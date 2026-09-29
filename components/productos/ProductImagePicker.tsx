'use client'

import { useMemo, useState } from 'react'
import { createClient } from '@/lib/supabase/client'

type Props = {
  productId?: string
  name: string
  brand: string
  sku: string
  description?: string
  value: string
  sourceUrl: string
  onChange: (url: string, sourceUrl?: string) => void
}

type SearchImage = { imageUrl: string; thumbnailUrl: string; title: string; source: string; link: string }

export default function ProductImagePicker({ productId, name, brand, sku, description='', value, sourceUrl, onChange }: Props) {
  const supabase = useMemo(() => createClient(), [])
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<SearchImage[]>([])
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState('')
  const [externalUrl, setExternalUrl] = useState('')

  const suggestedQuery = [brand, name, description, sku].filter(Boolean).join(' ')

  async function searchImages() {
    const q = query.trim() || suggestedQuery
    if (!q) return
    setLoading(true); setMessage(''); setExternalUrl('')
    try {
      const response = await fetch(`/api/images/search?q=${encodeURIComponent(q)}`)
      const data = await response.json()
      setResults(data.images ?? [])
      setMessage(data.message ?? '')
      setExternalUrl(data.externalSearchUrl ?? '')
    } catch { setMessage('No se pudo realizar la búsqueda.') }
    setLoading(false)
  }

  async function upload(file?: File) {
    if (!file) return
    const ext = file.name.split('.').pop() || 'jpg'
    const path = `${productId || 'nuevo'}/${crypto.randomUUID()}.${ext}`
    const { error } = await supabase.storage.from('product-images').upload(path, file, { upsert: false })
    if (error) { setMessage(error.message); return }
    const { data } = supabase.storage.from('product-images').getPublicUrl(path)
    onChange(data.publicUrl, '')
  }

  return <div className="rounded-2xl border bg-slate-50 p-4 sm:col-span-2">
    <div className="font-semibold">Imagen del producto</div>
    <p className="mt-1 text-xs text-slate-500">Subí una foto propia o buscá por marca, nombre, descripción y código. Verificá que la imagen corresponda al producto y que puedas usarla.</p>
    <div className="mt-4 grid gap-4 md:grid-cols-[180px_1fr]">
      <div className="flex min-h-40 items-center justify-center overflow-hidden rounded-xl border bg-white">
        {value ? <img src={value} alt={name || 'Producto'} className="h-40 w-full object-contain p-2" /> : <span className="px-3 text-center text-sm text-slate-400">Sin imagen</span>}
      </div>
      <div>
        <div className="flex flex-col gap-2 sm:flex-row">
          <input value={query} onChange={e=>setQuery(e.target.value)} placeholder={suggestedQuery || 'Buscar imagen del producto'} className="flex-1 rounded-xl border bg-white px-3 py-2.5" />
          <button type="button" onClick={searchImages} className="rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white">{loading ? 'Buscando…' : 'Buscar en Internet'}</button>
        </div>
        <div className="mt-2 flex flex-wrap gap-2">
          <label className="cursor-pointer rounded-xl border bg-white px-3 py-2 text-sm font-medium">Subir imagen<input type="file" accept="image/*" className="hidden" onChange={e=>void upload(e.target.files?.[0])}/></label>
          {value && <button type="button" onClick={()=>onChange('', '')} className="rounded-xl border bg-white px-3 py-2 text-sm">Quitar imagen</button>}
          {externalUrl && <a href={externalUrl} target="_blank" rel="noreferrer" className="rounded-xl border bg-white px-3 py-2 text-sm font-medium">Abrir búsqueda en Google</a>}
        </div>
        {message && <p className="mt-2 text-xs text-amber-700">{message}</p>}
      </div>
    </div>
    {results.length > 0 && <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
      {results.map((img,i)=><button key={`${img.imageUrl}-${i}`} type="button" onClick={()=>onChange(img.imageUrl, img.link)} className="overflow-hidden rounded-xl border bg-white text-left hover:border-brand-500">
        <img src={img.thumbnailUrl} alt={img.title} className="h-28 w-full object-contain p-2" />
        <div className="border-t p-2"><div className="truncate text-xs font-medium">{img.title || 'Imagen'}</div><div className="truncate text-[10px] text-slate-400">{img.source}</div></div>
      </button>)}
    </div>}
    {sourceUrl && <p className="mt-3 truncate text-[11px] text-slate-400">Origen: {sourceUrl}</p>}
  </div>
}
