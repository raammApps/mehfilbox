'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'

/**
 * Create a studio from the platform (D-39): the org, its first operator, their set-password
 * link, and the credits the sale included. The link is shown once — a console with no mailer
 * configured still has to be able to hand it over.
 */
export function CreateStudioForm() {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [name, setName] = useState('')
  const [contactName, setContactName] = useState('')
  const [email, setEmail] = useState('')
  const [locale, setLocale] = useState<'en' | 'hi'>('en')
  const [credits, setCredits] = useState('1')
  const [reason, setReason] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [made, setMade] = useState<{ name: string; email: string; link: string } | null>(null)

  async function submit(event: React.FormEvent) {
    event.preventDefault()
    setBusy(true)
    setError(null)
    try {
      const response = await fetch('/api/admin/platform/orgs', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          name: name.trim(),
          contactName: contactName.trim(),
          email: email.trim(),
          locale,
          credits: Number.parseInt(credits || '0', 10),
          reason: reason.trim() || undefined,
        }),
      })
      const body = (await response.json().catch(() => null)) as {
        org?: { name: string }
        operator?: { email: string }
        link?: string
        error?: { message?: string }
      } | null
      if (!response.ok) throw new Error(body?.error?.message ?? `Request failed (${response.status})`)
      setMade({ name: body!.org!.name, email: body!.operator!.email, link: body!.link! })
      router.refresh()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Something went wrong')
    } finally {
      setBusy(false)
    }
  }

  if (made) {
    return (
      <div className="rounded-[var(--radius-card)] border border-[var(--color-l-line)] bg-white p-4">
        <p className="text-[15px] font-semibold">{made.name} is ready</p>
        <p className="mt-1 text-[13px] text-[var(--color-l-text-mid)]">
          A set-password link has been queued for {made.email}. If it has to reach them another
          way, this is it — shown once, works once, fourteen days:
        </p>
        <code className="mt-2 block break-all rounded bg-[var(--color-l-surface-2)] px-2 py-1 text-[12px]">
          {made.link}
        </code>
        <button
          type="button"
          onClick={() => {
            setMade(null)
            setName('')
            setContactName('')
            setEmail('')
            setCredits('1')
            setReason('')
          }}
          className="mt-3 h-9 rounded-[var(--radius-pill)] border border-[var(--color-l-line)] px-4 text-[13px] font-semibold"
        >
          Create another
        </button>
      </div>
    )
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex h-11 items-center rounded-[var(--radius-pill)] bg-accent px-5 text-[14px] font-semibold text-accent-ink"
      >
        Create a studio
      </button>
    )
  }

  return (
    <form
      onSubmit={(event) => void submit(event)}
      className="rounded-[var(--radius-card)] border border-[var(--color-l-line)] bg-white p-4"
      aria-label="Create a studio"
    >
      <p className="mb-3 text-[15px] font-semibold">A new studio</p>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="text-[13px]">
          <span className="mb-1 block font-medium">Studio name</span>
          <input
            value={name}
            onChange={(event) => setName(event.target.value)}
            required
            className="h-10 w-full rounded-[var(--radius-input)] border border-[var(--color-l-line)] px-3 text-[14px]"
          />
        </label>
        <label className="text-[13px]">
          <span className="mb-1 block font-medium">Contact name</span>
          <input
            value={contactName}
            onChange={(event) => setContactName(event.target.value)}
            required
            className="h-10 w-full rounded-[var(--radius-input)] border border-[var(--color-l-line)] px-3 text-[14px]"
          />
        </label>
        <label className="text-[13px]">
          <span className="mb-1 block font-medium">Email — receives the set-password link</span>
          <input
            type="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            required
            className="h-10 w-full rounded-[var(--radius-input)] border border-[var(--color-l-line)] px-3 text-[14px]"
          />
        </label>
        <label className="text-[13px]">
          <span className="mb-1 block font-medium">Language</span>
          <select
            value={locale}
            onChange={(event) => setLocale(event.target.value as 'en' | 'hi')}
            className="h-10 w-full rounded-[var(--radius-input)] border border-[var(--color-l-line)] bg-white px-2 text-[14px]"
          >
            <option value="en">English</option>
            <option value="hi">हिंदी</option>
          </select>
        </label>
        <label className="text-[13px]">
          <span className="mb-1 block font-medium">Opening credits</span>
          <input
            type="number"
            min={0}
            max={50}
            value={credits}
            onChange={(event) => setCredits(event.target.value)}
            className="h-10 w-full rounded-[var(--radius-input)] border border-[var(--color-l-line)] px-3 text-[14px]"
          />
        </label>
        <label className="text-[13px]">
          <span className="mb-1 block font-medium">Why (recorded)</span>
          <input
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            placeholder="Studio plan, paid 12 Sept"
            className="h-10 w-full rounded-[var(--radius-input)] border border-[var(--color-l-line)] px-3 text-[14px]"
          />
        </label>
      </div>
      {error ? (
        <p role="alert" className="mt-3 text-[13px] text-[var(--color-error)]">
          {error}
        </p>
      ) : null}
      <div className="mt-4 flex gap-2">
        <button
          type="submit"
          disabled={busy}
          className="h-10 rounded-[var(--radius-pill)] bg-[var(--color-l-text-hi)] px-5 text-[14px] font-semibold text-white disabled:opacity-60"
        >
          {busy ? 'Creating…' : 'Create the studio'}
        </button>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="h-10 rounded-[var(--radius-pill)] border border-[var(--color-l-line)] px-5 text-[14px] font-semibold"
        >
          Cancel
        </button>
      </div>
    </form>
  )
}
