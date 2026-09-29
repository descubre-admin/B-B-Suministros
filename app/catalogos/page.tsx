'use client'

import { useEffect, useMemo, useState } from 'react'
import { AppShell } from '@/components/AppShell'
import { createClient } from '@/lib/supabase/client'
import jsPDF from 'jspdf'

type Product = { id:string; name:string; brand:string|null; sku:string|null; category:string|null; sale_price:number|string; image_url?:string|null; description?:string|null }
const money=(v:number|string)=>new Intl.NumberFormat('es-AR',{style:'currency',currency:'ARS',maximumFractionDigits:0}).format(Number(v||0))

export default function CatalogosPage(){
 const supabase=useMemo(()=>createClient(),[])
 const [products,setProducts]=useState<Product[]>([]), [selected,setSelected]=useState<string[]>([])
 const [query,setQuery]=useState(''), [title,setTitle]=useState('Catálogo B&B Suministros'), [subtitle,setSubtitle]=useState('Electricidad · Iluminación · Ferretería')
 const [showPrices,setShowPrices]=useState(true), [showBrand,setShowBrand]=useState(true), [showSku,setShowSku]=useState(false), [generating,setGenerating]=useState(false)
 useEffect(()=>{ void (async()=>{const {data}=await supabase.from('products').select('id,name,brand,sku,category,sale_price,image_url,description').eq('active',true).order('name').limit(2000);setProducts((data??[]) as Product[])})()},[])
 const filtered=products.filter(p=>[p.name,p.brand,p.sku,p.category].some(v=>(v??'').toLowerCase().includes(query.toLowerCase())))
 const chosen=products.filter(p=>selected.includes(p.id))
 const toggle=(id:string)=>setSelected(x=>x.includes(id)?x.filter(v=>v!==id):[...x,id])
 async function toDataUrl(url?:string|null){if(!url)return ''; try{const r=await fetch(url);const b=await r.blob();return await new Promise<string>((ok,fail)=>{const fr=new FileReader();fr.onload=()=>ok(String(fr.result));fr.onerror=fail;fr.readAsDataURL(b)})}catch{return ''}}
 async function generate(){
  if(!chosen.length){alert('Seleccioná al menos un producto.');return} setGenerating(true)
  const pdf=new jsPDF({unit:'mm',format:'a4'}); const W=210,H=297, margin=14
  pdf.setFillColor(20,20,20);pdf.rect(0,0,W,42,'F');pdf.setTextColor(255);pdf.setFont('helvetica','bold');pdf.setFontSize(22);pdf.text(title,margin,19);pdf.setFont('helvetica','normal');pdf.setFontSize(10);pdf.text(subtitle,margin,28);pdf.setTextColor(215,25,32);pdf.setFontSize(9);pdf.text('Tu proyecto, nuestro compromiso',margin,35)
  let x=margin,y=51; const cardW=86,cardH=70,gap=10
  for(let i=0;i<chosen.length;i++){
   const p=chosen[i]; if(y+cardH>H-14){pdf.addPage();y=16;x=margin}
   pdf.setDrawColor(225);pdf.roundedRect(x,y,cardW,cardH,3,3)
   const img=await toDataUrl(p.image_url); if(img){try{pdf.addImage(img,'JPEG',x+5,y+5,cardW-10,34,undefined,'FAST')}catch{}}
   else {pdf.setFillColor(245,245,245);pdf.rect(x+5,y+5,cardW-10,34,'F');pdf.setTextColor(150);pdf.setFontSize(8);pdf.text('Sin imagen',x+cardW/2,y+23,{align:'center'})}
   pdf.setTextColor(25);pdf.setFont('helvetica','bold');pdf.setFontSize(10); const lines=pdf.splitTextToSize(p.name,cardW-10);pdf.text(lines.slice(0,2),x+5,y+44)
   let ty=y+54;pdf.setFont('helvetica','normal');pdf.setFontSize(8);pdf.setTextColor(90)
   if(showBrand&&p.brand){pdf.text(p.brand,x+5,ty);ty+=4}
   if(showSku&&p.sku){pdf.text(`Código: ${p.sku}`,x+5,ty);ty+=4}
   if(showPrices){pdf.setTextColor(215,25,32);pdf.setFont('helvetica','bold');pdf.setFontSize(13);pdf.text(money(p.sale_price),x+cardW-5,y+64,{align:'right'})}
   if(i%2===0)x=margin+cardW+gap;else{x=margin;y+=cardH+8}
  }
  pdf.save(`${title.replace(/[^a-z0-9áéíóúñ]+/gi,'_')}.pdf`);setGenerating(false)
 }
 return <AppShell><div className="mb-6"><h1 className="text-2xl font-black md:text-3xl">Catálogos</h1><p className="mt-1 text-sm text-slate-500">Elegí productos, personalizá qué mostrar y generá un PDF para WhatsApp o clientes.</p></div>
 <div className="grid gap-6 xl:grid-cols-[360px_1fr]">
  <aside className="rounded-2xl border bg-white p-5 shadow-sm"><h2 className="font-bold">Diseño del catálogo</h2><div className="mt-4 space-y-3">
   <label className="block text-sm font-medium">Título<input value={title} onChange={e=>setTitle(e.target.value)} className="mt-1 w-full rounded-xl border px-3 py-2"/></label>
   <label className="block text-sm font-medium">Subtítulo<input value={subtitle} onChange={e=>setSubtitle(e.target.value)} className="mt-1 w-full rounded-xl border px-3 py-2"/></label>
   <label className="flex gap-2 text-sm"><input type="checkbox" checked={showPrices} onChange={e=>setShowPrices(e.target.checked)}/> Mostrar precios</label>
   <label className="flex gap-2 text-sm"><input type="checkbox" checked={showBrand} onChange={e=>setShowBrand(e.target.checked)}/> Mostrar marca</label>
   <label className="flex gap-2 text-sm"><input type="checkbox" checked={showSku} onChange={e=>setShowSku(e.target.checked)}/> Mostrar código</label>
   <button onClick={generate} disabled={generating||!selected.length} className="w-full rounded-xl bg-brand-600 px-4 py-3 font-semibold text-white disabled:opacity-50">{generating?'Generando PDF…':`Generar catálogo PDF (${selected.length})`}</button>
  </div></aside>
  <section><div className="flex flex-col gap-3 sm:flex-row"><input value={query} onChange={e=>setQuery(e.target.value)} placeholder="Buscar producto, marca o código" className="flex-1 rounded-xl border bg-white px-4 py-3"/><button onClick={()=>setSelected(filtered.map(p=>p.id))} className="rounded-xl border bg-white px-4 py-2 text-sm font-medium">Seleccionar visibles</button><button onClick={()=>setSelected([])} className="rounded-xl border bg-white px-4 py-2 text-sm">Limpiar</button></div>
  <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">{filtered.map(p=><button key={p.id} onClick={()=>toggle(p.id)} className={`overflow-hidden rounded-2xl border bg-white text-left shadow-sm ${selected.includes(p.id)?'ring-2 ring-brand-500':''}`}><div className="flex h-36 items-center justify-center bg-slate-50">{p.image_url?<img src={p.image_url} alt={p.name} className="h-full w-full object-contain p-3"/>:<span className="text-xs text-slate-400">Sin imagen</span>}</div><div className="p-3"><div className="line-clamp-2 font-semibold">{p.name}</div><div className="mt-1 text-xs text-slate-500">{p.brand||p.category||'Sin marca'}</div><div className="mt-2 font-bold text-brand-700">{money(p.sale_price)}</div></div></button>)}</div></section>
 </div></AppShell>
}
