import { NextRequest, NextResponse } from 'next/server'

export async function GET(request: NextRequest) {
  const q = request.nextUrl.searchParams.get('q')?.trim()
  if (!q) return NextResponse.json({ images: [] })

  const apiKey = process.env.SERPER_API_KEY
  if (!apiKey) {
    return NextResponse.json({
      images: [],
      configured: false,
      message: 'Falta configurar SERPER_API_KEY para buscar imágenes desde la app.',
      externalSearchUrl: `https://www.google.com/search?tbm=isch&q=${encodeURIComponent(q)}`,
    })
  }

  const response = await fetch('https://google.serper.dev/images', {
    method: 'POST',
    headers: { 'X-API-KEY': apiKey, 'Content-Type': 'application/json' },
    body: JSON.stringify({ q, num: 12, gl: 'ar', hl: 'es' }),
    cache: 'no-store',
  })
  if (!response.ok) return NextResponse.json({ images: [], message: 'No se pudo consultar el buscador.' }, { status: 502 })
  const data = await response.json()
  const images = (data.images ?? []).slice(0, 12).map((item: any) => ({
    imageUrl: item.imageUrl,
    thumbnailUrl: item.thumbnailUrl || item.imageUrl,
    title: item.title || '',
    source: item.source || '',
    link: item.link || '',
  }))
  return NextResponse.json({ images, configured: true })
}
