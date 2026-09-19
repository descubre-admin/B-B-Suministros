'use client'

import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { AppShell } from '@/components/AppShell'
import { createClient } from '@/lib/supabase/client'
import { CheckCircle2, FileUp, Search, TriangleAlert } from 'lucide-react'

type Product = { id:string; name:string; brand:string|null; sku:string|null; sale_price:number; cost:number; markup_percent:number }
type Match = 'code'|'name'|'manual'|'none'
type Row = { line:string; code:string; qty:number; product:Product|null; selected:boolean; match:Match; confidence:number; suggestions:Product[] }
type PdfTextItem = { str?:string; transform?:number[]; hasEOL?:boolean }
type Alias = { alias_normalized:string; product_id:string }
type Customer = { id:string; name:string }
const DRAFT_KEY='bb_quote_draft_items'

function norm(v:string){return v.toUpperCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/,/g,'.').replace(/[^A-Z0-9.]+/g,' ').replace(/\s+/g,' ').trim()}
const STOP=new Set(['DE','DEL','LA','EL','LOS','LAS','UN','UNA','POR','PARA','CON','SIN','MARCA','ART','ARTICULO','UNIDAD','UNIDADES','U','UN','PRECIO','TOTAL','SUBTOTAL','IVA'])
function tokens(v:string){return norm(v).split(' ').filter(x=>x.length>=2&&!STOP.has(x))}
function nameScore(line:string,p:Product){
  const lt=tokens(line), pt=tokens(`${p.name} ${p.brand??''}`)
  if(!lt.length||!pt.length)return 0
  const ls=new Set(lt)
  let hit=0, weight=0
  for(const t of pt){const w=/\d/.test(t)?2.2:(t.length>=6?1.5:1);weight+=w;if(ls.has(t))hit+=w}
  let score=hit/Math.max(weight,1)
  const numsP=pt.filter(t=>/\d/.test(t)), numsL=new Set(lt.filter(t=>/\d/.test(t)))
  if(numsP.length&&numsP.some(n=>numsL.has(n)))score+=0.12
  if(p.brand&&norm(line).includes(norm(p.brand)))score+=0.10
  return Math.min(score,1)
}
function bestNameMatches(line:string,products:Product[]){
  return products.map(p=>({p,score:nameScore(line,p)})).filter(x=>x.score>=0.28).sort((a,b)=>b.score-a.score).slice(0,5)
}
function likelyProductLine(line:string){
  const t=tokens(line); if(t.length<2)return false
  const n=norm(line); return !/^(TOTAL|SUBTOTAL|IVA|FECHA|CLIENTE|DOMICILIO|TELEFONO|PRESUPUESTO|CANTIDAD PRECIO)/.test(n)
}
function guessQty(line:string, code:string){
  const escaped=code.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')
  const after=line.match(new RegExp(`${escaped}\\s+(\\d+(?:[.,]\\d+)?)`, 'i'))
  if(after){const n=Number(after[1].replace(',','.'));if(n>0&&n<100000)return n}
  const before=line.match(new RegExp(`(\\d+(?:[.,]\\d+)?)\\s*(?:x|u|un|uni|unidad(?:es)?)?\\s+${escaped}`, 'i'))
  if(before){const n=Number(before[1].replace(',','.'));if(n>0&&n<100000)return n}
  return 1
}

async function readPdfLines(file:File){
  const pdfjs=await import('pdfjs-dist')
  pdfjs.GlobalWorkerOptions.workerSrc=`https://unpkg.com/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.mjs`
  const bytes=new Uint8Array(await file.arrayBuffer())
  const pdf=await pdfjs.getDocument({data:bytes}).promise
  const lines:string[]=[]
  for(let p=1;p<=pdf.numPages;p++){
    const page=await pdf.getPage(p)
    const content=await page.getTextContent()
    const items=(content.items as PdfTextItem[]).filter(i=>typeof i.str==='string'&&i.str.trim())
    const grouped=new Map<number,{x:number;text:string}[]>()
    for(const item of items){
      const y=Math.round((item.transform?.[5]??0)*2)/2
      const x=item.transform?.[4]??0
      const bucket=grouped.get(y)??[];bucket.push({x,text:item.str!.trim()});grouped.set(y,bucket)
    }
    const pageLines=[...grouped.entries()].sort((a,b)=>b[0]-a[0]).map(([,parts])=>parts.sort((a,b)=>a.x-b.x).map(x=>x.text).join(' ').replace(/\s+/g,' ').trim()).filter(Boolean)
    lines.push(...pageLines)
  }
  return lines
}

export default function ImportQuotePdfPage(){
  const supabase=useMemo(()=>createClient(),[])
  const router=useRouter()
  const [rows,setRows]=useState<Row[]>([])
  const [loading,setLoading]=useState(false)
  const [error,setError]=useState('')
  const [fileName,setFileName]=useState('')
  const [products,setProducts]=useState<Product[]>([])
  const [masterQuery,setMasterQuery]=useState('')
  const [rowQueries,setRowQueries]=useState<Record<number,string>>({})
  const [aliases,setAliases]=useState<Alias[]>([])
  const [budgetCost,setBudgetCost]=useState(0)
  const [budgetProfit,setBudgetProfit]=useState(30)
  const [customers,setCustomers]=useState<Customer[]>([])
  const [saleCustomerId,setSaleCustomerId]=useState('')
  const [saleCustomerName,setSaleCustomerName]=useState('')
  const [saleSaving,setSaleSaving]=useState(false)
  const [saleMessage,setSaleMessage]=useState('')

  async function loadCustomers(){
    if(customers.length)return
    const {data}=await supabase.from('customers').select('id,name').order('name')
    setCustomers((data??[]) as Customer[])
  }

  async function registerQuickSale(){
    if(budgetCost<=0)return setSaleMessage('Ingresá un monto de presupuesto mayor a 0.')
    if(budgetProfit<0||budgetProfit>100)return setSaleMessage('El porcentaje de ganancia debe estar entre 0 y 100.')
    setSaleSaving(true);setSaleMessage('')
    try{
      const chosen=customers.find(c=>c.id===saleCustomerId)
      const customerName=(chosen?.name||saleCustomerName.trim()||'Consumidor final')
      const {data,error}=await supabase.from('sales').insert({
        customer_id: chosen?.id||null,
        customer_name: customerName,
        subtotal: budgetCost,
        discount: 0,
        total: budgetCost,
        total_cost: budgetBase,
        profit: budgetGain,
        status: 'confirmed'
      }).select('id,number').single()
      if(error)throw error
      setSaleMessage(`Venta #${String(data.number).padStart(6,'0')} registrada correctamente. Ya impacta en el dashboard.`)
      router.refresh()
    }catch(e:any){setSaleMessage(e?.message||'No se pudo registrar la venta.')}
    finally{setSaleSaving(false)}
  }

  async function process(file:File){
    setLoading(true);setError('');setRows([]);setFileName(file.name)
    try{
      const lines=await readPdfLines(file)
      const all:Product[]=[];const size=1000
      for(let from=0;;from+=size){
        const {data,error}=await supabase.from('products').select('id,name,brand,sku,sale_price,cost,markup_percent').eq('active',true).range(from,from+size-1)
        if(error)throw error
        const page=(data??[]) as Product[];all.push(...page);if(page.length<size)break
      }
      setProducts(all)
      const {data:aliasRows}=await supabase.from('product_aliases').select('alias_normalized,product_id')
      const loadedAliases=(aliasRows??[]) as Alias[]
      setAliases(loadedAliases)
      const aliasMap=new Map(loadedAliases.map(a=>[a.alias_normalized,a.product_id]))
      const coded=all.filter(p=>p.sku?.trim()).sort((a,b)=>norm(b.sku!).length-norm(a.sku!).length)
      const found:Row[]=[]
      for(const line of lines){
        if(!likelyProductLine(line))continue
        const compact=norm(line)
        const learnedId=aliasMap.get(compact)
        const learned=learnedId?all.find(p=>p.id===learnedId)??null:null
        if(learned){found.push({line,code:learned.sku??'',qty:1,product:learned,selected:true,match:'manual',confidence:1,suggestions:[learned]});continue}
        const byCode=coded.find(p=>{const c=norm(p.sku!);return c.length>=2&&compact.includes(c)})??null
        if(byCode){found.push({line,code:byCode.sku!,qty:guessQty(line,byCode.sku!),product:byCode,selected:true,match:'code',confidence:1,suggestions:[byCode]});continue}
        const matches=bestNameMatches(line,all)
        const best=matches[0]
        if(best && best.score>=0.48){
          found.push({line,code:best.p.sku??'',qty:1,product:best.p,selected:true,match:'name',confidence:best.score,suggestions:matches.map(x=>x.p)})
        } else if(best && best.score>=0.32){
          found.push({line,code:'',qty:1,product:null,selected:false,match:'none',confidence:best.score,suggestions:matches.map(x=>x.p)})
        }
      }
      const unique=found.filter((r,i,a)=>a.findIndex(x=>x.line===r.line)===i)
      setRows(unique)
      if(!unique.length)setError('El PDF se pudo leer, pero no encontré líneas con coincidencias suficientes. Podés probar con otro PDF o cargar más nombres/marcas/códigos en Productos.')
    }catch(e:any){setError(e?.message||'No se pudo leer el PDF. Si es un PDF escaneado como imagen, más adelante podemos agregar OCR como respaldo.')}
    finally{setLoading(false)}
  }

  function patch(i:number,patch:Partial<Row>){setRows(v=>v.map((r,n)=>n===i?{...r,...patch}:r))}
  function sendToQuote(){
    const selected=rows.filter(r=>r.selected&&r.product)
    const draft=selected.map(r=>({productId:r.product!.id,name:r.product!.name,brand:r.product!.brand,sku:r.product!.sku,qty:r.qty,unitPrice:Number(r.product!.sale_price),basePrice:Number(r.product!.cost||r.product!.sale_price),supplierDiscount:0,profitPercent:Number(r.product!.markup_percent||0)}))
    localStorage.setItem(DRAFT_KEY,JSON.stringify(draft));router.push('/presupuestos/nuevo')
  }

  function searchProducts(query:string){
    const q=norm(query); if(!q)return []
    const qt=tokens(query)
    return products.map(p=>{
      const sku=norm(p.sku??''); const hay=norm(`${p.name} ${p.brand??''} ${p.sku??''}`)
      let score=0
      if(sku&&sku===q)score=100
      else if(sku&&sku.includes(q))score=80
      else { const hits=qt.filter(t=>hay.includes(t)).length; score=qt.length?hits/qt.length*60:0; if(hay.includes(q))score+=20 }
      return {p,score}
    }).filter(x=>x.score>0).sort((a,b)=>b.score-a.score||a.p.name.localeCompare(b.p.name)).map(x=>x.p)
  }
  async function assignProduct(i:number,p:Product|null){
    patch(i,{product:p,code:p?.sku??'',selected:!!p,match:p?'manual':'none',confidence:p?1:0})
    if(!p)return
    const aliasText=rows[i]?.line?.trim(); if(!aliasText)return
    const aliasNormalized=norm(aliasText)
    const {error}=await supabase.from('product_aliases').upsert({alias_text:aliasText,alias_normalized:aliasNormalized,product_id:p.id},{onConflict:'user_id,alias_normalized'})
    if(!error)setAliases(v=>[...v.filter(a=>a.alias_normalized!==aliasNormalized),{alias_normalized:aliasNormalized,product_id:p.id}])
  }
  const masterResults=searchProducts(masterQuery)
  const selected=rows.filter(r=>r.selected&&r.product).length
  const budgetGain=budgetCost*(budgetProfit/100)
  const budgetBase=budgetCost-budgetGain
  return <AppShell>
    <div className="flex flex-wrap items-end justify-between gap-3"><div><h1 className="text-2xl font-bold">Importar presupuesto PDF</h1><p className="mt-1 text-slate-500">Busca primero por código y, si no existe, compara nombre, marca y medidas con los productos de B&B.</p></div>{rows.length>0&&<button onClick={sendToQuote} disabled={!selected} className="rounded-xl bg-brand-600 px-4 py-2.5 font-semibold text-white disabled:opacity-40">Llevar {selected} al presupuesto</button>}</div>
    <div className="mt-6 rounded-2xl border bg-white p-5"><div className="mb-3"><b>Cálculo rápido por monto del presupuesto</b><p className="text-sm text-slate-500">Ingresá el monto final del presupuesto y el porcentaje que corresponde a tu ganancia. El sistema resta esa ganancia y te muestra la base restante.</p></div><div className="grid gap-3 md:grid-cols-4"><label className="text-sm"><span className="mb-1 block text-slate-500">Monto total del presupuesto</span><input type="number" min="0" step="0.01" value={budgetCost||''} onChange={e=>{setBudgetCost(Number(e.target.value)||0);setSaleMessage('')}} placeholder="$ 0" className="w-full rounded-xl border px-3 py-2.5"/></label><label className="text-sm"><span className="mb-1 block text-slate-500">Restar ganancia %</span><input type="number" min="0" max="100" step="0.1" value={budgetProfit||''} onChange={e=>{setBudgetProfit(Number(e.target.value)||0);setSaleMessage('')}} className="w-full rounded-xl border px-3 py-2.5"/></label><div className="rounded-xl bg-slate-50 p-3"><div className="text-xs text-slate-500">Ganancia</div><div className="mt-1 text-lg font-bold">${budgetGain.toLocaleString('es-AR',{maximumFractionDigits:2})}</div></div><div className="rounded-xl bg-slate-900 p-3 text-white"><div className="text-xs text-slate-300">Base restante</div><div className="mt-1 text-lg font-bold">${budgetBase.toLocaleString('es-AR',{maximumFractionDigits:2})}</div></div></div><div className="mt-4 border-t pt-4"><div className="mb-2 font-semibold">Registrar este monto como venta</div><div className="grid gap-3 md:grid-cols-[1fr_1fr_auto]"><label className="text-sm"><span className="mb-1 block text-slate-500">Cliente existente (opcional)</span><select value={saleCustomerId} onFocus={()=>void loadCustomers()} onChange={e=>{setSaleCustomerId(e.target.value);setSaleMessage('')}} className="w-full rounded-xl border px-3 py-2.5"><option value="">Consumidor final / escribir nombre</option>{customers.map(c=><option key={c.id} value={c.id}>{c.name}</option>)}</select></label><label className="text-sm"><span className="mb-1 block text-slate-500">Nombre del cliente (opcional)</span><input value={saleCustomerName} disabled={!!saleCustomerId} onChange={e=>setSaleCustomerName(e.target.value)} placeholder="Consumidor final" className="w-full rounded-xl border px-3 py-2.5 disabled:bg-slate-100"/></label><button type="button" onClick={()=>void registerQuickSale()} disabled={saleSaving||budgetCost<=0} className="self-end rounded-xl bg-emerald-600 px-4 py-2.5 font-semibold text-white disabled:opacity-40">{saleSaving?'Registrando…':'Registrar como venta'}</button></div>{saleMessage&&<div className={`mt-3 rounded-xl px-3 py-2 text-sm ${saleMessage.includes('correctamente')?'bg-emerald-50 text-emerald-800':'bg-amber-50 text-amber-800'}`}>{saleMessage}</div>}<p className="mt-2 text-xs text-slate-500">La venta se guarda con total, costo/base y ganancia. Al quedar confirmada, se suma automáticamente a Ventas y al Dashboard.</p></div></div>
    <div className="mt-4 rounded-2xl border bg-white p-5"><div className="mb-3"><b>Buscador maestro de productos / códigos</b><p className="text-sm text-slate-500">Escribí nombre, marca, medida o código para consultar todos los productos de la base.</p></div><div className="relative"><Search className="absolute left-3 top-3 text-slate-400" size={18}/><input value={masterQuery} onChange={e=>setMasterQuery(e.target.value)} placeholder="Ej: cable 2.5 Trefilcon o 6845" className="w-full rounded-xl border py-2.5 pl-10 pr-3"/></div>{masterQuery&&<div className="mt-3 max-h-64 overflow-auto rounded-xl border"><table className="w-full text-sm"><thead className="sticky top-0 bg-slate-50 text-left text-xs uppercase text-slate-500"><tr><th className="p-2">Código</th><th className="p-2">Producto</th><th className="p-2">Marca</th><th className="p-2 text-right">Precio</th></tr></thead><tbody className="divide-y">{masterResults.map(p=><tr key={p.id}><td className="p-2 font-mono font-semibold">{p.sku||'—'}</td><td className="p-2">{p.name}</td><td className="p-2">{p.brand||'—'}</td><td className="p-2 text-right">${Number(p.sale_price||0).toLocaleString('es-AR')}</td></tr>)}{!masterResults.length&&<tr><td colSpan={4} className="p-4 text-center text-slate-500">No hay coincidencias.</td></tr>}</tbody></table></div>}</div>
    <div className="mt-4 rounded-2xl border bg-white p-5"><label className="flex cursor-pointer items-center justify-center gap-3 rounded-xl border-2 border-dashed p-8 hover:bg-slate-50"><FileUp/><span><b>{loading?'Leyendo PDF…':'Seleccionar presupuesto PDF'}</b><span className="block text-sm text-slate-500">{fileName||'PDF con texto seleccionable. Puede tener código o solamente la descripción del producto.'}</span></span><input type="file" accept="application/pdf,.pdf" disabled={loading} className="hidden" onChange={e=>{const f=e.target.files?.[0];if(f)void process(f)}}/></label>{error&&<div className="mt-4 flex gap-2 rounded-xl bg-amber-50 p-3 text-sm text-amber-900"><TriangleAlert size={18} className="shrink-0"/>{error}</div>}</div>
    {rows.length>0&&<div className="mt-6 overflow-hidden rounded-2xl border bg-white"><div className="flex items-center justify-between border-b p-4"><div><b>Productos detectados</b><div className="text-sm text-slate-500">Código exacto tiene prioridad. Las coincidencias por nombre se pueden corregir antes de importar.</div></div><div className="text-sm font-semibold">{selected} seleccionados</div></div><div className="overflow-x-auto"><table className="w-full min-w-[980px] text-sm"><thead className="bg-slate-50 text-left text-xs uppercase text-slate-500"><tr><th className="p-3">Usar</th><th className="p-3">Código</th><th className="p-3">Producto encontrado</th><th className="p-3">Cantidad</th><th className="p-3">Resultado</th><th className="p-3">Línea del PDF</th></tr></thead><tbody className="divide-y">{rows.map((r,i)=><tr key={`${r.line}-${i}`}><td className="p-3"><input type="checkbox" checked={r.selected} disabled={!r.product} onChange={e=>patch(i,{selected:e.target.checked})}/></td><td className="p-3 font-mono font-semibold">{r.product?.sku||'—'}</td><td className="p-3"><div className="min-w-[360px] space-y-2"><input value={rowQueries[i]??''} onChange={e=>setRowQueries(v=>({...v,[i]:e.target.value}))} placeholder="Buscar todas las opciones por nombre, marca o medida…" className="w-full rounded-lg border px-2 py-2"/><div className="flex gap-2"><input value={r.code} onChange={e=>patch(i,{code:e.target.value})} placeholder="Código directo" className="min-w-0 flex-1 rounded-lg border px-2 py-2 font-mono"/><button type="button" onClick={()=>{const p=products.find(x=>norm(x.sku??'')===norm(r.code));if(p)void assignProduct(i,p);else alert('No encontré un producto con ese código.')}} className="rounded-lg border px-3 py-2 font-semibold">Buscar código</button></div><select value={r.product?.id??''} onChange={e=>void assignProduct(i,products.find(x=>x.id===e.target.value)??null)} className="w-full rounded-lg border px-2 py-2"><option value="">Elegir producto…</option>{(rowQueries[i]?searchProducts(rowQueries[i]):r.suggestions).map(p=><option key={p.id} value={p.id}>{p.sku?`${p.sku} · `:''}{p.name}{p.brand?` · ${p.brand}`:''}</option>)}</select>{rowQueries[i]&&<div className="max-h-36 overflow-auto rounded-lg border bg-slate-50">{searchProducts(rowQueries[i]).map(p=><button type="button" key={p.id} onClick={()=>void assignProduct(i,p)} className="block w-full border-b px-2 py-2 text-left last:border-0 hover:bg-white"><span className="font-mono font-semibold">{p.sku||'S/C'}</span> · {p.name}{p.brand?` · ${p.brand}`:''}</button>)}{!searchProducts(rowQueries[i]).length&&<div className="p-2 text-xs text-slate-500">Sin coincidencias.</div>}</div>}{r.product&&<div className="text-xs text-slate-500">Referencia seleccionada: <b>{r.product.sku||'sin código'}</b> · {r.product.name} {r.product.brand?`· ${r.product.brand}`:''}</div>}</div></td><td className="p-3"><input type="number" min="0.01" step="0.01" value={r.qty} onChange={e=>patch(i,{qty:Number(e.target.value)||1})} className="w-24 rounded-lg border px-2 py-1.5"/></td><td className="p-3">{r.match==='code'?<span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-1 text-xs font-semibold text-emerald-700"><CheckCircle2 size={14}/>Código exacto</span>:r.match==='name'?<span className="inline-flex rounded-full bg-blue-50 px-2 py-1 text-xs font-semibold text-blue-700">Nombre · {Math.round(r.confidence*100)}%</span>:r.match==='manual'?<span className="inline-flex rounded-full bg-violet-50 px-2 py-1 text-xs font-semibold text-violet-700">Elegido manualmente</span>:<span className="inline-flex rounded-full bg-amber-50 px-2 py-1 text-xs font-semibold text-amber-700">Revisar</span>}</td><td className="max-w-md p-3 text-xs text-slate-500">{r.line}</td></tr>)}</tbody></table></div></div>}
        {!rows.length&&!loading&&!error&&<div className="mt-6 rounded-2xl border bg-white p-6"><div className="flex gap-3"><Search className="text-slate-400"/><div><b>Cómo va a funcionar</b><p className="mt-1 text-sm text-slate-500">Si el PDF trae código, se usa como coincidencia principal. Si no lo trae, se comparan palabras del nombre, marca y medidas. Las coincidencias dudosas quedan para revisión manual.</p></div></div></div>}
  </AppShell>
}
