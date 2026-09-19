'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { CREDIT_PLAN_IDS, type CreditPlanId } from '@/lib/plans'
import type { CreditBalance } from '@/lib/schema'

/**
 * Grant a studio credits from the platform console (D-38, D-39).
 *
 * Additive only, and it asks for a reason because "why does this studio have twelve credits" is
 * a question somebody asks a year later. The balance beside it is what the studio itself sees,
 * so the two ends of a credit request are looking at the same number — and it is per plan (N-119),
 * because a credit is for one plan and a request names which.
 */
export function OrgCreditsControl({
  orgId,
  orgName,
  balance,
  planNames,
}: {
  orgId: string
  orgName: string
  balance: CreditBalance
  /** What each plan is called, from the price list — never spelled here. */
  planNames: Record<CreditPlanId, string>
}) {
  const router = useRouter()
  const [planId, setPlanId] = useState<CreditPlanId>('deliver')
  const [count, setCount] = useState('1')
  const [reason, setReason] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function submit(event: React.FormEvent) {
    event.preventDefault()
    setBusy(true)
    setError(null)
    try {
      const response = await fetch(`/api/admin/platform/orgs/${orgId}/credits`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ count: Number.parseInt(count, 10), planId, reason: reason.trim() }),
      })
      if (!response.ok) {
        const body = (await response.json().catch(() => null)) as { error?: { message?: string } } | null
        throw new Error(body?.error?.message ?? `Request failed (${response.status})`)
      }
      setReason('')
      setCount('1')
      router.refresh()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Something went wrong')
    } finally {
      setBusy(false)
    }
  }

  const parsed = Number.parseInt(count, 10)
  const valid = Number.isInteger(parsed) && parsed >= 1 && parsed <= 50 && reason.trim().length > 0

  return (
    <div className="rounded-[var(--radius-card)] border border-[var(--color-l-line)] bg-white p-4">
      <p className="mb-1 text-[15px] font-semibold">Credits</p>
      <p className="mb-3 text-[13px] text-[var(--color-l-text-mid)]">
        <span className="font-semibold text-[var(--color-l-text-hi)]">{balance.available} available</span>
        {' · '}
        {balance.consumed} spent{balance.expired > 0 ? ` · ${balance.expired} expired` : ''}. A
        credit is one wedding&rsquo;s first publish, of one plan; {orgName} spends one each time.
      </p>
      <ul data-testid="credit-baskets" className="mb-3 flex flex-wrap gap-2 text-[13px]">
        {CREDIT_PLAN_IDS.map((id) => (
          <li
            key={id}
            className="rounded-[var(--radius-pill)] border border-[var(--color-l-line)] px-3 py-1"
          >
            {planNames[id]} · <span className="font-semibold">{balance.byPlan[id].available}</span>
          </li>
        ))}
      </ul>
      <form onSubmit={(event) => void submit(event)} className="flex flex-col gap-2">
        <div className="flex flex-wrap gap-2">
          <label className="text-[13px]">
            <span className="mb-1 block font-medium">Plan</span>
            <select
              value={planId}
              onChange={(event) => setPlanId(event.target.value as CreditPlanId)}
              className="h-10 rounded-[var(--radius-input)] border border-[var(--color-l-line)] bg-white px-3 text-[14px]"
            >
              {CREDIT_PLAN_IDS.map((id) => (
                <option key={id} value={id}>
                  {planNames[id]}
                </option>
              ))}
            </select>
          </label>
          <label className="text-[13px]">
            <span className="mb-1 block font-medium">How many</span>
            <input
              type="number"
              min={1}
              max={50}
              value={count}
              onChange={(event) => setCount(event.target.value)}
              className="h-10 w-24 rounded-[var(--radius-input)] border border-[var(--color-l-line)] px-3 text-[14px]"
            />
          </label>
          <label className="min-w-[200px] flex-1 text-[13px]">
            <span className="mb-1 block font-medium">Why (recorded in the audit trail)</span>
            <input
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              placeholder="Paid by bank transfer on 12 Sept"
              className="h-10 w-full rounded-[var(--radius-input)] border border-[var(--color-l-line)] px-3 text-[14px]"
            />
          </label>
        </div>
        <div>
          <button
            type="submit"
            disabled={busy || !valid}
            className="h-10 rounded-[var(--radius-pill)] bg-[var(--color-l-text-hi)] px-5 text-[14px] font-semibold text-white disabled:opacity-60"
          >
            {busy ? 'Granting…' : `Grant ${valid ? parsed : ''} ${planNames[planId]} credit${parsed === 1 ? '' : 's'}`}
          </button>
        </div>
      </form>
      {error ? <p className="mt-2 text-[13px] text-[var(--color-error)]">{error}</p> : null}
    </div>
  )
}
