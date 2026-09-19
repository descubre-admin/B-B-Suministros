import Link from 'next/link'
import { AppShell } from '@/components/AppShell'
import DashboardPriceFinder from '@/components/DashboardPriceFinder'
import { createClient } from '@/lib/supabase/server'

const money = (n: number) => new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', maximumFractionDigits: 0 }).format(n || 0)

export default async function Dashboard() {
  const supabase = await createClient()
  const now = new Date()
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString()

  const [productsRes, customersRes, quotesRes, salesRes] = await Promise.all([
    supabase.from('products').select('*', { count: 'exact', head: true }),
    supabase.from('customers').select('*', { count: 'exact', head: true }),
    supabase.from('quotes').select('*', { count: 'exact', head: true }),
    supabase
      .from('sales')
      .select('id,number,created_at,customer_name,total,total_cost,profit,status,sale_payments(amount)')
      .order('created_at', { ascending: false }),
  ])

  const sales = (salesRes.data ?? []) as any[]
  const active = sales.filter((s) => s.status !== 'cancelled')
  const monthSales = active.filter((s) => new Date(s.created_at) >= new Date(monthStart))
  const paidFor = (s: any) => (s.sale_payments ?? []).reduce((a: number, p: any) => a + Number(p.amount || 0), 0)

  const soldMonth = monthSales.reduce((a, s) => a + Number(s.total || 0), 0)
  const profitMonth = monthSales.reduce((a, s) => a + Number(s.profit || 0), 0)
  const collectedTotal = active.reduce((a, s) => a + paidFor(s), 0)
  const receivable = active.reduce((a, s) => a + Math.max(0, Number(s.total || 0) - paidFor(s)), 0)
  const pendingCount = active.filter((s) => Number(s.total || 0) - paidFor(s) > 0.01).length
  const margin = soldMonth > 0 ? (profitMonth / soldMonth) * 100 : 0
  const recent = sales.slice(0, 6)

  return (
    <AppShell>
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold">Dashboard</h1>
          <p className="mt-1 text-slate-500">Resumen comercial de B&B Suministros.</p>
        </div>
        <div className="text-sm text-slate-500">{now.toLocaleDateString('es-AR', { month: 'long', year: 'numeric' })}</div>
      </div>

      <div className="mt-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Metric title="Vendido este mes" value={money(soldMonth)} detail={`${monthSales.length} venta${monthSales.length === 1 ? '' : 's'}`} />
        <Metric title="Ganancia este mes" value={money(profitMonth)} detail={`Margen ${margin.toFixed(1)}%`} />
        <Metric title="Cobrado total" value={money(collectedTotal)} detail="Sobre ventas activas" />
        <Metric title="Por cobrar" value={money(receivable)} detail={`${pendingCount} venta${pendingCount === 1 ? '' : 's'} con saldo`} emphasis={receivable > 0} />
      </div>

      <div className="mt-4 grid gap-4 sm:grid-cols-3">
        <SmallMetric title="Productos" value={productsRes.count ?? 0} href="/productos" />
        <SmallMetric title="Clientes" value={customersRes.count ?? 0} href="/clientes" />
        <SmallMetric title="Presupuestos" value={quotesRes.count ?? 0} href="/presupuestos" />
      </div>

      <div className="mt-6 grid gap-6 xl:grid-cols-[1.35fr_.65fr]">
        <section className="rounded-2xl border bg-white shadow-sm">
          <div className="flex items-center justify-between border-b p-5">
            <div><h2 className="font-bold">Ventas recientes</h2><p className="text-sm text-slate-500">Últimos movimientos confirmados.</p></div>
            <Link href="/ventas" className="text-sm font-semibold text-brand-700 hover:underline">Ver todas</Link>
          </div>
          <div className="divide-y">
            {recent.map((s) => {
              const paid = paidFor(s)
              const balance = Math.max(0, Number(s.total || 0) - paid)
              return <Link key={s.id} href={`/ventas/${s.id}`} className="grid gap-2 p-4 hover:bg-slate-50 sm:grid-cols-[1fr_auto_auto] sm:items-center sm:gap-6">
                <div><div className="font-semibold">Venta #{String(s.number).padStart(6, '0')}</div><div className="text-sm text-slate-500">{s.customer_name || 'Consumidor final'} · {new Date(s.created_at).toLocaleDateString('es-AR')}</div></div>
                <div className="sm:text-right"><div className="text-xs text-slate-500">Ganancia</div><div className="font-semibold">{money(Number(s.profit || 0))}</div></div>
                <div className="sm:min-w-32 sm:text-right"><div className="font-bold">{money(Number(s.total || 0))}</div><div className={`text-xs ${balance > 0 ? 'text-amber-700' : 'text-emerald-700'}`}>{s.status === 'cancelled' ? 'Cancelada' : balance > 0 ? `Debe ${money(balance)}` : 'Cobrada'}</div></div>
              </Link>
            })}
            {!recent.length && <div className="p-8 text-center text-sm text-slate-500">Todavía no hay ventas confirmadas.</div>}
          </div>
        </section>

        <section className="rounded-2xl border bg-white p-5 shadow-sm">
          <h2 className="font-bold">Accesos rápidos</h2>
          <p className="mt-1 text-sm text-slate-500">Las tareas más usadas del negocio.</p>
          <div className="mt-4 grid gap-2">
            <Quick href="/presupuestos/nuevo" title="Nuevo presupuesto" detail="Cotizar productos a un cliente" />
            <Quick href="/cobros" title="Cobros pendientes" detail={`${pendingCount} venta${pendingCount === 1 ? '' : 's'} con saldo`} />
            <Quick href="/productos" title="Productos y precios" detail="Consultar costos y precios de venta" />
            <Quick href="/productos/importar" title="Importar lista" detail="Actualizar precios de proveedores" />
          </div>
        </section>
      </div>

      <div className="mt-6">
        <DashboardPriceFinder />
      </div>
    </AppShell>
  )
}

function Metric({ title, value, detail, emphasis = false }: { title: string, value: string, detail: string, emphasis?: boolean }) {
  return <div className={`rounded-2xl border bg-white p-5 shadow-sm ${emphasis ? 'border-amber-200' : ''}`}><div className="text-sm text-slate-500">{title}</div><div className="mt-2 text-2xl font-black tracking-tight">{value}</div><div className="mt-1 text-xs text-slate-500">{detail}</div></div>
}
function SmallMetric({ title, value, href }: { title: string, value: number, href: string }) {
  return <Link href={href} className="rounded-2xl border bg-white p-4 shadow-sm transition hover:shadow"><div className="text-sm text-slate-500">{title}</div><div className="mt-1 text-2xl font-bold">{value}</div></Link>
}
function Quick({ href, title, detail }: { href: string, title: string, detail: string }) {
  return <Link href={href} className="rounded-xl border p-3 transition hover:border-brand-300 hover:bg-slate-50"><div className="font-semibold">{title}</div><div className="text-xs text-slate-500">{detail}</div></Link>
}
