'use client'

import Link from 'next/link'
import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'

export default function LoginPage() {
  const supabase = createClient()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    setLoading(true)

    const { error } = await supabase.auth.signInWithPassword({ email, password })

    setLoading(false)
    if (error) return setError('No se pudo ingresar. Revisá email y contraseña.')

    window.location.href = '/dashboard'
  }

  return (
    <div className="grid min-h-screen place-items-center p-4">
      <form onSubmit={submit} className="w-full max-w-sm rounded-3xl border bg-white p-7 shadow-sm">
        <div className="text-2xl font-black tracking-tight">B&B SUMINISTROS</div>
        <p className="mt-1 text-sm text-slate-500">Electricidad · Iluminación · Ferretería</p>

        <h1 className="mt-8 text-xl font-bold">Ingresar al sistema</h1>

        <div className="mt-5 space-y-3">
          <input
            required
            className="w-full rounded-xl border px-3 py-2.5"
            placeholder="Email"
            type="email"
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
          <input
            required
            className="w-full rounded-xl border px-3 py-2.5"
            placeholder="Contraseña"
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />

          {error && <p className="text-sm text-red-600">{error}</p>}

          <button
            disabled={loading}
            className="w-full rounded-xl bg-brand-600 py-2.5 font-semibold text-white disabled:opacity-50"
          >
            {loading ? 'Ingresando…' : 'Entrar'}
          </button>
        </div>

        <p className="mt-6 text-center text-sm text-slate-500">
          ¿No tenés cuenta?{' '}
          <Link href="/registro" className="font-semibold text-brand-600 hover:underline">
            Crear cuenta
          </Link>
        </p>
      </form>
    </div>
  )
}
