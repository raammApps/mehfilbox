'use client'

import { useRouter } from 'next/navigation'
import { useState, useTransition } from 'react'
import { planLabel, type CreditPlanId } from '@/lib/plans'

type Result = { kind: 'ok'; text: string } | { kind: 'error'; text: string }

/**
 * "Have a code?" — a studio redeems a reward code for credits (N-121, D-61).
 *
 * The box says nothing about *why* a code did not work, because the server does not: mistyped,
 * unknown, expired, used up and not-for-you are one answer, so that the answer cannot be used to find
 * out which codes exist. Too many tries in a row is different — that one says to wait, and how long.
 *
 * After a redemption the credits card is told to refresh, and the box stays locked until the new
 * balance is on screen, so the number next to it never contradicts the message above it.
 */
export function RedeemCode({ planNames }: { planNames: Record<CreditPlanId, string> }) {
  const router = useRouter()
  const [code, setCode] = useState('')
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState<Result | null>(null)
  const [refreshing, startRefresh] = useTransition()

  async function submit(event: React.FormEvent) {
    event.preventDefault()
    setBusy(true)
    setResult(null)
    try {
      const response = await fetch('/api/admin/coupons/redeem', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ code }),
      })
      const body = (await response.json().catch(() => null)) as
        | { granted?: { count: number; planId: CreditPlanId }; error?: { message?: string } }
        | null
      if (!response.ok || !body?.granted) {
        setResult({ kind: 'error', text: body?.error?.message ?? 'Something went wrong — try again in a moment.' })
        return
      }
      const { count, planId } = body.granted
      setResult({
        kind: 'ok',
        text: `Added ${count} ${planLabel(
          Object.fromEntries(Object.entries(planNames).map(([id, name]) => [id, { name }])),
          planId,
        )} credit${count === 1 ? '' : 's'}.`,
      })
      setCode('')
      startRefresh(() => router.refresh())
    } catch {
      setResult({ kind: 'error', text: 'Something went wrong — try again in a moment.' })
    } finally {
      setBusy(false)
    }
  }

  const locked = busy || refreshing
  return (
    <form onSubmit={(event) => void submit(event)} data-testid="redeem-code" className="mt-3">
      <label className="block text-[13px] font-medium" htmlFor="redeem-code-input">
        Have a code?
      </label>
      <div className="mt-1 flex flex-wrap gap-2">
        <input
          id="redeem-code-input"
          value={code}
          onChange={(event) => setCode(event.target.value)}
          autoComplete="off"
          spellCheck={false}
          placeholder="WELCOME-2026"
          className="h-10 w-56 rounded-[var(--radius-input)] border border-[var(--color-l-line)] bg-white px-3 font-mono text-[14px] uppercase"
        />
        <button
          type="submit"
          disabled={locked || code.trim().length === 0}
          className="h-10 rounded-[var(--radius-pill)] bg-[var(--color-l-text-hi)] px-5 text-[14px] font-semibold text-white disabled:opacity-60"
        >
          {locked ? 'Checking…' : 'Redeem'}
        </button>
      </div>
      {result ? (
        <p
          role={result.kind === 'error' ? 'alert' : 'status'}
          className={`mt-2 text-[13px] ${result.kind === 'error' ? 'text-[var(--color-error)]' : 'text-[#1c5f2a]'}`}
        >
          {result.text}
        </p>
      ) : null}
    </form>
  )
}
