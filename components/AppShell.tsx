import Link from 'next/link'
import { Boxes, FileText, LayoutDashboard, Settings, Users } from 'lucide-react'

const nav = [
  ['Dashboard', '/dashboard', LayoutDashboard],
  ['Productos', '/productos', Boxes],
  ['Clientes', '/clientes', Users],
  ['Presupuestos', '/presupuestos', FileText],
  ['Ajustes', '/ajustes', Settings],
] as const

export function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen md:grid md:grid-cols-[250px_1fr]">
      <aside className="hidden border-r bg-white md:block">
        <div className="p-5">
          <div className="text-xl font-black tracking-tight">B&B SUMINISTROS</div>
          <div className="mt-1 text-xs text-slate-500">Electricidad · Iluminación · Ferretería</div>
        </div>
        <nav className="space-y-1 px-3">
          {nav.map(([label, href, Icon]) => (
            <Link key={href} href={href} className="flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium hover:bg-slate-100">
              <Icon size={18} /> {label}
            </Link>
          ))}
        </nav>
      </aside>
      <main className="min-w-0">
        <header className="sticky top-0 z-10 flex items-center justify-between border-b bg-white/95 px-4 py-3 backdrop-blur md:px-8">
          <div>
            <div className="font-bold md:hidden">B&B Suministros</div>
            <div className="hidden text-sm text-slate-500 md:block">Sistema comercial</div>
          </div>
          <Link href="/presupuestos/nuevo" className="rounded-xl bg-brand-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-brand-700">+ Nuevo presupuesto</Link>
        </header>
        <div className="p-4 pb-24 md:p-8">{children}</div>
        <nav className="fixed bottom-0 left-0 right-0 z-20 grid grid-cols-5 border-t bg-white md:hidden">
          {nav.map(([label, href, Icon]) => (
            <Link key={href} href={href} className="flex flex-col items-center gap-1 px-1 py-2 text-[11px] text-slate-700">
              <Icon size={18} /> {label}
            </Link>
          ))}
        </nav>
      </main>
    </div>
  )
}
