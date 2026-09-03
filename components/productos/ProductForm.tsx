'use client'

import { FormEvent, useEffect, useMemo, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { calculateSupplierCost, PRICING_MODE_LABELS, type PricingMode } from '@/lib/pricing'

type Product = {
  id: string
  name: string
  brand: string | null
  sku: string | null
  category: string | null
  cost: number | string
  markup_percent: number | string
  suggested_price: number | string
  sale_price: number | string
  stock: number | string | null
  active: boolean
}

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

type SupplierCost = {
  id: string
  supplier_id: string
  pricing_mode: PricingMode
  base_price: number | string
  multiplier: number | string
  pack_quantity: number | string
  discount_percent: number | string
  surcharge_percent: number | string
  calculated_cost: number | string
  purchase_unit: string | null
  is_preferred: boolean
}

type Props = {
  product?: Product | null
  onSaved: () => void | Promise<void>
  onCancel: () => void
}

function parseArNumber(value: string) {
  const text = value.trim()
  if (!text) return 0
  const normalized = text.includes(',') ? text.replace(/\./g, '').replace(',', '.') : text
  const parsed = Number(normalized)
  return Number.isFinite(parsed) ? parsed : 0
}

const currency = (value: number) =>
  new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', maximumFractionDigits: 2 }).format(value)

export default function ProductForm({ product, onSaved, onCancel }: Props) {
  const supabase = useMemo(() => createClient(), [])
  const [suppliers, setSuppliers] = useState<Supplier[]>([])
  const [name, setName] = useState('')
  const [brand, setBrand] = useState('')
  const [sku, setSku] = useState('')
  const [category, setCategory] = useState('')
  const [markup, setMarkup] = useState('20')
  const [salePrice, setSalePrice] = useState('')
  const [stock, setStock] = useState('')

  const [supplierId, setSupplierId] = useState('')
  const [pricingMode, setPricingMode] = useState<PricingMode>('manual')
  const [basePrice, setBasePrice] = useState('0')
  const [multiplier, setMultiplier] = useState('1')
  const [packQuantity, setPackQuantity] = useState('1')
  const [discount, setDiscount] = useState('0')
  const [surcharge, setSurcharge] = useState('0')
  const [purchaseUnit, setPurchaseUnit] = useState('unidad')

  const [saving, setSaving] = useState(false)
  const [loadingRules, setLoadingRules] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    void loadSuppliers()
  }, [])

  useEffect(() => {
    if (!product) {
      setName('')
      setBrand('')
      setSku('')
      setCategory('')
      setMarkup('20')
      setSalePrice('')
      setStock('')
      setSupplierId('')
      setPricingMode('manual')
      setBasePrice('0')
      setMultiplier('1')
      setPackQuantity('1')
      setDiscount('0')
      setSurcharge('0')
      setPurchaseUnit('unidad')
      setError('')
      return
    }

    setName(product.name ?? '')
    setBrand(product.brand ?? '')
    setSku(product.sku ?? '')
    setCategory(product.category ?? '')
    setMarkup(String(product.markup_percent ?? 20))
    setSalePrice(String(product.sale_price ?? ''))
    setStock(product.stock == null ? '' : String(product.stock))
    setBasePrice(String(product.cost ?? 0))
    setError('')
    void loadPreferredSupplierCost(product.id)
  }, [product])

  async function loadSuppliers() {
    const { data } = await supabase.from('suppliers').select('*').eq('active', true).order('name')
    setSuppliers((data ?? []) as Supplier[])
  }

  async function loadPreferredSupplierCost(productId: string) {
    setLoadingRules(true)
    const { data } = await supabase
      .from('product_supplier_costs')
      .select('*')
      .eq('product_id', productId)
      .eq('is_preferred', true)
      .maybeSingle()

    if (data) {
      const cost = data as SupplierCost
      setSupplierId(cost.supplier_id)
      setPricingMode(cost.pricing_mode)
      setBasePrice(String(cost.base_price ?? 0))
      setMultiplier(String(cost.multiplier ?? 1))
      setPackQuantity(String(cost.pack_quantity ?? 1))
      setDiscount(String(cost.discount_percent ?? 0))
      setSurcharge(String(cost.surcharge_percent ?? 0))
      setPurchaseUnit(cost.purchase_unit ?? 'unidad')
    } else {
      setSupplierId('')
      setPricingMode('manual')
      setBasePrice(String(product?.cost ?? 0))
    }
    setLoadingRules(false)
  }

  function applySupplierDefaults(id: string) {
    setSupplierId(id)
    const supplier = suppliers.find((item) => item.id === id)
    if (!supplier) {
      setPricingMode('manual')
      return
    }
    setPricingMode(supplier.pricing_mode)
    setMultiplier(String(supplier.default_multiplier ?? 1))
    setPackQuantity(String(supplier.default_pack_quantity ?? 1))
    setDiscount(String(supplier.default_discount_percent ?? 0))
    setSurcharge(String(supplier.default_surcharge_percent ?? 0))
    setMarkup(String(supplier.default_markup_percent ?? 20))
  }

  const calculatedCost = calculateSupplierCost({
    pricingMode,
    basePrice: parseArNumber(basePrice),
    multiplier: parseArNumber(multiplier),
    packQuantity: parseArNumber(packQuantity),
    discountPercent: parseArNumber(discount),
    surchargePercent: parseArNumber(surcharge),
  })
  const markupNumber = parseArNumber(markup)
  const suggested = Math.round(calculatedCost * (1 + markupNumber / 100) * 100) / 100
  const finalSale = salePrice.trim() === '' ? suggested : parseArNumber(salePrice)
  const gain = finalSale - calculatedCost

  async function handleSubmit(event: FormEvent) {
    event.preventDefault()
    setError('')
    if (!name.trim()) {
      setError('Ingresá el nombre del producto.')
      return
    }
    if (calculatedCost < 0 || markupNumber < 0 || finalSale < 0) {
      setError('Costo, margen y precio no pueden ser negativos.')
      return
    }

    setSaving(true)
    const productPayload = {
      name: name.trim(),
      brand: brand.trim() || null,
      sku: sku.trim() || null,
      category: category.trim() || null,
      cost: calculatedCost,
      markup_percent: markupNumber,
      sale_price: finalSale,
      stock: stock.trim() === '' ? null : parseArNumber(stock),
      active: true,
    }

    let productId = product?.id ?? ''
    if (product?.id) {
      const { error } = await supabase.from('products').update(productPayload).eq('id', product.id)
      if (error) {
        setSaving(false)
        setError([error.message, error.details, error.hint].filter(Boolean).join(' · '))
        return
      }
    } else {
      const { data, error } = await supabase.from('products').insert(productPayload).select('id').single()
      if (error || !data) {
        setSaving(false)
        setError([error?.message, error?.details, error?.hint].filter(Boolean).join(' · ') || 'No se pudo crear el producto.')
        return
      }
      productId = data.id
    }

    if (supplierId && productId) {
      const linkPayload = {
        product_id: productId,
        supplier_id: supplierId,
        pricing_mode: pricingMode,
        base_price: parseArNumber(basePrice),
        multiplier: parseArNumber(multiplier) || 1,
        pack_quantity: parseArNumber(packQuantity) || 1,
        discount_percent: parseArNumber(discount),
        surcharge_percent: parseArNumber(surcharge),
        calculated_cost: calculatedCost,
        purchase_unit: purchaseUnit.trim() || null,
        is_preferred: true,
      }

      // Solo una regla preferida por producto. Primero desmarcamos la anterior
      // y después guardamos/actualizamos la regla elegida.
      const { error: clearPreferredError } = await supabase
        .from('product_supplier_costs')
        .update({ is_preferred: false })
        .eq('product_id', productId)

      if (clearPreferredError) {
        setSaving(false)
        setError(`El producto se guardó, pero no pudimos actualizar su proveedor preferido: ${clearPreferredError.message}`)
        return
      }

      const { error: linkError } = await supabase
        .from('product_supplier_costs')
        .upsert(linkPayload, { onConflict: 'product_id,supplier_id' })

      if (linkError) {
        setSaving(false)
        setError(`El producto se guardó, pero no la regla del proveedor: ${linkError.message}`)
        return
      }
    }

    setSaving(false)
    await onSaved()
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      <div>
        <h2 className="text-lg font-semibold">{product ? 'Editar producto' : 'Nuevo producto'}</h2>
        <p className="mt-1 text-sm text-slate-500">Elegí el proveedor y el sistema calcula el costo real antes de aplicar el margen de B&B.</p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <label className="text-sm font-medium">Producto *
          <input required value={name} onChange={(e) => setName(e.target.value)} placeholder="Ej: Cable Trefilcon 2,5 mm² x 100 m" className="mt-1.5 w-full rounded-xl border px-3 py-2.5 font-normal" />
        </label>
        <label className="text-sm font-medium">Marca
          <input value={brand} onChange={(e) => setBrand(e.target.value)} className="mt-1.5 w-full rounded-xl border px-3 py-2.5 font-normal" />
        </label>
        <label className="text-sm font-medium">Código / SKU
          <input value={sku} onChange={(e) => setSku(e.target.value)} className="mt-1.5 w-full rounded-xl border px-3 py-2.5 font-normal" />
        </label>
        <label className="text-sm font-medium">Categoría
          <input value={category} onChange={(e) => setCategory(e.target.value)} className="mt-1.5 w-full rounded-xl border px-3 py-2.5 font-normal" />
        </label>
      </div>

      <div className="rounded-2xl border bg-slate-50 p-4">
        <div className="mb-4">
          <div className="font-semibold">Costo del proveedor</div>
          <div className="text-xs text-slate-500">Cada producto puede usar la regla predeterminada del proveedor y después ajustarla.</div>
        </div>

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <label className="text-sm font-medium">Proveedor
            <select disabled={loadingRules} value={supplierId} onChange={(e) => applySupplierDefaults(e.target.value)} className="mt-1.5 w-full rounded-xl border bg-white px-3 py-2.5 font-normal">
              <option value="">Sin proveedor / costo manual</option>
              {suppliers.map((supplier) => <option key={supplier.id} value={supplier.id}>{supplier.name}</option>)}
            </select>
          </label>
          <label className="text-sm font-medium">Forma de cálculo
            <select value={pricingMode} onChange={(e) => setPricingMode(e.target.value as PricingMode)} className="mt-1.5 w-full rounded-xl border bg-white px-3 py-2.5 font-normal">
              {Object.entries(PRICING_MODE_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
            </select>
          </label>
          <label className="text-sm font-medium">Precio base
            <input inputMode="decimal" value={basePrice} onChange={(e) => setBasePrice(e.target.value)} placeholder="793,47" className="mt-1.5 w-full rounded-xl border bg-white px-3 py-2.5 font-normal" />
          </label>
          {(pricingMode === 'meter' || pricingMode === 'multiplier_discount') && (
            <label className="text-sm font-medium">Multiplicador
              <input inputMode="decimal" value={multiplier} onChange={(e) => setMultiplier(e.target.value)} className="mt-1.5 w-full rounded-xl border bg-white px-3 py-2.5 font-normal" />
              <span className="mt-1 block text-xs font-normal text-slate-500">Ej.: 100 para un rollo de 100 m.</span>
            </label>
          )}
          {pricingMode === 'pack' && (
            <label className="text-sm font-medium">Unidades del pack
              <input inputMode="decimal" value={packQuantity} onChange={(e) => setPackQuantity(e.target.value)} className="mt-1.5 w-full rounded-xl border bg-white px-3 py-2.5 font-normal" />
            </label>
          )}
          <label className="text-sm font-medium">Descuento proveedor %
            <input inputMode="decimal" value={discount} onChange={(e) => setDiscount(e.target.value)} className="mt-1.5 w-full rounded-xl border bg-white px-3 py-2.5 font-normal" />
          </label>
          <label className="text-sm font-medium">Recargo %
            <input inputMode="decimal" value={surcharge} onChange={(e) => setSurcharge(e.target.value)} className="mt-1.5 w-full rounded-xl border bg-white px-3 py-2.5 font-normal" />
          </label>
          <label className="text-sm font-medium">Unidad de compra
            <input value={purchaseUnit} onChange={(e) => setPurchaseUnit(e.target.value)} placeholder="unidad / metro / caja / rollo" className="mt-1.5 w-full rounded-xl border bg-white px-3 py-2.5 font-normal" />
          </label>
        </div>

        <div className="mt-4 rounded-xl bg-white p-4">
          <div className="text-xs text-slate-500">Costo real calculado</div>
          <div className="text-xl font-bold">{currency(calculatedCost)}</div>
          {pricingMode === 'meter' && <div className="mt-1 text-xs text-slate-500">{currency(parseArNumber(basePrice))} × {parseArNumber(multiplier) || 1}, aplicando luego descuento y recargo.</div>}
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <label className="text-sm font-medium">Margen B&B %
          <input inputMode="decimal" value={markup} onChange={(e) => setMarkup(e.target.value)} className="mt-1.5 w-full rounded-xl border px-3 py-2.5 font-normal" />
        </label>
        <label className="text-sm font-medium">Precio final
          <input inputMode="decimal" value={salePrice} onChange={(e) => setSalePrice(e.target.value)} placeholder={String(suggested)} className="mt-1.5 w-full rounded-xl border px-3 py-2.5 font-normal" />
          <span className="mt-1 block text-xs font-normal text-slate-500">Vacío = precio sugerido.</span>
        </label>
        <label className="text-sm font-medium">Stock
          <input inputMode="decimal" value={stock} onChange={(e) => setStock(e.target.value)} className="mt-1.5 w-full rounded-xl border px-3 py-2.5 font-normal" />
        </label>
      </div>

      <div className="grid gap-3 rounded-2xl bg-slate-50 p-4 sm:grid-cols-4">
        <div><div className="text-xs text-slate-500">Costo real</div><div className="font-semibold">{currency(calculatedCost)}</div></div>
        <div><div className="text-xs text-slate-500">Sugerido</div><div className="font-semibold">{currency(suggested)}</div></div>
        <div><div className="text-xs text-slate-500">Precio final</div><div className="font-semibold">{currency(finalSale)}</div></div>
        <div><div className="text-xs text-slate-500">Ganancia</div><div className="font-semibold">{currency(gain)}</div></div>
      </div>

      {error && <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div>}
      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <button type="button" onClick={onCancel} className="rounded-xl border px-4 py-2.5 text-sm font-semibold">Cancelar</button>
        <button type="submit" disabled={saving} className="rounded-xl bg-brand-600 px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50">{saving ? 'Guardando…' : product ? 'Guardar cambios' : 'Crear producto'}</button>
      </div>
    </form>
  )
}
