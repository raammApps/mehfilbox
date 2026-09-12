'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { AuthShell, Field, PrimaryButton } from './AuthShell'

/**
 * A signed-in person replacing their password (D-33).
 *
 * `forced` is the temporary-password case: a studio handed the couple a password in the room,
 * and the first sign-in lands here before anything else. Nothing to type but the new one — the
 * old one is the thing being got rid of. Everyone else proves they hold the current password
 * first.
 */
export function ChangePasswordForm({ forced, next = '/admin' }: { forced: boolean; next?: string }) {
  const router = useRouter()
  const [current, setCurrent] = useState('')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const submit = async (event: React.FormEvent) => {
    event.preventDefault()
    setError(null)
    if (password !== confirm) {
      setError('The two passwords do not match')
      return
    }
    setBusy(true)
    const response = await fetch('/api/auth/change-password', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ ...(forced ? {} : { current }), password }),
    })
    if (response.ok) {
      router.replace(next)
      router.refresh()
      return
    }
    const body = (await response.json().catch(() => null)) as {
      error?: { message?: string; fields?: Record<string, string> }
    } | null
    setError(
      body?.error?.fields?.current ??
        body?.error?.fields?.password ??
        body?.error?.message ??
        'Could not change the password',
    )
    setBusy(false)
  }

  return (
    <AuthShell>
      <h1 className="type-display-lg mb-2">
        {forced ? 'Choose your own password' : 'Change your password'}
      </h1>
      <p className="type-body mb-8 text-text-mid">
        {forced
          ? 'The one you signed in with was given to you by your studio. Replace it with one only you know before going any further.'
          : 'Type the current one, then the new one twice.'}
      </p>

      <form onSubmit={submit} noValidate>
        {!forced ? (
          <Field
            id="current"
            label="Current password"
            type="password"
            autoComplete="current-password"
            value={current}
            onChange={setCurrent}
            required
          />
        ) : null}
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

        <PrimaryButton busy={busy}>{busy ? 'Saving…' : 'Save new password'}</PrimaryButton>
      </form>
    </AuthShell>
  )
}
