'use client'

import Link from 'next/link'
import { useState } from 'react'
import type { Door } from './LoginForm'
import { AuthShell, Field, PrimaryButton } from './AuthShell'

/**
 * Forgot password (D-33). One sentence back, whatever was typed — the server says the same thing
 * for a known address, an unknown one, and one that has been asked about too often, so the form
 * has nothing to interpret and nothing to leak.
 */
export function ForgotForm({ door }: { door: Door }) {
  const [email, setEmail] = useState('')
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<string | null>(null)

  const submit = async (event: React.FormEvent) => {
    event.preventDefault()
    setBusy(true)
    const response = await fetch('/api/auth/forgot', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email }),
    })
    const body = (await response.json().catch(() => null)) as { message?: string } | null
    setMessage(
      body?.message ?? 'If that address has an account, a link to set a new password is on its way.',
    )
    setBusy(false)
  }

  return (
    <AuthShell>
      <h1 className="type-display-lg mb-2">Forgot your password?</h1>
      <p className="type-body mb-8 text-text-mid">
        Type the address you sign in with. If it has an account, a link to set a new password
        arrives by email and works once, for an hour.
      </p>

      {message ? (
        <p role="status" className="type-body mb-6 rounded-[var(--radius-card)] bg-surface-2 px-4 py-3 text-text-hi">
          {message}
        </p>
      ) : (
        <form onSubmit={submit} noValidate>
          <Field
            id="email"
            label="Email"
            type="email"
            autoComplete="username"
            value={email}
            onChange={setEmail}
            required
          />
          <PrimaryButton busy={busy}>{busy ? 'Sending…' : 'Email me a link'}</PrimaryButton>
        </form>
      )}

      <p className="type-meta mt-5">
        <Link href={`/login?door=${door}`} className="underline underline-offset-4">
          Back to sign in
        </Link>
      </p>
    </AuthShell>
  )
}
