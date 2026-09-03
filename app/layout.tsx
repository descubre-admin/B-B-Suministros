import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'B&B Suministros',
  description: 'Productos, precios, clientes y presupuestos de B&B Suministros',
}

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="es">
      <body>{children}</body>
    </html>
  )
}
