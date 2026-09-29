'use client'

import { ChangeEvent, useMemo, useState } from 'react'
import * as XLSX from 'xlsx'
import { AppShell } from '@/components/AppShell'
import { createClient } from '@/lib/supabase/client'

type CatalogRow = {
  key: string
  brand: string
  category: string
  name: string
  sku: string
  specification: string
  presentation: string
  supplierPrice: number
  unit: string
  sourcePage: string
  notes: string
}

const money = (n:number) => new Intl.NumberFormat('es-AR',{style:'currency',currency:'ARS',maximumFractionDigits:2}).format(n||0)
const norm = (v:unknown) => String(v ?? '').trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'')
const str = (v:unknown) => String(v ?? '').trim()
const num = (v:unknown) => {
  if (typeof v === 'number') return Number.isFinite(v) ? v : 0
  const s=str(v).replace(/[$\s]/g,'')
  const x=s.includes(',') ? s.replace(/\./g,'').replace(',','.') : s.replace(/,/g,'')
  const n=Number(x); return Number.isFinite(n)?n:0
}

export default function SupplierCatalogsPage(){
  const supabase=useMemo(()=>createClient(),[])
  const [fileName,setFileName]=useState('')
  const [supplier,setSupplier]=useState('Eléctrica Urbano')
  const [rows,setRows]=useState<CatalogRow[]>([])
  const [selected,setSelected]=useState<Set<string>>(new Set())
  const [query,setQuery]=useState('')
  const [brand,setBrand]=useState('')
  const [iva,setIva]=useState('21')
  const [discount,setDiscount]=useState('0')
  const [markup,setMarkup]=useState('30')
  const [busy,setBusy]=useState(false)
  const [message,setMessage]=useState('')

  async function readFile(e:ChangeEvent<HTMLInputElement>){
    const file=e.target.files?.[0]; if(!file)return
    setFileName(file.name); setMessage('')
    const data=await file.arrayBuffer(); const wb=XLSX.read(data,{type:'array'})
    const ws=wb.Sheets[wb.SheetNames[0]]
    const matrix=XLSX.utils.sheet_to_json<unknown[]>(ws,{header:1,defval:''})
    const hi=matrix.findIndex(r=>r.some(c=>['marca','categoria','producto / descripcion','producto / descripción','precio proveedor'].includes(norm(c))))
    if(hi<0){setMessage('No pude reconocer las columnas del catálogo. Usá el Excel preparado para B&B.');setRows([]);return}
    const headers=matrix[hi].map(norm)
    const col=(...names:string[])=>headers.findIndex(h=>names.some(n=>h===norm(n)))
    const idx={brand:col('Marca'),category:col('Categoría','Categoria'),name:col('Producto / descripción','Producto / descripcion','Producto','Descripción'),sku:col('Código','Codigo'),spec:col('Medida / potencia'),presentation:col('Presentación','Presentacion'),price:col('Precio proveedor','Precio'),unit:col('Unidad'),page:col('Página catálogo','Pagina catalogo'),notes:col('Observaciones')}
    const parsed=matrix.slice(hi+1).map((r,i):CatalogRow=>({
      key:`${i+hi+2}-${str(r[idx.sku])}-${str(r[idx.name])}`,
      brand:idx.brand>=0?str(r[idx.brand]):'', category:idx.category>=0?str(r[idx.category]):'',
      name:idx.name>=0?str(r[idx.name]):'', sku:idx.sku>=0?str(r[idx.sku]):'', specification:idx.spec>=0?str(r[idx.spec]):'',
      presentation:idx.presentation>=0?str(r[idx.presentation]):'', supplierPrice:idx.price>=0?num(r[idx.price]):0,
      unit:idx.unit>=0?str(r[idx.unit]):'', sourcePage:idx.page>=0?str(r[idx.page]):'', notes:idx.notes>=0?str(r[idx.notes]):''
    })).filter(r=>r.name && r.supplierPrice>=0)
    setRows(parsed); setSelected(new Set())
  }

  const brands=[...new Set(rows.map(r=>r.brand).filter(Boolean))].sort((a,b)=>a.localeCompare(b,'es'))
  const filtered=rows.filter(r=>(!brand||r.brand===brand) && (!query || `${r.name} ${r.sku} ${r.brand} ${r.category}`.toLowerCase().includes(query.toLowerCase())))
  const selectedRows=rows.filter(r=>selected.has(r.key))
  const ivaN=num(iva), discountN=num(discount), markupN=num(markup)
  const cost=(p:number)=>Math.round((p*(1+ivaN/100)*(1-discountN/100)+Number.EPSILON)*100)/100
  const sale=(p:number)=>Math.round((cost(p)*(1+markupN/100)+Number.EPSILON)*100)/100
  const toggle=(key:string)=>setSelected(cur=>{const n=new Set(cur);n.has(key)?n.delete(key):n.add(key);return n})
  const selectVisible=()=>setSelected(cur=>{const n=new Set(cur);filtered.forEach(r=>n.add(r.key));return n})

  async function importSelected(){
    if(!selectedRows.length){setMessage('Seleccioná al menos un producto.');return}
    setBusy(true);setMessage('Verificando productos existentes…')
    try{
      const {data:auth,error:authErr}=await supabase.auth.getUser(); if(authErr||!auth.user) throw new Error('Sesión no disponible.')
      const skuRows=selectedRows.filter(r=>r.sku); const existing=new Map<string,string>()
      for(let i=0;i<skuRows.length;i+=100){
        const skus=skuRows.slice(i,i+100).map(r=>r.sku)
        const {data,error}=await supabase.from('products').select('id,sku').in('sku',skus); if(error)throw error
        ;(data??[]).forEach(x=>{if(x.sku)existing.set(String(x.sku),String(x.id))})
      }
      const payload=selectedRows.map(r=>({
        id:r.sku&&existing.get(r.sku)?existing.get(r.sku):crypto.randomUUID(), user_id:auth.user.id,
        name:r.name, brand:r.brand||null, sku:r.sku||null, category:r.category||null,
        description:[r.specification,r.presentation,r.unit?`Unidad: ${r.unit}`:''].filter(Boolean).join(' · ')||null,
        cost:cost(r.supplierPrice), markup_percent:markupN, sale_price:sale(r.supplierPrice), active:true,
        supplier_name:supplier||null, supplier_price:r.supplierPrice, supplier_source_page:r.sourcePage||null,
        supplier_catalog_date:new Date().toISOString().slice(0,10)
      }))
      for(let i=0;i<payload.length;i+=100){
        setMessage(`Importando… ${Math.min(i+100,payload.length)}/${payload.length}`)
        const {error}=await supabase.from('products').upsert(payload.slice(i,i+100),{onConflict:'id'});if(error)throw error
      }
      setMessage(`Listo: ${payload.length} productos pasaron a Productos B&B.`); setSelected(new Set())
    }catch(e){setMessage(e instanceof Error?e.message:'No se pudo completar la importación.')}
    finally{setBusy(false)}
  }

  return <AppShell><div className="mx-auto max-w-7xl">
    <div className="flex flex-wrap items-end justify-between gap-3"><div><h1 className="text-2xl font-bold">Catálogos de proveedores</h1><p className="mt-1 text-slate-500">Subí una lista, elegí qué querés vender y pasalo a Productos B&B.</p></div></div>
    <div className="mt-6 grid gap-4 rounded-2xl border bg-white p-5 md:grid-cols-4">
      <label className="text-sm font-medium">Proveedor<input value={supplier} onChange={e=>setSupplier(e.target.value)} className="mt-1.5 w-full rounded-xl border px-3 py-2"/></label>
      <label className="text-sm font-medium">IVA %<input value={iva} onChange={e=>setIva(e.target.value)} className="mt-1.5 w-full rounded-xl border px-3 py-2"/></label>
      <label className="text-sm font-medium">Descuento proveedor %<input value={discount} onChange={e=>setDiscount(e.target.value)} className="mt-1.5 w-full rounded-xl border px-3 py-2"/></label>
      <label className="text-sm font-medium">Margen B&B %<input value={markup} onChange={e=>setMarkup(e.target.value)} className="mt-1.5 w-full rounded-xl border px-3 py-2"/></label>
      <label className="md:col-span-4 cursor-pointer rounded-xl border-2 border-dashed p-5 text-center"><b>{fileName||'Seleccionar Excel del proveedor'}</b><input type="file" accept=".xlsx,.xls,.csv" className="hidden" onChange={readFile}/></label>
    </div>
    {rows.length>0&&<>
      <div className="mt-4 flex flex-wrap gap-2 rounded-2xl border bg-white p-4">
        <input placeholder="Buscar producto, código, marca…" value={query} onChange={e=>setQuery(e.target.value)} className="min-w-[260px] flex-1 rounded-xl border px-3 py-2"/>
        <select value={brand} onChange={e=>setBrand(e.target.value)} className="rounded-xl border px-3 py-2"><option value="">Todas las marcas</option>{brands.map(b=><option key={b}>{b}</option>)}</select>
        <button onClick={selectVisible} className="rounded-xl border px-4 py-2 font-medium">Seleccionar visibles</button>
        <button onClick={()=>setSelected(new Set())} className="rounded-xl border px-4 py-2">Limpiar</button>
      </div>
      <div className="mt-4 overflow-x-auto rounded-2xl border bg-white"><table className="w-full text-sm"><thead className="bg-slate-50 text-left"><tr><th className="p-3">✓</th><th className="p-3">Producto</th><th className="p-3">Marca</th><th className="p-3">Código</th><th className="p-3">Proveedor</th><th className="p-3">Costo B&B</th><th className="p-3">Venta sugerida</th></tr></thead><tbody>{filtered.map(r=><tr key={r.key} className="border-t"><td className="p-3"><input type="checkbox" checked={selected.has(r.key)} onChange={()=>toggle(r.key)}/></td><td className="p-3"><div className="font-medium">{r.name}</div><div className="text-xs text-slate-500">{[r.category,r.specification,r.presentation,r.unit].filter(Boolean).join(' · ')}</div></td><td className="p-3">{r.brand||'—'}</td><td className="p-3">{r.sku||'—'}</td><td className="p-3">{money(r.supplierPrice)}</td><td className="p-3">{money(cost(r.supplierPrice))}</td><td className="p-3 font-semibold">{money(sale(r.supplierPrice))}</td></tr>)}</tbody></table></div>
      <div className="sticky bottom-4 mt-4 flex flex-wrap items-center justify-between gap-3 rounded-2xl border bg-white p-4 shadow-lg"><div><b>{selected.size}</b> seleccionados <span className="text-sm text-slate-500">de {rows.length} detectados</span></div><button disabled={busy||!selected.size} onClick={importSelected} className="rounded-xl bg-brand-600 px-5 py-2.5 font-semibold text-white disabled:opacity-50">{busy?'Importando…':`Importar ${selected.size} a B&B`}</button></div>
    </>}
    {message&&<div className="mt-4 rounded-xl border bg-white p-4 text-sm">{message}</div>}
  </div></AppShell>
}
