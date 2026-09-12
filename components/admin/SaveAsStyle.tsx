'use client'

import Link from 'next/link'
import { useState } from 'react'

/**
 * "Save this look as a house style" (D-36) — the way most studios will get their first.
 *
 * Captures the catalogue's **published** look: theme, layout, branding, language and whether a
 * code is on. Published only, because a style is a record of what a couple was given, and a
 * draft nobody has seen is not that yet.
 */
export function SaveAsStyle({ catalogueId, published }: { catalogueId: string; published: boolean }) {
  const [name, setName] = useState('')
  const [busy, setBusy] = useState(false)
  const [saved, setSaved] = useState<{ id: string; name: string } | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function submit(event: React.FormEvent) {
    event.preventDefault()
    setBusy(true)
    setError(null)
    try {
      const response = await fetch('/api/admin/presets', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ name: name.trim(), fromCatalogueId: catalogueId }),
      })
      if (!response.ok) {
        const body = (await response.json().catch(() => null)) as { error?: { message?: string } } | null
        throw new Error(body?.error?.message ?? `Request failed (${response.status})`)
      }
      const body = (await response.json()) as { preset: { id: string; name: string } }
      setSaved(body.preset)
      setName('')
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Something went wrong')
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="rounded-[var(--radius-card)] border border-[var(--color-l-line)] bg-white p-4">
      <h2 className="text-[15px] font-semibold">Keep this look</h2>
      <p className="mb-3 mt-1 text-[13px] text-[var(--color-l-text-mid)]">
        Save the theme, layout, branding, language and guest-code choice as a house style, so the
        next wedding starts here.
        {!published ? ' Publish first — a style is what the couple was given.' : ''}
      </p>

      {saved ? (
        <p className="text-[13px]">
          Saved as <strong className="font-semibold">{saved.name}</strong>.{' '}
          <Link href="/admin/studio/styles" className="underline underline-offset-4">
            Your house styles
          </Link>
        </p>
      ) : (
        <form onSubmit={(event) => void submit(event)} className="flex flex-wrap items-center gap-2">
          <label className="sr-only" htmlFor="style-name">
            Style name
          </label>
          <input
            id="style-name"
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="Winter classic"
            maxLength={60}
            disabled={!published || busy}
            className="h-10 min-w-[200px] flex-1 rounded-[var(--radius-input)] border border-[var(--color-l-line)] px-3 text-[14px] disabled:bg-[var(--color-l-surface-2)]"
          />
          <button
            type="submit"
            disabled={!published || busy || name.trim().length === 0}
            className="h-10 rounded-[var(--radius-pill)] border border-[var(--color-l-line)] px-4 text-[14px] font-semibold disabled:opacity-60"
          >
            {busy ? 'Saving…' : 'Save as a house style'}
          </button>
        </form>
      )}
      {error ? <p className="mt-2 text-[13px] text-[var(--color-error)]">{error}</p> : null}
    </section>
  )
}
