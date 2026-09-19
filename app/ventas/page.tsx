import Link from 'next/link'
import { AppShell } from '@/components/AppShell'
import { createClient } from '@/lib/supabase/server'

const money=(n:number)=>new Intl.NumberFormat('es-AR',{style:'currency',currency:'ARS',maximumFractionDigits:2}).format(n||0)
const statusLabel:Record<string,string>={confirmed:'Confirmada',delivered:'Entregada',cancelled:'Cancelada'}

export default async function SalesPage(){
  const supabase=await createClient()
  const {data}=await supabase.from('sales').select('id,number,created_at,customer_name,total,total_cost,profit,status,sale_payments(amount)').order('created_at',{ascending:false})
  const sales=data??[]
  const active=sales.filter((s:any)=>s.status!=='cancelled')
  const billed=active.reduce((a:number,s:any)=>a+Number(s.total),0)
  const profit=active.reduce((a:number,s:any)=>a+Number(s.profit),0);const collected=active.reduce((a:number,s:any)=>a+(s.sale_payments??[]).reduce((x:number,p:any)=>x+Number(p.amount),0),0)
  return <AppShell>
    <div><h1 className="text-2xl font-bold">Ventas</h1><p className="text-slate-500">Ventas confirmadas y rentabilidad real.</p></div>
    <div className="mt-6 grid gap-3 sm:grid-cols-4">
      <div className="rounded-2xl border bg-white p-4"><div className="text-sm text-slate-500">Ventas</div><div className="mt-1 text-2xl font-bold">{active.length}</div></div>
      <div className="rounded-2xl border bg-white p-4"><div className="text-sm text-slate-500">Total vendido</div><div className="mt-1 text-2xl font-bold">{money(billed)}</div></div>
      <div className="rounded-2xl border bg-white p-4"><div className="text-sm text-slate-500">Cobrado</div><div className="mt-1 text-2xl font-bold">{money(collected)}</div></div><div className="rounded-2xl border bg-white p-4"><div className="text-sm text-slate-500">Ganancia</div><div className="mt-1 text-2xl font-bold">{money(profit)}</div></div>
    </div>
    <div className="mt-6 space-y-3">{sales.map((s:any)=><Link href={`/ventas/${s.id}`} key={s.id} className="grid gap-2 rounded-2xl border bg-white p-4 transition hover:border-brand-300 hover:shadow-sm sm:grid-cols-[1fr_auto_auto] sm:items-center sm:gap-8"><div><div className="font-semibold">Venta #{String(s.number).padStart(6,'0')}</div><div className="text-sm text-slate-500">{s.customer_name||'Consumidor final'} · {new Date(s.created_at).toLocaleDateString('es-AR')}</div></div><div className="sm:text-right"><div className="text-xs text-slate-500">Ganancia</div><div className="font-semibold">{money(Number(s.profit))}</div></div><div className="sm:min-w-32 sm:text-right"><div className="font-bold">{money(Number(s.total))}</div><div className="text-xs text-slate-500">{statusLabel[s.status]??s.status}</div></div></Link>)}</div>
    {!sales.length&&<div className="mt-6 rounded-2xl border bg-white p-8 text-center text-sm text-slate-500">Todavía no hay ventas. Abrí un presupuesto y confirmalo como venta.</div>}
  </AppShell>
}
