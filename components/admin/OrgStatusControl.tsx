'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'
import type { OrgStatus } from '@/lib/schema'

/**
 * Suspend or restore a studio from the platform console (N-27).
 *
 * The confirmation is not decoration. This is the only control in the product that can stop
 * another business working, and the cost of a mis-click is a studio locked out mid-wedding — so
 * it asks, it names the studio it is about to act on, and it asks for a reason that lands on the
 * audit row.
 *
 * Restoring is one click with no confirmation, because the asymmetry is real: suspending is
 * dangerous and restoring is the fix for having suspended by mistake.
 */
export function OrgStatusControl({
  orgId,
  orgName,
  status,
}: {
  orgId: string
  orgName: string
  status: OrgStatus
}) {
  const router = useRouter()
  const [confirming, setConfirming] = useState(false)
  const [reason, setReason] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function submit(next: OrgStatus) {
    setBusy(true)
    setError(null)
    try {
      const response = await fetch(`/api/admin/platform/orgs/${orgId}/status`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ status: next, reason: reason.trim() || undefined }),
      })
      if (!response.ok) {
        const body = (await response.json().catch(() => null)) as { error?: { message?: string } } | null
        throw new Error(body?.error?.message ?? `Request failed (${response.status})`)
      }
      setConfirming(false)
      setReason('')
      router.refresh()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Something went wrong')
    } finally {
      setBusy(false)
    }
  }

  if (status === 'suspended') {
    return (
      <div className="rounded-[var(--radius-card)] border border-[var(--color-error)] bg-white p-4">
        <p className="mb-1 text-[15px] font-semibold">This studio is suspended</p>
        <p className="mb-3 text-[13px] text-[var(--color-l-text-mid)]">
          They cannot sign in or change anything. Weddings they have already delivered are
          untouched and still playing.
        </p>
        <button
          type="button"
          onClick={() => void submit('active')}
          disabled={busy}
          className="h-10 rounded-[var(--radius-pill)] bg-[var(--color-l-text-hi)] px-5 text-[14px] font-semibold text-white disabled:opacity-60"
        >
          {busy ? 'Restoring…' : 'Restore access'}
        </button>
        {error ? <p className="mt-2 text-[13px] text-[var(--color-error)]">{error}</p> : null}
      </div>
    )
  }

  return (
    <div className="rounded-[var(--radius-card)] border border-[var(--color-l-line)] bg-white p-4">
      <p className="mb-1 text-[15px] font-semibold">Access</p>
      <p className="mb-3 text-[13px] text-[var(--color-l-text-mid)]">
        Suspending stops {orgName} signing in and blocks every change they could make. It does not
        touch the weddings they have delivered.
      </p>

      {confirming ? (
        <div className="flex flex-col gap-3">
          <label className="text-[13px]">
            <span className="mb-1 block font-medium">Why (recorded in the audit trail)</span>
            <input
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Unpaid since August"
              className="h-10 w-full rounded-[var(--radius-input)] border border-[var(--color-l-line)] px-3 text-[14px]"
            />
          </label>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => void submit('suspended')}
              disabled={busy}
              className="h-10 rounded-[var(--radius-pill)] bg-[var(--color-error)] px-5 text-[14px] font-semibold text-white disabled:opacity-60"
            >
              {busy ? 'Suspending…' : `Suspend ${orgName}`}
            </button>
            <button
              type="button"
              onClick={() => setConfirming(false)}
              disabled={busy}
              className="h-10 rounded-[var(--radius-pill)] border border-[var(--color-l-line)] px-5 text-[14px] font-semibold"
            >
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setConfirming(true)}
          className="h-10 rounded-[var(--radius-pill)] border border-[var(--color-l-line)] px-5 text-[14px] font-semibold"
        >
          Suspend this studio
        </button>
      )}
      {error ? <p className="mt-2 text-[13px] text-[var(--color-error)]">{error}</p> : null}
    </div>
  )
}
