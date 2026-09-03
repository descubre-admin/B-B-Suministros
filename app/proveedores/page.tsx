'use client'

import { useEffect, useMemo, useState } from 'react'
import { AppShell } from '@/components/AppShell'
import SupplierForm from '@/components/proveedores/SupplierForm'
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

export default function ProveedoresPage() {
  const supabase = useMemo(() => createClient(), [])
  const [suppliers, setSuppliers] = useState<Supplier[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [query, setQuery] = useState('')
  const [showForm, setShowForm] = useState(false)
  const [editing, setEditing] = useState<Supplier | null>(null)

  async function loadSuppliers() {
    setLoading(true)
    setError('')
    const { data, error } = await supabase
      .from('suppliers')
      .select('*')
      .order('name', { ascending: true })

    if (error) {
      setSuppliers([])
      setError([error.message, error.details, error.hint, error.code].filter(Boolean).join(' · '))
    } else {
      setSuppliers((data ?? []) as Supplier[])
    }
    setLoading(false)
  }

  useEffect(() => {
    void loadSuppliers()
  }, [])

  async function removeSupplier(id: string) {
    if (!confirm('¿Eliminar este proveedor? Los productos no se eliminan.')) return
    const { error } = await supabase.from('suppliers').delete().eq('id', id)
    if (error) {
      alert(error.message || 'No se pudo eliminar el proveedor.')
      return
    }
    await loadSuppliers()
  }

  const filtered = suppliers.filter((supplier) =>
    `${supplier.name} ${supplier.code ?? ''}`.toLowerCase().includes(query.trim().toLowerCase())
  )

  return (
    <AppShell>
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold">Proveedores</h1>
          <p className="mt-1 text-slate-500">Definí cómo calcula sus precios cada proveedor.</p>
        </div>
        <button
          type="button"
          onClick={() => {
            setEditing(null)
            setShowForm(true)
          }}
          className="rounded-xl bg-brand-600 px-4 py-2.5 text-sm font-semibold text-white"
        >
          + Nuevo proveedor
        </button>
      </div>

      <input
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        placeholder="Buscar proveedor..."
        className="mt-6 w-full rounded-xl border bg-white px-4 py-3 outline-none focus:border-brand-500"
      />

      {showForm && (
        <div className="mt-5 rounded-2xl border bg-white p-5 shadow-sm">
          <SupplierForm
            supplier={editing}
            onCancel={() => {
              setShowForm(false)
              setEditing(null)
            }}
            onSaved={async () => {
              setShowForm(false)
              setEditing(null)
              await loadSuppliers()
            }}
          />
        </div>
      )}

      {error && (
        <div className="mt-5 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          <div className="font-semibold">No pudimos cargar los proveedores</div>
          <div className="mt-1 break-words">{error}</div>
        </div>
      )}

      {loading ? (
        <div className="mt-6 text-sm text-slate-500">Cargando proveedores…</div>
      ) : !error && filtered.length === 0 ? (
        <div className="mt-6 rounded-2xl border bg-white p-6 text-sm text-slate-500">
          Todavía no cargaste proveedores.
        </div>
      ) : (
        !error && (
          <div className="mt-6 grid gap-3">
            {filtered.map((supplier) => (
              <div key={supplier.id} className="rounded-2xl border bg-white p-4 sm:flex sm:items-center sm:justify-between">
                <div>
                  <div className="font-semibold">{supplier.name}</div>
                  <div className="mt-1 text-sm text-slate-500">
                    {PRICING_MODE_LABELS[supplier.pricing_mode]}
                    {supplier.code ? ` · ${supplier.code}` : ''}
                  </div>
                  <div className="mt-2 text-xs text-slate-500">
                    Multiplicador: {Number(supplier.default_multiplier)} · Descuento: {Number(supplier.default_discount_percent)}% · Recargo: {Number(supplier.default_surcharge_percent)}% · Margen sugerido: {Number(supplier.default_markup_percent)}%
                  </div>
                </div>
                <div className="mt-4 flex gap-2 sm:mt-0">
                  <button
                    type="button"
                    onClick={() => {
                      setEditing(supplier)
                      setShowForm(true)
                    }}
                    className="rounded-xl border px-3 py-2 text-sm font-medium"
                  >
                    Editar
                  </button>
                  <button
                    type="button"
                    onClick={() => void removeSupplier(supplier.id)}
                    className="rounded-xl border px-3 py-2 text-sm font-medium text-red-600"
                  >
                    Eliminar
                  </button>
                </div>
              </div>
            ))}
          </div>
        )
      )}
    </AppShell>
  )
}
