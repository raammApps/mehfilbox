'use client'

import { useRouter } from 'next/navigation'
import { useState, useTransition } from 'react'
import { formatRupees, rupeesToPaise } from '@/lib/format'
import { CREDIT_PLAN_IDS, PLAN_SECTIONS, unitLabel } from '@/lib/plans'
import type { Plan } from '@/lib/schema'

type Change =
  | { pricePaise: number | null }
  | { retail: { minPaise: number; maxPaise: number } | null }
  | { grants: Record<string, number> }

/** `1999`, or `1999.50` — what goes back into a box, so an edit starts from what is live. */
const plain = (paise: number | null): string =>
  paise === null ? '' : Number.isInteger(paise / 100) ? String(paise / 100) : (paise / 100).toFixed(2)

const inputClass =
  'h-10 rounded-[var(--radius-input)] border border-[var(--color-l-line)] bg-white px-3 text-[15px]'
const primaryClass =
  'h-10 rounded-[var(--radius-pill)] bg-[var(--color-l-text-hi)] px-5 text-[14px] font-semibold text-white disabled:opacity-60'
const secondaryClass =
  'h-10 rounded-[var(--radius-pill)] border border-[var(--color-l-line)] px-5 text-[14px] font-semibold disabled:opacity-60'

/**
 * The platform's price list, editable (N-118, D-61).
 *
 * Every figure a customer is quoted comes from here, so a change lands on the marketing page, a
 * studio's credits card and — once N-20 exists — the checkout, with no deploy. Nothing confirms
 * before saving, in the spirit of the quota controls: what makes an edit safe is that it is
 * written to the audit trail with what it was and what it became, and is one box away from being
 * put back.
 *
 * One reason box for the whole page rather than one per row: twenty rows each asking "why" would
 * be twenty boxes nobody fills in. It travels with the next save and is cleared after it.
 */
export function PricingTable({ plans }: { plans: Plan[] }) {
  const router = useRouter()
  const [reason, setReason] = useState('')
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<{ id: string; message: string } | null>(null)
  /**
   * The write returns as soon as the database has it, but the screen catches up only when the
   * refreshed page arrives — a second or more on a real network, when local development made it
   * look instant. Until then the row would show the *old* price beside an enabled button, which
   * reads as "it did not save" and invites a second click. So the row stays locked, still saying
   * "Saving…", until the new data is actually on screen.
   */
  const [refreshing, startRefresh] = useTransition()
  const [lastSaved, setLastSaved] = useState<string | null>(null)
  const isBusy = (id: string) => busy === id || (refreshing && lastSaved === id)

  async function save(plan: Plan, change: Change): Promise<void> {
    setBusy(plan.id)
    setLastSaved(plan.id)
    setError(null)
    try {
      const response = await fetch(`/api/admin/platform/pricing/${encodeURIComponent(plan.id)}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ ...change, reason: reason.trim() || undefined }),
      })
      if (!response.ok) {
        const body = (await response.json().catch(() => null)) as { error?: { message?: string } } | null
        throw new Error(body?.error?.message ?? `Request failed (${response.status})`)
      }
      setReason('')
      startRefresh(() => router.refresh())
    } catch (cause) {
      setError({ id: plan.id, message: cause instanceof Error ? cause.message : 'Something went wrong' })
    } finally {
      setBusy(null)
    }
  }

  return (
    <div>
      <label className="mb-6 block max-w-[640px] text-[13px] text-[var(--color-l-text-mid)]">
        Why (recorded in the audit trail with the next change you save)
        <input
          value={reason}
          onChange={(event) => setReason(event.target.value)}
          placeholder="Festival offer, or a corrected typo"
          aria-label="Reason for the next change"
          className={`${inputClass} mt-1 w-full text-[13px]`}
        />
      </label>

      {PLAN_SECTIONS.map((section) => {
        const rows = plans.filter((plan) => plan.kind === section.kind)
        if (rows.length === 0) return null
        return (
          <section key={section.kind} className="mb-8">
            <h2 className="text-[17px] font-semibold">{section.title}</h2>
            <p className="mb-3 text-[13px] text-[var(--color-l-text-mid)]">{section.blurb}</p>
            <ul className="grid gap-3">
              {rows.map((plan) => (
                <li
                  key={plan.id}
                  className="rounded-[var(--radius-card)] border border-[var(--color-l-line)] bg-white p-4"
                >
                  <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
                    <p className="text-[15px] font-semibold">
                      {plan.name}
                      <span className="ml-2 text-[13px] font-normal text-[var(--color-l-text-mid)]">
                        {unitLabel(plan.unit)}
                        {plan.storageGb ? ` · ${plan.storageGb} GB` : ''}
                      </span>
                    </p>
                    <p
                      className={`text-[13px] font-semibold ${
                        plan.pricePaise === null ? 'text-[var(--color-warn)]' : ''
                      }`}
                    >
                      {plan.pricePaise === null ? 'Not for sale' : `${formatRupees(plan.pricePaise)} ex-GST`}
                    </p>
                  </div>

                  <PriceForm
                    key={`price:${plan.id}:${plan.pricePaise}`}
                    plan={plan}
                    busy={isBusy(plan.id)}
                    onSave={(change) => save(plan, change)}
                  />
                  {plan.kind === 'partner' ? (
                    <GrantsForm
                      key={`grants:${plan.id}:${JSON.stringify(plan.grants)}`}
                      plan={plan}
                      busy={isBusy(plan.id)}
                      onSave={(change) => save(plan, change)}
                    />
                  ) : null}
                  {(CREDIT_PLAN_IDS as readonly string[]).includes(plan.id) ? (
                    <RetailForm
                      key={`retail:${plan.id}:${plan.retailMinPaise}:${plan.retailMaxPaise}`}
                      plan={plan}
                      busy={isBusy(plan.id)}
                      onSave={(change) => save(plan, change)}
                    />
                  ) : null}

                  {error?.id === plan.id ? (
                    <p role="alert" className="mt-2 text-[13px] text-[var(--color-error)]">
                      {error.message}
                    </p>
                  ) : null}
                </li>
              ))}
            </ul>
          </section>
        )
      })}
    </div>
  )
}

type FormProps = { plan: Plan; busy: boolean; onSave: (change: Change) => Promise<void> }

function PriceForm({ plan, busy, onSave }: FormProps) {
  const [value, setValue] = useState(plain(plan.pricePaise))
  const parsed = rupeesToPaise(value)
  const changed = parsed !== null && parsed !== plan.pricePaise
  return (
    <div className="flex flex-wrap items-center gap-2">
      <label className="flex items-center gap-2 text-[13px]">
        ₹
        <input
          inputMode="decimal"
          value={value}
          onChange={(event) => setValue(event.target.value)}
          placeholder="Not for sale"
          aria-label={`${plan.name} price in rupees, ex-GST`}
          className={`${inputClass} w-32`}
        />
      </label>
      <button
        type="button"
        onClick={() => parsed !== null && void onSave({ pricePaise: parsed })}
        disabled={busy || !changed}
        className={primaryClass}
      >
        {busy ? 'Saving…' : 'Set price'}
      </button>
      {plan.pricePaise !== null ? (
        <button
          type="button"
          onClick={() => void onSave({ pricePaise: null })}
          disabled={busy}
          className={secondaryClass}
        >
          Take off sale
        </button>
      ) : null}
      {value.trim() !== '' && parsed === null ? (
        <span className="text-[13px] text-[var(--color-error)]">Rupees, like 1999 or 1999.50</span>
      ) : null}
    </div>
  )
}

function RetailForm({ plan, busy, onSave }: FormProps) {
  const [min, setMin] = useState(plain(plan.retailMinPaise))
  const [max, setMax] = useState(plain(plan.retailMaxPaise))
  const lo = rupeesToPaise(min)
  const hi = rupeesToPaise(max)
  const valid = lo !== null && hi !== null && lo <= hi
  const changed = lo !== plan.retailMinPaise || hi !== plan.retailMaxPaise
  const hasRange = plan.retailMinPaise !== null && plan.retailMaxPaise !== null
  return (
    <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-[var(--color-l-line)] pt-3">
      <span className="text-[13px] text-[var(--color-l-text-mid)]">Studios typically charge</span>
      <input
        inputMode="decimal"
        value={min}
        onChange={(event) => setMin(event.target.value)}
        aria-label={`${plan.name} suggested retail, lowest`}
        className={`${inputClass} w-28`}
      />
      <span aria-hidden>–</span>
      <input
        inputMode="decimal"
        value={max}
        onChange={(event) => setMax(event.target.value)}
        aria-label={`${plan.name} suggested retail, highest`}
        className={`${inputClass} w-28`}
      />
      <button
        type="button"
        onClick={() => valid && void onSave({ retail: { minPaise: lo, maxPaise: hi } })}
        disabled={busy || !valid || !changed}
        className={secondaryClass}
      >
        Set range
      </button>
      {hasRange ? (
        <button type="button" onClick={() => void onSave({ retail: null })} disabled={busy} className={secondaryClass}>
          Clear
        </button>
      ) : null}
    </div>
  )
}

function GrantsForm({ plan, busy, onSave }: FormProps) {
  const [counts, setCounts] = useState<Record<string, string>>(
    Object.fromEntries(CREDIT_PLAN_IDS.map((id) => [id, String(plan.grants[id] ?? 0)])),
  )
  const parsed = CREDIT_PLAN_IDS.map((id) => [id, Number(counts[id])] as const)
  const valid = parsed.every(([, n]) => Number.isInteger(n) && n >= 0 && n <= 100)
  const changed = parsed.some(([id, n]) => n !== (plan.grants[id] ?? 0))
  return (
    <div className="mt-3 flex flex-wrap items-center gap-3 border-t border-[var(--color-l-line)] pt-3">
      <span className="text-[13px] text-[var(--color-l-text-mid)]">Comes with</span>
      {CREDIT_PLAN_IDS.map((id) => (
        <label key={id} className="flex items-center gap-1.5 text-[13px] capitalize">
          <input
            type="number"
            min={0}
            max={100}
            value={counts[id]}
            onChange={(event) => setCounts({ ...counts, [id]: event.target.value })}
            aria-label={`${id} credits included with the ${plan.name}`}
            className={`${inputClass} w-20`}
          />
          {id}
        </label>
      ))}
      <button
        type="button"
        onClick={() =>
          valid &&
          void onSave({
            grants: Object.fromEntries(parsed.filter(([, n]) => n > 0)),
          })
        }
        disabled={busy || !valid || !changed}
        className={secondaryClass}
      >
        Set credits
      </button>
    </div>
  )
}
