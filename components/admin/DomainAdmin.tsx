'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'

/** "I attached it at the host": the platform's manual attachment, recorded (doc 16 §8). */
export function MarkAttachedButton({ domainId, host }: { domainId: string; host: string }) {
  const router = useRouter()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  return (
    <span className="inline-flex items-center gap-2">
      <button
        type="button"
        disabled={busy}
        onClick={() => {
          setBusy(true)
          setError(null)
          fetch(`/api/admin/platform/domains/${domainId}/attached`, { method: 'POST' })
            .then(async (response) => {
              if (!response.ok) {
                const body = (await response.json().catch(() => null)) as { error?: { message?: string } } | null
                throw new Error(body?.error?.message ?? `Request failed (${response.status})`)
              }
              router.refresh()
            })
            .catch((cause: unknown) => setError(cause instanceof Error ? cause.message : 'Something went wrong'))
            .finally(() => setBusy(false))
        }}
        className="h-8 rounded-[var(--radius-pill)] bg-[var(--color-l-text-hi)] px-3 text-[12px] font-semibold text-white disabled:opacity-60"
      >
        {busy ? 'Marking…' : `Mark ${host} attached`}
      </button>
      {error ? <span className="text-[12px] text-[var(--color-error)]">{error}</span> : null}
    </span>
  )
}
