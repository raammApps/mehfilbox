'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'

async function post(url: string, body?: unknown): Promise<Record<string, unknown>> {
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
  const parsed = (await response.json().catch(() => null)) as Record<string, unknown> | null
  if (!response.ok) {
    const error = parsed?.error as { message?: string } | undefined
    throw new Error(error?.message ?? `Request failed (${response.status})`)
  }
  return parsed ?? {}
}

/** Send one person a set-password link (D-39): the support answer to "I can't get in". */
export function PasswordLinkButton({ operatorId, email }: { operatorId: string; email: string }) {
  const [state, setState] = useState<'idle' | 'busy' | 'sent' | 'error'>('idle')
  const [link, setLink] = useState<string | null>(null)

  return (
    <span className="inline-flex flex-wrap items-center gap-2">
      <button
        type="button"
        disabled={state === 'busy'}
        onClick={() => {
          setState('busy')
          post(`/api/admin/platform/operators/${operatorId}/password-link`)
            .then((body) => {
              setLink(typeof body.link === 'string' ? body.link : null)
              setState('sent')
            })
            .catch(() => setState('error'))
        }}
        className="h-8 rounded-[var(--radius-pill)] border border-[var(--color-l-line)] px-3 text-[12px] font-semibold disabled:opacity-60"
      >
        {state === 'busy' ? 'Sending…' : state === 'sent' ? 'Sent' : 'Send a password link'}
      </button>
      {state === 'sent' ? (
        <span className="text-[12px] text-[var(--color-l-text-mid)]">
          Queued for {email}.{' '}
          {link ? (
            <code className="break-all text-[11px]" title="Shown once, works once">
              {link}
            </code>
          ) : null}
        </span>
      ) : null}
      {state === 'error' ? <span className="text-[12px] text-[var(--color-error)]">Could not send.</span> : null}
    </span>
  )
}

/** Another person who can sign in to this org (D-39). */
export function AddOperatorForm({ orgId }: { orgId: string }) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [role, setRole] = useState<'admin' | 'uploader'>('admin')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [made, setMade] = useState<{ email: string; link: string } | null>(null)

  if (made) {
    return (
      <p className="text-[13px]">
        Added {made.email}; their set-password link is queued.{' '}
        <code className="break-all text-[11px]">{made.link}</code>{' '}
        <button type="button" onClick={() => { setMade(null); setName(''); setEmail('') }} className="underline underline-offset-4">
          Add another
        </button>
      </p>
    )
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="h-8 rounded-[var(--radius-pill)] border border-[var(--color-l-line)] px-3 text-[12px] font-semibold"
      >
        Add a person
      </button>
    )
  }

  return (
    <form
      aria-label="Add a person"
      onSubmit={(event) => {
        event.preventDefault()
        setBusy(true)
        setError(null)
        post('/api/admin/platform/operators', { orgId, name: name.trim(), email: email.trim(), role })
          .then((body) => {
            setMade({ email: (body.operator as { email: string }).email, link: String(body.link) })
            router.refresh()
          })
          .catch((cause: unknown) => setError(cause instanceof Error ? cause.message : 'Something went wrong'))
          .finally(() => setBusy(false))
      }}
      className="flex flex-col gap-2"
    >
      <div className="flex flex-wrap gap-2">
        <input
          aria-label="Name"
          value={name}
          onChange={(event) => setName(event.target.value)}
          placeholder="Name"
          required
          className="h-9 min-w-[140px] flex-1 rounded-[var(--radius-input)] border border-[var(--color-l-line)] px-3 text-[13px]"
        />
        <input
          aria-label="Email"
          type="email"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          placeholder="Email"
          required
          className="h-9 min-w-[180px] flex-1 rounded-[var(--radius-input)] border border-[var(--color-l-line)] px-3 text-[13px]"
        />
        <select
          aria-label="Role"
          value={role}
          onChange={(event) => setRole(event.target.value as 'admin' | 'uploader')}
          className="h-9 rounded-[var(--radius-input)] border border-[var(--color-l-line)] bg-white px-2 text-[13px]"
        >
          <option value="admin">Admin</option>
          <option value="uploader">Uploader</option>
        </select>
      </div>
      {error ? <p className="text-[12px] text-[var(--color-error)]">{error}</p> : null}
      <div className="flex gap-2">
        <button
          type="submit"
          disabled={busy}
          className="h-9 rounded-[var(--radius-pill)] bg-[var(--color-l-text-hi)] px-4 text-[13px] font-semibold text-white disabled:opacity-60"
        >
          {busy ? 'Adding…' : 'Add and send a link'}
        </button>
        <button type="button" onClick={() => setOpen(false)} className="h-9 rounded-[var(--radius-pill)] border border-[var(--color-l-line)] px-4 text-[13px] font-semibold">
          Cancel
        </button>
      </div>
    </form>
  )
}
