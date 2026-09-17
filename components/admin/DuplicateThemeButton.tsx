'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'

/**
 * "Make a copy, edit, save as new" (D-57, N-115), for a theme rather than a saved house style —
 * the same verb `HouseStyleActions`' Duplicate button already uses, aimed at
 * `POST /api/admin/presets`'s other `duplicateOf` branch. Free and unlimited for a studio; a
 * client's own version of this is capped and waits on the payment seam (N-113).
 */
export function DuplicateThemeButton({ themeId, themeName }: { themeId: string; themeName: string }) {
  const router = useRouter()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function duplicate() {
    setBusy(true)
    setError(null)
    try {
      const response = await fetch('/api/admin/presets', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ name: `${themeName} style`, duplicateOf: themeId }),
      })
      if (!response.ok) {
        const body = (await response.json().catch(() => null)) as { error?: { message?: string } } | null
        throw new Error(body?.error?.message ?? `Request failed (${response.status})`)
      }
      const body = (await response.json()) as { preset: { id: string } }
      router.push(`/admin/studio/styles/${body.preset.id}`)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Something went wrong')
      setBusy(false)
    }
  }

  return (
    <div className="mt-2">
      <button
        type="button"
        disabled={busy}
        onClick={() => void duplicate()}
        className="h-8 w-full rounded-[var(--radius-pill)] border border-[var(--color-l-line)] text-[12px] font-semibold disabled:opacity-60"
      >
        {busy ? 'Copying…' : 'Duplicate as a house style'}
      </button>
      {error ? <p className="mt-1 text-[12px] text-[var(--color-error)]">{error}</p> : null}
    </div>
  )
}
