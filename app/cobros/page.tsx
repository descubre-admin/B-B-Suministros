import Link from 'next/link'
import {AppShell} from '@/components/AppShell'
import {createClient} from '@/lib/supabase/server'
const money=(n:number)=>new Intl.NumberFormat('es-AR',{style:'currency',currency:'ARS',maximumFractionDigits:2}).format(n||0)
export default async function Cobros(){
 const supabase=await createClient(); const {data}=await supabase.from('sales').select('id,number,customer_name,total,created_at,status,sale_payments(amount)').neq('status','cancelled').order('created_at',{ascending:false})
 const rows=(data??[]).map((s:any)=>{const paid=(s.sale_payments??[]).reduce((a:number,p:any)=>a+Number(p.amount),0);return {...s,paid,balance:Math.max(0,Number(s.total)-paid)}})
 const pending=rows.filter((r:any)=>r.balance>0), collected=rows.reduce((a:number,r:any)=>a+r.paid,0), debt=pending.reduce((a:number,r:any)=>a+r.balance,0)
 return <AppShell><h1 className="text-2xl font-bold">Cobros</h1><p className="text-slate-500">Dinero recibido y saldos pendientes.</p>
 <div className="mt-6 grid gap-3 sm:grid-cols-3"><Card t="Cobrado" v={money(collected)}/><Card t="Por cobrar" v={money(debt)}/><Card t="Ventas con saldo" v={String(pending.length)}/></div>
 <div className="mt-6 space-y-3">{pending.map((r:any)=><Link key={r.id} href={`/ventas/${r.id}`} className="grid gap-2 rounded-2xl border bg-white p-4 hover:shadow-sm sm:grid-cols-[1fr_auto_auto] sm:items-center sm:gap-8"><div><b>Venta #{String(r.number).padStart(6,'0')}</b><div className="text-sm text-slate-500">{r.customer_name||'Consumidor final'} · {new Date(r.created_at).toLocaleDateString('es-AR')}</div></div><div className="sm:text-right"><div className="text-xs text-slate-500">Cobrado</div><b>{money(r.paid)}</b></div><div className="sm:text-right"><div className="text-xs text-slate-500">Pendiente</div><b>{money(r.balance)}</b></div></Link>)}</div>{!pending.length&&<div className="mt-6 rounded-2xl border bg-white p-8 text-center text-slate-500">No hay saldos pendientes.</div>}</AppShell>
}
function Card({t,v}:{t:string,v:string}){return <div className="rounded-2xl border bg-white p-4"><div className="text-sm text-slate-500">{t}</div><div className="mt-1 text-2xl font-bold">{v}</div></div>}
