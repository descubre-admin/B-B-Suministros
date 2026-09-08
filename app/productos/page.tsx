'use client'

import { useEffect, useMemo, useState } from 'react'
import { AppShell } from '@/components/AppShell'
import ProductForm from '@/components/productos/ProductForm'
import BulkProductRuleEditor from '@/components/productos/BulkProductRuleEditor'
import { createClient } from '@/lib/supabase/client'

export type Product = {
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
  created_at: string
}

const money = (value: number | string | null | undefined) =>
  new Intl.NumberFormat('es-AR', {
    style: 'currency',
    currency: 'ARS',
    maximumFractionDigits: 2,
  }).format(Number(value ?? 0))

export default function ProductosPage() {
  const supabase = useMemo(() => createClient(), [])
  const [products, setProducts] = useState<Product[]>([])
  const [loading, setLoading] = useState(true)
  const [page, setPage] = useState(1)
  const [totalCount, setTotalCount] = useState(0)
  const [debouncedQuery, setDebouncedQuery] = useState('')
  const pageSize = 100
  const [loadError, setLoadError] = useState('')
  const [query, setQuery] = useState('')
  const [editing, setEditing] = useState<Product | null>(null)
  const [showForm, setShowForm] = useState(false)
  const [selectedIds, setSelectedIds] = useState<string[]>([])
  const [showBulkEditor, setShowBulkEditor] = useState(false)
  const [showAdvancedSelection, setShowAdvancedSelection] = useState(false)
  const [rangeInput, setRangeInput] = useState('')
  const [brandSelection, setBrandSelection] = useState('')
  const [selectionMessage, setSelectionMessage] = useState('')

  async function loadProducts(targetPage = page, search = debouncedQuery) {
    setLoading(true)
    setLoadError('')

    const from = (targetPage - 1) * pageSize
    const to = from + pageSize - 1
    const rawSearch = search.trim()
    // Permite buscar varios códigos de una sola vez, por ejemplo:
    // 6845,6847,7275,7277 (también acepta ; o saltos de línea).
    const multipleTerms = rawSearch
      .split(/[,;\n]+/)
      .map((term) => term.trim().replace(/[%()]/g, ' '))
      .filter(Boolean)

    let request = supabase
      .from('products')
      .select('*', { count: 'exact' })
      .order('name', { ascending: true })
      .range(from, to)

    if (multipleTerms.length > 1) {
      // En búsquedas múltiples hacemos OR entre todos los códigos/textos.
      // Así los resultados pueden venir de cualquier parte de la base,
      // sin depender de la página que estaba visible.
      const conditions = multipleTerms.flatMap((value) => {
        const term = `%${value}%`
        return [
          `sku.ilike.${term}`,
          `name.ilike.${term}`,
          `brand.ilike.${term}`,
          `category.ilike.${term}`,
        ]
      })
      request = request.or(conditions.join(','))
    } else if (multipleTerms.length === 1) {
      const term = `%${multipleTerms[0]}%`
      request = request.or(
        `name.ilike.${term},brand.ilike.${term},sku.ilike.${term},category.ilike.${term}`
      )
    }

    const { data, error, count } = await request

    if (error) {
      setProducts([])
      setTotalCount(0)
      setLoadError(
        [error.message, error.details, error.hint, error.code]
          .filter(Boolean)
          .join(' · ') || 'No se pudieron cargar los productos.'
      )
    } else {
      setProducts((data ?? []) as Product[])
      setTotalCount(count ?? 0)
    }

    setLoading(false)
  }

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setDebouncedQuery(query.trim())
      setPage(1)
      setSelectedIds([])
      setSelectionMessage('')
    }, 300)

    return () => window.clearTimeout(timer)
  }, [query])

  useEffect(() => {
    void loadProducts(page, debouncedQuery)
  }, [page, debouncedQuery])

  async function removeProduct(id: string) {
    if (!confirm('¿Eliminar este producto?')) return

    const { error } = await supabase.from('products').delete().eq('id', id)

    if (error) {
      alert(error.message || 'No se pudo eliminar el producto.')
      return
    }

    setSelectedIds((current) => current.filter((item) => item !== id))
    await loadProducts(page, debouncedQuery)
  }

  // La búsqueda se hace en Supabase para encontrar también productos
  // que estén más allá de los primeros 1000 registros.
  const filtered = products
  const totalPages = Math.max(1, Math.ceil(totalCount / pageSize))
  const firstVisibleNumber = totalCount === 0 ? 0 : (page - 1) * pageSize + 1
  const lastVisibleNumber = Math.min(page * pageSize, totalCount)

  const selectedProducts = products.filter((product) =>
    selectedIds.includes(product.id)
  )

  const visibleIds = filtered.map((product) => product.id)
  const allVisibleSelected =
    visibleIds.length > 0 && visibleIds.every((id) => selectedIds.includes(id))

  const visibleBrands = [...new Set(
    filtered
      .map((product) => (product.brand ?? '').trim())
      .filter(Boolean)
  )].sort((a, b) => a.localeCompare(b, 'es'))

  function addSelection(ids: string[]) {
    setSelectedIds((current) => [...new Set([...current, ...ids])])
  }

  function parseRanges(value: string) {
    const result = new Set<number>()
    const parts = value
      .split(',')
      .map((item) => item.trim())
      .filter(Boolean)

    for (const part of parts) {
      const single = part.match(/^\d+$/)
      if (single) {
        result.add(Number(part))
        continue
      }

      const range = part.match(/^(\d+)\s*[-–]\s*(\d+)$/)
      if (!range) continue

      let start = Number(range[1])
      let end = Number(range[2])

      if (start > end) [start, end] = [end, start]

      for (let number = start; number <= end; number += 1) {
        result.add(number)
      }
    }

    return [...result]
      .filter((number) => number >= 1 && number <= filtered.length)
      .sort((a, b) => a - b)
  }

  function selectByRange() {
    setSelectionMessage('')
    const positions = parseRanges(rangeInput)

    if (!positions.length) {
      setSelectionMessage(
        'Ingresá un rango válido, por ejemplo 1-48 o 1-48, 60-75.'
      )
      return
    }

    const ids = positions
      .map((position) => filtered[position - 1]?.id)
      .filter((id): id is string => Boolean(id))

    addSelection(ids)
    setSelectionMessage(
      `Se seleccionaron ${ids.length} producto${ids.length === 1 ? '' : 's'} por rango.`
    )
  }

  function selectByBrand() {
    setSelectionMessage('')

    if (!brandSelection) {
      setSelectionMessage('Elegí una marca.')
      return
    }

    const ids = filtered
      .filter((product) => (product.brand ?? '').trim() === brandSelection)
      .map((product) => product.id)

    addSelection(ids)
    setSelectionMessage(
      `Se seleccionaron ${ids.length} producto${ids.length === 1 ? '' : 's'} de ${brandSelection}.`
    )
  }

  function selectAllFiltered() {
    addSelection(visibleIds)
    setSelectionMessage(
      `Se seleccionaron los ${visibleIds.length} productos de esta página.`
    )
  }

  function toggleProduct(id: string) {
    setSelectedIds((current) =>
      current.includes(id)
        ? current.filter((item) => item !== id)
        : [...current, id]
    )
  }

  function toggleAllVisible() {
    if (allVisibleSelected) {
      setSelectedIds((current) =>
        current.filter((id) => !visibleIds.includes(id))
      )
      return
    }

    setSelectedIds((current) => [...new Set([...current, ...visibleIds])])
  }

  return (
    <AppShell>
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold">Productos</h1>
          <p className="mt-1 text-slate-500">
            Costos, márgenes y precios de venta de B&B Suministros.
          </p>
        </div>

        <button
          type="button"
          onClick={() => {
            setEditing(null)
            setShowForm(true)
          }}
          className="rounded-xl bg-brand-600 px-4 py-2.5 text-sm font-semibold text-white"
        >
          + Nuevo producto
        </button>
      </div>

      <div className="mt-6">
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Buscar por producto, marca o código. Varios códigos: 6845,6847,7275,7277"
          className="w-full rounded-xl border bg-white px-4 py-3 outline-none focus:border-brand-500"
        />
      </div>

      <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-sm text-slate-500">
        <div>
          {loading
            ? 'Buscando productos…'
            : totalCount > 0
              ? `Mostrando ${firstVisibleNumber}-${lastVisibleNumber} de ${totalCount} productos`
              : '0 productos'}
        </div>
        <div className="font-medium text-slate-600">100 productos por página</div>
      </div>

      <div className="mt-3 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => setShowAdvancedSelection((value) => !value)}
          className="rounded-xl border bg-white px-3 py-2 text-sm font-medium"
        >
          {showAdvancedSelection ? 'Cerrar selección avanzada' : 'Selección avanzada'}
        </button>

        <button
          type="button"
          onClick={selectAllFiltered}
          disabled={filtered.length === 0}
          className="rounded-xl border bg-white px-3 py-2 text-sm font-medium disabled:opacity-50"
        >
          Seleccionar página actual ({filtered.length})
        </button>
      </div>

      {showAdvancedSelection && (
        <div className="mt-4 rounded-2xl border bg-white p-5 shadow-sm">
          <div>
            <h2 className="text-lg font-semibold">Selección avanzada</h2>
            <p className="mt-1 text-sm text-slate-500">
              La numeración corresponde a la página actual (hasta 100 productos).
            </p>
          </div>

          <div className="mt-4 grid gap-4 lg:grid-cols-2">
            <div className="rounded-xl border bg-slate-50 p-4">
              <div className="font-semibold">Seleccionar por rango</div>
              <p className="mt-1 text-xs text-slate-500">
                Ejemplos: 1-48 o 1-48, 60-75, 101-120.
              </p>

              <div className="mt-3 flex flex-col gap-2 sm:flex-row">
                <input
                  value={rangeInput}
                  onChange={(event) => setRangeInput(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter') {
                      event.preventDefault()
                      selectByRange()
                    }
                  }}
                  placeholder="1-48, 60-75"
                  className="flex-1 rounded-xl border bg-white px-3 py-2.5"
                />
                <button
                  type="button"
                  onClick={selectByRange}
                  className="rounded-xl bg-brand-600 px-4 py-2.5 text-sm font-semibold text-white"
                >
                  Seleccionar rango
                </button>
              </div>
            </div>

            <div className="rounded-xl border bg-slate-50 p-4">
              <div className="font-semibold">Seleccionar por marca</div>
              <p className="mt-1 text-xs text-slate-500">
                Solo toma productos de la página actual.
              </p>

              <div className="mt-3 flex flex-col gap-2 sm:flex-row">
                <select
                  value={brandSelection}
                  onChange={(event) => setBrandSelection(event.target.value)}
                  className="flex-1 rounded-xl border bg-white px-3 py-2.5"
                >
                  <option value="">Elegir marca</option>
                  {visibleBrands.map((brand) => (
                    <option key={brand} value={brand}>
                      {brand}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  onClick={selectByBrand}
                  className="rounded-xl bg-brand-600 px-4 py-2.5 text-sm font-semibold text-white"
                >
                  Seleccionar marca
                </button>
              </div>
            </div>
          </div>

          <div className="mt-4 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={selectAllFiltered}
              disabled={filtered.length === 0}
              className="rounded-xl border px-3 py-2 text-sm font-medium disabled:opacity-50"
            >
              Seleccionar página actual ({filtered.length})
            </button>

            {selectedIds.length > 0 && (
              <button
                type="button"
                onClick={() => {
                  setSelectedIds([])
                  setSelectionMessage('')
                }}
                className="rounded-xl border px-3 py-2 text-sm font-medium"
              >
                Limpiar selección
              </button>
            )}
          </div>

          {selectionMessage && (
            <div className="mt-3 rounded-xl bg-slate-100 px-3 py-2 text-sm text-slate-700">
              {selectionMessage}
            </div>
          )}
        </div>
      )}

      {selectedIds.length > 0 && (
        <div className="sticky top-3 z-20 mt-4 rounded-2xl border border-brand-200 bg-brand-50 p-4 shadow-sm">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <div className="font-semibold text-brand-900">
                {selectedIds.length} producto{selectedIds.length === 1 ? '' : 's'} seleccionado{selectedIds.length === 1 ? '' : 's'}
              </div>
              <div className="text-sm text-brand-700">
                Podés aplicar una misma regla manteniendo el precio base propio de cada producto.
              </div>
            </div>

            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => setShowAdvancedSelection((value) => !value)}
                className="rounded-xl border border-brand-300 bg-white px-3 py-2 text-sm font-medium"
              >
                {showAdvancedSelection ? 'Cerrar selección avanzada' : 'Selección avanzada'}
              </button>

              <button
                type="button"
                onClick={toggleAllVisible}
                className="rounded-xl border border-brand-300 bg-white px-3 py-2 text-sm font-medium"
              >
                {allVisibleSelected ? 'Quitar visibles' : 'Seleccionar visibles'}
              </button>

              <button
                type="button"
                onClick={() => {
                  setSelectedIds([])
                  setSelectionMessage('')
                }}
                className="rounded-xl border border-brand-300 bg-white px-3 py-2 text-sm font-medium"
              >
                Limpiar selección
              </button>

              <button
                type="button"
                onClick={() => setShowBulkEditor((value) => !value)}
                className="rounded-xl bg-brand-600 px-4 py-2 text-sm font-semibold text-white"
              >
                {showBulkEditor ? 'Cerrar reglas' : 'Aplicar reglas'}
              </button>
            </div>
          </div>
        </div>
      )}

      {showBulkEditor && selectedProducts.length > 0 && (
        <div className="mt-4">
          <BulkProductRuleEditor
            products={selectedProducts}
            onCancel={() => setShowBulkEditor(false)}
            onApplied={async () => {
              setShowBulkEditor(false)
              setSelectedIds([])
              await loadProducts(page, debouncedQuery)
            }}
          />
        </div>
      )}

      {showForm && (
        <div className="mt-5 rounded-2xl border bg-white p-5 shadow-sm">
          <ProductForm
            product={editing}
            onCancel={() => {
              setShowForm(false)
              setEditing(null)
            }}
            onSaved={async () => {
              setShowForm(false)
              setEditing(null)
              await loadProducts(page, debouncedQuery)
            }}
          />
        </div>
      )}

      {loadError && (
        <div className="mt-5 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          <div className="font-semibold">No pudimos cargar los productos</div>
          <div className="mt-1 break-words">{loadError}</div>
          <button
            type="button"
            onClick={() => void loadProducts()}
            className="mt-3 rounded-lg border border-red-300 bg-white px-3 py-1.5 font-medium"
          >
            Reintentar
          </button>
        </div>
      )}

      {loading ? (
        <div className="mt-6 text-sm text-slate-500">Cargando productos…</div>
      ) : !loadError && filtered.length === 0 ? (
        <div className="mt-6 rounded-2xl border bg-white p-6 text-sm text-slate-500">
          {products.length === 0
            ? 'Todavía no cargaste productos.'
            : 'No encontramos productos con esa búsqueda.'}
        </div>
      ) : (
        !loadError && (
          <>
            <div className="mt-6 hidden overflow-hidden rounded-2xl border bg-white md:block">
              <table className="w-full text-sm">
                <thead className="bg-slate-50 text-left text-slate-600">
                  <tr>
                    <th className="w-12 p-3">
                      <input
                        type="checkbox"
                        checked={allVisibleSelected}
                        onChange={toggleAllVisible}
                        aria-label="Seleccionar todos los productos visibles"
                        className="h-4 w-4 rounded border-slate-300"
                      />
                    </th>
                    <th className="w-16 p-3">N°</th>
                    <th className="p-3">Producto</th>
                    <th className="p-3">Costo</th>
                    <th className="p-3">Margen</th>
                    <th className="p-3">Sugerido</th>
                    <th className="p-3">Venta</th>
                    <th className="p-3">Ganancia</th>
                    <th className="p-3"></th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((product, index) => {
                    const gain = Number(product.sale_price) - Number(product.cost)
                    const selected = selectedIds.includes(product.id)

                    return (
                      <tr
                        key={product.id}
                        className={`border-t ${selected ? 'bg-brand-50/60' : ''}`}
                      >
                        <td className="p-3">
                          <input
                            type="checkbox"
                            checked={selected}
                            onChange={() => toggleProduct(product.id)}
                            aria-label={`Seleccionar ${product.name}`}
                            className="h-4 w-4 rounded border-slate-300"
                          />
                        </td>
                        <td className="p-3 font-medium text-slate-500">{(page - 1) * pageSize + index + 1}</td>
                        <td className="p-3">
                          <div className="font-medium">{product.name}</div>
                          <div className="text-xs text-slate-500">
                            {[product.brand, product.sku, product.category]
                              .filter(Boolean)
                              .join(' · ')}
                          </div>
                        </td>
                        <td className="p-3">{money(product.cost)}</td>
                        <td className="p-3">{Number(product.markup_percent)}%</td>
                        <td className="p-3">{money(product.suggested_price)}</td>
                        <td className="p-3 font-semibold">{money(product.sale_price)}</td>
                        <td className="p-3">{money(gain)}</td>
                        <td className="p-3">
                          <div className="flex justify-end gap-2">
                            <button
                              type="button"
                              onClick={() => {
                                setEditing(product)
                                setShowForm(true)
                              }}
                              className="rounded-lg border px-3 py-2"
                            >
                              Editar
                            </button>
                            <button
                              type="button"
                              onClick={() => void removeProduct(product.id)}
                              className="rounded-lg border px-3 py-2 text-red-600"
                            >
                              Eliminar
                            </button>
                          </div>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>

            <div className="mt-6 grid gap-3 md:hidden">
              {filtered.map((product, index) => {
                const gain = Number(product.sale_price) - Number(product.cost)
                const selected = selectedIds.includes(product.id)

                return (
                  <div
                    key={product.id}
                    className={`rounded-2xl border bg-white p-4 ${selected ? 'ring-2 ring-brand-200' : ''}`}
                  >
                    <label className="mb-3 flex items-start gap-3">
                      <input
                        type="checkbox"
                        checked={selected}
                        onChange={() => toggleProduct(product.id)}
                        className="mt-1 h-4 w-4 rounded border-slate-300"
                      />
                      <div className="flex-1">
                        <div className="mb-1 text-xs font-semibold text-slate-400">N° {(page - 1) * pageSize + index + 1}</div>
                        <div className="font-semibold">{product.name}</div>
                        <div className="mt-0.5 text-xs text-slate-500">
                          {[product.brand, product.sku, product.category]
                            .filter(Boolean)
                            .join(' · ')}
                        </div>
                      </div>
                    </label>

                    <div className="grid grid-cols-2 gap-3 text-sm">
                      <div>
                        <div className="text-xs text-slate-500">Costo</div>
                        <div>{money(product.cost)}</div>
                      </div>
                      <div>
                        <div className="text-xs text-slate-500">Margen</div>
                        <div>{Number(product.markup_percent)}%</div>
                      </div>
                      <div>
                        <div className="text-xs text-slate-500">Sugerido</div>
                        <div>{money(product.suggested_price)}</div>
                      </div>
                      <div>
                        <div className="text-xs text-slate-500">Venta</div>
                        <div className="font-semibold">{money(product.sale_price)}</div>
                      </div>
                      <div>
                        <div className="text-xs text-slate-500">Ganancia</div>
                        <div>{money(gain)}</div>
                      </div>
                    </div>

                    <div className="mt-4 flex gap-2">
                      <button
                        type="button"
                        onClick={() => {
                          setEditing(product)
                          setShowForm(true)
                        }}
                        className="flex-1 rounded-xl border px-3 py-2"
                      >
                        Editar
                      </button>
                      <button
                        type="button"
                        onClick={() => void removeProduct(product.id)}
                        className="flex-1 rounded-xl border px-3 py-2 text-red-600"
                      >
                        Eliminar
                      </button>
                    </div>
                  </div>
                )
              })}
            </div>

            {totalPages > 1 && (
              <div className="mt-5 flex flex-col gap-3 rounded-2xl border bg-white p-4 sm:flex-row sm:items-center sm:justify-between">
                <div className="text-sm text-slate-600">
                  Página <span className="font-semibold text-slate-900">{page}</span> de{' '}
                  <span className="font-semibold text-slate-900">{totalPages}</span>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedIds([])
                      setSelectionMessage('')
                      setPage(1)
                    }}
                    disabled={page === 1 || loading}
                    className="rounded-xl border px-3 py-2 text-sm font-medium disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    Primera
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedIds([])
                      setSelectionMessage('')
                      setPage((current) => Math.max(1, current - 1))
                    }}
                    disabled={page === 1 || loading}
                    className="rounded-xl border px-3 py-2 text-sm font-medium disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    Anterior
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedIds([])
                      setSelectionMessage('')
                      setPage((current) => Math.min(totalPages, current + 1))
                    }}
                    disabled={page === totalPages || loading}
                    className="rounded-xl border px-3 py-2 text-sm font-medium disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    Siguiente
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedIds([])
                      setSelectionMessage('')
                      setPage(totalPages)
                    }}
                    disabled={page === totalPages || loading}
                    className="rounded-xl border px-3 py-2 text-sm font-medium disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    Última
                  </button>
                </div>
              </div>
            )}
          </>
        )
      )}
    </AppShell>
  )
}
