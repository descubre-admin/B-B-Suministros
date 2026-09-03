
'use client'

import { FormEvent, useEffect, useMemo, useState } from 'react'
import { createClient } from '@/lib/supabase/client'

type Product = {
  id: string
  name: string
  brand: string | null
  sku: string | null
  category: string | null
  cost: number
  markup_percent: number
  suggested_price: number
  sale_price: number
  stock: number | null
  active: boolean
}

type Props = {
  product?: Product | null
  onSaved: () => void
  onCancel: () => void
}

export default function ProductForm({ product, onSaved, onCancel }: Props) {
  const supabase = useMemo(() => createClient(), [])
  const [name, setName] = useState('')
  const [brand, setBrand] = useState('')
  const [sku, setSku] = useState('')
  const [category, setCategory] = useState('')
  const [cost, setCost] = useState('0')
  const [markup, setMarkup] = useState('20')
  const [salePrice, setSalePrice] = useState('')
  const [stock, setStock] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!product) {
      setName('')
      setBrand('')
      setSku('')
      setCategory('')
      setCost('0')
      setMarkup('20')
      setSalePrice('')
      setStock('')
      return
    }

    setName(product.name || '')
    setBrand(product.brand || '')
    setSku(product.sku || '')
    setCategory(product.category || '')
    setCost(String(product.cost ?? 0))
    setMarkup(String(product.markup_percent ?? 20))
    setSalePrice(String(product.sale_price ?? ''))
    setStock(product.stock === null || product.stock === undefined ? '' : String(product.stock))
  }, [product])

  const costNumber = Number(cost.replace(',', '.')) || 0
  const markupNumber = Number(markup.replace(',', '.')) || 0
  const suggested = Math.round(costNumber * (1 + markupNumber / 100) * 100) / 100
  const finalSale = salePrice === '' ? suggested : Number(salePrice.replace(',', '.')) || 0
  const gain = finalSale - costNumber

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError('')

    if (!name.trim()) {
      setError('Ingresá el nombre del producto.')
      return
    }

    setSaving(true)

    // Importante: suggested_price NO se envía.
    // Supabase/PostgreSQL lo calcula automáticamente porque es una generated column.
    const payload = {
      name: name.trim(),
      brand: brand.trim() || null,
      sku: sku.trim() || null,
      category: category.trim() || null,
      cost: costNumber,
      markup_percent: markupNumber,
      sale_price: finalSale,
      stock: stock === '' ? null : Number(stock.replace(',', '.')),
      active: true,
    }

    const result = product?.id
      ? await supabase.from('products').update(payload).eq('id', product.id)
      : await supabase.from('products').insert(payload)

    setSaving(false)

    if (result.error) {
      setError(result.error.message)
      return
    }

    onSaved()
  }

  const currency = (value: number) =>
    new Intl.NumberFormat('es-AR', {
      style: 'currency',
      currency: 'ARS',
      maximumFractionDigits: 2,
    }).format(value)

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <h2 className="text-lg font-semibold">
          {product ? 'Editar producto' : 'Nuevo producto'}
        </h2>
        <p className="text-sm text-muted-foreground">
          El precio sugerido se calcula automáticamente desde costo + margen.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <label className="space-y-1">
          <span className="text-sm font-medium">Producto *</span>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Ej. Cable Trefilcon 2,5 mm² x 100 m"
            className="w-full rounded-xl border px-3 py-2.5"
          />
        </label>

        <label className="space-y-1">
          <span className="text-sm font-medium">Marca</span>
          <input
            value={brand}
            onChange={(e) => setBrand(e.target.value)}
            placeholder="Trefilcon"
            className="w-full rounded-xl border px-3 py-2.5"
          />
        </label>

        <label className="space-y-1">
          <span className="text-sm font-medium">Código / SKU</span>
          <input
            value={sku}
            onChange={(e) => setSku(e.target.value)}
            placeholder="TF-250"
            className="w-full rounded-xl border px-3 py-2.5"
          />
        </label>

        <label className="space-y-1">
          <span className="text-sm font-medium">Categoría</span>
          <input
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            placeholder="Cables"
            className="w-full rounded-xl border px-3 py-2.5"
          />
        </label>

        <label className="space-y-1">
          <span className="text-sm font-medium">Costo</span>
          <input
            inputMode="decimal"
            value={cost}
            onChange={(e) => setCost(e.target.value)}
            className="w-full rounded-xl border px-3 py-2.5"
          />
        </label>

        <label className="space-y-1">
          <span className="text-sm font-medium">Margen %</span>
          <input
            inputMode="decimal"
            value={markup}
            onChange={(e) => setMarkup(e.target.value)}
            className="w-full rounded-xl border px-3 py-2.5"
          />
        </label>

        <label className="space-y-1">
          <span className="text-sm font-medium">Precio final</span>
          <input
            inputMode="decimal"
            value={salePrice}
            onChange={(e) => setSalePrice(e.target.value)}
            placeholder={String(suggested)}
            className="w-full rounded-xl border px-3 py-2.5"
          />
          <span className="text-xs text-muted-foreground">
            Vacío = usa automáticamente el precio sugerido.
          </span>
        </label>

        <label className="space-y-1">
          <span className="text-sm font-medium">Stock</span>
          <input
            inputMode="decimal"
            value={stock}
            onChange={(e) => setStock(e.target.value)}
            placeholder="Opcional"
            className="w-full rounded-xl border px-3 py-2.5"
          />
        </label>
      </div>

      <div className="grid gap-3 rounded-2xl bg-muted/40 p-4 sm:grid-cols-3">
        <div>
          <div className="text-xs text-muted-foreground">Precio sugerido</div>
          <div className="font-semibold">{currency(suggested)}</div>
        </div>
        <div>
          <div className="text-xs text-muted-foreground">Precio final</div>
          <div className="font-semibold">{currency(finalSale)}</div>
        </div>
        <div>
          <div className="text-xs text-muted-foreground">Ganancia</div>
          <div className="font-semibold">{currency(gain)}</div>
        </div>
      </div>

      {error && (
        <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          {error}
        </div>
      )}

      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <button type="button" onClick={onCancel} className="rounded-xl border px-4 py-2.5">
          Cancelar
        </button>
        <button
          disabled={saving}
          className="rounded-xl bg-black px-4 py-2.5 font-semibold text-white disabled:opacity-60"
        >
          {saving ? 'Guardando...' : product ? 'Guardar cambios' : 'Crear producto'}
        </button>
      </div>
    </form>
  )
}
