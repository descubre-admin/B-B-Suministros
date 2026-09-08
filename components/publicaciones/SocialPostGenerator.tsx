'use client'

import { ChangeEvent, useEffect, useMemo, useRef, useState } from 'react'
import { Check, Download, ImagePlus, RefreshCcw, Search, X } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'

const SIZE = 1080
const RED = '#cb0505'
const DARK = '#111111'

type ProductOption = {
  id: string
  name: string
  brand: string | null
  sku: string | null
  sale_price: number | string | null
}

type OfferItem = {
  selectedProduct: ProductOption | null
  query: string
  title: string
  price: string
  image: HTMLImageElement | null
  imageName: string
}

const emptyOfferItem = (): OfferItem => ({
  selectedProduct: null,
  query: '',
  title: '',
  price: '',
  image: null,
  imageName: '',
})

function formatPrice(value: string) {
  const digits = value.replace(/\D/g, '')
  if (!digits) return '$ 0'
  return `$ ${Number(digits).toLocaleString('es-AR')}`
}

function roundedRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  radius: number,
) {
  const r = Math.min(radius, w / 2, h / 2)
  ctx.beginPath()
  ctx.moveTo(x + r, y)
  ctx.arcTo(x + w, y, x + w, y + h, r)
  ctx.arcTo(x + w, y + h, x, y + h, r)
  ctx.arcTo(x, y + h, x, y, r)
  ctx.arcTo(x, y, x + w, y, r)
  ctx.closePath()
}

function drawContainImage(
  ctx: CanvasRenderingContext2D,
  image: HTMLImageElement,
  x: number,
  y: number,
  w: number,
  h: number,
) {
  const scale = Math.min(w / image.width, h / image.height)
  const dw = image.width * scale
  const dh = image.height * scale
  const dx = x + (w - dw) / 2
  const dy = y + (h - dh) / 2
  ctx.drawImage(image, dx, dy, dw, dh)
}

function removeEdgeWhiteBackground(image: HTMLImageElement): HTMLImageElement | null {
  const canvas = document.createElement('canvas')
  canvas.width = image.naturalWidth || image.width
  canvas.height = image.naturalHeight || image.height
  const ctx = canvas.getContext('2d', { willReadFrequently: true })
  if (!ctx || !canvas.width || !canvas.height) return null

  ctx.drawImage(image, 0, 0)
  const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height)
  const data = imageData.data
  const width = canvas.width
  const height = canvas.height
  const visited = new Uint8Array(width * height)
  const queue: number[] = []

  const isBackground = (idx: number) => {
    const p = idx * 4
    const r = data[p]
    const g = data[p + 1]
    const b = data[p + 2]
    const max = Math.max(r, g, b)
    const min = Math.min(r, g, b)
    return max >= 238 && min >= 228 && max - min <= 18
  }

  const push = (idx: number) => {
    if (idx < 0 || idx >= width * height || visited[idx] || !isBackground(idx)) return
    visited[idx] = 1
    queue.push(idx)
  }

  for (let x = 0; x < width; x++) {
    push(x)
    push((height - 1) * width + x)
  }
  for (let y = 0; y < height; y++) {
    push(y * width)
    push(y * width + width - 1)
  }

  for (let head = 0; head < queue.length; head++) {
    const idx = queue[head]
    const x = idx % width
    const y = Math.floor(idx / width)
    data[idx * 4 + 3] = 0
    if (x > 0) push(idx - 1)
    if (x + 1 < width) push(idx + 1)
    if (y > 0) push(idx - width)
    if (y + 1 < height) push(idx + width)
  }

  ctx.putImageData(imageData, 0, 0)
  const result = new Image()
  result.src = canvas.toDataURL('image/png')
  return result
}

function drawHeaderLogo(
  ctx: CanvasRenderingContext2D,
  logo: HTMLImageElement,
  x: number,
  y: number,
  w: number,
  h: number,
) {
  const sx = 24
  const sy = 24
  const sw = Math.max(1, logo.naturalWidth - sx * 2)
  const sh = Math.max(1, logo.naturalHeight - sy * 2)
  const scale = Math.min(w / sw, h / sh)
  const dw = sw * scale
  const dh = sh * scale
  const dx = x + (w - dw) / 2
  const dy = y + (h - dh) / 2
  ctx.drawImage(logo, sx, sy, sw, sh, dx, dy, dw, dh)
}

function drawShield(ctx: CanvasRenderingContext2D, cx: number, cy: number, scale = 1) {
  ctx.save()
  ctx.strokeStyle = '#fff'
  ctx.lineWidth = 5 * scale
  ctx.lineJoin = 'round'
  ctx.beginPath()
  ctx.moveTo(cx, cy - 24 * scale)
  ctx.lineTo(cx + 21 * scale, cy - 15 * scale)
  ctx.lineTo(cx + 18 * scale, cy + 7 * scale)
  ctx.quadraticCurveTo(cx + 12 * scale, cy + 23 * scale, cx, cy + 31 * scale)
  ctx.quadraticCurveTo(cx - 12 * scale, cy + 23 * scale, cx - 18 * scale, cy + 7 * scale)
  ctx.lineTo(cx - 21 * scale, cy - 15 * scale)
  ctx.closePath()
  ctx.stroke()
  ctx.beginPath()
  ctx.moveTo(cx - 8 * scale, cy + 1 * scale)
  ctx.lineTo(cx - 1 * scale, cy + 9 * scale)
  ctx.lineTo(cx + 11 * scale, cy - 7 * scale)
  ctx.stroke()
  ctx.restore()
}

function drawTagIcon(ctx: CanvasRenderingContext2D, cx: number, cy: number) {
  ctx.save()
  ctx.strokeStyle = '#fff'
  ctx.lineWidth = 3
  ctx.beginPath()
  ctx.moveTo(cx - 13, cy - 4)
  ctx.lineTo(cx + 1, cy - 18)
  ctx.lineTo(cx + 17, cy - 2)
  ctx.lineTo(cx + 3, cy + 12)
  ctx.closePath()
  ctx.stroke()
  ctx.beginPath()
  ctx.arc(cx + 4, cy - 5, 3.5, 0, Math.PI * 2)
  ctx.stroke()
  ctx.restore()
}

function drawListIcon(ctx: CanvasRenderingContext2D, cx: number, cy: number) {
  ctx.save()
  ctx.strokeStyle = '#fff'
  ctx.lineWidth = 3
  ctx.strokeRect(cx - 13, cy - 17, 26, 34)
  ;[-8, 0, 8].forEach((dy) => {
    ctx.beginPath()
    ctx.moveTo(cx - 7, cy + dy)
    ctx.lineTo(cx + 7, cy + dy)
    ctx.stroke()
  })
  ctx.restore()
}

function drawPinIcon(ctx: CanvasRenderingContext2D, cx: number, cy: number) {
  ctx.save()
  ctx.fillStyle = '#fff'
  ctx.beginPath()
  ctx.arc(cx, cy - 5, 11, 0, Math.PI * 2)
  ctx.fill()
  ctx.beginPath()
  ctx.moveTo(cx - 8, cy + 2)
  ctx.lineTo(cx, cy + 18)
  ctx.lineTo(cx + 8, cy + 2)
  ctx.closePath()
  ctx.fill()
  ctx.fillStyle = RED
  ctx.beginPath()
  ctx.arc(cx, cy - 5, 4, 0, Math.PI * 2)
  ctx.fill()
  ctx.restore()
}

function drawCartIcon(ctx: CanvasRenderingContext2D, cx: number, cy: number) {
  ctx.save()
  ctx.strokeStyle = '#fff'
  ctx.lineWidth = 3
  ctx.lineCap = 'round'
  ctx.beginPath()
  ctx.moveTo(cx - 16, cy - 13)
  ctx.lineTo(cx - 10, cy - 13)
  ctx.lineTo(cx - 5, cy + 5)
  ctx.lineTo(cx + 12, cy + 5)
  ctx.lineTo(cx + 17, cy - 7)
  ctx.lineTo(cx - 8, cy - 7)
  ctx.stroke()
  ctx.beginPath()
  ctx.arc(cx - 1, cy + 13, 3, 0, Math.PI * 2)
  ctx.arc(cx + 12, cy + 13, 3, 0, Math.PI * 2)
  ctx.fillStyle = '#fff'
  ctx.fill()
  ctx.restore()
}

function wrapTextLines(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxWidth: number,
  maxLines = 3,
) {
  const words = text.trim().split(/\s+/)
  const lines: string[] = []
  let current = ''

  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word
    if (ctx.measureText(candidate).width <= maxWidth || !current) {
      current = candidate
      continue
    }
    lines.push(current)
    current = word
    if (lines.length === maxLines - 1) break
  }

  if (current && lines.length < maxLines) lines.push(current)
  return lines
}

function drawFooterItem(
  ctx: CanvasRenderingContext2D,
  x: number,
  icon: 'cart' | 'tag' | 'list' | 'pin',
  line1: string,
  line2: string,
  y: number,
) {
  ctx.fillStyle = RED
  ctx.beginPath()
  ctx.arc(x, y, 31, 0, Math.PI * 2)
  ctx.fill()
  if (icon === 'cart') drawCartIcon(ctx, x, y)
  if (icon === 'tag') drawTagIcon(ctx, x, y)
  if (icon === 'list') drawListIcon(ctx, x, y)
  if (icon === 'pin') drawPinIcon(ctx, x, y)

  ctx.fillStyle = '#fff'
  ctx.font = '700 16px Arial, sans-serif'
  ctx.fillText(line1, x + 48, y - 5)
  ctx.fillText(line2, x + 48, y + 19)
}

function drawQualityRibbon(ctx: CanvasRenderingContext2D) {
  ctx.fillStyle = RED
  ctx.beginPath()
  ctx.moveTo(902, 0)
  ctx.lineTo(1038, 0)
  ctx.lineTo(1038, 170)
  ctx.lineTo(970, 145)
  ctx.lineTo(902, 170)
  ctx.closePath()
  ctx.fill()
  drawShield(ctx, 970, 52, 0.72)
  ctx.fillStyle = '#fff'
  ctx.textAlign = 'center'
  ctx.font = '800 17px Arial, sans-serif'
  ctx.fillText('CALIDAD', 970, 101)
  ctx.fillText('GARANTIZADA', 970, 124)
  ctx.textAlign = 'left'
}

function drawSoftBackground(ctx: CanvasRenderingContext2D) {
  const bg = ctx.createLinearGradient(0, 0, SIZE, SIZE)
  bg.addColorStop(0, '#ffffff')
  bg.addColorStop(0.7, '#fbfbfa')
  bg.addColorStop(1, '#f1f1ef')
  ctx.fillStyle = bg
  ctx.fillRect(0, 0, SIZE, SIZE)
  for (let row = 0; row < 7; row += 1) {
    for (let col = 0; col < 15; col += 1) {
      const alpha = Math.max(0.025, 0.12 - col * 0.006 - row * 0.01)
      ctx.fillStyle = `rgba(203,5,5,${alpha})`
      ctx.beginPath()
      ctx.arc(615 + col * 18, 12 + row * 16, 4, 0, Math.PI * 2)
      ctx.fill()
    }
  }
}

function drawFourProductCard(
  ctx: CanvasRenderingContext2D,
  item: OfferItem,
  x: number,
  y: number,
  w: number,
  h: number,
) {
  roundedRect(ctx, x, y, w, h, 18)
  ctx.fillStyle = 'rgba(255,255,255,.93)'
  ctx.fill()
  ctx.strokeStyle = '#dc1b1b'
  ctx.lineWidth = 1.5
  ctx.stroke()

  const imageX = x + 18
  const imageY = y + 18
  const imageW = 235
  const imageH = h - 36

  if (item.image) {
    ctx.save()
    ctx.shadowColor = 'rgba(0,0,0,.14)'
    ctx.shadowBlur = 18
    ctx.shadowOffsetY = 10
    drawContainImage(ctx, item.image, imageX, imageY, imageW, imageH)
    ctx.restore()
  } else {
    ctx.save()
    ctx.setLineDash([8, 7])
    ctx.strokeStyle = '#d7d7d7'
    roundedRect(ctx, imageX + 10, imageY + 10, imageW - 20, imageH - 20, 14)
    ctx.stroke()
    ctx.setLineDash([])
    ctx.fillStyle = '#999'
    ctx.textAlign = 'center'
    ctx.font = '700 15px Arial, sans-serif'
    ctx.fillText('FOTO', imageX + imageW / 2, imageY + imageH / 2)
    ctx.textAlign = 'left'
    ctx.restore()
  }

  const textX = x + 285
  const textW = w - 310
  const cleanTitle = (item.title || 'PRODUCTO').trim().toUpperCase()
  ctx.fillStyle = DARK
  ctx.font = '900 24px Arial, sans-serif'
  const lines = wrapTextLines(ctx, cleanTitle, textW, 3)
  lines.forEach((line, idx) => ctx.fillText(line, textX, y + 70 + idx * 31))

  const price = formatPrice(item.price)
  ctx.font = '900 34px Arial, sans-serif'
  const pillW = Math.min(textW, Math.max(190, ctx.measureText(price).width + 44))
  const pillY = y + h - 80
  roundedRect(ctx, textX, pillY, pillW, 58, 13)
  const gradient = ctx.createLinearGradient(textX, pillY, textX + pillW, pillY + 58)
  gradient.addColorStop(0, '#dc0909')
  gradient.addColorStop(1, '#b40000')
  ctx.fillStyle = gradient
  ctx.fill()
  ctx.fillStyle = '#fff'
  ctx.textAlign = 'center'
  ctx.font = '900 34px Arial, sans-serif'
  ctx.fillText(price, textX + pillW / 2, pillY + 40)
  ctx.textAlign = 'left'
}

export default function SocialPostGenerator() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const supabase = useMemo(() => createClient(), [])
  const [mode, setMode] = useState<'single' | 'four'>('single')
  const [price, setPrice] = useState('')
  const [productTitle, setProductTitle] = useState('')
  const [image, setImage] = useState<HTMLImageElement | null>(null)
  const [logo, setLogo] = useState<HTMLImageElement | null>(null)
  const [imageName, setImageName] = useState('')
  const [products, setProducts] = useState<ProductOption[]>([])
  const [productQuery, setProductQuery] = useState('')
  const [selectedProduct, setSelectedProduct] = useState<ProductOption | null>(null)
  const [offers, setOffers] = useState<OfferItem[]>([
    emptyOfferItem(),
    emptyOfferItem(),
    emptyOfferItem(),
    emptyOfferItem(),
  ])
  const [productsLoading, setProductsLoading] = useState(true)
  const [productsError, setProductsError] = useState('')

  useEffect(() => {
    let cancelled = false

    async function loadProducts() {
      setProductsLoading(true)
      setProductsError('')

      const pageSize = 500
      let from = 0
      const allProducts: ProductOption[] = []

      while (true) {
        const { data, error } = await supabase
          .from('products')
          .select('id,name,brand,sku,sale_price')
          .order('name', { ascending: true })
          .range(from, from + pageSize - 1)

        if (cancelled) return

        if (error) {
          setProductsError('No se pudo cargar la lista completa de productos.')
          setProducts([])
          setProductsLoading(false)
          return
        }

        const batch = (data ?? []) as ProductOption[]
        allProducts.push(...batch)

        if (batch.length < pageSize) break
        from += pageSize
      }

      if (!cancelled) {
        setProducts(allProducts)
        setProductsLoading(false)
      }
    }

    void loadProducts()
    return () => {
      cancelled = true
    }
  }, [supabase])

  useEffect(() => {
    const img = new Image()
    img.onload = () => setLogo(img)
    img.src = '/logo-bb-horizontal.png'
  }, [])

  const filteredProducts = (query: string) => {
    const normalizedText = query.trim().toLowerCase()
    const normalizedCode = query.replace(/[^a-zA-Z0-9]/g, '').toLowerCase()
    if (!normalizedText) return []

    return products
      .filter((product) => {
        const sku = String(product.sku ?? '')
        const skuNormalized = sku.replace(/[^a-zA-Z0-9]/g, '').toLowerCase()
        const searchable = `${product.name} ${product.brand ?? ''} ${sku}`.toLowerCase()
        return searchable.includes(normalizedText) ||
          Boolean(normalizedCode && skuNormalized.includes(normalizedCode))
      })
      .sort((a, b) => {
        const aSku = String(a.sku ?? '').replace(/[^a-zA-Z0-9]/g, '').toLowerCase()
        const bSku = String(b.sku ?? '').replace(/[^a-zA-Z0-9]/g, '').toLowerCase()
        const aExact = normalizedCode && aSku === normalizedCode ? 1 : 0
        const bExact = normalizedCode && bSku === normalizedCode ? 1 : 0
        return bExact - aExact || a.name.localeCompare(b.name, 'es')
      })
      .slice(0, 12)
  }

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    canvas.width = SIZE
    canvas.height = SIZE
    drawSoftBackground(ctx)

    if (mode === 'four') {
      if (logo) drawHeaderLogo(ctx, logo, 28, 18, 350, 150)
      drawQualityRibbon(ctx)

      ctx.fillStyle = DARK
      ctx.font = '800 23px Arial, sans-serif'
      ctx.fillText('TODO', 455, 88)
      ctx.fillText('LO QUE NECESITÁS', 455, 118)
      ctx.fillText('PARA TUS PROYECTOS', 455, 148)
      ctx.fillStyle = RED
      ctx.fillRect(455, 162, 120, 3)

      ctx.fillStyle = RED
      ctx.textAlign = 'center'
      ctx.font = '900 92px Arial, sans-serif'
      ctx.fillText('OFERTAS', 540, 290)
      ctx.fillStyle = DARK
      ctx.font = '900 28px Arial, sans-serif'
      ctx.fillText('MATERIALES DE CONFIANZA, AL MEJOR PRECIO', 540, 327)
      ctx.textAlign = 'left'

      drawFourProductCard(ctx, offers[0], 24, 350, 506, 245)
      drawFourProductCard(ctx, offers[1], 550, 350, 506, 245)
      drawFourProductCard(ctx, offers[2], 24, 614, 506, 245)
      drawFourProductCard(ctx, offers[3], 550, 614, 506, 245)

      ctx.fillStyle = DARK
      ctx.fillRect(0, 890, SIZE, 190)
      drawFooterItem(ctx, 70, 'cart', 'CONSULTÁ', 'DISPONIBILIDAD', 985)
      drawFooterItem(ctx, 330, 'tag', 'PRECIOS', 'POR CANTIDAD', 985)
      drawFooterItem(ctx, 585, 'list', 'COTIZAMOS TU', 'LISTA DE MATERIALES', 985)
      drawFooterItem(ctx, 855, 'pin', 'TRES ARROYOS', 'CONSULTÁ ENTREGA', 985)
      return
    }

    if (logo) drawHeaderLogo(ctx, logo, 28, 18, 350, 150)
    drawQualityRibbon(ctx)

    ctx.fillStyle = DARK
    ctx.font = '900 72px Arial, sans-serif'
    ctx.fillText('OFERTA', 34, 300)
    ctx.fillStyle = RED
    ctx.font = '900 76px Arial, sans-serif'
    ctx.fillText('ESPECIAL', 34, 372)

    const cleanTitle = productTitle.trim().toUpperCase()
    let titleLines: string[] = []
    if (cleanTitle) {
      ctx.fillStyle = DARK
      ctx.font = '800 27px Arial, sans-serif'
      titleLines = wrapTextLines(ctx, cleanTitle, 390, 3)
      titleLines.forEach((line, index) => ctx.fillText(line, 38, 418 + index * 32))
    }

    const displayPrice = formatPrice(price)
    ctx.font = '900 46px Arial, sans-serif'
    const priceMeasure = Math.max(315, ctx.measureText(displayPrice).width + 68)
    const titleBottom = cleanTitle ? 418 + Math.max(1, titleLines.length) * 32 : 418
    const priceY = Math.max(500, titleBottom + 22)
    roundedRect(ctx, 38, priceY, priceMeasure, 78, 15)
    const priceGradient = ctx.createLinearGradient(38, priceY, 38 + priceMeasure, priceY + 78)
    priceGradient.addColorStop(0, '#d70606')
    priceGradient.addColorStop(1, '#a90000')
    ctx.fillStyle = priceGradient
    ctx.fill()
    ctx.fillStyle = '#fff'
    ctx.textAlign = 'center'
    ctx.font = '900 46px Arial, sans-serif'
    ctx.fillText(displayPrice, 38 + priceMeasure / 2, priceY + 54)
    ctx.textAlign = 'left'

    const materialsY = Math.max(620, priceY + 112)
    ctx.fillStyle = DARK
    ctx.font = '800 20px Arial, sans-serif'
    ctx.fillText('MATERIALES PARA TU PROYECTO', 42, materialsY)

    const benefitY = [materialsY + 56, materialsY + 129, materialsY + 202, materialsY + 275]
    const benefits = [
      ['CALIDAD Y', 'CONFIABILIDAD'],
      ['IDEAL PARA HOGAR,', 'OBRA Y COMERCIO'],
      ['PRECIOS POR', 'CANTIDAD'],
      ['CONSULTÁ STOCK', 'Y ENTREGA'],
    ]
    benefitY.forEach((y, i) => {
      ctx.fillStyle = RED
      ctx.beginPath()
      ctx.arc(61, y, 27, 0, Math.PI * 2)
      ctx.fill()
      drawShield(ctx, 61, y - 1, 0.52)
      ctx.fillStyle = DARK
      ctx.font = '800 18px Arial, sans-serif'
      ctx.fillText(benefits[i][0], 108, y - 7)
      ctx.fillText(benefits[i][1], 108, y + 16)
      ctx.fillStyle = '#dc3c3c'
      ctx.fillRect(108, y + 31, 220, 1.5)
    })

    if (image) {
      ctx.save()
      ctx.shadowColor = 'rgba(0,0,0,.18)'
      ctx.shadowBlur = 22
      ctx.shadowOffsetY = 14
      drawContainImage(ctx, image, 490, 180, 545, 555)
      ctx.restore()
    } else {
      ctx.save()
      ctx.strokeStyle = '#d7d7d7'
      ctx.lineWidth = 2
      ctx.setLineDash([10, 9])
      roundedRect(ctx, 560, 285, 395, 300, 24)
      ctx.stroke()
      ctx.setLineDash([])
      ctx.fillStyle = '#999'
      ctx.textAlign = 'center'
      ctx.font = '700 20px Arial, sans-serif'
      ctx.fillText('FOTO DEL PRODUCTO', 757, 438)
      ctx.textAlign = 'left'
      ctx.restore()
    }

    roundedRect(ctx, 455, 825, 575, 92, 16)
    ctx.fillStyle = 'rgba(255,255,255,.84)'
    ctx.fill()
    ctx.strokeStyle = '#bdbdbd'
    ctx.lineWidth = 1.2
    ctx.stroke()
    ctx.fillStyle = DARK
    ctx.font = '800 16px Arial, sans-serif'
    ctx.fillText('ELECTRICIDAD · ILUMINACIÓN · FERRETERÍA', 545, 863)
    ctx.font = '600 15px Arial, sans-serif'
    ctx.fillStyle = '#4b4b4b'
    ctx.fillText('Consultanos por disponibilidad y alternativas', 545, 887)

    ctx.fillStyle = DARK
    ctx.fillRect(0, 955, SIZE, 125)
    drawFooterItem(ctx, 67, 'cart', 'CONSULTÁ', 'DISPONIBILIDAD', 1018)
    drawFooterItem(ctx, 323, 'tag', 'PRECIOS', 'POR CANTIDAD', 1018)
    drawFooterItem(ctx, 566, 'list', 'COTIZAMOS TU', 'LISTA DE MATERIALES', 1018)
    drawFooterItem(ctx, 844, 'pin', 'TRES ARROYOS', 'CONSULTÁ ENTREGA', 1018)
  }, [mode, image, price, productTitle, logo, offers])

  function selectProduct(product: ProductOption) {
    setSelectedProduct(product)
    setProductTitle(product.name)
    const numericPrice = Number(product.sale_price ?? 0)
    setPrice(Number.isFinite(numericPrice) && numericPrice > 0 ? String(Math.round(numericPrice)) : '')
    setProductQuery('')
  }

  function updateOffer(index: number, patch: Partial<OfferItem>) {
    setOffers((current) => current.map((item, i) => (i === index ? { ...item, ...patch } : item)))
  }

  function selectOfferProduct(index: number, product: ProductOption) {
    const numericPrice = Number(product.sale_price ?? 0)
    updateOffer(index, {
      selectedProduct: product,
      query: '',
      title: product.name,
      price: Number.isFinite(numericPrice) && numericPrice > 0 ? String(Math.round(numericPrice)) : '',
    })
  }

  function handleSingleImage(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    if (!file) return
    setImageName(file.name)
    const reader = new FileReader()
    reader.onload = () => {
      const img = new Image()
      img.onload = () => {
        const cleaned = removeEdgeWhiteBackground(img)
        if (!cleaned) return setImage(img)
        cleaned.onload = () => setImage(cleaned)
      }
      img.src = String(reader.result)
    }
    reader.readAsDataURL(file)
  }

  function handleOfferImage(index: number, event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    if (!file) return
    updateOffer(index, { imageName: file.name })
    const reader = new FileReader()
    reader.onload = () => {
      const img = new Image()
      img.onload = () => {
        const cleaned = removeEdgeWhiteBackground(img)
        if (!cleaned) return updateOffer(index, { image: img })
        cleaned.onload = () => updateOffer(index, { image: cleaned })
      }
      img.src = String(reader.result)
    }
    reader.readAsDataURL(file)
  }

  function downloadImage() {
    const canvas = canvasRef.current
    if (!canvas) return
    const link = document.createElement('a')
    link.download = `bb-publicacion-${mode}-${Date.now()}.png`
    link.href = canvas.toDataURL('image/png', 1)
    link.click()
  }

  function clear() {
    setPrice('')
    setProductTitle('')
    setImage(null)
    setImageName('')
    setSelectedProduct(null)
    setProductQuery('')
    setOffers([emptyOfferItem(), emptyOfferItem(), emptyOfferItem(), emptyOfferItem()])
  }

  const canDownload = mode === 'single'
    ? Boolean(image && price)
    : offers.every((item) => item.image && item.price && item.title.trim())

  const productPicker = (
    query: string,
    selected: ProductOption | null,
    onQueryChange: (value: string) => void,
    onSelect: (product: ProductOption) => void,
    onClear: () => void,
    id: string,
  ) => (
    <div className="relative">
      {selected ? (
        <div className="flex items-center justify-between gap-3 rounded-xl border border-green-200 bg-green-50 p-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2 text-sm font-bold text-green-800"><Check size={16} /> Producto seleccionado</div>
            <div className="mt-1 truncate font-semibold text-slate-900">{selected.name}</div>
            <div className="truncate text-xs text-slate-500">{[selected.brand, selected.sku].filter(Boolean).join(' · ') || 'Sin marca / SKU'}</div>
          </div>
          <button type="button" onClick={onClear} className="shrink-0 rounded-lg p-2 text-slate-500 transition hover:bg-white hover:text-slate-900"><X size={17} /></button>
        </div>
      ) : (
        <>
          <div className="flex items-center rounded-xl border bg-white px-3 focus-within:border-red-400 focus-within:ring-2 focus-within:ring-red-100">
            <Search size={18} className="shrink-0 text-slate-400" />
            <input id={id} value={query} onChange={(e) => onQueryChange(e.target.value)} placeholder="Buscar por código, nombre o marca..." className="w-full bg-transparent px-2 py-3 text-sm outline-none" />
          </div>
          {query.trim() && (
            <div className="absolute z-30 mt-2 max-h-72 w-full overflow-y-auto rounded-xl border bg-white shadow-xl">
              {productsLoading ? (
                <div className="px-3 py-4 text-sm text-slate-500">Cargando productos…</div>
              ) : productsError ? (
                <div className="px-3 py-4 text-sm text-red-600">{productsError}</div>
              ) : filteredProducts(query).length ? (
                filteredProducts(query).map((product) => (
                  <button key={product.id} type="button" onClick={() => onSelect(product)} className="flex w-full items-center justify-between gap-3 border-b px-3 py-3 text-left last:border-0 hover:bg-slate-50">
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-semibold">{product.name}</span>
                      <span className="block truncate text-xs text-slate-500">{[product.brand, product.sku].filter(Boolean).join(' · ') || 'Sin marca / SKU'}</span>
                    </span>
                    <span className="shrink-0 text-sm font-black text-slate-900">{formatPrice(String(Math.round(Number(product.sale_price ?? 0))))}</span>
                  </button>
                ))
              ) : (
                <div className="px-3 py-4 text-sm text-slate-500">No encontramos productos con esa búsqueda.</div>
              )}
            </div>
          )}
        </>
      )}
    </div>
  )

  return (
    <div className="grid gap-6 xl:grid-cols-[390px_minmax(0,1fr)]">
      <section className="h-fit rounded-2xl border bg-white p-5 shadow-sm">
        <span className="inline-flex rounded-full bg-red-50 px-3 py-1 text-xs font-bold text-red-700">Formato B&B aprobado</span>
        <h2 className="mt-3 text-xl font-black tracking-tight">Crear publicación</h2>
        <p className="mt-1 text-sm leading-5 text-slate-500">Elegí una publicación individual o una placa de 4 ofertas.</p>

        <div className="mt-5 grid grid-cols-2 gap-2 rounded-xl bg-slate-100 p-1">
          <button type="button" onClick={() => setMode('single')} className={`rounded-lg px-3 py-2 text-sm font-bold transition ${mode === 'single' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500'}`}>1 producto</button>
          <button type="button" onClick={() => setMode('four')} className={`rounded-lg px-3 py-2 text-sm font-bold transition ${mode === 'four' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500'}`}>4 productos</button>
        </div>

        {mode === 'single' ? (
          <>
            <div className="mt-5">
              <label className="mb-2 block text-sm font-bold">Elegir de la lista</label>
              {productPicker(productQuery, selectedProduct, setProductQuery, selectProduct, () => setSelectedProduct(null), 'product-search')}
            </div>

            <label className="mt-5 block text-sm font-bold">Foto del producto</label>
            <label className="mt-2 flex min-h-32 cursor-pointer flex-col items-center justify-center rounded-2xl border-2 border-dashed border-slate-200 bg-slate-50 p-4 transition hover:border-red-300 hover:bg-red-50/30">
              <ImagePlus size={28} /><span className="mt-2 text-sm font-semibold">Elegir foto</span><span className="mt-1 max-w-full truncate text-xs text-slate-500">{imageName || 'JPG, PNG o WEBP'}</span>
              <input className="hidden" type="file" accept="image/*" onChange={handleSingleImage} />
            </label>

            <label className="mt-5 block text-sm font-bold">Título del producto</label>
            <input value={productTitle} onChange={(e) => setProductTitle(e.target.value)} maxLength={80} className="mt-2 w-full rounded-xl border bg-white px-3 py-3 font-semibold outline-none focus:border-red-400 focus:ring-2 focus:ring-red-100" />

            <label className="mt-5 block text-sm font-bold">Precio</label>
            <div className="mt-2 flex items-center rounded-xl border bg-white px-3 focus-within:border-red-400 focus-within:ring-2 focus-within:ring-red-100"><span className="font-black text-slate-400">$</span><input value={price} onChange={(e) => setPrice(e.target.value.replace(/\D/g, ''))} inputMode="numeric" className="w-full bg-transparent px-2 py-3 text-lg font-bold outline-none" /></div>
          </>
        ) : (
          <div className="mt-5 space-y-4">
            {offers.map((item, index) => (
              <div key={index} className="rounded-2xl border bg-slate-50 p-4">
                <div className="mb-3 flex items-center justify-between"><span className="text-sm font-black">Producto {index + 1}</span><span className="text-xs text-slate-400">{index < 2 ? 'Fila superior' : 'Fila inferior'}</span></div>
                {productPicker(item.query, item.selectedProduct, (value) => updateOffer(index, { query: value }), (product) => selectOfferProduct(index, product), () => updateOffer(index, { selectedProduct: null, query: '' }), `offer-search-${index}`)}
                <label className="mt-3 flex cursor-pointer items-center justify-center gap-2 rounded-xl border-2 border-dashed border-slate-200 bg-white px-3 py-3 text-sm font-semibold transition hover:border-red-300"><ImagePlus size={18} /> {item.imageName || 'Cargar foto'}<input className="hidden" type="file" accept="image/*" onChange={(e) => handleOfferImage(index, e)} /></label>
                <input value={item.title} onChange={(e) => updateOffer(index, { title: e.target.value })} placeholder="Nombre para la publicación" maxLength={72} className="mt-3 w-full rounded-xl border bg-white px-3 py-2.5 text-sm font-semibold outline-none focus:border-red-400" />
                <div className="mt-3 flex items-center rounded-xl border bg-white px-3"><span className="font-black text-slate-400">$</span><input value={item.price} onChange={(e) => updateOffer(index, { price: e.target.value.replace(/\D/g, '') })} inputMode="numeric" placeholder="Precio" className="w-full bg-transparent px-2 py-2.5 font-bold outline-none" /></div>
              </div>
            ))}
          </div>
        )}

        <button type="button" onClick={downloadImage} disabled={!canDownload} className="mt-6 flex w-full items-center justify-center gap-2 rounded-xl bg-red-600 px-4 py-3 font-bold text-white shadow-sm transition hover:bg-red-700 disabled:cursor-not-allowed disabled:bg-slate-300"><Download size={19} /> Descargar PNG</button>
        <button type="button" onClick={clear} className="mt-2 flex w-full items-center justify-center gap-2 rounded-xl border px-4 py-3 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"><RefreshCcw size={17} /> Empezar de nuevo</button>
      </section>

      <section className="rounded-2xl border bg-white p-4 shadow-sm md:p-6">
        <div className="mb-4 flex items-end justify-between gap-4"><div><h2 className="font-black">Vista previa</h2><p className="text-xs text-slate-500">1080 × 1080 px · Instagram / Facebook</p></div><span className="hidden rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-600 sm:inline-flex">{mode === 'single' ? '1 producto' : '4 productos'}</span></div>
        <div className="mx-auto max-w-[720px] overflow-hidden rounded-2xl border bg-slate-100 shadow-sm"><canvas ref={canvasRef} className="block h-auto w-full" /></div>
      </section>
    </div>
  )
}
