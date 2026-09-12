'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'

/**
 * The studio issues the couple's sign-in (D-33, D-37).
 *
 * Two ways for the first password to reach them: a link to set their own (the default — nothing
 * to read out, nothing to write down), or a temporary password shown here once for the studio
 * that is sitting across the table from the couple. The temporary one lives exactly one sign-in.
 *
 * An address that already has a couple account is linked rather than duplicated, and the panel
 * says so: the second wedding lands in the account the first one made.
 */
export function CoupleAccountPanel({
  catalogueId,
  linked,
}: {
  catalogueId: string
  linked: { email: string; name: string } | null
}) {
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [name, setName] = useState('')
  const [delivery, setDelivery] = useState<'link' | 'temporary'>('link')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<{
    email: string
    existing: boolean
    temporaryPassword?: string
  } | null>(null)
  const [copied, setCopied] = useState(false)

  const submit = async (event: React.FormEvent) => {
    event.preventDefault()
    setBusy(true)
    setError(null)
    const response = await fetch(`/api/admin/catalogues/${catalogueId}/couple`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email, name, delivery }),
    })
    const body = (await response.json().catch(() => null)) as {
      email?: string
      existing?: boolean
      temporaryPassword?: string
      error?: { message?: string; fields?: Record<string, string> }
    } | null
    setBusy(false)
    if (!response.ok || !body?.email) {
      setError(body?.error?.fields?.email ?? body?.error?.message ?? 'Could not create the sign-in')
      return
    }
    setResult({ email: body.email, existing: body.existing ?? false, temporaryPassword: body.temporaryPassword })
    router.refresh()
  }

  const copy = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      // Selectable on screen regardless.
    }
  }

  if (result) {
    return (
      <section className="rounded-[var(--radius-card)] border border-[color-mix(in_srgb,var(--color-ok)_35%,white)] bg-[color-mix(in_srgb,var(--color-ok)_8%,white)] p-4">
        <h2 className="text-[15px] font-semibold">
          {result.existing ? 'Linked to their existing account' : 'The couple’s sign-in is ready'}
        </h2>
        {result.temporaryPassword ? (
          <>
            <p className="mb-2 mt-1 text-[13px] text-[var(--color-l-text-mid)]">
              Read this out or write it down for them. It is shown once, and they replace it the
              first time they sign in at <strong className="font-semibold">mehfilbox.com/login</strong>.
            </p>
            <div className="flex items-center gap-2 rounded-[var(--radius-input)] border border-[var(--color-l-line)] bg-white px-3 py-2">
              <span className="min-w-0 flex-1 font-mono text-[15px]" data-testid="temporary-password">
                {result.temporaryPassword}
              </span>
              <button
                type="button"
                onClick={() => void copy(result.temporaryPassword!)}
                className="shrink-0 rounded-[var(--radius-pill)] border border-[var(--color-l-line)] px-2.5 py-1 text-[12px] font-medium"
              >
                {copied ? 'Copied' : 'Copy'}
              </button>
            </div>
          </>
        ) : result.existing ? (
          <p className="mt-1 text-[13px] text-[var(--color-l-text-mid)]">
            <strong className="font-semibold">{result.email}</strong> already had an account, so this
            wedding joins it. Nothing to send.
          </p>
        ) : (
          <p className="mt-1 text-[13px] text-[var(--color-l-text-mid)]">
            A link to choose a password is on its way to{' '}
            <strong className="font-semibold">{result.email}</strong>. It works once and lasts
            fourteen days.
          </p>
        )}
      </section>
    )
  }

  if (linked) {
    return (
      <section className="rounded-[var(--radius-card)] border border-[var(--color-l-line)] bg-white p-4">
        <h2 className="text-[15px] font-semibold">The couple’s sign-in</h2>
        <p className="mt-1 text-[13px] text-[var(--color-l-text-mid)]">
          <strong className="font-semibold">{linked.name}</strong> signs in as{' '}
          <strong className="font-semibold">{linked.email}</strong>. They can see this wedding in
          their account already, and it becomes theirs at the handover below.
        </p>
      </section>
    )
  }

  return (
    <section className="rounded-[var(--radius-card)] border border-[var(--color-l-line)] bg-white p-4">
      <h2 className="text-[15px] font-semibold">Give the couple their sign-in</h2>
      <p className="mb-3 mt-1 text-[13px] text-[var(--color-l-text-mid)]">
        Their own account, where this wedding — and any later one — lives. Do it with them in the
        room if you can: the address is theirs to keep.
      </p>

      <form onSubmit={submit} className="grid gap-3 sm:grid-cols-2">
        <label className="block">
          <span className="mb-1 block text-[13px] font-semibold">Their email</span>
          <input
            type="email"
            required
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            autoCapitalize="none"
            className="h-11 w-full rounded-[var(--radius-input)] border border-[var(--color-l-line)] px-3 text-[14px]"
          />
        </label>
        <label className="block">
          <span className="mb-1 block text-[13px] font-semibold">Their name</span>
          <input
            type="text"
            required
            minLength={2}
            maxLength={80}
            value={name}
            onChange={(event) => setName(event.target.value)}
            className="h-11 w-full rounded-[var(--radius-input)] border border-[var(--color-l-line)] px-3 text-[14px]"
          />
        </label>

        <fieldset className="sm:col-span-2">
          <legend className="mb-1 text-[13px] font-semibold">Their first password</legend>
          <div className="grid gap-2 sm:grid-cols-2">
            {(
              [
                ['link', 'Email them a link to choose one', 'Nothing to read out. Works once, lasts fourteen days.'],
                ['temporary', 'Show me a temporary one', 'For the couple sitting with you. They replace it at first sign-in.'],
              ] as const
            ).map(([value, label, hint]) => (
              <label
                key={value}
                className="flex cursor-pointer items-start gap-2 rounded-[var(--radius-input)] border border-[var(--color-l-line)] px-3 py-2 has-[:checked]:border-[var(--color-l-text-hi)]"
              >
                <input
                  type="radio"
                  name="delivery"
                  value={value}
                  checked={delivery === value}
                  onChange={() => setDelivery(value)}
                  className="mt-1"
                />
                <span className="text-[14px]">
                  {label}
                  <span className="block text-[12px] text-[var(--color-l-text-mid)]">{hint}</span>
                </span>
              </label>
            ))}
          </div>
        </fieldset>

        {error ? (
          <p role="alert" className="text-[13px] text-[var(--color-error)] sm:col-span-2">
            {error}
          </p>
        ) : null}

        <div className="sm:col-span-2">
          <button
            type="submit"
            disabled={busy}
            className="h-11 rounded-[var(--radius-pill)] bg-accent px-5 text-[14px] font-semibold text-accent-ink disabled:opacity-60"
          >
            {busy ? 'Creating…' : 'Create their sign-in'}
          </button>
        </div>
      </form>
    </section>
  )
}
