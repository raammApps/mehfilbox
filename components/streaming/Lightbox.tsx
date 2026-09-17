'use client'

import { ChevronLeft, ChevronRight, X } from 'lucide-react'
import { useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import { ShareButton } from './ShareButton'
import { LikeButton } from './LikeButton'
import { photoShareUrl } from './usePhotoDeepLink'
import { resolveLocalised, type Translator } from '@/lib/i18n'
import type { SignedPhoto } from '@/lib/photos'
import type { Locale } from '@/lib/schema'
import { useFocusTrap } from './useFocusTrap'

type Props = {
  /** Needed by the like button, which has to name the catalogue it is counting within. */
  catalogueSlug: string
  /** Already signed (N-83) — every caller reads this off a bundle `signPhotos` produced. */
  photos: SignedPhoto[]
  index: number
  locale: Locale
  t: Translator
  onIndexChange: (next: number) => void
  onClose: () => void
}

/** Full-screen photo viewer: swipe on touch, ←/→ and Esc on keyboard, pinch-zoom left to the OS. */
export function Lightbox({ catalogueSlug, photos, index, locale, t, onIndexChange, onClose }: Props) {
  const panel = useRef<HTMLDivElement>(null)
  const touchStartX = useRef<number | null>(null)
  useFocusTrap(panel, onClose)

  const photo = photos[index]

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'ArrowRight' && index < photos.length - 1) onIndexChange(index + 1)
      if (event.key === 'ArrowLeft' && index > 0) onIndexChange(index - 1)
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [index, photos.length, onIndexChange])

  if (!photo || typeof document === 'undefined') return null

  const caption = resolveLocalised(photo.caption, locale)

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-label={caption || t('photo.open')}
      data-motion="modal"
      className="fixed inset-0 z-[70] flex flex-col bg-surface-0/97 backdrop-blur-sm"
      onClick={onClose}
      onTouchStart={(e) => {
        touchStartX.current = e.touches[0]?.clientX ?? null
      }}
      onTouchEnd={(e) => {
        const start = touchStartX.current
        const end = e.changedTouches[0]?.clientX
        if (start == null || end == null) return
        const delta = end - start
        if (Math.abs(delta) < 48) return
        if (delta < 0 && index < photos.length - 1) onIndexChange(index + 1)
        if (delta > 0 && index > 0) onIndexChange(index - 1)
      }}
    >
      <div ref={panel} className="flex h-full flex-col" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between p-3">
          <span className="type-meta" aria-live="polite">
            {t('photo.counter', { index: index + 1, total: photos.length })}
          </span>
          <div className="flex items-center gap-1">
            {/*
              N-31. The one thing a guest most wants to send their sister was the one thing they
              could not — films have had this since VE-6 and photographs had no actions at all.
              The same button, so a shared photograph and a shared film behave identically.
            */}
            <ShareButton url={photoShareUrl(photo)} text={caption || t('photo.open')} t={t} compact />
            <LikeButton
              catalogueSlug={catalogueSlug}
              subject="photo"
              subjectId={photo.id}
              t={t}
              compact
            />
          <button
            type="button"
            onClick={onClose}
            aria-label={t('photo.close')}
            className="flex h-11 w-11 items-center justify-center rounded-full text-text-hi hover:bg-surface-2"
          >
            <X size={22} strokeWidth={1.5} aria-hidden />
          </button>
          </div>
        </div>

        <div className="relative flex min-h-0 flex-1 items-center justify-center px-2">
          <NavButton
            side="left"
            disabled={index === 0}
            onClick={() => onIndexChange(index - 1)}
            label={t('photo.previous')}
          />
          {/* eslint-disable-next-line @next/next/no-img-element -- see PosterCard */}
          <img
            src={photo.url}
            srcSet={photo.srcSet || undefined}
            // Full-bleed, so the browser should take the widest it can use — but a phone still
            // only needs ~1024. This is the one place the 2048 rendition earns its keep.
            sizes="100vw"
            alt={caption}
            className="max-h-full max-w-full object-contain"
            decoding="async"
          />
          <NavButton
            side="right"
            disabled={index === photos.length - 1}
            onClick={() => onIndexChange(index + 1)}
            label={t('photo.next')}
          />
        </div>

        {caption ? <p className="type-body gutter-x py-4 text-center text-text-mid">{caption}</p> : <div className="h-4" />}
      </div>
    </div>,
    document.body,
  )
}

function NavButton({
  side,
  disabled,
  onClick,
  label,
}: {
  side: 'left' | 'right'
  disabled: boolean
  onClick: () => void
  label: string
}) {
  const Icon = side === 'left' ? ChevronLeft : ChevronRight
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      className={`absolute ${side === 'left' ? 'start-2' : 'end-2'} z-10 flex h-12 w-12 items-center justify-center rounded-full bg-surface-1/70 text-text-hi backdrop-blur-sm disabled:opacity-25`}
    >
      <Icon size={24} strokeWidth={1.5} aria-hidden />
    </button>
  )
}
