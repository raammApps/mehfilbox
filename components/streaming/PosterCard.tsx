'use client'

import { memo, useEffect, useRef, useState } from 'react'
import { photoSrcSet } from '@/lib/photos/srcset'
import { posterDataUri, type PosterPaletteName } from '@/lib/poster'

export type Aspect = '2:3' | '16:9' | '1:1' | '4:3'

export type RowItem = {
  id: string
  /** Deep-link key: `?title=<slug>` for films, a photo id for photo rows. */
  key: string
  label: string
  eyebrow?: string
  posterUrl?: string | null
  durationBadge?: string | null
  /** 0–1. Renders the accent progress bar across the bottom of the card. */
  progress?: number
  alt?: string
  /**
   * Animated preview, shown on deliberate hover or focus. Films only — a photo row has nothing
   * to move.
   */
  previewUrl?: string | null
  /** The theme's palette for generated art (D-35). Set by the module that built the item. */
  palette?: PosterPaletteName
}

const ASPECT_CLASS: Record<Aspect, string> = {
  '2:3': 'aspect-[2/3]',
  '16:9': 'aspect-video',
  '1:1': 'aspect-square',
  '4:3': 'aspect-[4/3]',
}

type Props = {
  item: RowItem
  aspect: Aspect
  onOpen: (item: RowItem) => void
  /** First two cards of the first row load eagerly; the rest are lazy (doc 08). */
  eager?: boolean
  /** Set when the row is in its stepped-up 2–3 card layout. */
  wide?: boolean
}

/**
 * Long enough that sweeping the cursor across a row loads nothing.
 *
 * Netflix waits about this long for the same reason: without it, crossing eight cards to reach
 * the ninth would fetch eight previews nobody asked to see.
 */
const PREVIEW_DELAY_MS = 500

function PosterCardImpl({ item, aspect, onOpen, eager = false, wide = false }: Props) {
  const [preview, setPreview] = useState<'idle' | 'wanted' | 'ready'>('idle')
  const timer = useRef<number | null>(null)

  /**
   * Whether a moving preview is welcome here at all.
   *
   * Three refusals, and each is a real user rather than a checkbox: `prefers-reduced-motion` is
   * someone who gets motion sick; Save-Data is someone on a metered Indian mobile plan, which
   * doc 05 §1 treats as the default case, and a preview is ~300KB nobody requested; and a
   * coarse pointer means a phone, where "hover" fires on the tap that was already opening the
   * film — so the preview would flash once and be replaced by the player.
   */
  const previewAllowed = (): boolean => {
    if (!item.previewUrl) return false
    if (typeof window === 'undefined' || !window.matchMedia) return false
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return false
    if (!window.matchMedia('(hover: hover) and (pointer: fine)').matches) return false
    const connection = (navigator as Navigator & { connection?: { saveData?: boolean } }).connection
    return connection?.saveData !== true
  }

  const wantPreview = () => {
    if (!previewAllowed() || preview !== 'idle') return
    timer.current = window.setTimeout(() => setPreview('wanted'), PREVIEW_DELAY_MS)
  }

  const dropPreview = () => {
    if (timer.current !== null) window.clearTimeout(timer.current)
    timer.current = null
    setPreview('idle')
  }

  useEffect(
    () => () => {
      if (timer.current !== null) window.clearTimeout(timer.current)
    },
    [],
  )

  /**
   * Generated artwork carries no type on a card.
   *
   * Doc 04 §6 sets the event name into the artwork, which is right when the poster is the only
   * surface showing it. The card also renders the name and category underneath — and it has to,
   * because a real photographic poster has no text baked in — so keeping both printed the title
   * twice. The DOM label is the single source: it truncates, it localises, and a screen reader
   * can read it.
   */
  const src = item.posterUrl || posterDataUri({ slug: item.key, label: '', palette: item.palette })

  return (
    <button
      type="button"
      onClick={() => onOpen(item)}
      // Focus counts as intent as much as hover does: a keyboard user tabbing to a card has
      // chosen it just as deliberately as a cursor resting on it.
      onPointerEnter={wantPreview}
      onPointerLeave={dropPreview}
      onFocus={wantPreview}
      onBlur={dropPreview}
      data-testid="poster-card"
      data-key={item.key}
      className={[
        'group relative shrink-0 snap-start overflow-hidden rounded-[var(--radius-card)]',
        'text-left transition-transform duration-[180ms] ease-[var(--ease-lift)]',
        // :hover sticks after a tap on Android, so the lift is pointer-device only (doc 08).
        '[@media(hover:hover)_and_(pointer:fine)]:hover:scale-[1.03] [@media(hover:hover)_and_(pointer:fine)]:hover:z-10',
        wide ? 'w-[var(--card-w-wide)]' : 'w-[var(--card-w)] md:w-[var(--card-w-md)]',
      ].join(' ')}
    >
      <span
        className={`relative block ${ASPECT_CLASS[aspect]} w-full overflow-hidden rounded-[var(--radius-card)] bg-surface-2`}
      >
        {/* eslint-disable-next-line @next/next/no-img-element -- posters are provider URLs or
            generated data: URIs; the image optimiser adds a hop for no benefit here. */}
        <img
          src={src}
          // Photo rows pass a stored photograph here; film posters come from `/api/poster/…`
          // and have no rendition set, so this is empty for them and the markup is unchanged.
          srcSet={photoSrcSet(src) || undefined}
          sizes="(max-width: 768px) 45vw, 320px"
          alt={item.alt ?? ''}
          loading={eager ? 'eager' : 'lazy'}
          decoding={eager ? 'sync' : 'async'}
          fetchPriority={eager ? 'high' : 'auto'}
          className="h-full w-full object-cover"
          draggable={false}
        />

        {/*
          Layered over the poster rather than swapping its `src`: swapping shows the card's
          background for as long as the preview takes to arrive, which reads as a flicker on
          every hover. This stays invisible until it has actually decoded, so the poster holds
          the frame and the motion simply appears.
        */}
        {preview !== 'idle' && item.previewUrl ? (
          // eslint-disable-next-line @next/next/no-img-element -- animated webp from the CDN
          <img
            src={item.previewUrl}
            alt=""
            aria-hidden
            onLoad={() => setPreview('ready')}
            className={`absolute inset-0 h-full w-full object-cover transition-opacity duration-300 ${
              preview === 'ready' ? 'opacity-100' : 'opacity-0'
            }`}
            draggable={false}
          />
        ) : null}

        <span
          aria-hidden
          className="pointer-events-none absolute inset-0 rounded-[var(--radius-card)] opacity-0 transition-opacity duration-[180ms] group-hover:opacity-100"
          style={{
            boxShadow: 'inset 0 0 0 1px color-mix(in srgb, var(--color-accent) 45%, transparent)',
          }}
        />

        {item.durationBadge ? (
          <span className="type-label absolute end-2 top-2 rounded bg-surface-0/75 px-1.5 py-1 text-text-hi backdrop-blur-sm">
            {item.durationBadge}
          </span>
        ) : null}

        {item.progress !== undefined && item.progress > 0 ? (
          <span aria-hidden className="absolute inset-x-0 bottom-0 h-[3px] bg-surface-3">
            <span
              className="block h-full bg-accent"
              style={{ width: `${Math.min(100, Math.round(item.progress * 100))}%` }}
            />
          </span>
        ) : null}
      </span>

      <span className="block px-1 pb-1 pt-2">
        <span className="type-body block truncate font-medium text-text-hi">{item.label}</span>
        {item.eyebrow ? <span className="type-meta block truncate">{item.eyebrow}</span> : null}
      </span>
    </button>
  )
}

export const PosterCard = memo(PosterCardImpl)
