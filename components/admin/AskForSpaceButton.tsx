'use client'

import { useState } from 'react'

/**
 * The interim step buying storage doesn't have yet (N-79, D-60) — credits already had this
 * shape (`CreditPanel`'s "Ask for a credit"). Sits in the overview's own storage-full warning,
 * which is already "where the refusal is shown," so this is a button rather than a second box.
 */
export function AskForSpaceButton({ catalogueId }: { catalogueId: string }) {
  const [state, setState] = useState<'idle' | 'sending' | 'sent' | 'repeated' | 'error'>('idle')

  async function request() {
    setState('sending')
    try {
      const response = await fetch('/api/admin/storage/request', {
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

  if (state === 'sent' || state === 'repeated') {
    return (
      <p className="mt-3 text-[13px]">
        {state === 'sent'
          ? 'Asked. We add space the same working day and email you when it is done.'
          : 'Already asked today — we add space the same working day and will email you.'}
      </p>
    )
  }

  return (
    <div className="mt-3 flex flex-wrap items-center gap-3">
      <button
        type="button"
        onClick={() => void request()}
        disabled={state === 'sending'}
        className="h-10 rounded-[var(--radius-pill)] bg-[var(--color-l-text-hi)] px-5 text-[14px] font-semibold text-white disabled:opacity-60"
      >
        {state === 'sending' ? 'Asking…' : 'Ask for more space'}
      </button>
      {state === 'error' ? (
        <span className="text-[13px] text-[var(--color-error)]">That did not send. Try again in a moment.</span>
      ) : (
        <span className="text-[12px] text-[var(--color-l-text-mid)]">
          Online payment is coming; until then we add it by hand, same day.
        </span>
      )}
    </div>
  )
}
