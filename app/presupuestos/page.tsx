import Link from 'next/link'
import { AppShell } from '@/components/AppShell'
import { createClient } from '@/lib/supabase/server'

const money = (n:number) => new Intl.NumberFormat('es-AR', { style:'currency', currency:'ARS', maximumFractionDigits:0 }).format(n)

export default async function QuotesPage() {
  const supabase = await createClient()
  const { data } = await supabase.from('quotes').select('id,number,created_at,total,status,customers(name)').order('created_at', { ascending:false })
  return <AppShell><div className="flex items-center justify-between"><div><h1 className="text-2xl font-bold">Presupuestos</h1><p className="text-slate-500">Historial comercial.</p></div><Link href="/presupuestos/nuevo" className="rounded-xl bg-brand-600 px-4 py-2 text-sm font-semibold text-white">Nuevo</Link></div>
    <div className="mt-6 space-y-3">{(data ?? []).map((q:any)=><div key={q.id} className="flex items-center justify-between rounded-2xl border bg-white p-4"><div><div className="font-semibold">Presupuesto #{q.number}</div><div className="text-sm text-slate-500">{q.customers?.name ?? 'Sin cliente'}</div></div><div className="text-right"><div className="font-bold">{money(Number(q.total))}</div><div className="text-xs text-slate-500">{q.status}</div></div></div>)}</div>
  </AppShell>
}
