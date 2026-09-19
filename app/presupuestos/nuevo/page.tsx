'use client'

import { useEffect, useMemo, useState } from 'react'
import { AppShell } from '@/components/AppShell'
import { createClient } from '@/lib/supabase/client'
import { jsPDF } from 'jspdf'
import { Trash2 } from 'lucide-react'

const money = (n:number) => new Intl.NumberFormat('es-AR', { style:'currency', currency:'ARS', maximumFractionDigits:2 }).format(n || 0)
type Product = { id:string; name:string; brand:string|null; sale_price:number; sku:string|null; cost:number; markup_percent:number; listPrice?:number; supplierDiscount?:number }
type Customer = { id:string; customer_number:number; name:string; phone:string|null; city:string|null }
type Item = { product:Product; qty:number; unitPrice:number; basePrice:number; supplierDiscount:number; profitPercent:number }
type DraftQuoteItem = { productId:string; name:string; brand:string|null; sku:string|null; qty:number; unitPrice:number; basePrice?:number; supplierDiscount?:number; profitPercent?:number }
type EditQuoteDraft = { quoteId:string; number:number; customerId:string; customerName?:string; discount:number; items:DraftQuoteItem[] }
const DRAFT_KEY = 'bb_quote_draft_items'
const EDIT_KEY = 'bb_quote_edit'
type Settings = { business_name:string|null; phone:string|null; address:string|null; city:string|null; quote_validity_hours:number|null }
type SavedQuote = { id:string; number:number }

export default function NewQuotePage() {
  const supabase = useMemo(()=>createClient(),[])
  const [products,setProducts] = useState<Product[]>([])
  const [customers,setCustomers] = useState<Customer[]>([])
  const [settings,setSettings] = useState<Settings>({business_name:'B&B Suministros',phone:null,address:null,city:null,quote_validity_hours:48})
  const [customerId,setCustomerId] = useState('')
  const [customerName,setCustomerName] = useState('')
  const [query,setQuery] = useState('')
  const [items,setItems] = useState<Item[]>([])
  const [discount,setDiscount] = useState(0)
  const [saving,setSaving] = useState(false)
  const [savedQuote,setSavedQuote] = useState<SavedQuote|null>(null)
  const [editing,setEditing] = useState(false)

  useEffect(()=>{ void (async()=>{
    // Supabase limita por defecto las consultas a una cantidad maxima de filas.
    // Si el catalogo crece, productos que quedan fuera de ese primer bloque (por
    // ejemplo "lampara") nunca llegaban al buscador. Cargamos el catalogo
    // activo completo por paginas para que la busqueda local siempre vea todo.
    async function loadAllActiveProducts(){
      const pageSize=1000
      const all:Product[]=[]
      for(let from=0;;from+=pageSize){
        const {data,error}=await supabase
          .from('products')
          .select('id,name,brand,sale_price,sku,cost,markup_percent')
          .eq('active',true)
          .order('name')
          .range(from,from+pageSize-1)
        if(error) throw error
        const page=(data ?? []) as Product[]
        all.push(...page)
        if(page.length<pageSize) break
      }
      return all
    }

    const [p,{data:c},{data:s}] = await Promise.all([
      loadAllActiveProducts(),
      supabase.from('customers').select('id,customer_number,name,phone,city').order('name'),
      supabase.from('settings').select('business_name,phone,address,city,quote_validity_hours').maybeSingle(),
    ])
    const loadedProducts=p
    const {data:costRows}=await supabase.from('product_supplier_costs').select('product_id,base_price,discount_percent,is_preferred').eq('is_preferred',true)
    const costMap=new Map((costRows??[]).map((r:any)=>[r.product_id,r]))
    const enriched=loadedProducts.map(product=>{const r:any=costMap.get(product.id);return {...product,listPrice:r?Number(r.base_price):Number(product.cost||product.sale_price),supplierDiscount:r?Number(r.discount_percent):0}})
    setProducts(enriched); setCustomers((c ?? []) as Customer[]); if(s)setSettings(s as Settings)

    try {
      const edit=JSON.parse(localStorage.getItem(EDIT_KEY) || 'null') as EditQuoteDraft|null
      if(edit?.quoteId && Array.isArray(edit.items)){
        setEditing(true)
        setSavedQuote({id:edit.quoteId,number:Number(edit.number)})
        setCustomerId(edit.customerId || '')
        setCustomerName(edit.customerName || '')
        setDiscount(Number(edit.discount)||0)
        setItems(edit.items.map(d=>{
          const found=enriched.find(product=>product.id===d.productId)
          const product:Product = found ?? { id:d.productId, name:d.name, brand:d.brand, sku:d.sku, sale_price:d.unitPrice, cost:d.basePrice??d.unitPrice, markup_percent:d.profitPercent??0, listPrice:d.basePrice??d.unitPrice, supplierDiscount:d.supplierDiscount??0 }
          return { product, qty:Number(d.qty)||1, unitPrice:Number(d.unitPrice)||0, basePrice:Number(d.basePrice??product.listPrice??product.cost??d.unitPrice)||0, supplierDiscount:Number(d.supplierDiscount??product.supplierDiscount??0)||0, profitPercent:Number(d.profitPercent??product.markup_percent??0)||0 }
        }))
        localStorage.removeItem(EDIT_KEY)
        localStorage.removeItem(DRAFT_KEY)
        return
      }
      const draft=JSON.parse(localStorage.getItem(DRAFT_KEY) || '[]') as DraftQuoteItem[]
      if(Array.isArray(draft) && draft.length){
        const draftItems:Item[] = draft.map(d=>{
          const found=enriched.find(product=>product.id===d.productId)
          const product:Product = found ?? { id:d.productId, name:d.name, brand:d.brand, sku:d.sku, sale_price:d.unitPrice, cost:d.basePrice??d.unitPrice, markup_percent:d.profitPercent??0, listPrice:d.basePrice??d.unitPrice, supplierDiscount:d.supplierDiscount??0 }
          return { product, qty:Number(d.qty)||1, unitPrice:Number(d.unitPrice)||0, basePrice:Number(d.basePrice??product.listPrice??product.cost??d.unitPrice)||0, supplierDiscount:Number(d.supplierDiscount??product.supplierDiscount??0)||0, profitPercent:Number(d.profitPercent??product.markup_percent??0)||0 }
        })
        setItems(draftItems)
        localStorage.removeItem(DRAFT_KEY)
      }
    } catch {
      localStorage.removeItem(EDIT_KEY)
      localStorage.removeItem(DRAFT_KEY)
    }
  })() },[supabase])

  // Busqueda tolerante: ignora mayusculas, acentos y diferencias como 2.5 / 2,5 / 2,5mm².
  // Cada palabra escrita puede aparecer en cualquier parte del nombre, marca o codigo.
  function normalizeSearch(value:string){
    return value
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g,'')
      .replace(/(\d),(\d)/g,'$1.$2')
      .replace(/²/g,'2')
      .replace(/³/g,'3')
      .replace(/[^a-z0-9.]+/g,' ')
      .replace(/\s+/g,' ')
      .trim()
  }

  const normalizedQuery=normalizeSearch(query).split(' ').filter(Boolean)
  const filtered = products
    .map(p => {
      const haystack=normalizeSearch(`${p.name} ${p.brand??''} ${p.sku??''}`)
      const compactHaystack=haystack.replace(/\s+/g,'')
      const matches=normalizedQuery.every(token => {
        const compactToken=token.replace(/\s+/g,'')
        return haystack.includes(token) || compactHaystack.includes(compactToken)
      })
      const score=normalizedQuery.reduce((acc,token)=>{
        if(normalizeSearch(p.name).includes(token)) return acc+3
        if(normalizeSearch(p.brand??'').includes(token)) return acc+2
        if(normalizeSearch(p.sku??'').includes(token)) return acc+1
        return acc
      },0)
      return {p,matches,score}
    })
    .filter(x=>normalizedQuery.length>0 && x.matches)
    .sort((a,b)=>b.score-a.score || a.p.name.localeCompare(b.p.name))
    .slice(0,12)
    .map(x=>x.p)
  const subtotal = useMemo(()=>items.reduce((s,i)=>s+i.qty*i.unitPrice,0),[items])
  const total = Math.max(0, subtotal - discount)
  const totalCost = useMemo(()=>items.reduce((s,i)=>s + i.qty * (i.basePrice * (1-i.supplierDiscount/100)),0),[items])
  const totalProfit = total - totalCost
  const totalProfitPercent = totalCost > 0 ? (totalProfit / totalCost) * 100 : 0
  const customer = customers.find(c=>c.id===customerId)
  const displayCustomerName = customerName.trim() || customer?.name || 'Consumidor final'
  const validity = settings.quote_validity_hours ?? 48

  function calcSale(base:number,disc:number,profit:number){const cost=base*(1-disc/100);return Math.max(0,cost*(1+profit/100))}
  function clearZeroOnFocus(e:React.FocusEvent<HTMLInputElement>){ if(Number(e.currentTarget.value)===0) e.currentTarget.select() }
  function add(p:Product){ setItems(prev=>{ const ix=prev.findIndex(i=>i.product.id===p.id); if(ix>=0)return prev.map((i,n)=>n===ix?{...i,qty:i.qty+1}:i); const base=Number(p.listPrice??p.cost??p.sale_price); const disc=Number(p.supplierDiscount??0); const profit=Number(p.markup_percent??0); const calculated=calcSale(base,disc,profit); return [...prev,{product:p,qty:1,basePrice:base,supplierDiscount:disc,profitPercent:profit,unitPrice:calculated>0?calculated:Number(p.sale_price)}] }); setQuery('') }
  function patchPricing(idx:number, patch:Partial<Item>){setItems(v=>v.map((x,n)=>{if(n!==idx)return x;const next={...x,...patch};return {...next,unitPrice:calcSale(Number(next.basePrice)||0,Number(next.supplierDiscount)||0,Number(next.profitPercent)||0)}}))}
  function patch(idx:number, patch:Partial<Item>){ setItems(v=>v.map((x,n)=>n===idx?{...x,...patch}:x)) }

  async function saveQuote(showAlert=true):Promise<SavedQuote|null>{
    if(!items.length)return null
    setSaving(true)
    const validUntil = new Date(Date.now()+validity*60*60*1000).toISOString().slice(0,10)
    let q:SavedQuote|null = savedQuote

    if(savedQuote){
      const { error } = await supabase.from('quotes').update({ customer_id: customerId || null, custom_customer_name: customerName.trim() || null, subtotal, discount, total, status:'draft', valid_until:validUntil }).eq('id',savedQuote.id)
      if(error){setSaving(false);alert(error.message);return null}
      const { error:deleteError } = await supabase.from('quote_items').delete().eq('quote_id',savedQuote.id)
      if(deleteError){setSaving(false);alert(deleteError.message);return null}
    } else {
      const { data, error } = await supabase.from('quotes').insert({ customer_id: customerId || null, custom_customer_name: customerName.trim() || null, subtotal, discount, total, status:'draft', valid_until:validUntil }).select('id,number').single()
      if(error || !data){setSaving(false);alert(error?.message ?? 'No se pudo guardar');return null}
      q={id:data.id,number:Number(data.number)}
      setSavedQuote(q)
    }

    const rows = items.map(i=>({ quote_id:q!.id, product_id:i.product.id, description:i.product.name, quantity:i.qty, unit_price:i.unitPrice, line_total:i.qty*i.unitPrice, base_price:i.basePrice, supplier_discount_percent:i.supplierDiscount, profit_percent:i.profitPercent }))
    const { error:itemsError } = await supabase.from('quote_items').insert(rows)
    setSaving(false)
    if(itemsError){alert(itemsError.message);return null}
    if(showAlert)alert(`${editing?'Cambios guardados':'Presupuesto guardado'} · N° ${String(q!.number).padStart(6,'0')}`)
    return q
  }

  async function pdf(){
    const q=await saveQuote(false)
    if(!q)return
    const doc = new jsPDF()
    const business=settings.business_name||'B&B Suministros'
    try { const blob=await fetch('/logo-bb-horizontal.png').then(r=>r.blob()); const logo=await new Promise<string>((resolve,reject)=>{const fr=new FileReader();fr.onload=()=>resolve(String(fr.result));fr.onerror=reject;fr.readAsDataURL(blob)}); doc.addImage(logo,'PNG',14,8,48,23) } catch {}
    doc.setFont('helvetica','bold'); doc.setFontSize(12); doc.text(business.toUpperCase(),14,36)
    doc.setFont('helvetica','normal'); doc.setFontSize(9); doc.text('Electricidad · Iluminación · Ferretería',14,41)
    const contact=[settings.address,settings.city,settings.phone].filter(Boolean).join(' · '); if(contact)doc.text(contact,14,46)
    doc.setFont('helvetica','bold');doc.setFontSize(15);doc.text('PRESUPUESTO',196,18,{align:'right'})
    doc.setFontSize(11);doc.text(`N° ${String(q.number).padStart(6,'0')}`,196,25,{align:'right'})
    doc.setFont('helvetica','normal');doc.setFontSize(9);doc.text(`Fecha: ${new Date().toLocaleDateString('es-AR')}`,196,31,{align:'right'})
    doc.setFont('helvetica','bold');doc.setFontSize(10);doc.text(`Cliente: ${displayCustomerName}`,14,54)
    doc.setFont('helvetica','normal'); if(customer) doc.text(`Cliente N° ${String(customer.customer_number).padStart(5,'0')}${customer.city?` · ${customer.city}`:''}`,14,60)
    let y=72;doc.setFont('helvetica','bold');doc.text('Cant.',14,y);doc.text('Producto',30,y);doc.text('P. unitario',156,y,{align:'right'});doc.text('Importe',196,y,{align:'right'});y+=4;doc.line(14,y,196,y);y+=8;doc.setFont('helvetica','normal')
    items.forEach(i=>{const desc=`${i.product.name}${i.product.brand?` · ${i.product.brand}`:''}`;doc.text(String(i.qty),14,y);doc.text(desc.slice(0,58),30,y);doc.text(money(i.unitPrice),156,y,{align:'right'});doc.text(money(i.qty*i.unitPrice),196,y,{align:'right'});y+=8;if(y>270){doc.addPage();y=20}})
    y+=3;doc.line(14,y,196,y);y+=9;doc.text(`Subtotal: ${money(subtotal)}`,196,y,{align:'right'});y+=7;if(discount>0){doc.text(`Descuento: -${money(discount)}`,196,y,{align:'right'});y+=8}doc.setFont('helvetica','bold');doc.setFontSize(13);doc.text(`TOTAL: ${money(total)}`,196,y,{align:'right'});y+=10;doc.setFont('helvetica','normal');doc.setFontSize(9);doc.text(`Precios válidos por ${validity} hs.`,14,y)
    doc.save(`BB-Presupuesto-${String(q.number).padStart(6,'0')}-${displayCustomerName.replace(/[^a-zA-Z0-9áéíóúÁÉÍÓÚñÑ]+/g,'-')}.pdf`)
  }

  function whatsapp(){
    const raw=(customer?.phone ?? '').replace(/\D/g,''); const phone=raw.startsWith('54')?raw:raw?`54${raw.replace(/^0/,'')}`:''
    const detail=items.map(i=>`${i.qty} x ${i.product.name}: ${money(i.qty*i.unitPrice)}`).join('\n')
    const text=`Hola ${displayCustomerName === 'Consumidor final' ? '' : displayCustomerName}, te envío el presupuesto de B&B Suministros:\n\n${detail}${discount>0?`\nDescuento: ${money(discount)}`:''}\n\n*TOTAL: ${money(total)}*\nPrecios válidos por ${validity} hs.`
    window.open(`https://wa.me/${phone}?text=${encodeURIComponent(text)}`,'_blank')
  }

  return <AppShell>
    <div><h1 className="text-2xl font-bold">{editing?'Editar presupuesto':'Nuevo presupuesto'}</h1><p className="text-slate-500">{editing&&savedQuote?`Estás editando el presupuesto N° ${String(savedQuote.number).padStart(6,'0')}. Se conservará el mismo número.`:'Armalo en segundos y mandalo por WhatsApp.'}</p></div>
    <div className="mt-6 grid gap-6 lg:grid-cols-[1fr_360px]">
      <section className="space-y-4">
        <div className="rounded-2xl border bg-white p-4"><label className="text-sm font-medium">Nombre del cliente</label><input value={customerName} onChange={e=>setCustomerName(e.target.value)} placeholder="Ej: Ariel Cabrera" className="mt-2 w-full rounded-xl border px-3 py-2.5"/><div className="mt-4"><label className="text-xs font-medium uppercase tracking-wide text-slate-500">Cliente guardado (opcional)</label><select value={customerId} onChange={e=>{const id=e.target.value;setCustomerId(id);const selected=customers.find(c=>c.id===id);if(selected)setCustomerName(selected.name)}} className="mt-2 w-full rounded-xl border px-3 py-2.5"><option value="">No vincular / consumidor final</option>{customers.map(c=><option key={c.id} value={c.id}>#{c.customer_number} · {c.name}{c.city?` · ${c.city}`:''}</option>)}</select><p className="mt-2 text-xs text-slate-500">Podés escribir cualquier nombre aunque el cliente no esté cargado. Si elegís uno guardado, completamos el nombre automáticamente.</p></div></div>
        <div className="rounded-2xl border bg-white p-4"><label className="text-sm font-medium">Buscar producto</label><input value={query} onChange={e=>setQuery(e.target.value)} placeholder="Ej: cable 2.5, Jeluz, Verona..." className="mt-2 w-full rounded-xl border px-3 py-2.5" />{query && <div className="mt-2 overflow-hidden rounded-xl border">{filtered.map(p=><button type="button" key={p.id} onClick={()=>add(p)} className="flex w-full items-center justify-between gap-3 border-b px-3 py-2.5 text-left last:border-0 hover:bg-slate-50"><span><span className="font-medium">{p.name}</span><span className="block text-xs text-slate-500">{p.brand} {p.sku?`· ${p.sku}`:''}</span></span><b>{money(Number(p.sale_price))}</b></button>)}{!filtered.length&&<div className="px-3 py-3 text-sm text-slate-500">Sin resultados.</div>}</div>}</div>
        <div className="rounded-2xl border bg-white p-4"><div className="flex items-center justify-between"><div className="font-semibold">Vista previa del presupuesto</div><div className="text-xs text-slate-500">Se actualiza en vivo</div></div><div className="mt-4 rounded-xl border bg-white p-5"><div className="flex items-start justify-between border-b pb-4"><div><img src="/logo-bb-horizontal.png" alt="B&B Suministros" className="h-14 w-auto"/><div className="mt-1 text-xs text-slate-500">Electricidad · Iluminación · Ferretería</div></div><div className="text-right"><div className="text-lg font-bold">PRESUPUESTO</div><div className="text-sm font-semibold">N° {savedQuote?String(savedQuote.number).padStart(6,'0'):'------'}</div><div className="text-xs text-slate-500">{new Date().toLocaleDateString('es-AR')}</div></div></div><div className="py-4"><div className="text-xs font-semibold uppercase tracking-wide text-slate-500">Cliente</div><div className="mt-1 text-lg font-bold">{displayCustomerName}</div>{customer&&<div className="mt-0.5 text-sm text-slate-500">Cliente N° {String(customer.customer_number).padStart(5,'0')}{customer.city?` · ${customer.city}`:''}</div>}</div><div className="overflow-x-auto"><div className="min-w-[900px]"><div className="grid grid-cols-[1fr_105px_90px_105px_90px_120px_75px_110px_36px] gap-2 border-b pb-2 text-[11px] font-semibold uppercase text-slate-500"><span>Producto</span><span>Precio lista</span><span>Desc. prov.</span><span>Costo</span><span>Ganancia</span><span>Venta</span><span>Cant.</span><span className="text-right">Importe</span><span></span></div><div className="divide-y">{items.map((i,idx)=>{const cost=i.basePrice*(1-i.supplierDiscount/100);return <div key={`${i.product.id}-${idx}`} className="grid grid-cols-[1fr_105px_90px_105px_90px_120px_75px_110px_36px] items-center gap-2 py-3"><div className="min-w-0"><div className="font-medium">{i.product.name}</div><div className="text-xs text-slate-500">{[i.product.brand,i.product.sku].filter(Boolean).join(' · ')}</div></div><input type="number" min="0" step="0.01" value={i.basePrice} onFocus={clearZeroOnFocus} onChange={e=>patchPricing(idx,{basePrice:Number(e.target.value)})} className="rounded-lg border px-2 py-2 text-sm"/><div className="relative"><input type="number" min="0" max="100" step="0.1" value={i.supplierDiscount} onFocus={clearZeroOnFocus} onChange={e=>patchPricing(idx,{supplierDiscount:Number(e.target.value)})} className="w-full rounded-lg border px-2 py-2 pr-6 text-sm"/><span className="absolute right-2 top-2 text-sm text-slate-400">%</span></div><div className="text-sm font-medium">{money(cost)}</div><div className="relative"><input type="number" min="0" step="0.1" value={i.profitPercent} onFocus={clearZeroOnFocus} onChange={e=>patchPricing(idx,{profitPercent:Number(e.target.value)})} className="w-full rounded-lg border px-2 py-2 pr-6 text-sm"/><span className="absolute right-2 top-2 text-sm text-slate-400">%</span></div><input type="number" min="0" step="0.01" value={Number(i.unitPrice.toFixed(2))} onFocus={clearZeroOnFocus} onChange={e=>patch(idx,{unitPrice:Number(e.target.value)})} className="rounded-lg border px-2 py-2 text-sm font-semibold"/><input type="number" min="0.01" step="0.01" value={i.qty} onFocus={clearZeroOnFocus} onChange={e=>patch(idx,{qty:Number(e.target.value)})} className="rounded-lg border px-2 py-2 text-sm"/><div className="text-right font-semibold">{money(i.qty*i.unitPrice)}</div><button onClick={()=>setItems(v=>v.filter((_,n)=>n!==idx))} className="rounded-lg p-2 text-slate-400 hover:bg-red-50 hover:text-red-600"><Trash2 size={16}/></button></div>})}</div>{!items.length&&<p className="py-6 text-center text-sm text-slate-500">Agregá productos desde el buscador.</p>}</div></div><div className="mt-4 ml-auto max-w-xs border-t pt-3 text-sm"><div className="flex justify-between"><span>Subtotal</span><b>{money(subtotal)}</b></div>{discount>0&&<div className="mt-1 flex justify-between"><span>Descuento cliente</span><span>-{money(discount)}</span></div>}<div className="mt-2 flex justify-between text-lg font-bold"><span>TOTAL</span><span>{money(total)}</span></div><div className="mt-1 text-xs text-slate-500">Vigencia: {validity} hs.</div></div></div><p className="mt-3 text-xs text-slate-500">Precio lista, descuento de proveedor, costo y ganancia son datos internos. El PDF del cliente muestra únicamente producto, cantidad, precio de venta e importe.</p></div>
      </section>
      <aside className="h-fit rounded-2xl border bg-white p-5 lg:sticky lg:top-24"><div className="flex justify-between text-sm"><span>Subtotal</span><span>{money(subtotal)}</span></div><div className="mt-3 flex items-center justify-between gap-3 text-sm"><span>Descuento $</span><input type="number" min="0" value={discount} onFocus={clearZeroOnFocus} onChange={e=>setDiscount(Number(e.target.value))} className="w-32 rounded-lg border px-2 py-1.5 text-right"/></div><div className="mt-4 flex justify-between border-t pt-4 text-xl font-bold"><span>Total</span><span>{money(total)}</span></div><div className="mt-4 rounded-xl border bg-slate-50 p-3"><div className="flex justify-between text-sm"><span>Costo total</span><span>{money(totalCost)}</span></div><div className="mt-2 flex justify-between font-bold"><span>Ganancia total</span><span>{money(totalProfit)}</span></div><div className="mt-1 flex justify-between text-xs text-slate-500"><span>Ganancia sobre costo</span><span>{totalProfitPercent.toFixed(1)}%</span></div></div><div className="mt-2 text-xs text-slate-500">Vigencia: {validity} hs.</div>{savedQuote&&<div className="mt-2 rounded-lg bg-slate-50 px-3 py-2 text-sm font-semibold">Presupuesto N° {String(savedQuote.number).padStart(6,'0')}</div>}<div className="mt-5 grid gap-2"><button disabled={!items.length||saving} onClick={()=>void saveQuote(true)} className="rounded-xl bg-brand-600 py-2.5 font-semibold text-white disabled:opacity-40">{saving?'Guardando…':'Guardar presupuesto'}</button><button disabled={!items.length} onClick={pdf} className="rounded-xl border py-2.5 font-semibold disabled:opacity-40">Descargar PDF</button><button disabled={!items.length} onClick={whatsapp} className="rounded-xl border py-2.5 font-semibold disabled:opacity-40">Enviar por WhatsApp</button></div></aside>
    </div>
  </AppShell>
}
