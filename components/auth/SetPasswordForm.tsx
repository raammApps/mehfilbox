'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { AuthShell, Field, PrimaryButton } from './AuthShell'

/**
 * Where a credential link lands (D-33): a first password for a couple or a new studio operator,
 * or a replacement after "forgot". The page has already checked the link is live, so a person
 * who reaches the form is being asked for exactly one thing.
 */
export function SetPasswordForm({ token, first }: { token: string; first: boolean }) {
  const router = useRouter()
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState<{ email: string; door: 'studio' | 'couple' } | null>(null)

  const submit = async (event: React.FormEvent) => {
    event.preventDefault()
    setError(null)
    if (password !== confirm) {
      setError('The two passwords do not match')
      return
    }
    setBusy(true)
    const response = await fetch('/api/auth/set-password', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ token, password }),
    })
    const body = (await response.json().catch(() => null)) as {
      email?: string
      door?: 'studio' | 'couple'
      error?: { message?: string; fields?: Record<string, string> }
    } | null
    setBusy(false)
    if (!response.ok || !body?.email) {
      setError(body?.error?.fields?.password ?? body?.error?.message ?? 'Could not set the password')
      return
    }
    setDone({ email: body.email, door: body.door ?? 'studio' })
  }

  if (done) {
    return (
      <AuthShell>
        <h1 className="type-display-lg mb-2">Password set</h1>
        <p className="type-body mb-8 text-text-mid">
          Sign in with <strong className="text-text-hi">{done.email}</strong> and the password you
          just chose.
        </p>
        <button
          type="button"
          onClick={() => router.push(`/login?door=${done.door}&email=${encodeURIComponent(done.email)}`)}
          className="h-12 w-full rounded-[var(--radius-pill)] bg-accent font-semibold text-accent-ink"
        >
          Go to sign in
        </button>
      </AuthShell>
    )
  }

  return (
    <AuthShell>
      <h1 className="type-display-lg mb-2">{first ? 'Choose your password' : 'Choose a new password'}</h1>
      <p className="type-body mb-8 text-text-mid">
        {first
          ? 'This link works once. Pick something you can remember — you can change it later from your account.'
          : 'This link works once. Anyone signed in with the old password stays signed in until they sign out.'}
      </p>

      <form onSubmit={submit} noValidate>
        <Field
          id="password"
          label="New password"
          type="password"
          autoComplete="new-password"
          value={password}
          onChange={setPassword}
          hint="At least 12 characters."
          required
        />
        <Field
          id="confirm"
          label="Type it again"
          type="password"
          autoComplete="new-password"
          value={confirm}
          onChange={setConfirm}
          required
        />

        {error ? (
          <p role="alert" className="type-body mb-4 text-error">
            {error}
          </p>
        ) : null}

        <PrimaryButton busy={busy}>{busy ? 'Saving…' : 'Set password'}</PrimaryButton>
      </form>
    </AuthShell>
  )
}
