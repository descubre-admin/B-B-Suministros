'use client'

import { ChangeEvent, useMemo, useState } from 'react'
import * as XLSX from 'xlsx'
import { AppShell } from '@/components/AppShell'
import { createClient } from '@/lib/supabase/client'

type CellValue = string | number | boolean | Date | null | undefined
type SheetRow = CellValue[]
type AdjustmentSource = 'none' | 'column' | 'fixed'
type PriceMode = 'unit' | 'meter' | 'pack'
type DuplicateMode = 'update' | 'skip'
type TreatmentMode = 'as_is' | 'general' | 'groups'
type ImportScope = 'all' | 'brand'

type Mapping = {
  sku: number | null
  name: number | null
  price: number | null
  brand: number | null
  iva: number | null
  discount: number | null
  modifier: number | null
}

type PriceRule = {
  priceMode: PriceMode
  multiplier: string
  packQuantity: string
  ivaSource: AdjustmentSource
  ivaFixed: string
  discountSource: AdjustmentSource
  discountFixed: string
  modifierSource: AdjustmentSource
  modifierFixed: string
  surchargeFixed: string
  markupPercent: string
}

type Rules = PriceRule & {
  category: string
  duplicateMode: DuplicateMode
}

type PreviewRow = {
  rowNumber: number
  sku: string
  name: string
  brand: string
  rawPrice: number
  ivaPercent: number
  discountPercent: number
  modifierPercent: number
  surchargePercent: number
  cost: number
  salePrice: number
  valid: boolean
  error?: string
  ruleLabel: string
}

const DEFAULT_RULE: PriceRule = {
  priceMode: 'unit',
  multiplier: '100',
  packQuantity: '1',
  ivaSource: 'none',
  ivaFixed: '21',
  discountSource: 'none',
  discountFixed: '0',
  modifierSource: 'none',
  modifierFixed: '0',
  surchargeFixed: '0',
  markupPercent: '20',
}

const money = (value: number) =>
  new Intl.NumberFormat('es-AR', {
    style: 'currency',
    currency: 'ARS',
    maximumFractionDigits: 2,
  }).format(value || 0)

function normalizeHeader(value: unknown) {
  return String(value ?? '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
}

function text(value: unknown) {
  return String(value ?? '').trim()
}

function numberValue(value: unknown) {
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0
  const raw = String(value ?? '').trim()
  if (!raw) return 0
  const cleaned = raw.replace(/[$%]/g, '').replace(/\s/g, '')
  let normalized = cleaned
  if (cleaned.includes(',') && cleaned.includes('.')) {
    normalized =
      cleaned.lastIndexOf(',') > cleaned.lastIndexOf('.')
        ? cleaned.replace(/\./g, '').replace(',', '.')
        : cleaned.replace(/,/g, '')
  } else if (cleaned.includes(',')) {
    normalized = cleaned.replace(/\./g, '').replace(',', '.')
  }
  const parsed = Number(normalized)
  return Number.isFinite(parsed) ? parsed : 0
}

function round2(value: number) {
  return Math.round((value + Number.EPSILON) * 100) / 100
}

function detectHeaderRow(rows: SheetRow[]) {
  const max = Math.min(rows.length, 40)
  let bestIndex = 0
  let bestScore = -1
  for (let i = 0; i < max; i += 1) {
    const headers = rows[i].map(normalizeHeader)
    let score = headers.filter(Boolean).length
    const joined = headers.join(' ')
    if (/codigo|cod|sku/.test(joined)) score += 5
    if (/descripcion|producto|nombre/.test(joined)) score += 5
    if (/precio|costo|coste/.test(joined)) score += 5
    if (/marca/.test(joined)) score += 2
    if (score > bestScore) {
      bestScore = score
      bestIndex = i
    }
  }
  return bestIndex
}

function autoMap(headers: string[]): Mapping {
  const find = (patterns: RegExp[]) => {
    const index = headers.findIndex((header) =>
      patterns.some((pattern) => pattern.test(normalizeHeader(header)))
    )
    return index >= 0 ? index : null
  }
  return {
    sku: find([/^codigo$/, /^cod\.?$/, /sku/]),
    name: find([/descripcion/, /producto/, /^nombre$/]),
    price: find([/^precio/, /^costo/, /^coste/]),
    brand: find([/^marca/]),
    iva: find([/^iva/]),
    discount: find([/bonif/, /descuento/, /^dto/]),
    modifier: find([/^mod$/, /modif/, /ajuste/]),
  }
}

function cell(row: SheetRow, index: number | null) {
  return index == null ? undefined : row[index]
}

function applyRule(
  row: SheetRow,
  rowNumber: number,
  mapping: Mapping,
  rule: PriceRule,
  ruleLabel: string
): PreviewRow {
  const sku = text(cell(row, mapping.sku))
  const name = text(cell(row, mapping.name))
  const brand = text(cell(row, mapping.brand))
  const rawPrice = numberValue(cell(row, mapping.price))

  const ivaPercent =
    rule.ivaSource === 'column'
      ? numberValue(cell(row, mapping.iva))
      : rule.ivaSource === 'fixed'
        ? numberValue(rule.ivaFixed)
        : 0

  const discountPercent =
    rule.discountSource === 'column'
      ? numberValue(cell(row, mapping.discount))
      : rule.discountSource === 'fixed'
        ? numberValue(rule.discountFixed)
        : 0

  const modifierPercent =
    rule.modifierSource === 'column'
      ? numberValue(cell(row, mapping.modifier))
      : rule.modifierSource === 'fixed'
        ? numberValue(rule.modifierFixed)
        : 0

  const surchargePercent = numberValue(rule.surchargeFixed)

  let cost = rawPrice

  if (rule.priceMode === 'meter') {
    cost *= Math.max(0, numberValue(rule.multiplier) || 1)
  }

  if (rule.priceMode === 'pack') {
    const qty = Math.max(0, numberValue(rule.packQuantity))
    cost = qty > 0 ? cost / qty : cost
  }

  cost *= 1 + ivaPercent / 100
  cost *= 1 - discountPercent / 100
  cost *= 1 + modifierPercent / 100
  cost *= 1 + surchargePercent / 100
  cost = round2(Math.max(0, cost))

  const markup = Math.max(0, numberValue(rule.markupPercent))
  const salePrice = round2(cost * (1 + markup / 100))
  const valid = Boolean(name) && rawPrice >= 0

  return {
    rowNumber,
    sku,
    name,
    brand,
    rawPrice,
    ivaPercent,
    discountPercent,
    modifierPercent,
    surchargePercent,
    cost,
    salePrice,
    valid,
    error: !name ? 'Falta nombre' : undefined,
    ruleLabel,
  }
}

function ruleSummary(rule: PriceRule) {
  const parts: string[] = []
  if (rule.priceMode === 'unit') parts.push('precio directo')
  if (rule.priceMode === 'meter') parts.push(`× ${rule.multiplier || '1'} m`)
  if (rule.priceMode === 'pack') parts.push(`÷ ${rule.packQuantity || '1'} u.`)
  if (rule.ivaSource !== 'none') parts.push('IVA')
  if (rule.discountSource !== 'none') parts.push('descuento')
  if (rule.modifierSource !== 'none') parts.push('mod.')
  if (numberValue(rule.surchargeFixed)) parts.push(`+${rule.surchargeFixed}%`)
  parts.push(`margen ${rule.markupPercent || '0'}%`)
  return parts.join(' · ')
}

export default function ImportarProductosPage() {
  const supabase = useMemo(() => createClient(), [])

  const [fileName, setFileName] = useState('')
  const [sheetName, setSheetName] = useState('')
  const [rawRows, setRawRows] = useState<SheetRow[]>([])
  const [headerRow, setHeaderRow] = useState(0)
  const [headers, setHeaders] = useState<string[]>([])
  const [mapping, setMapping] = useState<Mapping>({
    sku: null,
    name: null,
    price: null,
    brand: null,
    iva: null,
    discount: null,
    modifier: null,
  })

  const [treatmentMode, setTreatmentMode] = useState<TreatmentMode>('as_is')
  const [importScope, setImportScope] = useState<ImportScope>('all')
  const [selectedBrand, setSelectedBrand] = useState('')
  const [rules, setRules] = useState<Rules>({
    ...DEFAULT_RULE,
    category: '',
    duplicateMode: 'update',
  })
  const [groupRules, setGroupRules] = useState<Record<string, PriceRule>>({})
  const [rowRules, setRowRules] = useState<Record<number, PriceRule>>({})
  const [openGroup, setOpenGroup] = useState<string | null>(null)
  const [editingRow, setEditingRow] = useState<number | null>(null)

  const [step, setStep] = useState<1 | 2 | 3>(1)
  const [importing, setImporting] = useState(false)
  const [progress, setProgress] = useState('')
  const [result, setResult] = useState<{
    inserted: number
    updated: number
    skipped: number
  } | null>(null)
  const [error, setError] = useState('')

  async function handleFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    if (!file) return

    setError('')
    setResult(null)

    try {
      const buffer = await file.arrayBuffer()
      const workbook = XLSX.read(buffer, { type: 'array', cellDates: true })
      const firstSheet = workbook.SheetNames[0]
      if (!firstSheet) throw new Error('El archivo no contiene hojas.')

      const rows = XLSX.utils.sheet_to_json<SheetRow>(workbook.Sheets[firstSheet], {
        header: 1,
        raw: true,
        defval: null,
      })

      const detected = detectHeaderRow(rows)
      const detectedHeaders = (rows[detected] ?? []).map(
        (value, index) => text(value) || `Columna ${index + 1}`
      )

      setFileName(file.name)
      setSheetName(firstSheet)
      setRawRows(rows)
      setHeaderRow(detected)
      setHeaders(detectedHeaders)
      setMapping(autoMap(detectedHeaders))
      setTreatmentMode('as_is')
      setImportScope('all')
      setSelectedBrand('')
      setGroupRules({})
      setRowRules({})
      setOpenGroup(null)
      setEditingRow(null)
      setStep(2)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo leer el Excel.')
    }
  }

  function changeHeaderRow(value: number) {
    const safe = Math.max(0, Math.min(rawRows.length - 1, value))
    const nextHeaders = (rawRows[safe] ?? []).map(
      (item, index) => text(item) || `Columna ${index + 1}`
    )
    setHeaderRow(safe)
    setHeaders(nextHeaders)
    setMapping(autoMap(nextHeaders))
    setGroupRules({})
    setRowRules({})
  }

  const dataRows = rawRows.slice(headerRow + 1)

  const brands = useMemo(() => {
    const counts = new Map<string, number>()
    dataRows.forEach((row) => {
      const name = text(cell(row, mapping.name))
      const price = numberValue(cell(row, mapping.price))
      if (!name && !price) return
      const brand = text(cell(row, mapping.brand)) || 'Sin marca'
      counts.set(brand, (counts.get(brand) ?? 0) + 1)
    })
    return [...counts.entries()].sort((a, b) => a[0].localeCompare(b[0], 'es'))
  }, [dataRows, mapping.name, mapping.price, mapping.brand])

  const scopedDataRows = useMemo(() => {
    if (importScope !== 'brand' || !selectedBrand || mapping.brand == null) {
      return dataRows.map((row, index) => ({
        row,
        rowNumber: headerRow + index + 2,
      }))
    }

    return dataRows
      .map((row, index) => ({
        row,
        rowNumber: headerRow + index + 2,
      }))
      .filter(({ row }) => {
        const brand = text(cell(row, mapping.brand)) || 'Sin marca'
        return brand === selectedBrand
      })
  }, [dataRows, headerRow, importScope, selectedBrand, mapping.brand])

  function effectiveRule(row: SheetRow, rowNumber: number) {
    if (rowRules[rowNumber]) {
      return { rule: rowRules[rowNumber], label: 'Producto' }
    }

    if (treatmentMode === 'groups') {
      const brand = text(cell(row, mapping.brand)) || 'Sin marca'
      if (groupRules[brand]) {
        return { rule: groupRules[brand], label: `Grupo: ${brand}` }
      }
    }

    if (treatmentMode === 'general') {
      return { rule: rules, label: 'Regla general' }
    }

    return {
      rule: {
        ...DEFAULT_RULE,
        markupPercent: rules.markupPercent,
      },
      label: 'Precio sin modificar',
    }
  }

  const preview = scopedDataRows
    .map(({ row, rowNumber }) => {
      const { rule, label } = effectiveRule(row, rowNumber)
      return applyRule(row, rowNumber, mapping, rule, label)
    })
    .filter((row) => row.name || row.sku || row.rawPrice)

  const validRows = preview.filter((row) => row.valid)

  function validateMapping() {
    if (mapping.name == null || mapping.price == null) {
      setError('Tenés que indicar al menos las columnas Producto/Descripción y Precio.')
      return false
    }
    return true
  }

  function goPreview() {
    setError('')
    if (!validateMapping()) return

    if (importScope === 'brand') {
      if (mapping.brand == null) {
        setError('Para importar una sola marca, primero seleccioná la columna Marca.')
        return
      }

      if (!selectedBrand) {
        setError('Elegí qué marca querés importar.')
        return
      }
    }

    setStep(3)
  }

  async function importProducts() {
    setError('')
    setResult(null)

    if (!validRows.length) {
      setError('No hay filas válidas para importar.')
      return
    }

    setImporting(true)
    setProgress('Verificando sesión…')

    const { data: authData, error: authError } = await supabase.auth.getUser()
    const user = authData.user

    if (authError || !user) {
      setImporting(false)
      setError('Tu sesión no está disponible. Volvé a iniciar sesión.')
      return
    }

    try {
      const unique = new Map<string, PreviewRow>()
      validRows.forEach((row) => {
        const key = row.sku ? `sku:${row.sku}` : `row:${row.rowNumber}`
        unique.set(key, row)
      })

      const rows = [...unique.values()]
      const skuRows = rows.filter((row) => row.sku)
      const existingBySku = new Map<string, { id: string; sku: string | null }>()

      for (let start = 0; start < skuRows.length; start += 150) {
        const chunk = skuRows.slice(start, start + 150).map((row) => row.sku)
        setProgress(
          `Buscando productos existentes… ${Math.min(start + 150, skuRows.length)}/${skuRows.length}`
        )

        const { data, error: fetchError } = await supabase
          .from('products')
          .select('id,sku')
          .in('sku', chunk)

        if (fetchError) throw fetchError

        ;(data ?? []).forEach((item) => {
          if (item.sku) {
            existingBySku.set(String(item.sku), item as { id: string; sku: string | null })
          }
        })
      }

      const toSave: Array<Record<string, unknown>> = []
      let inserted = 0
      let updated = 0
      let skipped = 0

      rows.forEach((row) => {
        const existing = row.sku ? existingBySku.get(row.sku) : undefined

        if (existing && rules.duplicateMode === 'skip') {
          skipped += 1
          return
        }

        if (existing) updated += 1
        else inserted += 1

        const sourceRow = rawRows[row.rowNumber - 1]
        const { rule } = effectiveRule(sourceRow, row.rowNumber)

        toSave.push({
          id: existing?.id ?? crypto.randomUUID(),
          user_id: user.id,
          name: row.name,
          brand: row.brand || null,
          sku: row.sku || null,
          category: rules.category.trim() || null,
          cost: row.cost,
          markup_percent: Math.max(0, numberValue(rule.markupPercent)),
          sale_price: row.salePrice,
          active: true,
        })
      })

      for (let start = 0; start < toSave.length; start += 150) {
        const chunk = toSave.slice(start, start + 150)
        setProgress(
          `Guardando productos… ${Math.min(start + 150, toSave.length)}/${toSave.length}`
        )

        const { error: saveError } = await supabase
          .from('products')
          .upsert(chunk, { onConflict: 'id' })

        if (saveError) throw saveError
      }

      setResult({ inserted, updated, skipped })
      setProgress('Importación finalizada.')
    } catch (err) {
      const message =
        err && typeof err === 'object' && 'message' in err
          ? String((err as { message?: unknown }).message ?? '')
          : ''

      setError(message || 'No se pudo completar la importación.')
    } finally {
      setImporting(false)
    }
  }

  const MappingSelect = ({
    label,
    value,
    onChange,
    optional = true,
  }: {
    label: string
    value: number | null
    onChange: (value: number | null) => void
    optional?: boolean
  }) => (
    <label className="text-sm font-medium">
      {label}
      <select
        value={value == null ? '' : String(value)}
        onChange={(event) =>
          onChange(event.target.value === '' ? null : Number(event.target.value))
        }
        className="mt-1.5 w-full rounded-xl border bg-white px-3 py-2.5 font-normal"
      >
        <option value="">
          {optional ? 'No importar / ignorar' : 'Seleccionar columna'}
        </option>
        {headers.map((header, index) => (
          <option key={`${header}-${index}`} value={index}>
            {header}
          </option>
        ))}
      </select>
    </label>
  )

  return (
    <AppShell>
      <div className="mx-auto max-w-7xl">
        <div>
          <h1 className="text-2xl font-bold">Importar productos desde Excel</h1>
          <p className="mt-1 text-slate-500">
            El precio se conserva tal como viene por defecto. Las reglas se aplican solo cuando vos las confirmás.
          </p>
        </div>

        <div className="mt-6 grid grid-cols-3 gap-2 text-sm">
          {[
            [1, '1. Archivo'],
            [2, '2. Columnas y reglas'],
            [3, '3. Vista previa'],
          ].map(([number, label]) => (
            <div
              key={String(number)}
              className={`rounded-xl border px-3 py-2 text-center ${
                step === number
                  ? 'border-brand-500 bg-brand-50 font-semibold text-brand-700'
                  : 'bg-white text-slate-500'
              }`}
            >
              {label}
            </div>
          ))}
        </div>

        {step === 1 && (
          <div className="mt-6 rounded-2xl border bg-white p-6">
            <div className="text-lg font-semibold">Subí la lista del proveedor</div>
            <p className="mt-1 text-sm text-slate-500">
              Acepta .xlsx, .xls y .csv. Nada se importa hasta la confirmación final.
            </p>

            <label className="mt-5 flex cursor-pointer flex-col items-center justify-center rounded-2xl border-2 border-dashed p-10 text-center hover:bg-slate-50">
              <span className="font-semibold">Seleccionar Excel</span>
              <span className="mt-1 text-sm text-slate-500">
                Primero vamos a revisar columnas y reglas.
              </span>
              <input
                type="file"
                accept=".xlsx,.xls,.csv"
                onChange={handleFile}
                className="hidden"
              />
            </label>
          </div>
        )}

        {step === 2 && (
          <div className="mt-6 space-y-5">
            <div className="rounded-2xl border bg-white p-5">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <div className="font-semibold">{fileName}</div>
                  <div className="text-sm text-slate-500">
                    Hoja: {sheetName} · {rawRows.length} filas detectadas
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setStep(1)}
                  className="rounded-xl border px-3 py-2 text-sm"
                >
                  Cambiar archivo
                </button>
              </div>

              <label className="mt-4 block max-w-xs text-sm font-medium">
                Fila de encabezados
                <input
                  type="number"
                  min={1}
                  max={rawRows.length}
                  value={headerRow + 1}
                  onChange={(e) => changeHeaderRow(Number(e.target.value) - 1)}
                  className="mt-1.5 w-full rounded-xl border px-3 py-2.5 font-normal"
                />
              </label>
            </div>

            <div className="rounded-2xl border bg-white p-5">
              <div className="font-semibold">¿Qué columnas querés importar?</div>
              <p className="mt-1 text-sm text-slate-500">
                Producto y Precio son los únicos obligatorios.
              </p>

              <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                <MappingSelect
                  label="Código / SKU"
                  value={mapping.sku}
                  onChange={(value) => setMapping((m) => ({ ...m, sku: value }))}
                />
                <MappingSelect
                  label="Producto / Descripción *"
                  value={mapping.name}
                  onChange={(value) => setMapping((m) => ({ ...m, name: value }))}
                  optional={false}
                />
                <MappingSelect
                  label="Precio *"
                  value={mapping.price}
                  onChange={(value) => setMapping((m) => ({ ...m, price: value }))}
                  optional={false}
                />
                <MappingSelect
                  label="Marca"
                  value={mapping.brand}
                  onChange={(value) => {
                    setMapping((m) => ({ ...m, brand: value }))
                    setGroupRules({})
                  }}
                />
                <MappingSelect
                  label="IVA"
                  value={mapping.iva}
                  onChange={(value) => setMapping((m) => ({ ...m, iva: value }))}
                />
                <MappingSelect
                  label="Bonificación / Descuento"
                  value={mapping.discount}
                  onChange={(value) => setMapping((m) => ({ ...m, discount: value }))}
                />
                <MappingSelect
                  label="Modificación / Ajuste"
                  value={mapping.modifier}
                  onChange={(value) => setMapping((m) => ({ ...m, modifier: value }))}
                />
              </div>
            </div>

            <div className="rounded-2xl border bg-white p-5">
              <div className="font-semibold">¿Qué querés importar?</div>
              <p className="mt-1 text-sm text-slate-500">
                Podés cargar toda la lista o limitar la importación a una sola marca.
              </p>

              <div className="mt-4 grid gap-3 lg:grid-cols-2">
                <TreatmentCard
                  active={importScope === 'all'}
                  title="Importar todas las marcas"
                  description="La vista previa incluirá todos los productos detectados."
                  onClick={() => {
                    setImportScope('all')
                    setSelectedBrand('')
                  }}
                />

                <TreatmentCard
                  active={importScope === 'brand'}
                  title="Importar una sola marca"
                  description="Elegís una marca y solo esos productos pasan a la vista previa e importación."
                  onClick={() => setImportScope('brand')}
                />
              </div>

              {importScope === 'brand' && (
                <div className="mt-4">
                  {mapping.brand == null ? (
                    <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
                      Primero seleccioná la columna Marca en el bloque de columnas.
                    </div>
                  ) : (
                    <label className="block max-w-xl text-sm font-medium">
                      Marca a importar
                      <select
                        value={selectedBrand}
                        onChange={(event) => setSelectedBrand(event.target.value)}
                        className="mt-1.5 w-full rounded-xl border bg-white px-3 py-2.5 font-normal"
                      >
                        <option value="">Seleccionar marca</option>
                        {brands.map(([brand, count]) => (
                          <option key={brand} value={brand}>
                            {brand} ({count} productos)
                          </option>
                        ))}
                      </select>
                    </label>
                  )}
                </div>
              )}
            </div>

            <div className="rounded-2xl border bg-white p-5">
              <div className="font-semibold">Tratamiento inicial de precios</div>
              <p className="mt-1 text-sm text-slate-500">
                Elegí cómo querés trabajar esta lista. Ninguna regla se aplica automáticamente.
              </p>

              <div className="mt-4 grid gap-3 lg:grid-cols-3">
                <TreatmentCard
                  active={treatmentMode === 'as_is'}
                  title="Usar precio sin modificar"
                  description="El valor del Excel se toma como costo. Solo aplicamos el margen B&B."
                  onClick={() => setTreatmentMode('as_is')}
                />
                <TreatmentCard
                  active={treatmentMode === 'general'}
                  title="Una regla general"
                  description="La misma fórmula para todos los productos de esta importación."
                  onClick={() => setTreatmentMode('general')}
                />
                <TreatmentCard
                  active={treatmentMode === 'groups'}
                  title="Reglas por grupo/producto"
                  description="Cada marca puede tener su regla y además podés corregir productos puntuales."
                  onClick={() => setTreatmentMode('groups')}
                />
              </div>
            </div>

            {treatmentMode === 'general' && (
              <div className="rounded-2xl border bg-white p-5">
                <div className="font-semibold">Regla general</div>
                <div className="mt-4">
                  <RuleEditor
                    rule={rules}
                    onChange={(next) => setRules((current) => ({ ...current, ...next }))}
                    mapping={mapping}
                  />
                </div>
              </div>
            )}

            {treatmentMode === 'groups' && (
              <div className="rounded-2xl border bg-white p-5">
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <div className="font-semibold">Reglas por grupo</div>
                    <p className="mt-1 text-sm text-slate-500">
                      Agrupamos por Marca. Los grupos sin regla conservan el precio original.
                    </p>
                  </div>
                  <div className="text-sm text-slate-500">
                    {brands.length} grupos detectados
                  </div>
                </div>

                {mapping.brand == null ? (
                  <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
                    Para trabajar por grupos, seleccioná primero la columna Marca.
                  </div>
                ) : (
                  <div className="mt-4 space-y-3">
                    {brands.map(([brand, count]) => {
                      const rule = groupRules[brand]
                      const open = openGroup === brand

                      return (
                        <div key={brand} className="overflow-hidden rounded-xl border">
                          <div className="flex flex-col gap-3 bg-slate-50 p-4 sm:flex-row sm:items-center sm:justify-between">
                            <div>
                              <div className="font-semibold">{brand}</div>
                              <div className="text-xs text-slate-500">
                                {count} productos · {rule ? ruleSummary(rule) : 'sin regla: precio original'}
                              </div>
                            </div>

                            <div className="flex flex-wrap gap-2">
                              {rule && (
                                <button
                                  type="button"
                                  onClick={() =>
                                    setGroupRules((current) => {
                                      const copy = { ...current }
                                      delete copy[brand]
                                      return copy
                                    })
                                  }
                                  className="rounded-lg border bg-white px-3 py-2 text-xs"
                                >
                                  Quitar regla
                                </button>
                              )}

                              <button
                                type="button"
                                onClick={() => {
                                  if (!rule) {
                                    setGroupRules((current) => ({
                                      ...current,
                                      [brand]: { ...DEFAULT_RULE, markupPercent: rules.markupPercent },
                                    }))
                                  }
                                  setOpenGroup(open ? null : brand)
                                }}
                                className="rounded-lg bg-brand-600 px-3 py-2 text-xs font-semibold text-white"
                              >
                                {open ? 'Cerrar' : rule ? 'Editar regla' : 'Crear regla'}
                              </button>
                            </div>
                          </div>

                          {open && groupRules[brand] && (
                            <div className="border-t p-4">
                              <RuleEditor
                                rule={groupRules[brand]}
                                onChange={(next) =>
                                  setGroupRules((current) => ({
                                    ...current,
                                    [brand]: next,
                                  }))
                                }
                                mapping={mapping}
                              />
                            </div>
                          )}
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>
            )}

            <div className="rounded-2xl border bg-white p-5">
              <div className="font-semibold">Opciones generales de B&B</div>
              <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                <label className="text-sm font-medium">
                  Margen B&B por defecto %
                  <input
                    value={rules.markupPercent}
                    onChange={(e) =>
                      setRules((r) => ({ ...r, markupPercent: e.target.value }))
                    }
                    inputMode="decimal"
                    className="mt-1.5 w-full rounded-xl border px-3 py-2.5 font-normal"
                  />
                </label>

                <label className="text-sm font-medium">
                  Categoría fija (opcional)
                  <input
                    value={rules.category}
                    onChange={(e) =>
                      setRules((r) => ({ ...r, category: e.target.value }))
                    }
                    placeholder="Ej. Cables"
                    className="mt-1.5 w-full rounded-xl border px-3 py-2.5 font-normal"
                  />
                </label>

                <label className="text-sm font-medium">
                  Si el código ya existe
                  <select
                    value={rules.duplicateMode}
                    onChange={(e) =>
                      setRules((r) => ({
                        ...r,
                        duplicateMode: e.target.value as DuplicateMode,
                      }))
                    }
                    className="mt-1.5 w-full rounded-xl border bg-white px-3 py-2.5 font-normal"
                  >
                    <option value="update">Actualizar costo y precio</option>
                    <option value="skip">No modificarlo</option>
                  </select>
                </label>
              </div>
            </div>

            {error && (
              <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
                {error}
              </div>
            )}

            <div className="flex justify-end">
              <button
                type="button"
                onClick={goPreview}
                className="rounded-xl bg-brand-600 px-5 py-3 font-semibold text-white"
              >
                Ver vista previa
              </button>
            </div>
          </div>
        )}

        {step === 3 && (
          <div className="mt-6 space-y-5">
            <div className="rounded-2xl border bg-white p-5">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <div className="text-lg font-semibold">Vista previa antes de importar</div>
                  <div className="text-sm text-slate-500">
                    {validRows.length} productos válidos
                    {importScope === 'brand' && selectedBrand ? ` · Marca: ${selectedBrand}` : ''}.
                    Podés corregir productos puntuales antes de importar.
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => setStep(2)}
                  disabled={importing}
                  className="rounded-xl border px-3 py-2 text-sm"
                >
                  Volver a reglas
                </button>
              </div>

              <div className="mt-4 overflow-x-auto rounded-xl border">
                <table className="min-w-[1080px] w-full text-sm">
                  <thead className="bg-slate-50 text-left">
                    <tr>
                      <th className="p-3">Fila</th>
                      <th className="p-3">Código</th>
                      <th className="p-3">Producto</th>
                      <th className="p-3">Marca</th>
                      <th className="p-3">Precio Excel</th>
                      <th className="p-3">Regla</th>
                      <th className="p-3">Costo B&B</th>
                      <th className="p-3">Venta sugerida</th>
                      <th className="p-3"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {preview.slice(0, 100).map((row) => (
                      <tr
                        key={row.rowNumber}
                        className={`border-t ${row.valid ? '' : 'bg-red-50'}`}
                      >
                        <td className="p-3">{row.rowNumber}</td>
                        <td className="p-3">{row.sku || '—'}</td>
                        <td className="p-3 max-w-[300px]">{row.name || row.error}</td>
                        <td className="p-3">{row.brand || '—'}</td>
                        <td className="p-3">{money(row.rawPrice)}</td>
                        <td className="p-3">
                          <span className="rounded-lg bg-slate-100 px-2 py-1 text-xs">
                            {row.ruleLabel}
                          </span>
                        </td>
                        <td className="p-3 font-semibold">{money(row.cost)}</td>
                        <td className="p-3 font-semibold">{money(row.salePrice)}</td>
                        <td className="p-3">
                          <button
                            type="button"
                            onClick={() => {
                              const sourceRow = rawRows[row.rowNumber - 1]
                              const { rule } = effectiveRule(sourceRow, row.rowNumber)
                              setRowRules((current) => ({
                                ...current,
                                [row.rowNumber]: { ...rule },
                              }))
                              setEditingRow(
                                editingRow === row.rowNumber ? null : row.rowNumber
                              )
                            }}
                            className="rounded-lg border px-3 py-2 text-xs"
                          >
                            Regla producto
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {preview.length > 100 && (
                <div className="mt-3 text-xs text-slate-500">
                  Mostramos los primeros 100 productos para que la pantalla siga siendo rápida.
                </div>
              )}
            </div>

            {editingRow != null && rowRules[editingRow] && (
              <div className="rounded-2xl border border-brand-200 bg-brand-50 p-5">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <div className="font-semibold">Regla específica para fila {editingRow}</div>
                    <div className="text-sm text-slate-600">
                      Esta regla tiene prioridad sobre la regla de marca o general.
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={() => {
                      setRowRules((current) => {
                        const copy = { ...current }
                        delete copy[editingRow]
                        return copy
                      })
                      setEditingRow(null)
                    }}
                    className="rounded-lg border bg-white px-3 py-2 text-sm"
                  >
                    Quitar regla específica
                  </button>
                </div>

                <div className="mt-4 rounded-xl bg-white p-4">
                  <RuleEditor
                    rule={rowRules[editingRow]}
                    onChange={(next) =>
                      setRowRules((current) => ({
                        ...current,
                        [editingRow]: next,
                      }))
                    }
                    mapping={mapping}
                  />
                </div>
              </div>
            )}

            <div className="rounded-2xl border bg-slate-50 p-5 text-sm">
              <div className="font-semibold">Prioridad de reglas</div>
              <div className="mt-2 text-slate-600">
                Producto específico → grupo/marca → regla general → precio original. Nunca se transforma un precio sin que exista una regla configurada por vos.
              </div>
            </div>

            {result && (
              <div className="rounded-2xl border border-green-200 bg-green-50 p-5 text-green-800">
                <div className="font-semibold">Importación terminada</div>
                <div className="mt-1 text-sm">
                  Nuevos: {result.inserted} · Actualizados: {result.updated} · Omitidos: {result.skipped}
                </div>
              </div>
            )}

            {error && (
              <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
                {error}
              </div>
            )}

            {progress && <div className="text-sm text-slate-500">{progress}</div>}

            <div className="flex justify-end">
              <button
                type="button"
                onClick={importProducts}
                disabled={importing || Boolean(result)}
                className="rounded-xl bg-brand-600 px-5 py-3 font-semibold text-white disabled:opacity-50"
              >
                {importing
                  ? 'Importando…'
                  : result
                    ? 'Importación realizada'
                    : `Importar ${validRows.length} productos`}
              </button>
            </div>
          </div>
        )}
      </div>
    </AppShell>
  )
}

function TreatmentCard({
  active,
  title,
  description,
  onClick,
}: {
  active: boolean
  title: string
  description: string
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-2xl border p-4 text-left transition ${
        active
          ? 'border-brand-500 bg-brand-50 ring-2 ring-brand-100'
          : 'bg-white hover:bg-slate-50'
      }`}
    >
      <div className="font-semibold">{title}</div>
      <div className="mt-1 text-sm text-slate-500">{description}</div>
    </button>
  )
}

function RuleEditor({
  rule,
  onChange,
  mapping,
}: {
  rule: PriceRule
  onChange: (rule: PriceRule) => void
  mapping: Mapping
}) {
  return (
    <div className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <label className="text-sm font-medium">
          Forma del precio
          <select
            value={rule.priceMode}
            onChange={(e) =>
              onChange({ ...rule, priceMode: e.target.value as PriceMode })
            }
            className="mt-1.5 w-full rounded-xl border bg-white px-3 py-2.5 font-normal"
          >
            <option value="unit">Precio directo / final</option>
            <option value="meter">Precio por metro × cantidad</option>
            <option value="pack">Precio de pack ÷ unidades</option>
          </select>
        </label>

        {rule.priceMode === 'meter' && (
          <label className="text-sm font-medium">
            Metros / multiplicador
            <input
              value={rule.multiplier}
              onChange={(e) => onChange({ ...rule, multiplier: e.target.value })}
              inputMode="decimal"
              className="mt-1.5 w-full rounded-xl border px-3 py-2.5 font-normal"
            />
          </label>
        )}

        {rule.priceMode === 'pack' && (
          <label className="text-sm font-medium">
            Unidades dentro del pack
            <input
              value={rule.packQuantity}
              onChange={(e) => onChange({ ...rule, packQuantity: e.target.value })}
              inputMode="decimal"
              className="mt-1.5 w-full rounded-xl border px-3 py-2.5 font-normal"
            />
          </label>
        )}

        <label className="text-sm font-medium">
          Margen B&B %
          <input
            value={rule.markupPercent}
            onChange={(e) =>
              onChange({ ...rule, markupPercent: e.target.value })
            }
            inputMode="decimal"
            className="mt-1.5 w-full rounded-xl border px-3 py-2.5 font-normal"
          />
        </label>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Adjustment
          title="IVA"
          source={rule.ivaSource}
          fixed={rule.ivaFixed}
          onSource={(value) => onChange({ ...rule, ivaSource: value })}
          onFixed={(value) => onChange({ ...rule, ivaFixed: value })}
          hasColumn={mapping.iva != null}
        />
        <Adjustment
          title="Bonificación / descuento"
          source={rule.discountSource}
          fixed={rule.discountFixed}
          onSource={(value) => onChange({ ...rule, discountSource: value })}
          onFixed={(value) => onChange({ ...rule, discountFixed: value })}
          hasColumn={mapping.discount != null}
        />
        <Adjustment
          title="Modificación / ajuste"
          source={rule.modifierSource}
          fixed={rule.modifierFixed}
          onSource={(value) => onChange({ ...rule, modifierSource: value })}
          onFixed={(value) => onChange({ ...rule, modifierFixed: value })}
          hasColumn={mapping.modifier != null}
        />
      </div>

      <label className="block max-w-xs text-sm font-medium">
        Recargo adicional %
        <input
          value={rule.surchargeFixed}
          onChange={(e) =>
            onChange({ ...rule, surchargeFixed: e.target.value })
          }
          inputMode="decimal"
          className="mt-1.5 w-full rounded-xl border px-3 py-2.5 font-normal"
        />
      </label>
    </div>
  )
}

function Adjustment({
  title,
  source,
  fixed,
  onSource,
  onFixed,
  hasColumn,
}: {
  title: string
  source: AdjustmentSource
  fixed: string
  onSource: (source: AdjustmentSource) => void
  onFixed: (value: string) => void
  hasColumn: boolean
}) {
  return (
    <div className="rounded-xl border bg-slate-50 p-4">
      <div className="text-sm font-semibold">{title}</div>
      <select
        value={source}
        onChange={(e) => onSource(e.target.value as AdjustmentSource)}
        className="mt-3 w-full rounded-xl border bg-white px-3 py-2.5 text-sm"
      >
        <option value="none">No aplicar</option>
        <option value="column" disabled={!hasColumn}>
          Usar valor de la columna{!hasColumn ? ' (no seleccionada)' : ''}
        </option>
        <option value="fixed">Aplicar porcentaje fijo</option>
      </select>

      {source === 'fixed' && (
        <label className="mt-3 block text-xs font-medium text-slate-600">
          Porcentaje
          <input
            value={fixed}
            onChange={(e) => onFixed(e.target.value)}
            inputMode="decimal"
            className="mt-1 w-full rounded-lg border bg-white px-3 py-2 text-sm font-normal text-slate-900"
          />
        </label>
      )}
    </div>
  )
}
