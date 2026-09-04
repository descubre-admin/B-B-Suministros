import { AppShell } from '@/components/AppShell'
import SocialPostGenerator from '@/components/publicaciones/SocialPostGenerator'

export default function PublicacionesPage() {
  return (
    <AppShell>
      <div className="mb-6">
        <h1 className="text-2xl font-black tracking-tight md:text-3xl">Publicaciones</h1>
        <p className="mt-1 text-sm text-slate-500">
          Generá placas listas para publicar con la identidad de B&B Suministros.
        </p>
      </div>
      <SocialPostGenerator />
    </AppShell>
  )
}
