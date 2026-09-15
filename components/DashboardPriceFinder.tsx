'use client'

import { useEffect, useMemo, useState } from 'react'
import { Calculator, Check, Search, ShoppingCart } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

type Product = {
  id: string
  name: string
  brand: string | null
  sku: string | null
  category: string | null
  cost: number | string
  sale_price: number | string
  active: boolean
}

type DraftQuoteItem = {
  productId: string
  name: string
  brand: string | null
  sku: string | null
  qty: number
  unitPrice: number
}

const DRAFT_KEY = 'bb_quote_draft_items'

const money = (value: number | string | null | undefined) =>
  new Intl.NumberFormat('es-AR', {
    style: 'currency',
    currency: 'ARS',
    maximumFractionDigits: 2,
  }).format(Number(value ?? 0))

function parseNumber(value: string) {
  const raw = value.trim()
  if (!raw) return 0
  const normalized = raw.includes(',') ? raw.replace(/\./g, '').replace(',', '.') : raw
  const parsed = Number(normalized)
  return Number.isFinite(parsed) ? parsed : 0
}

function normalize(value: string | null | undefined) {
  return String(value ?? '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

function levenshtein(a: string, b: string) {
  if (a === b) return 0
  if (!a.length) return b.length
  if (!b.length) return a.length

  const previous = Array.from({ length: b.length + 1 }, (_, index) => index)
  const current = new Array<number>(b.length + 1)

  for (let i = 1; i <= a.length; i += 1) {
    current[0] = i
    for (let j = 1; j <= b.length; j += 1) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1
      current[j] = Math.min(current[j - 1] + 1, previous[j] + 1, previous[j - 1] + cost)
    }
    for (let j = 0; j <= b.length; j += 1) previous[j] = current[j]
  }

  return previous[b.length]
}

function tokenMatches(token: string, searchable: string, words: string[]) {
  if (searchable.includes(token)) return true
  if (token.length < 5) return false
  const maxDistance = token.length >= 8 ? 2 : 1
  return words.some((word) => Math.abs(word.length - token.length) <= maxDistance && levenshtein(token, word) <= maxDistance)
}

function matchesProduct(product: Product, query: string) {
  const tokens = normalize(query).split(/\s+/).filter(Boolean)
  if (!tokens.length) return false
  const searchable = normalize([product.sku, product.name, product.brand, product.category].filter(Boolean).join(' '))
  const words = searchable.split(/\s+/).filter(Boolean)
  return tokens.every((token) => tokenMatches(token, searchable, words))
}

export default function DashboardPriceFinder() {
  const supabase = useMemo(() => createClient(), [])
  const router = useRouter()
  const [products, setProducts] = useState<Product[]>([])
  const [query, setQuery] = useState('')
  const [discount, setDiscount] = useState('0')
  const [markup, setMarkup] = useState('30')
  const [customMarkup, setCustomMarkup] = useState<Record<string, string>>({})
  const [selected, setSelected] = useState<Record<string, boolean>>({})
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [added, setAdded] = useState(false)

  useEffect(() => {
    let cancelled = false

    async function loadAllProducts() {
      setLoading(true)
      setError('')
      const all: Product[] = []
      const pageSize = 1000

      for (let from = 0; ; from += pageSize) {
        const { data, error: loadError } = await supabase
          .from('products')
          .select('id,name,brand,sku,category,cost,sale_price,active')
          .eq('active', true)
          .order('name', { ascending: true })
          .range(from, from + pageSize - 1)

        if (loadError) {
          if (!cancelled) {
            setError(loadError.message || 'No se pudieron cargar los productos.')
            setLoading(false)
          }
          return
        }

        const batch = (data ?? []) as Product[]
        all.push(...batch)
        if (batch.length < pageSize) break
      }

      if (!cancelled) {
        setProducts(all)
        setLoading(false)
      }
    }

    void loadAllProducts()
    return () => { cancelled = true }
  }, [supabase])

  const results = useMemo(() => {
    if (!query.trim()) return []
    return products.filter((product) => matchesProduct(product, query)).slice(0, 30)
  }, [products, query])

  const discountNumber = Math.min(100, Math.max(0, parseNumber(discount)))
  const markupNumber = Math.max(0, parseNumber(markup))
  const selectedCount = Object.values(selected).filter(Boolean).length

  function getProductMarkup(productId: string) {
    const value = customMarkup[productId]
    return value === undefined || value === '' ? markupNumber : Math.max(0, parseNumber(value))
  }

  function getCalculatedPrice(product: Product) {
    const base = Math.max(0, Number(product.cost ?? 0))
    const discounted = base * (1 - discountNumber / 100)
    const productMarkup = getProductMarkup(product.id)
    const calculated = discounted * (1 + productMarkup / 100)
    return { base, discounted, calculated, productMarkup }
  }

  function toggleAllVisible() {
    const allSelected = results.length > 0 && results.every((product) => selected[product.id])
    setSelected((previous) => {
      const next = { ...previous }
      results.forEach((product) => { next[product.id] = !allSelected })
      return next
    })
  }

  function addSelectedToQuote() {
    const chosen = products.filter((product) => selected[product.id])
    if (!chosen.length) return

    let previous: DraftQuoteItem[] = []
    try {
      previous = JSON.parse(localStorage.getItem(DRAFT_KEY) || '[]') as DraftQuoteItem[]
      if (!Array.isArray(previous)) previous = []
    } catch {
      previous = []
    }

    const next = [...previous]
    chosen.forEach((product) => {
      const { calculated } = getCalculatedPrice(product)
      const index = next.findIndex((item) => item.productId === product.id)
      if (index >= 0) {
        next[index] = { ...next[index], qty: next[index].qty + 1, unitPrice: calculated }
      } else {
        next.push({
          productId: product.id,
          name: product.name,
          brand: product.brand,
          sku: product.sku,
          qty: 1,
          unitPrice: calculated,
        })
      }
    })

    localStorage.setItem(DRAFT_KEY, JSON.stringify(next))
    setAdded(true)
    setTimeout(() => router.push('/presupuestos/nuevo'), 250)
  }

  return (
    <section className="mt-6 rounded-2xl border bg-white p-5 shadow-sm">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex items-start gap-3">
          <div className="rounded-xl bg-brand-50 p-2 text-brand-700"><Calculator size={22} /></div>
          <div>
            <h2 className="text-lg font-bold">Buscador y calculadora de precios</h2>
            <p className="mt-1 text-sm text-slate-500">
              Buscá por código, producto o marca. Ej.: <strong>cable trefilcon</strong>, <strong>6845</strong> o <strong>térmica sica</strong>.
            </p>
          </div>
        </div>
        {selectedCount > 0 && (
          <button
            type="button"
            onClick={addSelectedToQuote}
            className="inline-flex items-center justify-center gap-2 rounded-xl bg-brand-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-brand-700"
          >
            {added ? <Check size={17} /> : <ShoppingCart size={17} />}
            {added ? 'Agregados' : `Agregar ${selectedCount} al presupuesto`}
          </button>
        )}
      </div>

      <div className="mt-5 grid gap-3 lg:grid-cols-[minmax(0,1fr)_160px_160px]">
        <label className="block">
          <span className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-slate-500">Buscar producto</span>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
            <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Ej.: 6845, cable trefilcon, térmica 20a" className="w-full rounded-xl border bg-white py-3 pl-10 pr-4 focus:border-brand-500" />
          </div>
        </label>

        <label className="block">
          <span className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-slate-500">Descuento %</span>
          <input inputMode="decimal" value={discount} onChange={(event) => setDiscount(event.target.value)} className="w-full rounded-xl border bg-white px-4 py-3 focus:border-brand-500" />
        </label>

        <label className="block">
          <span className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-slate-500">Margen general %</span>
          <input inputMode="decimal" value={markup} onChange={(event) => setMarkup(event.target.value)} className="w-full rounded-xl border bg-white px-4 py-3 focus:border-brand-500" />
        </label>
      </div>

      <div className="mt-3 rounded-xl bg-slate-50 px-4 py-3 text-xs text-slate-600">
        Cálculo: <strong>costo actual − {discountNumber}%</strong> y después <strong>+ {markupNumber}% de margen</strong>. Podés cambiar el margen de un producto individual antes de agregarlo al presupuesto.
      </div>

      {error && <div className="mt-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>}
      {loading && <div className="mt-5 text-sm text-slate-500">Cargando productos…</div>}
      {!loading && query.trim() && results.length === 0 && <div className="mt-5 rounded-xl border border-dashed p-5 text-sm text-slate-500">No encontré productos con “{query}”. Probá con otra palabra, marca o código.</div>}

      {results.length > 0 && (
        <div className="mt-5 overflow-hidden rounded-xl border">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[980px] text-left text-sm">
              <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="w-10 px-3 py-3"><input aria-label="Seleccionar resultados" type="checkbox" checked={results.every((p) => Boolean(selected[p.id]))} onChange={toggleAllVisible} /></th>
                  <th className="px-4 py-3">Código</th>
                  <th className="px-4 py-3">Producto</th>
                  <th className="px-4 py-3">Marca</th>
                  <th className="px-4 py-3 text-right">Costo</th>
                  <th className="px-4 py-3 text-right">Con descuento</th>
                  <th className="px-4 py-3 text-right">Margen %</th>
                  <th className="px-4 py-3 text-right">Precio calculado</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {results.map((product) => {
                  const { base, discounted, calculated, productMarkup } = getCalculatedPrice(product)
                  return (
                    <tr key={product.id} className={selected[product.id] ? 'bg-brand-50/40' : 'bg-white hover:bg-slate-50'}>
                      <td className="px-3 py-3"><input aria-label={`Seleccionar ${product.name}`} type="checkbox" checked={Boolean(selected[product.id])} onChange={() => setSelected((previous) => ({ ...previous, [product.id]: !previous[product.id] }))} /></td>
                      <td className="whitespace-nowrap px-4 py-3 font-mono text-xs text-slate-600">{product.sku || '—'}</td>
                      <td className="px-4 py-3 font-semibold text-slate-900">{product.name}</td>
                      <td className="px-4 py-3 text-slate-600">{product.brand || '—'}</td>
                      <td className="whitespace-nowrap px-4 py-3 text-right text-slate-600">{money(base)}</td>
                      <td className="whitespace-nowrap px-4 py-3 text-right">{money(discounted)}</td>
                      <td className="px-4 py-2 text-right">
                        <input
                          inputMode="decimal"
                          value={customMarkup[product.id] ?? ''}
                          onChange={(event) => setCustomMarkup((previous) => ({ ...previous, [product.id]: event.target.value }))}
                          placeholder={String(markupNumber)}
                          className="w-20 rounded-lg border px-2 py-1.5 text-right text-sm"
                          aria-label={`Margen para ${product.name}`}
                        />
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 text-right text-base font-black text-brand-700">{money(calculated)}<div className="text-[10px] font-normal text-slate-400">margen {productMarkup}%</div></td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
          {results.length === 30 && <div className="border-t bg-slate-50 px-4 py-2 text-xs text-slate-500">Se muestran los primeros 30 resultados. Agregá más palabras para afinar la búsqueda.</div>}
        </div>
      )}
    </section>
  )
}
