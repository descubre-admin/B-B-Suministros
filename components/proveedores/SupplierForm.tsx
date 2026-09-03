'use client'

import { FormEvent, useEffect, useMemo, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { PRICING_MODE_LABELS, type PricingMode } from '@/lib/pricing'

type Supplier = {
  id: string
  name: string
  code: string | null
  phone: string | null
  notes: string | null
  pricing_mode: PricingMode
  default_multiplier: number | string
  default_pack_quantity: number | string
  default_discount_percent: number | string
  default_surcharge_percent: number | string
  default_markup_percent: number | string
  active: boolean
}

type Props = {
  supplier?: Supplier | null
  onSaved: () => void | Promise<void>
  onCancel: () => void
}

function num(value: string) {
  const normalized = value.trim().includes(',')
    ? value.trim().replace(/\./g, '').replace(',', '.')
    : value.trim()
  const parsed = Number(normalized)
  return Number.isFinite(parsed) ? parsed : 0
}

export default function SupplierForm({ supplier, onSaved, onCancel }: Props) {
  const supabase = useMemo(() => createClient(), [])
  const [name, setName] = useState('')
  const [code, setCode] = useState('')
  const [phone, setPhone] = useState('')
  const [notes, setNotes] = useState('')
  const [pricingMode, setPricingMode] = useState<PricingMode>('unit')
  const [multiplier, setMultiplier] = useState('1')
  const [packQuantity, setPackQuantity] = useState('1')
  const [discount, setDiscount] = useState('0')
  const [surcharge, setSurcharge] = useState('0')
  const [markup, setMarkup] = useState('20')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!supplier) {
      setName('')
      setCode('')
      setPhone('')
      setNotes('')
      setPricingMode('unit')
      setMultiplier('1')
      setPackQuantity('1')
      setDiscount('0')
      setSurcharge('0')
      setMarkup('20')
      setError('')
      return
    }
    setName(supplier.name ?? '')
    setCode(supplier.code ?? '')
    setPhone(supplier.phone ?? '')
    setNotes(supplier.notes ?? '')
    setPricingMode(supplier.pricing_mode)
    setMultiplier(String(supplier.default_multiplier ?? 1))
    setPackQuantity(String(supplier.default_pack_quantity ?? 1))
    setDiscount(String(supplier.default_discount_percent ?? 0))
    setSurcharge(String(supplier.default_surcharge_percent ?? 0))
    setMarkup(String(supplier.default_markup_percent ?? 20))
    setError('')
  }, [supplier])

  async function submit(event: FormEvent) {
    event.preventDefault()
    setError('')
    if (!name.trim()) {
      setError('Ingresá el nombre del proveedor.')
      return
    }

    setSaving(true)
    const payload = {
      name: name.trim(),
      code: code.trim() || null,
      phone: phone.trim() || null,
      notes: notes.trim() || null,
      pricing_mode: pricingMode,
      default_multiplier: num(multiplier) || 1,
      default_pack_quantity: num(packQuantity) || 1,
      default_discount_percent: num(discount),
      default_surcharge_percent: num(surcharge),
      default_markup_percent: num(markup),
      active: true,
    }

    const result = supplier?.id
      ? await supabase.from('suppliers').update(payload).eq('id', supplier.id)
      : await supabase.from('suppliers').insert(payload)

    setSaving(false)
    if (result.error) {
      setError([result.error.message, result.error.details, result.error.hint].filter(Boolean).join(' · '))
      return
    }
    await onSaved()
  }

  return (
    <form onSubmit={submit} className="space-y-5">
      <div>
        <h2 className="text-lg font-semibold">{supplier ? 'Editar proveedor' : 'Nuevo proveedor'}</h2>
        <p className="mt-1 text-sm text-slate-500">La regla se usa como valor predeterminado al cargar productos de este proveedor.</p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <label className="text-sm font-medium">Proveedor *
          <input required value={name} onChange={(e) => setName(e.target.value)} className="mt-1.5 w-full rounded-xl border px-3 py-2.5 font-normal" />
        </label>
        <label className="text-sm font-medium">Código
          <input value={code} onChange={(e) => setCode(e.target.value)} className="mt-1.5 w-full rounded-xl border px-3 py-2.5 font-normal" />
        </label>
        <label className="text-sm font-medium">WhatsApp / teléfono
          <input value={phone} onChange={(e) => setPhone(e.target.value)} className="mt-1.5 w-full rounded-xl border px-3 py-2.5 font-normal" />
        </label>
        <label className="text-sm font-medium">Regla de precios
          <select value={pricingMode} onChange={(e) => setPricingMode(e.target.value as PricingMode)} className="mt-1.5 w-full rounded-xl border px-3 py-2.5 font-normal">
            {Object.entries(PRICING_MODE_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
          </select>
        </label>
        <label className="text-sm font-medium">Multiplicador predeterminado
          <input inputMode="decimal" value={multiplier} onChange={(e) => setMultiplier(e.target.value)} className="mt-1.5 w-full rounded-xl border px-3 py-2.5 font-normal" />
          <span className="mt-1 block text-xs font-normal text-slate-500">Ej.: cable por metro × 100.</span>
        </label>
        <label className="text-sm font-medium">Unidades por caja/pack
          <input inputMode="decimal" value={packQuantity} onChange={(e) => setPackQuantity(e.target.value)} className="mt-1.5 w-full rounded-xl border px-3 py-2.5 font-normal" />
        </label>
        <label className="text-sm font-medium">Descuento proveedor %
          <input inputMode="decimal" value={discount} onChange={(e) => setDiscount(e.target.value)} className="mt-1.5 w-full rounded-xl border px-3 py-2.5 font-normal" />
        </label>
        <label className="text-sm font-medium">Recargo %
          <input inputMode="decimal" value={surcharge} onChange={(e) => setSurcharge(e.target.value)} className="mt-1.5 w-full rounded-xl border px-3 py-2.5 font-normal" />
        </label>
        <label className="text-sm font-medium">Margen B&B sugerido %
          <input inputMode="decimal" value={markup} onChange={(e) => setMarkup(e.target.value)} className="mt-1.5 w-full rounded-xl border px-3 py-2.5 font-normal" />
        </label>
        <label className="text-sm font-medium sm:col-span-2">Notas
          <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} className="mt-1.5 w-full rounded-xl border px-3 py-2.5 font-normal" />
        </label>
      </div>

      {error && <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div>}
      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <button type="button" onClick={onCancel} className="rounded-xl border px-4 py-2.5 text-sm font-semibold">Cancelar</button>
        <button disabled={saving} className="rounded-xl bg-brand-600 px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50">{saving ? 'Guardando…' : 'Guardar proveedor'}</button>
      </div>
    </form>
  )
}
