'use client'

import { useRouter } from 'next/navigation'
import { useState, useTransition } from 'react'
import { rupeesToPaise } from '@/lib/format'
import { CREDIT_PLAN_IDS, MAX_REWARD_CREDITS, type CreditPlanId } from '@/lib/plans'
import type { CouponDoor, CouponKind } from '@/lib/schema'

const inputClass = 'h-10 rounded-[var(--radius-input)] border border-[var(--color-l-line)] bg-white px-3 text-[14px]'
const primaryClass =
  'h-10 rounded-[var(--radius-pill)] bg-[var(--color-l-text-hi)] px-5 text-[14px] font-semibold text-white disabled:opacity-60'

const KIND_LABELS: Record<CouponKind, string> = {
  percent: 'Percent off',
  fixed: 'Amount off',
  reward: 'Reward credits',
}

/** The console's two coupon controls: make one, and switch one off or on (N-121, D-61). */

type Product = { id: string; name: string }

export function CreateCouponForm({
  products,
  planNames,
}: {
  /** Everything on the price list a discount can be limited to. */
  products: Product[]
  planNames: Record<CreditPlanId, string>
}) {
  const router = useRouter()
  const [kind, setKind] = useState<CouponKind>('percent')
  const [value, setValue] = useState('')
  const [rewardPlanId, setRewardPlanId] = useState<CreditPlanId>('deliver')
  const [code, setCode] = useState('')
  const [campaign, setCampaign] = useState('')
  const [validFrom, setValidFrom] = useState('')
  const [validUntil, setValidUntil] = useState('')
  const [maxRedemptions, setMaxRedemptions] = useState('')
  const [maxPerPayer, setMaxPerPayer] = useState('1')
  const [doors, setDoors] = useState<CouponDoor[]>(['studio', 'couple'])
  const [planIds, setPlanIds] = useState<string[]>([])
  const [busy, setBusy] = useState(false)
  const [refreshing, startRefresh] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [created, setCreated] = useState<string | null>(null)

  const toggle = <T,>(list: T[], item: T): T[] => (list.includes(item) ? list.filter((x) => x !== item) : [...list, item])

  /** What the value box means for this kind, and the number the server is sent for it. */
  function parsedValue(): number | null {
    const text = value.trim()
    if (kind === 'fixed') return rupeesToPaise(text)
    return /^\d+$/.test(text) ? Number(text) : null
  }

  const wholeNumber = (text: string): number | null | undefined =>
    text.trim() === '' ? null : /^\d+$/.test(text.trim()) ? Number(text.trim()) : undefined

  async function submit(event: React.FormEvent) {
    event.preventDefault()
    setError(null)
    setCreated(null)

    const amount = parsedValue()
    const redemptions = wholeNumber(maxRedemptions)
    const perPayer = wholeNumber(maxPerPayer)
    if (amount === null || amount <= 0) {
      setError(kind === 'fixed' ? 'The amount is in rupees, like 500 or 499.50' : 'The value is a whole number')
      return
    }
    if (redemptions === undefined || perPayer === undefined) {
      setError('Limits are whole numbers, or blank for no limit')
      return
    }

    setBusy(true)
    try {
      const response = await fetch('/api/admin/platform/coupons', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          code: code.trim() || undefined,
          kind,
          value: amount,
          ...(kind === 'reward' ? { rewardPlanId } : { doors, planIds }),
          campaign: campaign.trim(),
          validFrom: validFrom || null,
          validUntil: validUntil || null,
          maxRedemptions: redemptions,
          maxPerPayer: perPayer,
        }),
      })
      const body = (await response.json().catch(() => null)) as
        | { coupon?: { code: string }; error?: { message?: string; fields?: Record<string, string> } }
        | null
      if (!response.ok || !body?.coupon) {
        const fields = Object.values(body?.error?.fields ?? {})
        throw new Error(fields.length > 0 ? fields.join(' · ') : (body?.error?.message ?? `Request failed (${response.status})`))
      }
      setCreated(body.coupon.code)
      setCode('')
      setValue('')
      startRefresh(() => router.refresh())
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Something went wrong')
    } finally {
      setBusy(false)
    }
  }

  const locked = busy || refreshing
  return (
    <form
      onSubmit={(event) => void submit(event)}
      aria-label="New coupon"
      className="mb-8 rounded-[var(--radius-card)] border border-[var(--color-l-line)] bg-white p-4"
    >
      <h2 className="text-[17px] font-semibold">New coupon</h2>
      <p className="mb-3 mt-1 max-w-[70ch] text-[13px] text-[var(--color-l-text-mid)]">
        A coupon cannot be edited or deleted once made — a redeemed code is history. To change one,
        switch it off and make another.
      </p>

      <fieldset className="mb-3">
        <legend className="mb-1 text-[13px] font-medium">What it does</legend>
        <div className="flex flex-wrap gap-2">
          {(Object.keys(KIND_LABELS) as CouponKind[]).map((option) => (
            <label
              key={option}
              className="cursor-pointer rounded-[var(--radius-pill)] border border-[var(--color-l-line)] px-3 py-1.5 text-[13px] has-[:checked]:border-[var(--color-accent)] has-[:checked]:font-semibold"
            >
              <input
                type="radio"
                name="kind"
                value={option}
                checked={kind === option}
                onChange={() => setKind(option)}
                className="sr-only"
              />
              {KIND_LABELS[option]}
            </label>
          ))}
        </div>
      </fieldset>

      <div className="mb-3 flex flex-wrap gap-3">
        <label className="text-[13px]">
          <span className="mb-1 block font-medium">
            {kind === 'percent' ? 'Percent off (1–100)' : kind === 'fixed' ? 'Amount off, in rupees (ex-GST)' : `How many credits (up to ${MAX_REWARD_CREDITS})`}
          </span>
          <input
            value={value}
            onChange={(event) => setValue(event.target.value)}
            inputMode="decimal"
            className={`${inputClass} w-44`}
            aria-label="Value"
          />
        </label>
        {kind === 'reward' ? (
          <label className="text-[13px]">
            <span className="mb-1 block font-medium">Which credit</span>
            <select
              value={rewardPlanId}
              onChange={(event) => setRewardPlanId(event.target.value as CreditPlanId)}
              className={inputClass}
              aria-label="Which credit"
            >
              {CREDIT_PLAN_IDS.map((id) => (
                <option key={id} value={id}>
                  {planNames[id]}
                </option>
              ))}
            </select>
          </label>
        ) : null}
        <label className="text-[13px]">
          <span className="mb-1 block font-medium">Code</span>
          <input
            value={code}
            onChange={(event) => setCode(event.target.value)}
            placeholder="Leave blank to generate one"
            autoComplete="off"
            className={`${inputClass} w-64 font-mono uppercase`}
            aria-label="Code"
          />
        </label>
        <label className="min-w-[220px] flex-1 text-[13px]">
          <span className="mb-1 block font-medium">Campaign (required — how a cohort is read back)</span>
          <input
            value={campaign}
            onChange={(event) => setCampaign(event.target.value)}
            placeholder="Diwali 2026 studios"
            className={`${inputClass} w-full`}
            aria-label="Campaign"
          />
        </label>
      </div>

      <div className="mb-3 flex flex-wrap gap-3">
        <label className="text-[13px]">
          <span className="mb-1 block font-medium">Valid from</span>
          <input type="date" value={validFrom} onChange={(event) => setValidFrom(event.target.value)} className={inputClass} aria-label="Valid from" />
        </label>
        <label className="text-[13px]">
          <span className="mb-1 block font-medium">Valid until (that whole day)</span>
          <input type="date" value={validUntil} onChange={(event) => setValidUntil(event.target.value)} className={inputClass} aria-label="Valid until" />
        </label>
        <label className="text-[13px]">
          <span className="mb-1 block font-medium">Uses in total (blank = no limit)</span>
          <input value={maxRedemptions} onChange={(event) => setMaxRedemptions(event.target.value)} inputMode="numeric" className={`${inputClass} w-32`} aria-label="Uses in total" />
        </label>
        <label className="text-[13px]">
          <span className="mb-1 block font-medium">Uses per payer (blank = no limit)</span>
          <input value={maxPerPayer} onChange={(event) => setMaxPerPayer(event.target.value)} inputMode="numeric" className={`${inputClass} w-32`} aria-label="Uses per payer" />
        </label>
      </div>

      {kind === 'reward' ? (
        <p className="mb-3 text-[13px] text-[var(--color-l-text-mid)]">
          A reward is for studios only — a direct couple has no basket of credits, and a 100% discount
          already covers them. It needs no payment.
        </p>
      ) : (
        <div className="mb-3 grid gap-3 sm:grid-cols-2">
          <fieldset>
            <legend className="mb-1 text-[13px] font-medium">Who can use it</legend>
            <div className="flex gap-4 text-[13px]">
              {(['studio', 'couple'] as const).map((door) => (
                <label key={door} className="flex items-center gap-2">
                  <input type="checkbox" checked={doors.includes(door)} onChange={() => setDoors((current) => toggle(current, door))} />
                  {door === 'studio' ? 'Studios' : 'Direct couples'}
                </label>
              ))}
            </div>
          </fieldset>
          <fieldset>
            <legend className="mb-1 text-[13px] font-medium">Which products (none ticked = any)</legend>
            <div className="flex max-h-32 flex-wrap gap-x-4 gap-y-1 overflow-y-auto text-[13px]">
              {products.map((product) => (
                <label key={product.id} className="flex items-center gap-2">
                  <input type="checkbox" checked={planIds.includes(product.id)} onChange={() => setPlanIds((current) => toggle(current, product.id))} />
                  {product.name}
                </label>
              ))}
            </div>
          </fieldset>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-3">
        <button type="submit" disabled={locked || campaign.trim().length === 0 || value.trim().length === 0 || (kind !== 'reward' && doors.length === 0)} className={primaryClass}>
          {locked ? 'Creating…' : 'Create coupon'}
        </button>
        {created ? (
          <span role="status" className="text-[13px] text-[#1c5f2a]">
            Created <code className="font-mono font-semibold">{created}</code>
          </span>
        ) : null}
      </div>
      {error ? (
        <p role="alert" className="mt-2 text-[13px] text-[var(--color-error)]">
          {error}
        </p>
      ) : null}
    </form>
  )
}

/** Switch one coupon off or on. Stays locked until the refreshed row is on screen. */
export function CouponSwitch({ couponId, code, active }: { couponId: string; code: string; active: boolean }) {
  const router = useRouter()
  const [busy, setBusy] = useState(false)
  const [refreshing, startRefresh] = useTransition()
  const [error, setError] = useState<string | null>(null)

  async function flip() {
    setBusy(true)
    setError(null)
    try {
      const response = await fetch(`/api/admin/platform/coupons/${couponId}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ active: !active }),
      })
      if (!response.ok) throw new Error(`Request failed (${response.status})`)
      startRefresh(() => router.refresh())
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Something went wrong')
    } finally {
      setBusy(false)
    }
  }

  return (
    <span className="inline-flex flex-col items-end gap-1">
      <button
        type="button"
        onClick={() => void flip()}
        disabled={busy || refreshing}
        aria-label={`${active ? 'Disable' : 'Enable'} ${code}`}
        className="h-8 rounded-[var(--radius-pill)] border border-[var(--color-l-line)] px-3 text-[12px] font-semibold disabled:opacity-60"
      >
        {busy || refreshing ? 'Saving…' : active ? 'Disable' : 'Enable'}
      </button>
      {error ? (
        <span role="alert" className="text-[12px] text-[var(--color-error)]">
          {error}
        </span>
      ) : null}
    </span>
  )
}
