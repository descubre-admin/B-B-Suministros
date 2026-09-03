'use client'

import { useEffect, useMemo, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import {
  calculateSupplierCost,
  PRICING_MODE_LABELS,
  type PricingMode,
} from '@/lib/pricing'
import type { Product } from '@/app/productos/page'

type Supplier = {
  id: string
  name: string
  pricing_mode: PricingMode
  default_multiplier: number | string
  default_pack_quantity: number | string
  default_discount_percent: number | string
  default_surcharge_percent: number | string
  default_markup_percent: number | string
}

type ExistingSupplierCost = {
  product_id: string
  base_price: number | string
}

type Props = {
  products: Product[]
  onApplied: () => void | Promise<void>
  onCancel: () => void
}

function parseArNumber(value: string) {
  const raw = value.trim()
  if (!raw) return 0

  let normalized = raw.replace(/[$%\s]/g, '')

  if (normalized.includes(',') && normalized.includes('.')) {
    normalized =
      normalized.lastIndexOf(',') > normalized.lastIndexOf('.')
        ? normalized.replace(/\./g, '').replace(',', '.')
        : normalized.replace(/,/g, '')
  } else if (normalized.includes(',')) {
    normalized = normalized.replace(/\./g, '').replace(',', '.')
  }

  const parsed = Number(normalized)
  return Number.isFinite(parsed) ? parsed : 0
}

const money = (value: number) =>
  new Intl.NumberFormat('es-AR', {
    style: 'currency',
    currency: 'ARS',
    maximumFractionDigits: 2,
  }).format(value)

export default function BulkProductRuleEditor({
  products,
  onApplied,
  onCancel,
}: Props) {
  const supabase = useMemo(() => createClient(), [])

  const [suppliers, setSuppliers] = useState<Supplier[]>([])
  const [supplierId, setSupplierId] = useState('')
  const [pricingMode, setPricingMode] = useState<PricingMode>('unit')
  const [multiplier, setMultiplier] = useState('1')
  const [packQuantity, setPackQuantity] = useState('1')
  const [discount, setDiscount] = useState('0')
  const [surcharge, setSurcharge] = useState('0')
  const [markup, setMarkup] = useState('20')
  const [purchaseUnit, setPurchaseUnit] = useState('unidad')
  const [useExistingBase, setUseExistingBase] = useState(true)
  const [recalculateSalePrice, setRecalculateSalePrice] = useState(true)
  const [existingBases, setExistingBases] = useState<Record<string, number>>({})
  const [saving, setSaving] = useState(false)
  const [loading, setLoading] = useState(true)
  const [showPreview, setShowPreview] = useState(false)
  const [error, setError] = useState('')
  const [progress, setProgress] = useState('')

  useEffect(() => {
    void loadData()
  }, [products])

  async function loadData() {
    setLoading(true)
    setError('')

    const [{ data: suppliersData, error: suppliersError }, { data: costsData, error: costsError }] =
      await Promise.all([
        supabase
          .from('suppliers')
          .select('*')
          .eq('active', true)
          .order('name'),
        supabase
          .from('product_supplier_costs')
          .select('product_id,base_price')
          .in(
            'product_id',
            products.map((product) => product.id)
          )
          .eq('is_preferred', true),
      ])

    if (suppliersError) {
      setError(suppliersError.message)
    } else {
      setSuppliers((suppliersData ?? []) as Supplier[])
    }

    if (!costsError) {
      const bases: Record<string, number> = {}
      ;((costsData ?? []) as ExistingSupplierCost[]).forEach((item) => {
        bases[item.product_id] = Number(item.base_price ?? 0)
      })
      setExistingBases(bases)
    }

    setLoading(false)
  }

  function applySupplierDefaults(id: string) {
    setSupplierId(id)
    const supplier = suppliers.find((item) => item.id === id)

    if (!supplier) return

    setPricingMode(supplier.pricing_mode)
    setMultiplier(String(supplier.default_multiplier ?? 1))
    setPackQuantity(String(supplier.default_pack_quantity ?? 1))
    setDiscount(String(supplier.default_discount_percent ?? 0))
    setSurcharge(String(supplier.default_surcharge_percent ?? 0))
    setMarkup(String(supplier.default_markup_percent ?? 20))
  }

  function getBasePrice(product: Product) {
    if (useExistingBase && existingBases[product.id] !== undefined) {
      return existingBases[product.id]
    }
    return Number(product.cost ?? 0)
  }

  function calculateForProduct(product: Product) {
    const basePrice = getBasePrice(product)
    const cost = calculateSupplierCost({
      pricingMode,
      basePrice,
      multiplier: parseArNumber(multiplier),
      packQuantity: parseArNumber(packQuantity),
      discountPercent: parseArNumber(discount),
      surchargePercent: parseArNumber(surcharge),
    })
    const markupNumber = Math.max(0, parseArNumber(markup))
    const salePrice =
      Math.round(cost * (1 + markupNumber / 100) * 100) / 100

    return { basePrice, cost, salePrice, markupNumber }
  }

  const previewRows = products.map((product) => ({
    product,
    ...calculateForProduct(product),
  }))

  const changedRows = previewRows.filter((item) => {
    const currentCost = Number(item.product.cost ?? 0)
    const currentSale = Number(item.product.sale_price ?? 0)

    return (
      Math.abs(currentCost - item.cost) > 0.001 ||
      (recalculateSalePrice && Math.abs(currentSale - item.salePrice) > 0.001)
    )
  })

  const totalCurrentCost = previewRows.reduce(
    (sum, item) => sum + Number(item.product.cost ?? 0),
    0
  )
  const totalNewCost = previewRows.reduce((sum, item) => sum + item.cost, 0)

  async function applyRules() {
    setError('')
    setProgress('')

    if (!supplierId) {
      setError('Elegí un proveedor para asignar la regla.')
      return
    }

    if (!products.length) {
      setError('No hay productos seleccionados.')
      return
    }

    setSaving(true)

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser()

    if (authError || !user) {
      setSaving(false)
      setError('Tu sesión no está disponible. Volvé a iniciar sesión.')
      return
    }

    try {
      const calculated = products.map((product) => ({
        product,
        ...calculateForProduct(product),
      }))

      setProgress('Actualizando costos y precios…')

      for (let start = 0; start < calculated.length; start += 100) {
        const chunk = calculated.slice(start, start + 100)

        for (const item of chunk) {
          const productPayload: Record<string, unknown> = {
            cost: item.cost,
            markup_percent: item.markupNumber,
          }

          if (recalculateSalePrice) {
            productPayload.sale_price = item.salePrice
          }

          const { error: productError } = await supabase
            .from('products')
            .update(productPayload)
            .eq('id', item.product.id)

          if (productError) {
            throw new Error(
              `${item.product.name}: ${productError.message}`
            )
          }
        }

        setProgress(
          `Productos actualizados: ${Math.min(start + 100, calculated.length)}/${calculated.length}`
        )
      }

      setProgress('Guardando reglas del proveedor…')

      const productIds = products.map((product) => product.id)

      const { error: clearPreferredError } = await supabase
        .from('product_supplier_costs')
        .update({ is_preferred: false })
        .in('product_id', productIds)

      if (clearPreferredError) throw clearPreferredError

      const links = calculated.map((item) => ({
        user_id: user.id,
        product_id: item.product.id,
        supplier_id: supplierId,
        pricing_mode: pricingMode,
        base_price: item.basePrice,
        multiplier: parseArNumber(multiplier) || 1,
        pack_quantity: parseArNumber(packQuantity) || 1,
        discount_percent: parseArNumber(discount),
        surcharge_percent: parseArNumber(surcharge),
        calculated_cost: item.cost,
        purchase_unit: purchaseUnit.trim() || null,
        is_preferred: true,
      }))

      for (let start = 0; start < links.length; start += 100) {
        const chunk = links.slice(start, start + 100)

        const { error: linkError } = await supabase
          .from('product_supplier_costs')
          .upsert(chunk, { onConflict: 'product_id,supplier_id' })

        if (linkError) throw linkError

        setProgress(
          `Reglas guardadas: ${Math.min(start + 100, links.length)}/${links.length}`
        )
      }

      setProgress('Reglas aplicadas correctamente.')
      await onApplied()
    } catch (err) {
      const message =
        err && typeof err === 'object' && 'message' in err
          ? String((err as { message?: unknown }).message ?? '')
          : ''

      setError(message || 'No se pudieron aplicar las reglas.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="rounded-2xl border border-brand-200 bg-white p-5 shadow-sm">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <h2 className="text-lg font-semibold">Edición masiva de reglas</h2>
          <p className="mt-1 text-sm text-slate-500">
            Se aplicará la misma fórmula a {products.length} productos, pero cada uno conserva su propio precio base.
          </p>
        </div>

        <button
          type="button"
          onClick={onCancel}
          disabled={saving}
          className="rounded-xl border px-3 py-2 text-sm"
        >
          Cancelar
        </button>
      </div>

      {loading ? (
        <div className="mt-5 text-sm text-slate-500">Cargando proveedores y reglas…</div>
      ) : (
        <>
          <div className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <label className="text-sm font-medium">
              Proveedor *
              <select
                value={supplierId}
                onChange={(event) => { setShowPreview(false); applySupplierDefaults(event.target.value) }}
                className="mt-1.5 w-full rounded-xl border bg-white px-3 py-2.5 font-normal"
              >
                <option value="">Seleccionar proveedor</option>
                {suppliers.map((supplier) => (
                  <option key={supplier.id} value={supplier.id}>
                    {supplier.name}
                  </option>
                ))}
              </select>
            </label>

            <label className="text-sm font-medium">
              Forma de cálculo
              <select
                value={pricingMode}
                onChange={(event) => { setShowPreview(false); setPricingMode(event.target.value as PricingMode) }}
                className="mt-1.5 w-full rounded-xl border bg-white px-3 py-2.5 font-normal"
              >
                {Object.entries(PRICING_MODE_LABELS).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </label>

            {(pricingMode === 'meter' ||
              pricingMode === 'multiplier_discount') && (
              <label className="text-sm font-medium">
                Multiplicador
                <input
                  value={multiplier}
                  onChange={(event) => { setShowPreview(false); setMultiplier(event.target.value) }}
                  inputMode="decimal"
                  className="mt-1.5 w-full rounded-xl border px-3 py-2.5 font-normal"
                />
                <span className="mt-1 block text-xs font-normal text-slate-500">
                  Ej.: 100 para pasar precio por metro a rollo de 100 m.
                </span>
              </label>
            )}

            {pricingMode === 'pack' && (
              <label className="text-sm font-medium">
                Unidades dentro del pack
                <input
                  value={packQuantity}
                  onChange={(event) => { setShowPreview(false); setPackQuantity(event.target.value) }}
                  inputMode="decimal"
                  className="mt-1.5 w-full rounded-xl border px-3 py-2.5 font-normal"
                />
              </label>
            )}

            <label className="text-sm font-medium">
              Descuento proveedor %
              <input
                value={discount}
                onChange={(event) => { setShowPreview(false); setDiscount(event.target.value) }}
                inputMode="decimal"
                className="mt-1.5 w-full rounded-xl border px-3 py-2.5 font-normal"
              />
            </label>

            <label className="text-sm font-medium">
              Recargo %
              <input
                value={surcharge}
                onChange={(event) => { setShowPreview(false); setSurcharge(event.target.value) }}
                inputMode="decimal"
                className="mt-1.5 w-full rounded-xl border px-3 py-2.5 font-normal"
              />
            </label>

            <label className="text-sm font-medium">
              Margen B&B %
              <input
                value={markup}
                onChange={(event) => { setShowPreview(false); setMarkup(event.target.value) }}
                inputMode="decimal"
                className="mt-1.5 w-full rounded-xl border px-3 py-2.5 font-normal"
              />
            </label>

            <label className="text-sm font-medium">
              Unidad de compra
              <input
                value={purchaseUnit}
                onChange={(event) => { setShowPreview(false); setPurchaseUnit(event.target.value) }}
                placeholder="unidad / metro / rollo / caja"
                className="mt-1.5 w-full rounded-xl border px-3 py-2.5 font-normal"
              />
            </label>
          </div>

          <div className="mt-5 grid gap-3 sm:grid-cols-2">
            <label className="flex gap-3 rounded-xl border bg-slate-50 p-4">
              <input
                type="checkbox"
                checked={useExistingBase}
                onChange={(event) => { setShowPreview(false); setUseExistingBase(event.target.checked) }}
                className="mt-1 h-4 w-4"
              />
              <div>
                <div className="text-sm font-semibold">
                  Conservar precio base original
                </div>
                <div className="mt-1 text-xs text-slate-500">
                  Si el producto ya tenía una regla de proveedor, usa ese precio base. Si no, usa su costo actual.
                </div>
              </div>
            </label>

            <label className="flex gap-3 rounded-xl border bg-slate-50 p-4">
              <input
                type="checkbox"
                checked={recalculateSalePrice}
                onChange={(event) => {
                  setShowPreview(false)
                  setRecalculateSalePrice(event.target.checked)
                }}
                className="mt-1 h-4 w-4"
              />
              <div>
                <div className="text-sm font-semibold">
                  Recalcular precio de venta
                </div>
                <div className="mt-1 text-xs text-slate-500">
                  Costo calculado + margen B&B. Si lo desmarcás, conserva el precio de venta actual.
                </div>
              </div>
            </label>
          </div>

          {!showPreview ? (
            <div className="mt-5 rounded-2xl border border-dashed bg-slate-50 p-6 text-center">
              <div className="font-semibold">Revisá antes de aplicar</div>
              <p className="mx-auto mt-1 max-w-2xl text-sm text-slate-500">
                Primero generamos una vista previa completa. Ningún producto se modifica
                hasta que confirmes desde esa pantalla.
              </p>

              <button
                type="button"
                onClick={() => setShowPreview(true)}
                disabled={!supplierId}
                className="mt-4 rounded-xl bg-brand-600 px-5 py-3 text-sm font-semibold text-white disabled:opacity-50"
              >
                Ver vista previa de {products.length} producto{products.length === 1 ? '' : 's'}
              </button>
            </div>
          ) : (
            <div className="mt-5 space-y-4">
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <div className="rounded-xl border bg-slate-50 p-4">
                  <div className="text-xs text-slate-500">Seleccionados</div>
                  <div className="mt-1 text-xl font-bold">{products.length}</div>
                </div>
                <div className="rounded-xl border bg-slate-50 p-4">
                  <div className="text-xs text-slate-500">Con cambios</div>
                  <div className="mt-1 text-xl font-bold">{changedRows.length}</div>
                </div>
                <div className="rounded-xl border bg-slate-50 p-4">
                  <div className="text-xs text-slate-500">Costo actual total</div>
                  <div className="mt-1 font-bold">{money(totalCurrentCost)}</div>
                </div>
                <div className="rounded-xl border bg-slate-50 p-4">
                  <div className="text-xs text-slate-500">Costo nuevo total</div>
                  <div className="mt-1 font-bold">{money(totalNewCost)}</div>
                </div>
              </div>

              <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
                Esta es solo una vista previa. Todavía no se modificó ningún producto.
              </div>

              <div className="max-h-[65vh] overflow-auto rounded-xl border">
                <table className="min-w-[1080px] w-full text-sm">
                  <thead className="sticky top-0 z-10 bg-slate-50 text-left text-slate-600">
                    <tr>
                      <th className="p-3">N°</th>
                      <th className="p-3">Producto</th>
                      <th className="p-3">Código</th>
                      <th className="p-3">Base</th>
                      <th className="p-3">Costo actual</th>
                      <th className="p-3">Costo nuevo</th>
                      <th className="p-3">Venta actual</th>
                      <th className="p-3">Venta nueva</th>
                      <th className="p-3">Estado</th>
                    </tr>
                  </thead>
                  <tbody>
                    {previewRows.map((item, index) => {
                      const currentCost = Number(item.product.cost ?? 0)
                      const currentSale = Number(item.product.sale_price ?? 0)
                      const costChanged = Math.abs(currentCost - item.cost) > 0.001
                      const saleChanged =
                        recalculateSalePrice &&
                        Math.abs(currentSale - item.salePrice) > 0.001
                      const changed = costChanged || saleChanged

                      return (
                        <tr
                          key={item.product.id}
                          className={`border-t ${changed ? 'bg-amber-50/40' : ''}`}
                        >
                          <td className="p-3 text-slate-500">{index + 1}</td>
                          <td className="p-3">
                            <div className="font-medium">{item.product.name}</div>
                            <div className="text-xs text-slate-500">
                              {[item.product.brand, item.product.category]
                                .filter(Boolean)
                                .join(' · ')}
                            </div>
                          </td>
                          <td className="p-3">{item.product.sku || '—'}</td>
                          <td className="p-3">{money(item.basePrice)}</td>
                          <td className="p-3">{money(currentCost)}</td>
                          <td className={`p-3 font-semibold ${costChanged ? 'text-amber-700' : ''}`}>
                            {money(item.cost)}
                          </td>
                          <td className="p-3">{money(currentSale)}</td>
                          <td className={`p-3 font-semibold ${saleChanged ? 'text-amber-700' : ''}`}>
                            {recalculateSalePrice ? money(item.salePrice) : 'Se conserva'}
                          </td>
                          <td className="p-3">
                            <span
                              className={`rounded-full px-2 py-1 text-xs font-medium ${
                                changed
                                  ? 'bg-amber-100 text-amber-800'
                                  : 'bg-slate-100 text-slate-600'
                              }`}
                            >
                              {changed ? 'Se modifica' : 'Sin cambios'}
                            </span>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>

              <div className="text-xs text-slate-500">
                Se muestran los {previewRows.length} productos seleccionados completos.
                Podés desplazarte dentro de la tabla para revisarlos todos.
              </div>
            </div>
          )}

          {error && (
            <div className="mt-4 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
              {error}
            </div>
          )}

          {progress && (
            <div className="mt-4 text-sm text-slate-500">{progress}</div>
          )}

          <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            {showPreview && (
              <button
                type="button"
                onClick={() => setShowPreview(false)}
                disabled={saving}
                className="rounded-xl border px-4 py-3 text-sm font-semibold"
              >
                Volver a editar regla
              </button>
            )}

            {showPreview && (
              <button
                type="button"
                onClick={() => void applyRules()}
                disabled={saving || !supplierId}
                className="rounded-xl bg-brand-600 px-5 py-3 text-sm font-semibold text-white disabled:opacity-50"
              >
                {saving
                  ? 'Aplicando cambios…'
                  : `Confirmar y aplicar a ${products.length} producto${products.length === 1 ? '' : 's'}`}
              </button>
            )}
          </div>
        </>
      )}
    </div>
  )
}
