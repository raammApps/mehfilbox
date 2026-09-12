'use client'

import { Check, Copy, Share2 } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import type { Translator } from '@/lib/i18n'

/**
 * VE-6 — the flaunt mechanic, and the reason it is P0 rather than polish (doc 01 §5.1).
 *
 * `navigator.share` where available (which on a phone is the WhatsApp share sheet, i.e. the
 * actual distribution channel), falling back to copy-link plus a prefilled WhatsApp text.
 *
 * Three shapes, one behaviour: the full pill in the title modal, `compact` in the lightbox, and
 * `nav` in the top bar — icon only below `sm`, and its fallback actions in a popover rather than
 * in flow, because the header is a fixed 64px and a row of buttons under it would paint over
 * the billboard.
 */
type Props = {
  url: string
  text: string
  t: Translator
  compact?: boolean
  nav?: boolean
}

export function ShareButton({ url, text, t, compact = false, nav = false }: Props) {
  const [copied, setCopied] = useState(false)
  const [expanded, setExpanded] = useState(false)
  const container = useRef<HTMLDivElement>(null)

  // The popover closes on Escape and on a click anywhere else, like every menu in the product.
  useEffect(() => {
    if (!nav || !expanded) return
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setExpanded(false)
    }
    const onPointer = (event: PointerEvent) => {
      if (!container.current?.contains(event.target as Node)) setExpanded(false)
    }
    document.addEventListener('keydown', onKey)
    document.addEventListener('pointerdown', onPointer)
    return () => {
      document.removeEventListener('keydown', onKey)
      document.removeEventListener('pointerdown', onPointer)
    }
  }, [nav, expanded])

  const share = async () => {
    if (typeof navigator !== 'undefined' && typeof navigator.share === 'function') {
      try {
        await navigator.share({ title: text, text, url })
        return
      } catch {
        // A dismissed share sheet is not an error; fall through to the manual affordances.
      }
    }
    setExpanded((was) => !was)
  }

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(url)
    } catch {
      return
    }
    setCopied(true)
    window.setTimeout(() => setCopied(false), 2000)
  }

  const buttonClass = nav
    ? 'inline-flex h-11 min-w-11 items-center justify-center gap-1.5 rounded-[var(--radius-pill)] px-2 text-text-hi hover:bg-surface-3 sm:px-3'
    : compact
      ? 'inline-flex h-11 items-center gap-2 rounded-[var(--radius-pill)] px-3 text-text-hi hover:bg-surface-3'
      : 'edge inline-flex h-12 items-center gap-2 rounded-[var(--radius-pill)] px-5 font-semibold text-text-hi hover:bg-surface-3 md:h-11'

  const actions = (
    <>
      <a
        href={`https://wa.me/?text=${encodeURIComponent(`${text} ${url}`)}`}
        target="_blank"
        rel="noreferrer noopener"
        className="edge inline-flex h-11 items-center rounded-[var(--radius-pill)] px-4 text-text-hi hover:bg-surface-3"
      >
        {t('title.shareWhatsapp')}
      </a>
      <button
        type="button"
        onClick={copy}
        className="edge inline-flex h-11 items-center gap-2 rounded-[var(--radius-pill)] px-4 text-text-hi hover:bg-surface-3"
      >
        {copied ? <Check size={18} aria-hidden /> : <Copy size={18} strokeWidth={1.5} aria-hidden />}
        {copied ? t('title.shareCopied') : t('title.shareCopy')}
      </button>
    </>
  )

  return (
    <div
      ref={container}
      className={nav ? 'relative' : 'inline-flex flex-col items-start gap-2'}
    >
      <button
        type="button"
        onClick={share}
        aria-label={nav ? t('title.share') : undefined}
        aria-expanded={nav ? expanded : undefined}
        className={buttonClass}
      >
        <Share2 size={20} strokeWidth={1.5} aria-hidden />
        {nav ? <span className="hidden text-[13px] font-semibold sm:inline">{t('title.share')}</span> : t('title.share')}
      </button>

      {expanded ? (
        nav ? (
          <div className="absolute end-0 top-full z-50 mt-1 flex w-max max-w-[calc(100vw-2rem)] flex-col gap-2 rounded-[var(--radius-card)] border border-surface-3 bg-surface-1 p-2">
            {actions}
          </div>
        ) : (
          <div className="flex flex-wrap items-center gap-2">{actions}</div>
        )
      ) : null}

      <span aria-live="polite" className="sr-only">
        {copied ? t('title.shareCopied') : ''}
      </span>
    </div>
  )
}
