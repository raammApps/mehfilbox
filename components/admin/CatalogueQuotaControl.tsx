'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'

/**
 * One wedding's storage allowance, from the platform console (N-79, D-60).
 *
 * `OrgQuotaControl`'s sibling, one level down: quota moved to the catalogue once tiers did, so
 * this is the answer to an "Ask for more space" request — a couple who bought (or was granted)
 * more must not stay capped by a studio's own tier, the same reasoning that already made a
 * catalogue's grant win over its org's in `resolveLimits`.
 */
export function CatalogueQuotaControl({
  catalogueId,
  coupleName,
  storageGb,
  fallbackGb,
}: {
  catalogueId: string
  coupleName: string
  /** This catalogue's own override, or null when it follows the org/default. */
  storageGb: number | null
  /** What it resolves to without this override — the org's own grant, or the flat default. */
  fallbackGb: number
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
      const response = await fetch(`/api/admin/platform/catalogues/${catalogueId}/quota`, {
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
          ? `${coupleName} is on ${fallbackGb} GB, following its studio or the default.`
          : `${coupleName} has ${storageGb} GB of its own, instead of the ${fallbackGb} GB it would otherwise follow.`}
      </p>

      <div className="mb-2 flex flex-wrap items-center gap-2">
        <label className="flex items-center gap-2 text-[13px]">
          <input
            type="number"
            min={1}
            value={value}
            onChange={(event) => setValue(event.target.value)}
            placeholder={String(fallbackGb)}
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
            Remove this grant
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
