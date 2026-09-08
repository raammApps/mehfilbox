'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'

/**
 * A studio's storage allowance, from the platform console (N-27b).
 *
 * Less dangerous than suspension and therefore quieter — no confirmation step, because the worst
 * a mis-typed quota does is refuse an upload until it is corrected, and it is corrected here in
 * five seconds. The reason still lands on the audit row: "why does this studio have 500 GB" is a
 * question somebody asks a year later, and the answer should not be lost.
 */
export function OrgQuotaControl({
  orgId,
  orgName,
  storageGb,
  defaultGb,
}: {
  orgId: string
  orgName: string
  /** The override, or null when the studio is on the default. */
  storageGb: number | null
  defaultGb: number
}) {
  const router = useRouter()
  const [value, setValue] = useState(storageGb === null ? '' : String(storageGb))
  const [reason, setReason] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function submit(next: number | null) {
    setBusy(true)
    setError(null)
    try {
      const response = await fetch(`/api/admin/platform/orgs/${orgId}/quota`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ storageGb: next, reason: reason.trim() || undefined }),
      })
      if (!response.ok) {
        const body = (await response.json().catch(() => null)) as {
          error?: { message?: string }
        } | null
        throw new Error(body?.error?.message ?? `Request failed (${response.status})`)
      }
      setReason('')
      router.refresh()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Something went wrong')
    } finally {
      setBusy(false)
    }
  }

  const parsed = Number.parseInt(value, 10)
  const valid = Number.isInteger(parsed) && parsed > 0

  return (
    <div className="rounded-[var(--radius-card)] border border-[var(--color-l-line)] bg-white p-4">
      <p className="mb-1 text-[15px] font-semibold">Storage</p>
      <p className="mb-3 text-[13px] text-[var(--color-l-text-mid)]">
        {storageGb === null
          ? `${orgName} is on the default of ${defaultGb} GB per wedding.`
          : `${orgName} has ${storageGb} GB per wedding, instead of the default ${defaultGb}.`}
      </p>

      <div className="mb-2 flex flex-wrap items-center gap-2">
        <label className="flex items-center gap-2 text-[13px]">
          <input
            type="number"
            min={1}
            value={value}
            onChange={(event) => setValue(event.target.value)}
            placeholder={String(defaultGb)}
            aria-label="Storage in gigabytes"
            className="h-10 w-24 rounded-[var(--radius-input)] border border-[var(--color-l-line)] px-3 text-[15px]"
          />
          GB
        </label>
        <button
          type="button"
          onClick={() => valid && void submit(parsed)}
          disabled={busy || !valid}
          className="h-10 rounded-[var(--radius-pill)] bg-[var(--color-l-text-hi)] px-5 text-[14px] font-semibold text-white disabled:opacity-60"
        >
          {busy ? 'Saving…' : 'Set'}
        </button>
        {storageGb !== null ? (
          <button
            type="button"
            onClick={() => void submit(null)}
            disabled={busy}
            className="h-10 rounded-[var(--radius-pill)] border border-[var(--color-l-line)] px-5 text-[14px] font-semibold"
          >
            Back to default
          </button>
        ) : null}
      </div>

      <input
        value={reason}
        onChange={(event) => setReason(event.target.value)}
        placeholder="Why (recorded in the audit trail)"
        aria-label="Reason"
        className="h-10 w-full rounded-[var(--radius-input)] border border-[var(--color-l-line)] px-3 text-[13px]"
      />

      {error ? <p className="mt-2 text-[13px] text-[var(--color-error)]">{error}</p> : null}
    </div>
  )
}
