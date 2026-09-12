'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'
import type { CatalogueStatus } from '@/lib/schema'

async function post(url: string, body: unknown): Promise<void> {
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
  if (!response.ok) {
    const parsed = (await response.json().catch(() => null)) as { error?: { message?: string } } | null
    throw new Error(parsed?.error?.message ?? `Request failed (${response.status})`)
  }
}

/**
 * The two platform-only writes on one wedding (D-39): its term, and whether it is on the air.
 *
 * The term is a renewal made real, so it lives here rather than on the studio's settings, and it
 * asks why. Offline is for abuse and says so — a billing question is the term, never this.
 */
export function ExtendTermControl({
  catalogueId,
  includedUntil,
}: {
  catalogueId: string
  includedUntil: string
}) {
  const router = useRouter()
  const [date, setDate] = useState(includedUntil.slice(0, 10))
  const [reason, setReason] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const plusYear = () => {
    const next = new Date(`${includedUntil.slice(0, 10)}T00:00:00.000Z`)
    next.setUTCFullYear(next.getUTCFullYear() + 1)
    setDate(next.toISOString().slice(0, 10))
  }

  return (
    <form
      aria-label="Term"
      onSubmit={(event) => {
        event.preventDefault()
        setBusy(true)
        setError(null)
        post(`/api/admin/platform/catalogues/${catalogueId}/term`, { includedUntil: date, reason: reason.trim() })
          .then(() => {
            setReason('')
            router.refresh()
          })
          .catch((cause: unknown) => setError(cause instanceof Error ? cause.message : 'Something went wrong'))
          .finally(() => setBusy(false))
      }}
      className="rounded-[var(--radius-card)] border border-[var(--color-l-line)] bg-white p-4"
    >
      <p className="mb-1 text-[15px] font-semibold">Serving until</p>
      <p className="mb-3 text-[13px] text-[var(--color-l-text-mid)]">
        Currently <span className="font-semibold tabular-nums">{includedUntil.slice(0, 10)}</span>.
        A renewal moves it; write what was paid.
      </p>
      <div className="flex flex-wrap items-end gap-2">
        <label className="text-[13px]">
          <span className="mb-1 block font-medium">New date</span>
          <input
            type="date"
            value={date}
            onChange={(event) => setDate(event.target.value)}
            required
            className="h-10 rounded-[var(--radius-input)] border border-[var(--color-l-line)] px-3 text-[14px]"
          />
        </label>
        <button
          type="button"
          onClick={plusYear}
          className="h-10 rounded-[var(--radius-pill)] border border-[var(--color-l-line)] px-3 text-[13px] font-semibold"
        >
          + 1 year
        </button>
        <label className="min-w-[200px] flex-1 text-[13px]">
          <span className="mb-1 block font-medium">Why (recorded)</span>
          <input
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            placeholder="Keep renewal, ₹2,500 paid 12 Sept"
            required
            className="h-10 w-full rounded-[var(--radius-input)] border border-[var(--color-l-line)] px-3 text-[14px]"
          />
        </label>
        <button
          type="submit"
          disabled={busy || reason.trim().length === 0}
          className="h-10 rounded-[var(--radius-pill)] bg-[var(--color-l-text-hi)] px-5 text-[14px] font-semibold text-white disabled:opacity-60"
        >
          {busy ? 'Saving…' : 'Set the term'}
        </button>
      </div>
      {error ? <p className="mt-2 text-[13px] text-[var(--color-error)]">{error}</p> : null}
    </form>
  )
}

export function OfflineControl({
  catalogueId,
  status,
  everPublished,
}: {
  catalogueId: string
  status: CatalogueStatus
  everPublished: boolean
}) {
  const router = useRouter()
  const [reason, setReason] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const offline = status !== 'published'

  return (
    <form
      aria-label="Availability"
      onSubmit={(event) => {
        event.preventDefault()
        setBusy(true)
        setError(null)
        post(`/api/admin/platform/catalogues/${catalogueId}/offline`, { offline: !offline, reason: reason.trim() })
          .then(() => {
            setReason('')
            router.refresh()
          })
          .catch((cause: unknown) => setError(cause instanceof Error ? cause.message : 'Something went wrong'))
          .finally(() => setBusy(false))
      }}
      className="rounded-[var(--radius-card)] border border-[var(--color-l-line)] bg-white p-4"
    >
      <p className="mb-1 text-[15px] font-semibold">
        {status === 'archived' ? 'Archived' : offline ? 'Off the air' : 'On the air'}
      </p>
      <p className="mb-3 text-[13px] text-[var(--color-l-text-mid)]">
        {status === 'archived'
          ? 'Archived by the lapse ladder; a renewed term brings it back through the cron, not this.'
          : offline
          ? everPublished
            ? 'Guests see “not yet available”. Putting it back republishes what was live and spends nothing.'
            : 'Never published. Its studio publishes it; nothing to do here.'
          : 'For abuse only. Nothing is deleted; guests see “not yet available” until it is put back. A billing question is the term above, never this.'}
      </p>
      {everPublished && status !== 'archived' ? (
        <div className="flex flex-wrap items-end gap-2">
          <label className="min-w-[200px] flex-1 text-[13px]">
            <span className="mb-1 block font-medium">Why (recorded)</span>
            <input
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              required
              className="h-10 w-full rounded-[var(--radius-input)] border border-[var(--color-l-line)] px-3 text-[14px]"
            />
          </label>
          <button
            type="submit"
            disabled={busy || reason.trim().length === 0}
            className={`h-10 rounded-[var(--radius-pill)] px-5 text-[14px] font-semibold text-white disabled:opacity-60 ${
              offline ? 'bg-[var(--color-l-text-hi)]' : 'bg-[var(--color-error)]'
            }`}
          >
            {busy ? 'Working…' : offline ? 'Put it back' : 'Take offline'}
          </button>
        </div>
      ) : null}
      {error ? <p className="mt-2 text-[13px] text-[var(--color-error)]">{error}</p> : null}
    </form>
  )
}
