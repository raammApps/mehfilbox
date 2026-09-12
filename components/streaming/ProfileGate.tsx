'use client'

import { useEffect, useRef, useState } from 'react'
import type { Translator, MessageKey } from '@/lib/i18n'
import { PROFILE_LABELS, type ProfileLabel } from '@/lib/schema'
import { hashSlug, tileColours, type PosterPaletteName } from '@/lib/poster'
import { useCatalogue } from './CatalogueProvider'
import { useFocusTrap } from './useFocusTrap'

const LABEL_KEYS: Record<ProfileLabel, MessageKey> = {
  "Bride's side": 'profileGate.label.brideSide',
  "Groom's side": 'profileGate.label.groomSide',
  Friends: 'profileGate.label.friends',
  Family: 'profileGate.label.family',
}

type Props = { appName: string; t: Translator; palette?: PosterPaletteName }

/**
 * The single most recognisable streaming moment, and the frame that tells a visitor what kind
 * of thing they just opened (doc 04 §1b mechanic 1, doc 01 VE-1).
 *
 * The wordmark animates in over ~600ms with a scale settle before the tiles appear — that beat
 * is what sells the reference. Never accepts a free-text personal name (doc 06 §5).
 */
export function ProfileGate({ appName, t, palette = 'warm' }: Props) {
  // Deterministic tile colour from the label, so the same tile is the same colour every visit —
  // drawn from the theme's palette (D-35).
  const tileColourSet = tileColours(palette)
  const { catalogueSlug, profileId, setProfileId, preview } = useCatalogue()
  const panel = useRef<HTMLDivElement>(null)
  const [mounted, setMounted] = useState(false)
  const [tilesIn, setTilesIn] = useState(false)
  const [busy, setBusy] = useState(false)

  // Rendering nothing on the server keeps the gate out of the HTML, so a returning guest never
  // sees it flash before localStorage is read.
  useEffect(() => setMounted(true), [])

  useEffect(() => {
    if (!mounted) return
    const timer = window.setTimeout(() => setTilesIn(true), 600)
    return () => window.clearTimeout(timer)
  }, [mounted])

  const dismiss = () => setProfileId('skipped')
  useFocusTrap(panel, dismiss)

  const choose = async (label: ProfileLabel) => {
    if (busy) return
    setBusy(true)
    try {
      const response = await fetch('/api/profiles', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ catalogue: catalogueSlug, label, avatarSeed: label }),
      })
      const body = (await response.json()) as { profileId?: string }
      setProfileId(body.profileId ?? 'skipped')
    } catch {
      // A profile is a convenience, not a gate. If the request fails, let the guest through.
      setProfileId('skipped')
    }
  }

  if (!mounted || preview || profileId !== null) return null

  return (
    <div
      className="fixed inset-0 z-[80] flex flex-col items-center justify-center bg-surface-0"
      data-testid="profile-gate"
    >
      <div ref={panel} role="dialog" aria-modal="true" aria-labelledby="gate-heading" tabIndex={-1}>
        <p
          className="type-display-lg mb-10 text-center text-accent transition-all duration-[600ms] ease-[var(--ease-in-modal)]"
          style={{
            letterSpacing: '0.28em',
            opacity: mounted ? 1 : 0,
            transform: mounted ? 'scale(1)' : 'scale(1.12)',
          }}
        >
          {appName.toUpperCase()}
        </p>

        <h1 id="gate-heading" className="type-display-lg mb-2 text-center">
          {t('profileGate.heading')}
        </h1>
        <p className="type-body mb-8 text-center text-text-lo">{t('profileGate.hint')}</p>

        <ul
          className="mx-auto grid max-w-[520px] grid-cols-2 gap-4 px-4 transition-opacity duration-500 sm:grid-cols-4"
          style={{ opacity: tilesIn ? 1 : 0 }}
        >
          {PROFILE_LABELS.map((label) => {
            const resolved = t(LABEL_KEYS[label])
            const colour = tileColourSet[hashSlug(label) % tileColourSet.length]!
            return (
              <li key={label}>
                <button
                  type="button"
                  onClick={() => void choose(label)}
                  disabled={busy}
                  className="group flex w-full flex-col items-center gap-2 disabled:opacity-60"
                >
                  <span
                    aria-hidden
                    className="flex aspect-square w-full items-center justify-center rounded-[var(--radius-card)] text-4xl font-black text-surface-0 transition-transform duration-[180ms] ease-[var(--ease-lift)] group-hover:scale-105"
                    style={{ background: colour, fontFamily: 'var(--font-display)' }}
                  >
                    {resolved.slice(0, 1)}
                  </span>
                  <span className="type-body text-center text-text-mid">{resolved}</span>
                </button>
              </li>
            )
          })}
        </ul>

        <div className="mt-10 text-center">
          <button
            type="button"
            onClick={dismiss}
            className="type-body h-11 rounded-[var(--radius-pill)] px-5 text-text-lo hover:text-text-hi"
          >
            {t('profileGate.skip')}
          </button>
        </div>
      </div>
    </div>
  )
}
