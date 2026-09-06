'use client'

import { Heart } from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'
import type { Translator } from '@/lib/i18n'
import type { LikeSubject } from '@/lib/schema'

const GUEST_KEY_STORAGE = 'mehfilbox.guest'

/**
 * The device's own key, minted on first use.
 *
 * Not a profile: the gate can be skipped and most guests do skip it, so keying likes on a profile
 * would mean creating one behind their back or refusing the tap. A key the browser holds is no
 * less trustworthy — a profile id is a client-held string too — and needs no plumbing.
 */
export function guestKey(): string {
  if (typeof window === 'undefined') return ''
  const existing = window.localStorage.getItem(GUEST_KEY_STORAGE)
  if (existing) return existing
  const minted = crypto.randomUUID()
  window.localStorage.setItem(GUEST_KEY_STORAGE, minted)
  return minted
}

export function likeKey(subject: LikeSubject, subjectId: string): string {
  return `${subject}:${subjectId}`
}

type Props = {
  catalogueSlug: string
  subject: LikeSubject
  subjectId: string
  t: Translator
  /** Seeded from the page's single fetch, so thirty photographs are not thirty requests. */
  initialCount?: number
  initialLiked?: boolean
  compact?: boolean
}

/**
 * A heart with a count (N-31).
 *
 * **Optimistic, and deliberately so.** A wedding gallery is browsed on hotel wifi with two
 * hundred people on it; waiting for a round trip before the heart fills makes the tap feel
 * broken, and a like is not a payment. The server's number replaces the guess when it lands, so
 * a race with another guest self-corrects on the next render rather than being lost.
 */
export function LikeButton({
  catalogueSlug,
  subject,
  subjectId,
  t,
  initialCount = 0,
  initialLiked = false,
  compact = false,
}: Props) {
  const [count, setCount] = useState(initialCount)
  const [liked, setLiked] = useState(initialLiked)
  const [busy, setBusy] = useState(false)

  /**
   * Loads its own state, because only one film or photograph is open at a time.
   *
   * Seeding every card on the page would mean carrying a counts map through the module contract
   * for numbers a guest cannot see until they open something. One small request per open is the
   * cheaper trade, and it also means the count is current rather than as-of-page-load.
   */
  useEffect(() => {
    let cancelled = false
    const key = likeKey(subject, subjectId)

    void fetch(
      `/api/likes?catalogue=${encodeURIComponent(catalogueSlug)}&guestKey=${encodeURIComponent(guestKey())}`,
    )
      .then((response) => (response.ok ? response.json() : null))
      .then((body: { counts: Record<string, number>; mine: string[] } | null) => {
        if (cancelled || !body) return
        setCount(body.counts[key] ?? 0)
        setLiked(body.mine.includes(key))
      })
      .catch(() => {
        // A count that fails to load shows as none rather than as an error. Nothing a guest can
        // do about it, and a broken-looking heart is worse than a quiet one.
      })

    return () => {
      cancelled = true
    }
  }, [catalogueSlug, subject, subjectId])

  const toggle = useCallback(async () => {
    if (busy) return
    setBusy(true)

    const nextLiked = !liked
    setLiked(nextLiked)
    setCount((current) => Math.max(0, current + (nextLiked ? 1 : -1)))

    try {
      const response = await fetch('/api/likes', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          catalogue: catalogueSlug,
          guestKey: guestKey(),
          subject,
          subjectId,
        }),
      })
      if (!response.ok) throw new Error(String(response.status))
      const body = (await response.json()) as { liked: boolean; count: number }
      setLiked(body.liked)
      setCount(body.count)
    } catch {
      // Put it back. A heart that stays filled after a failed request is a lie the guest will
      // only discover when they reload and their like is gone.
      setLiked(!nextLiked)
      setCount((current) => Math.max(0, current + (nextLiked ? -1 : 1)))
    } finally {
      setBusy(false)
    }
  }, [busy, liked, catalogueSlug, subject, subjectId])

  return (
    <button
      type="button"
      onClick={toggle}
      aria-pressed={liked}
      aria-label={liked ? t('like.remove') : t('like.add')}
      className={`inline-flex items-center gap-1.5 rounded-[var(--radius-pill)] text-text-hi hover:bg-surface-3 ${
        compact ? 'h-11 px-3' : 'edge h-12 px-5 font-semibold md:h-11'
      }`}
    >
      <Heart
        size={20}
        strokeWidth={1.5}
        aria-hidden
        className={liked ? 'fill-current text-accent' : ''}
      />
      {/* The count is the point of "counted and shown", but a zero reads as a scoreboard nobody
          has voted in yet — so it only appears once there is something to report. */}
      {count > 0 ? (
        <span className="type-meta tabular-nums" aria-live="polite">
          {count}
        </span>
      ) : null}
    </button>
  )
}
