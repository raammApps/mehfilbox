'use client'

import { useEffect, useState } from 'react'
import { resolveLocalised } from '@/lib/i18n'
import type { GuestProps } from '../contract'
import type { ChecklistConfig } from './schema'

/**
 * Tickable items that persist per profile (doc 14 §3, f19).
 *
 * Three deliberate choices:
 *
 *  - **Optimistic, and it never blocks.** A tick paints immediately and the write is
 *    fire-and-forget. A guest tapping a bucket list at a reception is on venue wifi; a spinner
 *    on a checkbox would be the worst possible place to teach them about latency.
 *  - **`localStorage` first, server second.** A guest who skipped the profile gate has no
 *    `profileId` and therefore no server state — they still get a checklist that remembers,
 *    which is the whole point of the module.
 *  - **Empty disappears.** Doc 14 §3's rule: a module with nothing to show is not there.
 */
export default function Guest({ config, ctx }: GuestProps<ChecklistConfig>) {
  const items = config.items.filter(
    (item) => resolveLocalised(item.text, ctx.locale).trim().length > 0,
  )

  const storageKey = `mehfilbox.checklist.${ctx.instanceId}`
  const [ticked, setTicked] = useState<Record<string, boolean>>({})
  const [loaded, setLoaded] = useState(false)

  // Restore from the device first, so the list is right before any network call resolves.
  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(storageKey)
      if (raw) setTicked(JSON.parse(raw) as Record<string, boolean>)
    } catch {
      // A corrupt value is not worth a broken section.
    }
    setLoaded(true)
  }, [storageKey])

  // Then reconcile with the server, if this guest chose a profile.
  useEffect(() => {
    if (!ctx.profileId) return
    let cancelled = false

    void (async () => {
      const response = await fetch(
        `/api/module-state?profileId=${ctx.profileId}&moduleId=${encodeURIComponent(ctx.instanceId)}`,
      ).catch(() => null)
      if (!response?.ok || cancelled) return

      const body = (await response.json()) as { state: Record<string, boolean> | null }
      // The server wins only where it has something to say — a tick made offline on this device
      // should not be erased by an older empty record.
      if (body.state) setTicked((current) => ({ ...body.state, ...current }))
    })()

    return () => {
      cancelled = true
    }
  }, [ctx.profileId, ctx.instanceId])

  if (items.length === 0) return null

  const toggle = (id: string) => {
    const next = { ...ticked, [id]: !ticked[id] }
    setTicked(next)

    try {
      window.localStorage.setItem(storageKey, JSON.stringify(next))
    } catch {
      // Private mode. The tick still works for this visit.
    }

    if (!ctx.profileId) return
    void fetch('/api/module-state', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        profileId: ctx.profileId,
        moduleId: ctx.instanceId,
        state: next,
      }),
      keepalive: true,
    }).catch(() => {
      // Fire and forget: the device already has it, and a failed sync is not worth an alert.
    })
  }

  const done = items.filter((item) => ticked[item.id]).length

  return (
    <section
      className="gutter-x py-12 md:py-20"
      data-testid="checklist-module"
      aria-labelledby={`checklist-${ctx.instanceId}`}
    >
      <div className="mx-auto max-w-[60ch]">
        <h2 id={`checklist-${ctx.instanceId}`} className="type-display-lg mb-2">
          {ctx.heading}
        </h2>

        {config.showProgress ? (
          <p className="mb-6 text-[14px] text-text-mid" aria-live="polite">
            {/* Rendered only after restore, or the server-rendered "0 of 8" flashes to "3 of 8". */}
            {loaded ? `${done} of ${items.length}` : ` `}
          </p>
        ) : (
          <div className="mb-6" />
        )}

        <ul className="space-y-1">
          {items.map((item) => {
            const isTicked = Boolean(ticked[item.id])
            return (
              <li key={item.id}>
                <label className="flex cursor-pointer items-start gap-3 rounded-[var(--radius-card)] px-2 py-2.5 transition-colors hover:bg-surface-1">
                  <input
                    type="checkbox"
                    checked={isTicked}
                    onChange={() => toggle(item.id)}
                    className="mt-0.5 h-5 w-5 shrink-0 accent-[var(--color-accent)]"
                  />
                  <span
                    className={`text-[16px] ${isTicked ? 'text-text-lo line-through' : 'text-text-hi'}`}
                  >
                    {resolveLocalised(item.text, ctx.locale)}
                  </span>
                </label>
              </li>
            )
          })}
        </ul>
      </div>
    </section>
  )
}
