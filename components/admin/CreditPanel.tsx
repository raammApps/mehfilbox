'use client'

import { useState } from 'react'

/**
 * Publish was refused for want of a credit (D-38): what that means, and the way to add one.
 *
 * Until online payment lands (N-20) the way is a request the platform answers by hand, so the
 * panel says so plainly — a price, a button, and what happens next — rather than pretending to
 * be a checkout.
 */
export function CreditPanel({ catalogueId }: { catalogueId: string }) {
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
      <p className="text-[14px] font-semibold">This wedding needs a credit to publish</p>
      <p className="mt-1 text-[13px] text-[var(--color-l-text-mid)]">
        Your first wedding was on us. Each one after that is one Deliver credit — ₹1,999, or five
        for ₹7,999 — and you have none left. Nothing here is lost: the page, the films and the
        draft all keep, and publishing works the moment a credit is added.
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
