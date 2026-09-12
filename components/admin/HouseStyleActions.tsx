'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'

/** The row actions on the styles list: default, duplicate, delete. Editing is its own page. */
export function HouseStyleActions({
  presetId,
  name,
  isDefault,
  frozen,
}: {
  presetId: string
  name: string
  isDefault: boolean
  /** A published wedding was made from it: it can be copied and made default, not deleted. */
  frozen: boolean
}) {
  const router = useRouter()
  const [busy, setBusy] = useState(false)
  const [confirming, setConfirming] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function call(input: RequestInfo, init: RequestInit): Promise<Response> {
    setBusy(true)
    setError(null)
    try {
      const response = await fetch(input, init)
      if (!response.ok) {
        const body = (await response.json().catch(() => null)) as { error?: { message?: string } } | null
        throw new Error(body?.error?.message ?? `Request failed (${response.status})`)
      }
      return response
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Something went wrong')
      throw cause
    } finally {
      setBusy(false)
    }
  }

  const json = { headers: { 'content-type': 'application/json' } }

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {!isDefault ? (
        <button
          type="button"
          disabled={busy}
          onClick={() =>
            void call(`/api/admin/presets/${presetId}`, {
              method: 'PATCH',
              ...json,
              body: JSON.stringify({ isDefault: true }),
            })
              .then(() => router.refresh())
              .catch(() => {})
          }
          className="h-8 rounded-[var(--radius-pill)] border border-[var(--color-l-line)] px-3 text-[12px] font-semibold"
        >
          Make default
        </button>
      ) : null}
      <button
        type="button"
        disabled={busy}
        onClick={() =>
          void call('/api/admin/presets', {
            method: 'POST',
            ...json,
            body: JSON.stringify({ name: `${name} (copy)`, duplicateOf: presetId }),
          })
            .then(async (response) => {
              const body = (await response.json()) as { preset: { id: string } }
              router.push(`/admin/studio/styles/${body.preset.id}`)
            })
            .catch(() => {})
        }
        className="h-8 rounded-[var(--radius-pill)] border border-[var(--color-l-line)] px-3 text-[12px] font-semibold"
      >
        Duplicate
      </button>
      {!frozen ? (
        confirming ? (
          <>
            <button
              type="button"
              disabled={busy}
              onClick={() =>
                void call(`/api/admin/presets/${presetId}`, { method: 'DELETE' })
                  .then(() => router.refresh())
                  .catch(() => {})
              }
              className="h-8 rounded-[var(--radius-pill)] bg-[var(--color-error)] px-3 text-[12px] font-semibold text-white"
            >
              Delete {name}
            </button>
            <button
              type="button"
              onClick={() => setConfirming(false)}
              className="h-8 rounded-[var(--radius-pill)] border border-[var(--color-l-line)] px-3 text-[12px] font-semibold"
            >
              Keep
            </button>
          </>
        ) : (
          <button
            type="button"
            disabled={busy}
            onClick={() => setConfirming(true)}
            className="h-8 rounded-[var(--radius-pill)] border border-[var(--color-l-line)] px-3 text-[12px] font-semibold text-[var(--color-l-text-mid)] hover:text-[var(--color-error)]"
          >
            Delete
          </button>
        )
      ) : null}
      {error ? <span className="text-[12px] text-[var(--color-error)]">{error}</span> : null}
    </div>
  )
}
