'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useState } from 'react'
import type { ChallengeConfig } from '@/lib/captcha/config'
import { Challenge } from './Challenge'
import { AuthShell, Field, PrimaryButton } from './AuthShell'

export type Door = 'studio' | 'couple'

/**
 * Two doors, one credential store (D-33).
 *
 * The door is a **tab, not a credential.** Both post to the same session route, and where a
 * person lands is decided by the org their operator row belongs to — a couple who picks the
 * studio tab by mistake still ends up in their own account. What the door changes is the words:
 * a studio is told where to sign up, a couple is told their studio made this sign-in.
 *
 * The challenge appears when the server says so (D-34) — after the third failure on this
 * address or this device, when a captcha driver is configured — and never before.
 */
export function LoginForm({
  door,
  initialEmail = '',
  challenge,
}: {
  door: Door
  initialEmail?: string
  challenge: ChallengeConfig
}) {
  const router = useRouter()
  const [email, setEmail] = useState(initialEmail)
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [needChallenge, setNeedChallenge] = useState(false)
  const [captchaToken, setCaptchaToken] = useState<string | null>(null)

  const submit = async (event: React.FormEvent) => {
    event.preventDefault()
    setBusy(true)
    setError(null)

    const response = await fetch('/api/admin/session', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        email,
        password,
        ...(needChallenge && captchaToken ? { captchaToken } : {}),
      }),
    })

    if (response.ok) {
      const body = (await response.json().catch(() => null)) as { landing?: string } | null
      router.replace(body?.landing ?? '/admin')
      router.refresh()
      return
    }

    const body = (await response.json().catch(() => null)) as {
      error?: { message?: string; challenge?: boolean }
    } | null
    setError(body?.error?.message ?? 'Sign in failed')
    if (body?.error?.challenge) setNeedChallenge(true)
    // A Turnstile token is single-use; whatever was held is spent now.
    setCaptchaToken(null)
    setBusy(false)
  }

  const copy =
    door === 'couple'
      ? {
          heading: 'Couple sign in',
          body: 'Your studio created this sign-in and sent you the first password. Change it whenever you like.',
        }
      : {
          heading: 'Studio sign in',
          body: 'For planners, photographers and studios. Your weddings, under your name.',
        }

  return (
    <AuthShell>
      <DoorTabs door={door} email={email} />

      <h1 className="type-display-lg mb-2">{copy.heading}</h1>
      <p className="type-body mb-8 text-text-mid">{copy.body}</p>

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
        <Field
          id="password"
          label="Password"
          type="password"
          autoComplete="current-password"
          value={password}
          onChange={setPassword}
          required
        />

        {needChallenge ? <Challenge config={challenge} onToken={setCaptchaToken} /> : null}

        {error ? (
          <p role="alert" className="type-body mb-4 text-error">
            {error}
          </p>
        ) : null}

        <PrimaryButton busy={busy} disabled={needChallenge && challenge.driver !== 'none' && !captchaToken}>
          {busy ? 'Signing in…' : 'Sign in'}
        </PrimaryButton>

        <p className="type-meta mt-5 flex flex-wrap gap-x-4 gap-y-2">
          <Link href={`/login/forgot?door=${door}`} className="underline underline-offset-4">
            Forgot password?
          </Link>
          {door === 'studio' ? (
            <Link href="/admin/register" className="underline underline-offset-4">
              New here? Create a studio account
            </Link>
          ) : (
            <span className="text-text-lo">Your studio gives you your sign-in.</span>
          )}
        </p>
      </form>
    </AuthShell>
  )
}

/** Links, not buttons: the door is in the URL, so the page a person refreshes is the page they chose. */
function DoorTabs({ door, email }: { door: Door; email: string }) {
  const query = email ? `&email=${encodeURIComponent(email)}` : ''
  return (
    <nav aria-label="Who is signing in" className="mb-8 inline-flex rounded-[var(--radius-pill)] bg-surface-2 p-1">
      {(
        [
          ['studio', 'Studio'],
          ['couple', 'Couple'],
        ] as const
      ).map(([value, label]) => (
        <Link
          key={value}
          href={`/login?door=${value}${query}`}
          aria-current={door === value ? 'page' : undefined}
          className={`inline-flex h-10 items-center rounded-[var(--radius-pill)] px-5 text-[14px] font-semibold ${
            door === value ? 'bg-accent text-accent-ink' : 'text-text-mid hover:text-text-hi'
          }`}
        >
          {label}
        </Link>
      ))}
    </nav>
  )
}
