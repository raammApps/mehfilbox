'use client'

import { useState } from 'react'
import { SaveState, type SaveStatus } from './SaveState'

/**
 * Tell the couple their wedding is ready (N-36).
 *
 * **Two channels, and only one of them is a send.** The email goes through the notification queue
 * and is recorded. WhatsApp is a `wa.me` link that opens the studio's own WhatsApp with the
 * message already written — which is not us sending anything, and is said that way rather than
 * dressed up as delivery. It is also the channel that actually matters in this market, works
 * today, and costs nothing: D-12 deferred the MSG91 subscription precisely because ₹500 a month
 * against a hundred messages was 44× the traffic it carried.
 *
 * The copy is composed on the server from the same `delivery` template the email uses, in the
 * catalogue's language — so the two channels say the same thing, and neither is whatever a busy
 * studio typed at eleven at night.
 */
export function SendToCouple({
  catalogueId,
  message,
  defaultEmail,
}: {
  catalogueId: string
  /** The rendered `delivery` text, for WhatsApp. Composed server-side, in the couple's language. */
  message: string
  /** The address the catalogue was handed to, where one is known. */
  defaultEmail: string | null
}) {
  const [email, setEmail] = useState(defaultEmail ?? '')
  const [status, setStatus] = useState<SaveStatus>('idle')
  const [error, setError] = useState<string | null>(null)

  const send = async () => {
    setStatus('saving')
    setError(null)
    try {
      const response = await fetch(`/api/admin/catalogues/${catalogueId}/deliver`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ email }),
      })
      if (!response.ok) {
        const body = (await response.json().catch(() => null)) as {
          error?: { message?: string }
        } | null
        setStatus('error')
        setError(body?.error?.message ?? 'Could not send')
        return
      }
      setStatus('saved')
    } catch {
      setStatus('error')
      setError('Could not send')
    }
  }

  return (
    <section className="rounded-[var(--radius-card)] border border-[var(--color-l-line)] bg-white p-4">
      <h2 className="mb-1 text-[15px] font-semibold">Send it to the couple</h2>
      <p className="mb-3 text-[13px] text-[var(--color-l-text-mid)]">
        Written for you, in this wedding&rsquo;s language. This is the message their family will
        forward.
      </p>

      <div className="mb-3 flex flex-wrap items-center gap-2">
        <input
          type="email"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          placeholder="couple@example.com"
          aria-label="Couple’s email"
          className="h-10 min-w-0 flex-1 rounded-[var(--radius-input)] border border-[var(--color-l-line)] px-3 text-[15px]"
        />
        <button
          type="button"
          onClick={() => void send()}
          disabled={status === 'saving' || !email}
          className="h-10 shrink-0 rounded-[var(--radius-pill)] bg-accent px-5 text-[14px] font-semibold text-accent-ink disabled:opacity-60"
        >
          {status === 'saving' ? 'Sending…' : 'Email it'}
        </button>
        {/*
          A link, not a button: it hands the message to the studio's own WhatsApp rather than
          sending on their behalf, and the label says so. Claiming otherwise would be the kind of
          "sent!" that is discovered to be false by a couple who never received anything.
        */}
        <a
          href={`https://wa.me/?text=${encodeURIComponent(message)}`}
          target="_blank"
          rel="noreferrer"
          className="inline-flex h-10 shrink-0 items-center rounded-[var(--radius-pill)] border border-[var(--color-l-line)] px-5 text-[14px] font-semibold"
        >
          Open in WhatsApp
        </a>
      </div>

      <SaveState status={status} savedLabel="Queued — it goes out within fifteen minutes" />
      {error ? <p className="text-[13px] text-[var(--color-error)]">{error}</p> : null}

      <details className="mt-3">
        <summary className="cursor-pointer text-[13px] text-[var(--color-l-text-mid)]">
          What it says
        </summary>
        <p className="mt-2 whitespace-pre-wrap text-[13px] text-[var(--color-l-text-mid)]">
          {message}
        </p>
      </details>
    </section>
  )
}
