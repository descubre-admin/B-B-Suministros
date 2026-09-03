import { AppShell } from '@/components/AppShell'
import { createClient } from '@/lib/supabase/server'

export default async function Dashboard() {
  const supabase = await createClient()
  const [{ count: products }, { count: customers }, { count: quotes }] = await Promise.all([
    supabase.from('products').select('*', { count: 'exact', head: true }),
    supabase.from('customers').select('*', { count: 'exact', head: true }),
    supabase.from('quotes').select('*', { count: 'exact', head: true }),
  ])

  return <AppShell>
    <h1 className="text-2xl font-bold">Dashboard</h1>
    <p className="mt-1 text-slate-500">Vista rápida de tu negocio.</p>
    <div className="mt-6 grid gap-4 sm:grid-cols-3">
      {[['Productos', products ?? 0], ['Clientes', customers ?? 0], ['Presupuestos', quotes ?? 0]].map(([k,v]) => (
        <div key={k} className="rounded-2xl border bg-white p-5 shadow-sm">
          <div className="text-sm text-slate-500">{k}</div><div className="mt-2 text-3xl font-bold">{v}</div>
        </div>
      ))}
    </div>
  </AppShell>
}
