'use client'

import { ChevronLeft, ChevronRight, Play, X } from 'lucide-react'
import { useEffect, useMemo, useRef } from 'react'
import { createPortal } from 'react-dom'
import { formatClock, formatWeddingDate } from '@/lib/format'
import { resolveLocalised, type Translator } from '@/lib/i18n'
import { eyebrowFor, posterDataUri, type PosterPaletteName } from '@/lib/poster'
import type { Catalogue, Locale, Title } from '@/lib/schema'
import { useCatalogue } from './CatalogueProvider'
import { ShareButton } from './ShareButton'
import { LikeButton } from './LikeButton'
import { useFocusTrap } from './useFocusTrap'

type Props = {
  catalogue: Catalogue
  titles: Title[]
  locale: Locale
  t: Translator
  shareBaseUrl: string
  palette?: PosterPaletteName
}

/**
 * The title-detail sheet (doc 08 `<TitleModal>` — nine required behaviours).
 *
 * History, focus and body-scroll behaviour live in `<CatalogueProvider>` and `useFocusTrap`;
 * this component owns content order, sibling navigation, and the manifest prefetch that is
 * where the sub-1.5s playback target is actually won.
 */
export function TitleModal({ catalogue, titles, locale, t, shareBaseUrl, palette = 'warm' }: Props) {
  const { openTitleSlug, closeTitle, openTitle, play, progressByTitleId } = useCatalogue()
  const panel = useRef<HTMLDivElement>(null)

  const index = titles.findIndex((title) => title.slug === openTitleSlug)
  const title = index >= 0 ? titles[index] : undefined

  useFocusTrap(panel, closeTitle)

  /**
   * Prefetch the playback token and the HLS manifest on open. By the time Play is pressed the
   * first segment is warm — doc 05 §6 and doc 08 behaviour 9.
   */
  useEffect(() => {
    if (!title || title.status !== 'ready') return
    const controller = new AbortController()

    fetch('/api/playback/token', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ catalogue: catalogue.slug, titleSlug: title.slug }),
      signal: controller.signal,
    })
      .then((response) => (response.ok ? response.json() : null))
      .then((body: { playbackUrl?: string } | null) => {
        if (!body?.playbackUrl) return
        // Warm the manifest itself; the player will hit the same URL from cache.
        return fetch(body.playbackUrl, { signal: controller.signal, mode: 'no-cors' })
      })
      .catch(() => {})

    return () => controller.abort()
  }, [title, catalogue.slug])

  const siblings = useMemo(() => ({ previous: titles[index - 1], next: titles[index + 1] }), [titles, index])

  useEffect(() => {
    if (!title) return
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'ArrowRight' && siblings.next) openTitle(siblings.next.slug)
      if (event.key === 'ArrowLeft' && siblings.previous) openTitle(siblings.previous.slug)
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [title, siblings, openTitle])

  if (!title || typeof document === 'undefined') return null

  const name = resolveLocalised(title.name, locale)
  const synopsis = resolveLocalised(title.synopsis, locale)
  const poster =
    title.posterUrl ||
    // No baked type: the modal renders the name and the category row directly below it.
    posterDataUri({ slug: title.slug, label: '', width: 1200, height: 675, palette })
  const resume = progressByTitleId[title.id]
  const shareUrl = `${shareBaseUrl}/watch/${title.slug}`
  const shareText = `${name} — ${resolveLocalised(catalogue.coupleName, locale)}`

  return createPortal(
    <div
      data-motion="modal"
      data-testid="title-modal"
      className="fixed inset-0 z-[60] overflow-y-auto bg-surface-0/80 backdrop-blur-[2px]"
      onClick={closeTitle}
    >
      <div
        ref={panel}
        role="dialog"
        aria-modal="true"
        aria-labelledby="title-modal-heading"
        tabIndex={-1}
        onClick={(event) => event.stopPropagation()}
        className="edge mx-auto my-0 w-full max-w-[860px] overflow-hidden rounded-b-[var(--radius-modal)] bg-surface-2 shadow-2xl md:my-8 md:rounded-[var(--radius-modal)]"
      >
        <div className="relative">
          {/* eslint-disable-next-line @next/next/no-img-element -- see PosterCard */}
          <img src={poster} alt="" className="aspect-video w-full object-cover" />
          <div aria-hidden className="absolute inset-0" style={{ background: 'var(--scrim)' }} />

          <button
            type="button"
            onClick={closeTitle}
            aria-label={t('title.close')}
            className="absolute end-3 top-3 flex h-11 w-11 items-center justify-center rounded-full bg-surface-0/70 text-text-hi backdrop-blur-sm hover:bg-surface-3"
          >
            <X size={22} strokeWidth={1.5} aria-hidden />
          </button>

          <div className="absolute inset-x-0 bottom-0 flex items-center justify-between gap-2 p-3">
            <SiblingButton
              direction="previous"
              sibling={siblings.previous}
              onOpen={openTitle}
              label={t('title.previous')}
            />
            <SiblingButton
              direction="next"
              sibling={siblings.next}
              onOpen={openTitle}
              label={t('title.next')}
            />
          </div>
        </div>

        <div className="p-5 md:p-8">
          <h2 id="title-modal-heading" className="type-display-lg">
            {name}
          </h2>

          <p className="type-meta mt-2">
            {[
              title.durationS ? formatClock(title.durationS) : null,
              eyebrowFor(name, title.category),
              formatWeddingDate(catalogue.weddingDate, locale),
            ]
              .filter(Boolean)
              .join(' · ')}
          </p>

          <div className="mt-5 flex flex-wrap items-center gap-3">
            {title.status === 'ready' ? (
              <button
                type="button"
                onClick={() => play(title.slug, resume && !resume.completed ? resume.positionS : undefined)}
                className="inline-flex h-12 items-center gap-2 rounded-[var(--radius-pill)] bg-accent px-6 font-semibold text-accent-ink transition-colors hover:bg-accent-hi md:h-11"
              >
                <Play size={20} fill="currentColor" strokeWidth={0} aria-hidden />
                {t('title.play')}
              </button>
            ) : (
              <p className="type-body text-warn">{t('title.processing')}</p>
            )}

            <ShareButton url={shareUrl} text={shareText} t={t} />
            <LikeButton
              catalogueSlug={catalogue.slug}
              subject="title"
              subjectId={title.id}
              t={t}
            />
          </div>

          {synopsis ? <p className="type-body-lg mt-6 text-text-mid">{synopsis}</p> : null}

          {title.credits.length > 0 ? (
            <section className="mt-8">
              {/* The label is a heading, not a term: a <dl> may only contain <dt>/<dd> groups
                  or <div>s wrapping them, and a stray <dt> breaks the list for a screen
                  reader (WCAG 1.3.1). */}
              <h3 className="type-label mb-2 text-text-lo">{t('title.credits')}</h3>
              <dl className="grid gap-x-6 gap-y-2 sm:grid-cols-2">
                {title.credits.map((credit) => (
                  <div key={`${credit.role}-${credit.name}`} className="flex gap-2">
                    <dt className="type-meta shrink-0">{credit.role}</dt>
                    <dd className="type-meta text-text-mid">{credit.name}</dd>
                  </div>
                ))}
              </dl>
            </section>
          ) : null}
        </div>
      </div>
    </div>,
    document.body,
  )
}

function SiblingButton({
  direction,
  sibling,
  onOpen,
  label,
}: {
  direction: 'previous' | 'next'
  sibling: Title | undefined
  onOpen: (slug: string) => void
  label: string
}) {
  const Icon = direction === 'previous' ? ChevronLeft : ChevronRight
  if (!sibling) return <span aria-hidden className="h-11 w-11" />
  return (
    <button
      type="button"
      onClick={() => onOpen(sibling.slug)}
      aria-label={label}
      className="flex h-11 w-11 items-center justify-center rounded-full bg-surface-0/60 text-text-hi backdrop-blur-sm hover:bg-surface-3"
    >
      <Icon size={22} strokeWidth={1.5} aria-hidden />
    </button>
  )
}
