'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { Challenge } from '@/components/auth/Challenge'
import type { ChallengeConfig } from '@/lib/captcha/config'

/**
 * Partner sign-up.
 *
 * Four fields, because a studio filling this in is between phone calls and every extra question
 * is a reason to close the tab. Anything else we need — logo, watermark, contact number — is
 * asked for later, in the console, where there is a reason to care.
 */
export function RegisterForm({ challenge }: { challenge: ChallengeConfig }) {
  const router = useRouter()
  const [captchaToken, setCaptchaToken] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [fields, setFields] = useState<Record<string, string>>({})
  const [done, setDone] = useState<{ name: string } | null>(null)

  const submit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setBusy(true)
    setError(null)
    setFields({})

    const form = new FormData(event.currentTarget)
    const response = await fetch('/api/partners', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        businessName: form.get('businessName'),
        contactName: form.get('contactName'),
        email: form.get('email'),
        password: form.get('password'),
        locale: form.get('locale') ?? 'en',
        ...(captchaToken ? { captchaToken } : {}),
      }),
    })

    const body = (await response.json().catch(() => null)) as {
      org?: { name: string }
      error?: { message?: string; fields?: Record<string, string> }
    } | null

    setBusy(false)

    if (!response.ok || !body?.org) {
      setError(body?.error?.message ?? 'Could not create the account')
      setFields(body?.error?.fields ?? {})
      return
    }

    setDone({ name: body.org.name })
  }

  if (done) {
    return (
      <div className="mx-auto max-w-[420px] py-16">
        <h1 className="text-[24px] font-bold">{done.name} is set up</h1>
        <p className="mt-2 text-[15px] text-[var(--color-l-text-mid)]">
          Sign in to create your first catalogue. If your email needs confirming, the link is on
          its way — sign in once you have clicked it.
        </p>
        <button
          type="button"
          onClick={() => router.push('/login?door=studio')}
          className="mt-6 h-11 rounded-[var(--radius-pill)] bg-accent px-5 text-[14px] font-semibold text-accent-ink"
        >
          Go to sign in
        </button>
      </div>
    )
  }

  return (
    <form onSubmit={submit} className="mx-auto max-w-[420px] py-12">
      <h1 className="text-[24px] font-bold">Create a partner account</h1>
      <p className="mb-6 mt-1 text-[15px] text-[var(--color-l-text-mid)]">
        For studios and planners. You will build catalogues for your couples and hand each one
        over when it is ready.
      </p>

      {error ? (
        <p role="alert" className="mb-4 rounded-[var(--radius-card)] bg-[color-mix(in_srgb,var(--color-error)_10%,white)] px-3 py-2 text-[14px]">
          {error}
        </p>
      ) : null}

      <Field name="businessName" label="Business name" hint="Guests see this as “presented by”." error={fields.businessName} autoComplete="organization" />
      <Field name="contactName" label="Your name" error={fields.contactName} autoComplete="name" />
      <Field name="email" label="Email" type="email" error={fields.email} autoComplete="email" />
      <Field
        name="password"
        label="Password"
        type="password"
        hint="At least 12 characters."
        error={fields.password}
        autoComplete="new-password"
      />

      {/*
        A radio pair rather than a select, and placed before the button rather than behind a
        "more options" disclosure. It is one decision, it is made once, and every wedding this
        studio creates inherits it — a Hindi-first studio that misses this sets up every wedding
        in English and hopes the family finds the toggle (N-29).
      */}
      <fieldset className="mb-4">
        <legend className="mb-1 block text-[13px] font-semibold">
          What language do your couples read?
        </legend>
        <p className="mb-2 text-[13px] text-[var(--color-l-text-mid)]">
          The language a wedding page opens in. Guests can still switch, and you can change it per
          wedding.
        </p>
        <div className="flex gap-2">
          {(
            [
              ['en', 'English'],
              ['hi', 'हिंदी'],
            ] as const
          ).map(([value, label], index) => (
            <label
              key={value}
              className="flex flex-1 cursor-pointer items-center gap-2 rounded-[var(--radius-input)] border border-[var(--color-l-line)] px-3 py-2 text-[15px] has-[:checked]:border-[var(--color-l-text-hi)] has-[:checked]:font-semibold"
            >
              <input type="radio" name="locale" value={value} defaultChecked={index === 0} />
              {label}
            </label>
          ))}
        </div>
      </fieldset>

      {/* Every registration, when a driver is configured (D-34): an account is worth a script's first try. */}
      <Challenge config={challenge} onToken={setCaptchaToken} />

      <button
        type="submit"
        disabled={busy || (challenge.driver !== 'none' && !captchaToken)}
        className="mt-2 h-11 w-full rounded-[var(--radius-pill)] bg-accent text-[15px] font-semibold text-accent-ink disabled:opacity-60"
      >
        {busy ? 'Creating…' : 'Create account'}
      </button>

      <p className="mt-4 text-[13px] text-[var(--color-l-text-mid)]">
        Already have one? <Link href="/login?door=studio" className="underline">Sign in</Link>
      </p>
    </form>
  )
}

function Field({
  name,
  label,
  hint,
  error,
  type = 'text',
  autoComplete,
}: {
  name: string
  label: string
  hint?: string
  error?: string
  type?: string
  autoComplete?: string
}) {
  return (
    <label className="mb-4 block">
      <span className="mb-1 block text-[13px] font-semibold">{label}</span>
      <input
        name={name}
        type={type}
        required
        autoComplete={autoComplete}
        aria-invalid={error ? true : undefined}
        aria-describedby={error || hint ? `${name}-hint` : undefined}
        className={`h-11 w-full rounded-[var(--radius-input)] border px-3 text-[15px] ${
          error ? 'border-[var(--color-error)]' : 'border-[var(--color-l-line)]'
        }`}
      />
      {error || hint ? (
        <span
          id={`${name}-hint`}
          className={`mt-1 block text-[12px] ${error ? 'text-[var(--color-error)]' : 'text-[var(--color-l-text-mid)]'}`}
        >
          {error ?? hint}
        </span>
      ) : null}
    </label>
  )
}
