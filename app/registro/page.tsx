'use client'

import Link from 'next/link'
import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'

export default function RegistroPage() {
  const supabase = createClient()
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [loading, setLoading] = useState(false)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    setMessage('')

    if (password.length < 6) {
      return setError('La contraseña debe tener al menos 6 caracteres.')
    }

    if (password !== confirmPassword) {
      return setError('Las contraseñas no coinciden.')
    }

    setLoading(true)

    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: {
          full_name: name.trim(),
        },
      },
    })

    setLoading(false)

    if (error) {
      if (error.message.toLowerCase().includes('already')) {
        return setError('Ya existe una cuenta con ese email.')
      }
      return setError(error.message || 'No se pudo crear la cuenta.')
    }

    // Si Supabase tiene desactivada la confirmación por email, habrá sesión inmediatamente.
    if (data.session) {
      window.location.href = '/dashboard'
      return
    }

    setMessage('Cuenta creada. Revisá tu email para confirmar la cuenta y después ingresá.')
    setPassword('')
    setConfirmPassword('')
  }

  return (
    <div className="grid min-h-screen place-items-center p-4">
      <form onSubmit={submit} className="w-full max-w-sm rounded-3xl border bg-white p-7 shadow-sm">
        <div className="text-2xl font-black tracking-tight">B&B SUMINISTROS</div>
        <p className="mt-1 text-sm text-slate-500">Electricidad · Iluminación · Ferretería</p>

        <h1 className="mt-8 text-xl font-bold">Crear cuenta</h1>
        <p className="mt-1 text-sm text-slate-500">Registrate para comenzar a usar el sistema.</p>

        <div className="mt-5 space-y-3">
          <input
            required
            className="w-full rounded-xl border px-3 py-2.5"
            placeholder="Nombre"
            type="text"
            autoComplete="name"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
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
            minLength={6}
            className="w-full rounded-xl border px-3 py-2.5"
            placeholder="Contraseña"
            type="password"
            autoComplete="new-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
          <input
            required
            minLength={6}
            className="w-full rounded-xl border px-3 py-2.5"
            placeholder="Repetir contraseña"
            type="password"
            autoComplete="new-password"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
          />

          {error && <p className="text-sm text-red-600">{error}</p>}
          {message && <p className="rounded-xl bg-green-50 p-3 text-sm text-green-700">{message}</p>}

          <button
            disabled={loading}
            className="w-full rounded-xl bg-brand-600 py-2.5 font-semibold text-white disabled:opacity-50"
          >
            {loading ? 'Creando cuenta…' : 'Crear cuenta'}
          </button>
        </div>

        <p className="mt-6 text-center text-sm text-slate-500">
          ¿Ya tenés cuenta?{' '}
          <Link href="/login" className="font-semibold text-brand-600 hover:underline">
            Ingresar
          </Link>
        </p>
      </form>
    </div>
  )
}
