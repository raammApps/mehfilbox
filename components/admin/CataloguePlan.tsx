'use client'

import { useRouter } from 'next/navigation'
import { useState, useTransition } from 'react'
import type { CreditPlanId } from '@/lib/plans'

type PlanOption = { id: CreditPlanId; name: string; available: number | null }

/**
 * Which plan this wedding is on, and — until it is first published — a way to change it (N-119).
 *
 * The plan decides which basket of credits the first publish spends from, so it is shown next to
 * what is in each basket, and refused afterwards: a credit of *this* plan is what publishing spent,
 * and a plan that could drift after that would leave a Cinema wedding paid for with a Deliver credit.
 *
 * Three states, told apart rather than blurred: **fixed** (published — say why), **read-only**
 * (a studio inside a couple's support window may edit the page, but the plan is the owner's), and
 * **editable**. `available` is `null` for a couple, who hold no basket (D-61), so no count is shown.
 */
export function CataloguePlan({
  catalogueId,
  planId,
  fixed,
  editable,
  plans,
}: {
  catalogueId: string
  planId: CreditPlanId
  /** Published at least once — `publishedAt` stays set through an unpublish, so this is "ever". */
  fixed: boolean
  editable: boolean
  plans: PlanOption[]
}) {
  const router = useRouter()
  const [chosen, setChosen] = useState<CreditPlanId>(planId)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  // The write returns before the screen has the new plan; hold the control until it does, the same
  // reason the price list does (a stale value beside a live button reads as "it did not save").
  const [refreshing, startRefresh] = useTransition()

  const nameOf = (id: CreditPlanId) => plans.find((plan) => plan.id === id)?.name ?? id
  const current = nameOf(planId)

  async function save() {
    setBusy(true)
    setError(null)
    try {
      const response = await fetch(`/api/admin/catalogues/${catalogueId}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ planId: chosen }),
      })
      if (!response.ok) {
        const body = (await response.json().catch(() => null)) as { error?: { message?: string } } | null
        throw new Error(body?.error?.message ?? `Request failed (${response.status})`)
      }
      startRefresh(() => router.refresh())
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Something went wrong')
    } finally {
      setBusy(false)
    }
  }

  return (
    <section
      data-testid="catalogue-plan"
      className="mt-4 rounded-[var(--radius-card)] border border-[var(--color-l-line)] bg-white p-4"
    >
      <h2 className="text-[15px] font-semibold">Plan</h2>

      {fixed ? (
        <p className="mt-1 text-[13px] text-[var(--color-l-text-mid)]">
          <span className="font-semibold text-[var(--color-l-text-hi)]">{current}.</span> Fixed — publishing
          this wedding spent a {current} credit.
        </p>
      ) : !editable ? (
        <p className="mt-1 text-[13px] text-[var(--color-l-text-mid)]">
          <span className="font-semibold text-[var(--color-l-text-hi)]">{current}.</span> The owner of this
          wedding chooses its plan.
        </p>
      ) : (
        <>
          <p className="mb-3 mt-1 text-[13px] text-[var(--color-l-text-mid)]">
            Publishing spends one <strong>{nameOf(chosen)}</strong> credit. You can change the plan until
            you publish — after that it is fixed.
          </p>
          <div className="flex flex-wrap items-center gap-2">
            <select
              value={chosen}
              onChange={(event) => setChosen(event.target.value as CreditPlanId)}
              aria-label="Plan"
              className="h-10 rounded-[var(--radius-input)] border border-[var(--color-l-line)] bg-white px-3 text-[14px]"
            >
              {plans.map((plan) => (
                <option key={plan.id} value={plan.id}>
                  {plan.name}
                  {plan.available === null
                    ? ''
                    : ` · ${plan.available} credit${plan.available === 1 ? '' : 's'}`}
                </option>
              ))}
            </select>
            <button
              type="button"
              onClick={() => void save()}
              disabled={busy || refreshing || chosen === planId}
              className="h-10 rounded-[var(--radius-pill)] bg-[var(--color-l-text-hi)] px-5 text-[14px] font-semibold text-white disabled:opacity-60"
            >
              {busy || refreshing ? 'Saving…' : 'Change plan'}
            </button>
          </div>
        </>
      )}

      {error ? (
        <p role="alert" className="mt-2 text-[13px] text-[var(--color-error)]">
          {error}
        </p>
      ) : null}
    </section>
  )
}
