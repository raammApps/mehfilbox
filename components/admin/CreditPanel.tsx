'use client'

import { useState } from 'react'

/**
 * Publish was refused for want of a credit (D-38): what that means, and the way to add one.
 *
 * Until online payment lands (N-20) the way is a request the platform answers by hand, so the
 * panel says so plainly — a price, a button, and what happens next — rather than pretending to
 * be a checkout.
 */
export function CreditPanel({
  catalogueId,
  audience = 'studio',
  prices,
  plan,
}: {
  catalogueId: string
  audience?: 'studio' | 'couple'
  /**
   * Formatted by the server from the price list (N-118) **for this wedding's plan** — a Cinema
   * credit costs what Cinema costs, and only Deliver has a five-pack. `null` means not for sale.
   */
  prices?: { credit: string | null; pack: string | null }
  /**
   * The wedding's plan by name, and what the studio holds of any other plan (N-119). The second is
   * the useful half: "no Keep credit" is an answer, "no Keep credit, but you hold a Deliver one" is a
   * way forward, because the plan can be changed until the first publish.
   */
  plan?: { planName: string; otherAvailable: string | null }
}) {
  const credit = prices?.credit ?? null
  const pack = prices?.pack ?? null
  const planName = plan?.planName ?? 'Deliver'
  const other = plan?.otherAvailable ?? null
  const [state, setState] = useState<'idle' | 'sending' | 'sent' | 'repeated' | 'error'>('idle')

  async function request() {
    setState('sending')
    try {
      const response = await fetch('/api/admin/credits/request', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ catalogueId }),
      })
      if (!response.ok) throw new Error(String(response.status))
      const body = (await response.json()) as { repeated: boolean }
      setState(body.repeated ? 'repeated' : 'sent')
    } catch {
      setState('error')
    }
  }

  return (
    <div
      role="alert"
      data-testid="credit-required"
      className="mb-3 rounded-[var(--radius-card)] border border-[color-mix(in_srgb,var(--color-warn)_45%,white)] bg-[color-mix(in_srgb,var(--color-warn)_10%,white)] p-4"
    >
      <p className="text-[14px] font-semibold">
        {audience === 'couple'
          ? `This catalogue needs a ${planName} credit to publish`
          : `This wedding needs a ${planName} credit to publish`}
      </p>
      <p className="mt-1 text-[13px] text-[var(--color-l-text-mid)]">
        {audience === 'couple'
          ? `A catalogue you start yourself publishes on a ${planName} credit${credit ? ` — ${credit} —` : ','} which your studio can add for you, or we can. Nothing here is lost: the page, the films and the draft all keep, and publishing works the moment one is added.`
          : `This wedding is on the ${planName} plan, so publishing it spends one ${planName} credit${credit ? ` — ${credit}${pack ? `, or five for ${pack}` : ''} —` : ','} and you have none left.${other ? ` You do hold ${other}: change this wedding’s plan on its overview to spend one of those.` : ''} Nothing here is lost: the page, the films and the draft all keep, and publishing works the moment a credit is added.`}
      </p>
      {state === 'sent' || state === 'repeated' ? (
        <p className="mt-3 text-[13px]">
          {state === 'sent'
            ? 'Asked. We add credits the same working day and email you when it is done.'
            : 'Already asked today — we add credits the same working day and will email you.'}
        </p>
      ) : (
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={() => void request()}
            disabled={state === 'sending'}
            className="h-10 rounded-[var(--radius-pill)] bg-[var(--color-l-text-hi)] px-5 text-[14px] font-semibold text-white disabled:opacity-60"
          >
            {state === 'sending' ? 'Asking…' : 'Ask for a credit'}
          </button>
          <span className="text-[12px] text-[var(--color-l-text-mid)]">
            Online payment is coming; until then we add them by hand, same day.
          </span>
        </div>
      )}
      {state === 'error' ? (
        <p className="mt-2 text-[13px] text-[var(--color-error)]">That did not send. Try again in a moment.</p>
      ) : null}
    </div>
  )
}
