'use client'

import { Info, Play } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { useCatalogue } from '@/components/streaming/CatalogueProvider'
import { formatWeddingDate } from '@/lib/format'
import { resolveLocalised } from '@/lib/i18n'
import { posterDataUri } from '@/lib/poster'
import type { GuestProps } from '../contract'
import { resolveFeatured } from './resolve'
import type { BillboardConfig } from './schema'

/**
 * Full-bleed hero. Poster still paints instantly; the muted trailer fades in only once it can
 * play through, so the transition never flashes black and a slow connection never sees a
 * half-loaded video (doc 08 `<Billboard>`).
 */
export default function Guest({ config, ctx }: GuestProps<BillboardConfig>) {
  const { openTitle, play, palette } = useCatalogue()
  const video = useRef<HTMLVideoElement>(null)
  const [trailerVisible, setTrailerVisible] = useState(false)

  const featured =
    resolveFeatured(config.featuredRef, ctx.catalogue.featuredTitleId, ctx.titles)

  const trailerUrl = featured?.trailerUrl ?? null

  useEffect(() => {
    if (!config.useTrailer || !trailerUrl) return

    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    const connection = (
      navigator as Navigator & {
        connection?: { saveData?: boolean; effectiveType?: string }
      }
    ).connection
    const thinPipe =
      connection?.saveData === true ||
      (connection?.effectiveType !== undefined && /^(slow-)?2g$|^3g$/.test(connection.effectiveType))

    if (reducedMotion || thinPipe) return

    // No motion in the first 1.5s after load on mobile — it competes with paint and makes the
    // site feel slower than it is (doc 04 §5).
    const timer = window.setTimeout(() => {
      const el = video.current
      if (!el) return
      el.addEventListener('canplaythrough', () => setTrailerVisible(true), { once: true })
      void el.play().catch(() => setTrailerVisible(false))
    }, 1500)

    return () => window.clearTimeout(timer)
  }, [config.useTrailer, trailerUrl])

  if (!featured) return null

  const coupleName = resolveLocalised(ctx.catalogue.coupleName, ctx.locale)
  const filmName = resolveLocalised(featured.name, ctx.locale)
  const headline = config.showCoupleName ? coupleName : filmName
  const synopsis = resolveLocalised(featured.synopsis ?? ctx.catalogue.synopsis, ctx.locale)
  const still =
    featured.posterUrl ||
    // No baked label: the hero renders its own headline, and artwork type behind it collides.
    posterDataUri({ slug: featured.slug, label: '', width: 1600, height: 900, palette })

  return (
    <section className="relative isolate -mt-[var(--nav-h,64px)] min-h-[78svh] w-full overflow-hidden md:min-h-[86svh]">
      {/* eslint-disable-next-line @next/next/no-img-element -- the still must paint before any
          JS runs; the optimiser hop is measurable against the 1.5s target. */}
      <img
        src={still}
        alt=""
        fetchPriority="high"
        decoding="sync"
        className="absolute inset-0 h-full w-full object-cover"
      />

      {trailerUrl && config.useTrailer ? (
        <video
          ref={video}
          src={trailerUrl}
          muted
          loop
          playsInline
          preload="none"
          aria-hidden
          tabIndex={-1}
          className={`absolute inset-0 h-full w-full object-cover transition-opacity duration-700 ${
            trailerVisible ? 'opacity-100' : 'opacity-0'
          }`}
        />
      ) : null}

      <div
        aria-hidden
        className="absolute inset-0"
        style={{ background: 'var(--scrim)' }}
      />

      <div className="gutter-x relative flex min-h-[78svh] flex-col justify-end pb-10 md:min-h-[86svh] md:pb-16">
        {/*
          A second, tighter scrim under the copy itself. The page scrim fades out well above the
          eyebrow, and accent-on-a-bright-poster is unreadable there — doc 04 §2 forbids fixing
          that by lightening the red, so the surface goes darker instead.
        */}
        <span
          aria-hidden
          className="pointer-events-none absolute inset-x-0 bottom-0 -z-10 h-[62%]"
          style={{
            background:
              'linear-gradient(to top, var(--color-surface-0) 4%, color-mix(in srgb, var(--color-surface-0) 72%, transparent) 46%, transparent 100%)',
          }}
        />

        <p className="type-label mb-3 text-text-mid">
          {formatWeddingDate(ctx.catalogue.weddingDate, ctx.locale)}
        </p>

        <h1 className="type-display-xl max-w-[16ch]">{headline}</h1>

        {synopsis ? (
          <p className="clamp-2 type-body-lg mt-3 max-w-[52ch] text-text-mid">{synopsis}</p>
        ) : null}

        {/* Exactly two buttons. Do not add a third (doc 04 §1b mechanic 3). */}
        <div className="mt-6 flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={() => play(featured.slug)}
            className="inline-flex h-12 items-center gap-2 rounded-[var(--radius-pill)] bg-accent px-6 font-semibold text-accent-ink transition-colors hover:bg-accent-hi md:h-11"
          >
            <Play size={20} fill="currentColor" strokeWidth={0} aria-hidden />
            {ctx.t('billboard.play')}
          </button>

          <button
            type="button"
            onClick={() => openTitle(featured.slug)}
            className="edge inline-flex h-12 items-center gap-2 rounded-[var(--radius-pill)] bg-surface-1/60 px-6 font-semibold text-text-hi backdrop-blur-sm transition-colors hover:bg-surface-2 md:h-11"
          >
            <Info size={20} strokeWidth={1.5} aria-hidden />
            {ctx.t('billboard.moreInfo')}
          </button>
        </div>
      </div>
    </section>
  )
}
