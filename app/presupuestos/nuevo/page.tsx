'use client'

import { useEffect, useMemo, useState } from 'react'
import { AppShell } from '@/components/AppShell'
import { createClient } from '@/lib/supabase/client'
import { jsPDF } from 'jspdf'
import { Trash2 } from 'lucide-react'

const money = (n:number) => new Intl.NumberFormat('es-AR', { style:'currency', currency:'ARS', maximumFractionDigits:2 }).format(n || 0)
type Product = { id:string; name:string; brand:string|null; sale_price:number; sku:string|null }
type Customer = { id:string; name:string; phone:string|null; city:string|null }
type Item = { product:Product; qty:number; unitPrice:number }
type Settings = { business_name:string|null; phone:string|null; address:string|null; city:string|null; quote_validity_hours:number|null }

export default function NewQuotePage() {
  const supabase = useMemo(()=>createClient(),[])
  const [products,setProducts] = useState<Product[]>([])
  const [customers,setCustomers] = useState<Customer[]>([])
  const [settings,setSettings] = useState<Settings>({business_name:'B&B Suministros',phone:null,address:null,city:null,quote_validity_hours:48})
  const [customerId,setCustomerId] = useState('')
  const [query,setQuery] = useState('')
  const [items,setItems] = useState<Item[]>([])
  const [discount,setDiscount] = useState(0)
  const [saving,setSaving] = useState(false)

  useEffect(()=>{ void (async()=>{
    const [{data:p},{data:c},{data:s}] = await Promise.all([
      supabase.from('products').select('id,name,brand,sale_price,sku').eq('active',true).order('name'),
      supabase.from('customers').select('id,name,phone,city').order('name'),
      supabase.from('settings').select('business_name,phone,address,city,quote_validity_hours').maybeSingle(),
    ])
    setProducts((p ?? []) as Product[]); setCustomers((c ?? []) as Customer[]); if(s)setSettings(s as Settings)
  })() },[])

  const filtered = products.filter(p => `${p.name} ${p.brand??''} ${p.sku ?? ''}`.toLowerCase().includes(query.toLowerCase())).slice(0,8)
  const subtotal = useMemo(()=>items.reduce((s,i)=>s+i.qty*i.unitPrice,0),[items])
  const total = Math.max(0, subtotal - discount)
  const customer = customers.find(c=>c.id===customerId)
  const validity = settings.quote_validity_hours ?? 48

  function add(p:Product){ setItems(prev=>{ const ix=prev.findIndex(i=>i.product.id===p.id); if(ix>=0)return prev.map((i,n)=>n===ix?{...i,qty:i.qty+1}:i); return [...prev,{product:p,qty:1,unitPrice:Number(p.sale_price)}] }); setQuery('') }
  function patch(idx:number, patch:Partial<Item>){ setItems(v=>v.map((x,n)=>n===idx?{...x,...patch}:x)) }

  async function saveQuote(){
    if(!items.length)return
    setSaving(true)
    const validUntil = new Date(Date.now()+validity*60*60*1000).toISOString()
    const { data:q, error } = await supabase.from('quotes').insert({ customer_id: customerId || null, subtotal, discount, total, status:'draft', valid_until:validUntil.slice(0,10) }).select('id,number').single()
    if(error || !q){setSaving(false);return alert(error?.message ?? 'No se pudo guardar')}
    const rows = items.map(i=>({ quote_id:q.id, product_id:i.product.id, description:i.product.name, quantity:i.qty, unit_price:i.unitPrice, line_total:i.qty*i.unitPrice }))
    const { error:itemsError } = await supabase.from('quote_items').insert(rows)
    setSaving(false)
    if(itemsError)return alert(itemsError.message)
    alert(`Presupuesto #${q.number} guardado`)
  }

  function pdf(){
    const doc = new jsPDF()
    const business=settings.business_name||'B&B Suministros'
    doc.setFont('helvetica','bold'); doc.setFontSize(18); doc.text(business.toUpperCase(),14,18)
    doc.setFont('helvetica','normal'); doc.setFontSize(9); doc.text('Electricidad · Iluminación · Ferretería',14,25)
    const contact=[settings.address,settings.city,settings.phone].filter(Boolean).join(' · '); if(contact)doc.text(contact,14,31)
    doc.setFont('helvetica','bold');doc.setFontSize(15);doc.text('PRESUPUESTO',196,18,{align:'right'})
    doc.setFont('helvetica','normal');doc.setFontSize(10);doc.text(`Fecha: ${new Date().toLocaleDateString('es-AR')}`,196,26,{align:'right'});doc.text(`Cliente: ${customer?.name ?? 'Consumidor final'}`,14,43)
    let y=55;doc.setFont('helvetica','bold');doc.text('Detalle',14,y);doc.text('Importe',196,y,{align:'right'});y+=4;doc.line(14,y,196,y);y+=8;doc.setFont('helvetica','normal')
    items.forEach(i=>{doc.text(`${i.qty} x ${i.product.name}  (${money(i.unitPrice)} c/u)`,14,y);doc.text(money(i.qty*i.unitPrice),196,y,{align:'right'});y+=8;if(y>270){doc.addPage();y=20}})
    y+=3;doc.line(14,y,196,y);y+=9;if(discount>0){doc.text(`Descuento: ${money(discount)}`,196,y,{align:'right'});y+=8}doc.setFont('helvetica','bold');doc.setFontSize(13);doc.text(`TOTAL: ${money(total)}`,196,y,{align:'right'});y+=10;doc.setFont('helvetica','normal');doc.setFontSize(9);doc.text(`Precios válidos por ${validity} hs.`,14,y)
    doc.save(`BB-Suministros-presupuesto-${new Date().toISOString().slice(0,10)}.pdf`)
  }

  function whatsapp(){
    const raw=(customer?.phone ?? '').replace(/\D/g,''); const phone=raw.startsWith('54')?raw:raw?`54${raw.replace(/^0/,'')}`:''
    const detail=items.map(i=>`${i.qty} x ${i.product.name}: ${money(i.qty*i.unitPrice)}`).join('\n')
    const text=`Hola ${customer?.name ?? ''}, te envío el presupuesto de B&B Suministros:\n\n${detail}${discount>0?`\nDescuento: ${money(discount)}`:''}\n\n*TOTAL: ${money(total)}*\nPrecios válidos por ${validity} hs.`
    window.open(`https://wa.me/${phone}?text=${encodeURIComponent(text)}`,'_blank')
  }

  return <AppShell>
    <div><h1 className="text-2xl font-bold">Nuevo presupuesto</h1><p className="text-slate-500">Armalo en segundos y mandalo por WhatsApp.</p></div>
    <div className="mt-6 grid gap-6 lg:grid-cols-[1fr_360px]">
      <section className="space-y-4">
        <div className="rounded-2xl border bg-white p-4"><label className="text-sm font-medium">Cliente</label><select value={customerId} onChange={e=>setCustomerId(e.target.value)} className="mt-2 w-full rounded-xl border px-3 py-2.5"><option value="">Consumidor final</option>{customers.map(c=><option key={c.id} value={c.id}>{c.name}{c.city?` · ${c.city}`:''}</option>)}</select></div>
        <div className="rounded-2xl border bg-white p-4"><label className="text-sm font-medium">Buscar producto</label><input value={query} onChange={e=>setQuery(e.target.value)} placeholder="Ej: cable 2.5, Jeluz, Verona..." className="mt-2 w-full rounded-xl border px-3 py-2.5" />{query && <div className="mt-2 overflow-hidden rounded-xl border">{filtered.map(p=><button type="button" key={p.id} onClick={()=>add(p)} className="flex w-full items-center justify-between gap-3 border-b px-3 py-2.5 text-left last:border-0 hover:bg-slate-50"><span><span className="font-medium">{p.name}</span><span className="block text-xs text-slate-500">{p.brand} {p.sku?`· ${p.sku}`:''}</span></span><b>{money(Number(p.sale_price))}</b></button>)}{!filtered.length&&<div className="px-3 py-3 text-sm text-slate-500">Sin resultados.</div>}</div>}</div>
        <div className="rounded-2xl border bg-white p-4"><div className="font-semibold">Productos</div><div className="mt-3 space-y-3">{items.map((i,idx)=><div key={i.product.id} className="grid grid-cols-[1fr_70px_105px_36px] items-center gap-2"><div className="min-w-0"><div className="truncate font-medium">{i.product.name}</div><input type="number" min="0" step="0.01" value={i.unitPrice} onChange={e=>patch(idx,{unitPrice:Number(e.target.value)})} className="mt-1 w-32 rounded-lg border px-2 py-1 text-xs"/><span className="ml-1 text-xs text-slate-500">c/u</span></div><input type="number" min="0.01" step="0.01" value={i.qty} onChange={e=>patch(idx,{qty:Number(e.target.value)})} className="rounded-lg border px-2 py-2"/><div className="text-right font-semibold">{money(i.qty*i.unitPrice)}</div><button onClick={()=>setItems(v=>v.filter((_,n)=>n!==idx))} className="rounded-lg p-2 text-slate-400 hover:bg-red-50 hover:text-red-600"><Trash2 size={16}/></button></div>)}</div>{!items.length && <p className="mt-3 text-sm text-slate-500">Agregá productos desde el buscador.</p>}</div>
      </section>
      <aside className="h-fit rounded-2xl border bg-white p-5 lg:sticky lg:top-24"><div className="flex justify-between text-sm"><span>Subtotal</span><span>{money(subtotal)}</span></div><div className="mt-3 flex items-center justify-between gap-3 text-sm"><span>Descuento $</span><input type="number" min="0" value={discount} onChange={e=>setDiscount(Number(e.target.value))} className="w-32 rounded-lg border px-2 py-1.5 text-right"/></div><div className="mt-4 flex justify-between border-t pt-4 text-xl font-bold"><span>Total</span><span>{money(total)}</span></div><div className="mt-1 text-xs text-slate-500">Vigencia: {validity} hs.</div><div className="mt-5 grid gap-2"><button disabled={!items.length||saving} onClick={saveQuote} className="rounded-xl bg-brand-600 py-2.5 font-semibold text-white disabled:opacity-40">{saving?'Guardando…':'Guardar presupuesto'}</button><button disabled={!items.length} onClick={pdf} className="rounded-xl border py-2.5 font-semibold disabled:opacity-40">Descargar PDF</button><button disabled={!items.length} onClick={whatsapp} className="rounded-xl border py-2.5 font-semibold disabled:opacity-40">Enviar por WhatsApp</button></div></aside>
    </div>
  </AppShell>
}
