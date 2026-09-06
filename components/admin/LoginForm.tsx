'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'

export function LoginForm({ initialEmail = '' }: { initialEmail?: string }) {
  const router = useRouter()
  const [email, setEmail] = useState(initialEmail)
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const submit = async (event: React.FormEvent) => {
    event.preventDefault()
    setBusy(true)
    setError(null)

    const response = await fetch('/api/admin/session', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email, password }),
    })

    if (response.ok) {
      router.replace('/admin')
      router.refresh()
      return
    }

    const body = (await response.json().catch(() => null)) as { error?: { message?: string } } | null
    setError(body?.error?.message ?? 'Sign in failed')
    setBusy(false)
  }

  return (
    <main className="mx-auto flex min-h-svh max-w-[380px] flex-col justify-center px-6">
      <h1 className="mb-1 text-2xl font-bold">Mehfilbox</h1>
      <p className="mb-8 text-[14px] text-[var(--color-l-text-mid)]">Sign in to your catalogues.</p>

      <form onSubmit={submit} noValidate>
        <label className="mb-1 block text-[13px] font-semibold" htmlFor="email">
          Email
        </label>
        <input
          id="email"
          type="email"
          autoComplete="username"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="mb-4 w-full rounded-[var(--radius-input)] border border-[var(--color-l-line)] bg-white px-3 py-2.5"
        />

        <label className="mb-1 block text-[13px] font-semibold" htmlFor="password">
          Password
        </label>
        <input
          id="password"
          type="password"
          autoComplete="current-password"
          required
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="mb-6 w-full rounded-[var(--radius-input)] border border-[var(--color-l-line)] bg-white px-3 py-2.5"
        />

        {error ? (
          <p role="alert" className="mb-4 text-[14px] text-[var(--color-error)]">
            {error}
          </p>
        ) : null}

        <button
          type="submit"
          disabled={busy}
          className="h-12 w-full rounded-[var(--radius-pill)] bg-accent font-semibold text-accent-ink disabled:opacity-60"
        >
          {busy ? 'Signing in…' : 'Sign in'}
        </button>
        <p className="mt-4 text-[13px] text-[var(--color-l-text-mid)]">
        New here? <a href="/admin/register" className="underline">Create a partner account</a>
      </p>
    </form>
    </main>
  )
}
