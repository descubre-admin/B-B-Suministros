'use client'

import { FormEvent, useEffect, useMemo, useState } from 'react'
import { AppShell } from '@/components/AppShell'
import { createClient } from '@/lib/supabase/client'
import { Plus, Trash2 } from 'lucide-react'

type Customer = { id:string; name:string; phone:string|null; city:string|null; notes:string|null }

export default function CustomersPage() {
  const supabase = useMemo(()=>createClient(),[])
  const [customers,setCustomers] = useState<Customer[]>([])
  const [open,setOpen] = useState(false)
  const [loading,setLoading] = useState(true)
  const [form,setForm] = useState({name:'',phone:'',city:'',notes:''})

  async function load(){ setLoading(true); const {data}=await supabase.from('customers').select('*').order('name'); setCustomers((data??[]) as Customer[]); setLoading(false) }
  useEffect(()=>{void load()},[])
  async function create(e:FormEvent){ e.preventDefault(); const {data:{user}}=await supabase.auth.getUser(); if(!user)return; const {error}=await supabase.from('customers').insert({user_id:user.id,name:form.name.trim(),phone:form.phone.trim()||null,city:form.city.trim()||null,notes:form.notes.trim()||null}); if(error)return alert(error.message); setForm({name:'',phone:'',city:'',notes:''});setOpen(false);await load() }
  async function remove(id:string){ if(!confirm('¿Eliminar este cliente?')) return; const {error}=await supabase.from('customers').delete().eq('id',id); if(error)return alert(error.message); await load() }

  return <AppShell>
    <div className="flex items-end justify-between gap-3"><div><h1 className="text-2xl font-bold">Clientes</h1><p className="text-slate-500">Guardá sus datos para presupuestar más rápido.</p></div><button onClick={()=>setOpen(v=>!v)} className="flex items-center gap-2 rounded-xl bg-brand-600 px-4 py-2 text-sm font-semibold text-white"><Plus size={17}/> Nuevo</button></div>
    {open && <form onSubmit={create} className="mt-6 rounded-2xl border bg-white p-5 shadow-sm"><div className="grid gap-4 sm:grid-cols-2"><label className="text-sm font-medium">Nombre<input required value={form.name} onChange={e=>setForm({...form,name:e.target.value})} className="mt-1.5 w-full rounded-xl border px-3 py-2.5 font-normal"/></label><label className="text-sm font-medium">WhatsApp<input value={form.phone} onChange={e=>setForm({...form,phone:e.target.value})} className="mt-1.5 w-full rounded-xl border px-3 py-2.5 font-normal" placeholder="Ej: 2983..."/></label><label className="text-sm font-medium">Localidad<input value={form.city} onChange={e=>setForm({...form,city:e.target.value})} className="mt-1.5 w-full rounded-xl border px-3 py-2.5 font-normal" placeholder="Tres Arroyos / Reta"/></label><label className="text-sm font-medium">Notas<input value={form.notes} onChange={e=>setForm({...form,notes:e.target.value})} className="mt-1.5 w-full rounded-xl border px-3 py-2.5 font-normal"/></label></div><div className="mt-5 flex justify-end gap-2"><button type="button" onClick={()=>setOpen(false)} className="rounded-xl border px-4 py-2 text-sm font-semibold">Cancelar</button><button className="rounded-xl bg-brand-600 px-4 py-2 text-sm font-semibold text-white">Guardar cliente</button></div></form>}
    <div className="mt-6 grid gap-3">{customers.map(c=><div key={c.id} className="flex items-center justify-between rounded-2xl border bg-white p-4"><div><div className="font-semibold">{c.name}</div><div className="text-sm text-slate-500">{c.phone || 'Sin teléfono'} · {c.city || 'Sin localidad'}</div></div><button onClick={()=>remove(c.id)} className="rounded-lg p-2 text-slate-400 hover:bg-red-50 hover:text-red-600"><Trash2 size={17}/></button></div>)}</div>
    {loading && <div className="mt-6 text-sm text-slate-500">Cargando…</div>}{!loading&&!customers.length&&<div className="mt-6 rounded-2xl border bg-white p-6 text-sm text-slate-500">Todavía no cargaste clientes.</div>}
  </AppShell>
}
