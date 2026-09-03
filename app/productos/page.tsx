
'use client'

import { useEffect, useMemo, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import ProductForm from '@/components/productos/ProductForm'

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
  created_at: string
}

const money = (n: number) =>
  new Intl.NumberFormat('es-AR', {
    style: 'currency',
    currency: 'ARS',
    maximumFractionDigits: 2,
  }).format(n || 0)

export default function ProductosPage() {
  const supabase = useMemo(() => createClient(), [])
  const [products, setProducts] = useState<Product[]>([])
  const [loading, setLoading] = useState(true)
  const [query, setQuery] = useState('')
  const [editing, setEditing] = useState<Product | null>(null)
  const [showForm, setShowForm] = useState(false)

  async function loadProducts() {
    setLoading(true)
    const { data, error } = await supabase
      .from('products')
      .select('id,name,brand,sku,category,cost,markup_percent,suggested_price,sale_price,stock,active,created_at')
      .order('name', { ascending: true })

    if (error) {
      console.error(error)
      setProducts([])
    } else {
      setProducts((data || []) as Product[])
    }
    setLoading(false)
  }

  useEffect(() => {
    loadProducts()
  }, [])

  async function removeProduct(id: string) {
    if (!confirm('¿Eliminar este producto?')) return
    const { error } = await supabase.from('products').delete().eq('id', id)
    if (error) {
      alert(error.message)
      return
    }
    loadProducts()
  }

  const filtered = products.filter((p) => {
    const text = `${p.name} ${p.brand || ''} ${p.sku || ''} ${p.category || ''}`.toLowerCase()
    return text.includes(query.toLowerCase())
  })

  return (
    <main className="mx-auto max-w-7xl p-4 sm:p-6">
      <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold">Productos</h1>
          <p className="text-sm text-muted-foreground">
            Costos, márgenes y precios de venta de B&B Suministros.
          </p>
        </div>

        <button
          onClick={() => {
            setEditing(null)
            setShowForm(true)
          }}
          className="rounded-xl bg-black px-4 py-3 text-sm font-semibold text-white"
        >
          + Nuevo producto
        </button>
      </div>

      <div className="mb-4">
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Buscar por producto, marca, código o categoría..."
          className="w-full rounded-xl border px-4 py-3 outline-none"
        />
      </div>

      {showForm && (
        <div className="mb-6 rounded-2xl border p-4 shadow-sm">
          <ProductForm
            product={editing}
            onCancel={() => {
              setShowForm(false)
              setEditing(null)
            }}
            onSaved={() => {
              setShowForm(false)
              setEditing(null)
              loadProducts()
            }}
          />
        </div>
      )}

      {loading ? (
        <div className="rounded-2xl border p-6">Cargando productos...</div>
      ) : filtered.length === 0 ? (
        <div className="rounded-2xl border p-6 text-sm text-muted-foreground">
          No hay productos todavía.
        </div>
      ) : (
        <>
          <div className="hidden overflow-hidden rounded-2xl border md:block">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 text-left">
                <tr>
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
                {filtered.map((p) => {
                  const gain = Number(p.sale_price) - Number(p.cost)
                  return (
                    <tr key={p.id} className="border-t">
                      <td className="p-3">
                        <div className="font-medium">{p.name}</div>
                        <div className="text-xs text-muted-foreground">
                          {[p.brand, p.sku, p.category].filter(Boolean).join(' · ')}
                        </div>
                      </td>
                      <td className="p-3">{money(Number(p.cost))}</td>
                      <td className="p-3">{p.markup_percent}%</td>
                      <td className="p-3">{money(Number(p.suggested_price))}</td>
                      <td className="p-3 font-semibold">{money(Number(p.sale_price))}</td>
                      <td className="p-3">{money(gain)}</td>
                      <td className="p-3">
                        <div className="flex gap-2">
                          <button
                            onClick={() => {
                              setEditing(p)
                              setShowForm(true)
                            }}
                            className="rounded-lg border px-3 py-2"
                          >
                            Editar
                          </button>
                          <button
                            onClick={() => removeProduct(p.id)}
                            className="rounded-lg border px-3 py-2"
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

          <div className="grid gap-3 md:hidden">
            {filtered.map((p) => {
              const gain = Number(p.sale_price) - Number(p.cost)
              return (
                <div key={p.id} className="rounded-2xl border p-4">
                  <div className="mb-3">
                    <div className="font-semibold">{p.name}</div>
                    <div className="text-xs text-muted-foreground">
                      {[p.brand, p.sku, p.category].filter(Boolean).join(' · ')}
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-3 text-sm">
                    <div>
                      <div className="text-xs text-muted-foreground">Costo</div>
                      <div>{money(Number(p.cost))}</div>
                    </div>
                    <div>
                      <div className="text-xs text-muted-foreground">Margen</div>
                      <div>{p.markup_percent}%</div>
                    </div>
                    <div>
                      <div className="text-xs text-muted-foreground">Sugerido</div>
                      <div>{money(Number(p.suggested_price))}</div>
                    </div>
                    <div>
                      <div className="text-xs text-muted-foreground">Venta</div>
                      <div className="font-semibold">{money(Number(p.sale_price))}</div>
                    </div>
                    <div>
                      <div className="text-xs text-muted-foreground">Ganancia</div>
                      <div>{money(gain)}</div>
                    </div>
                  </div>

                  <div className="mt-4 flex gap-2">
                    <button
                      onClick={() => {
                        setEditing(p)
                        setShowForm(true)
                      }}
                      className="flex-1 rounded-xl border px-3 py-2"
                    >
                      Editar
                    </button>
                    <button
                      onClick={() => removeProduct(p.id)}
                      className="flex-1 rounded-xl border px-3 py-2"
                    >
                      Eliminar
                    </button>
                  </div>
                </div>
              )
            })}
          </div>
        </>
      )}
    </main>
  )
}
