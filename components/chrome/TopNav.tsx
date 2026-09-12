'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import { useCatalogue } from '@/components/streaming/CatalogueProvider'
import { LOCALE_LABELS, type Translator } from '@/lib/i18n'
import { hashSlug } from '@/lib/poster'
import { LOCALES, type Locale } from '@/lib/schema'
import { ShareButton } from '@/components/streaming/ShareButton'

type Props = {
  appName: string
  logoUrl: string | null
  locale: Locale
  t: Translator
  /** The whole wedding's address and the text that travels with it (D-41). Omit to hide the control. */
  shareUrl?: string
  shareText?: string
}

const AVATAR_COLOURS = ['#f2933a', '#d4547e', '#3b3f8f', '#1f6b52', '#e0b155', '#8e1220']

/**
 * Sticky, transparent over the billboard, solid on scroll (doc 02 §4).
 * No search, no hamburger — neither exists in this product.
 *
 * The profile control is an avatar, not a text button: at 360px a "Switch profile" label
 * pushed the wordmark and the language toggle into each other and made the toggle
 * untappable. doc 02 §4 specifies an avatar here, and the avatar is also what makes the
 * row fit.
 */
export function TopNav({ appName, logoUrl, locale, t, shareUrl, shareText }: Props) {
  const { setProfileId, preview, basePath } = useCatalogue()
  const [solid, setSolid] = useState(false)

  useEffect(() => {
    const onScroll = () => setSolid(window.scrollY > 24)
    onScroll()
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  const colour = AVATAR_COLOURS[hashSlug(appName) % AVATAR_COLOURS.length]!

  return (
    <header
      className={`sticky top-0 z-50 h-[var(--nav-h,64px)] transition-colors duration-300 ${
        solid ? 'bg-surface-0/95 backdrop-blur-md' : 'bg-transparent'
      }`}
      style={{ ['--nav-h' as string]: '64px' }}
    >
      <div className="gutter-x flex h-full items-center justify-between gap-2">
        <Link href={basePath || '/'} className="flex min-w-0 items-center gap-2 no-underline">
          {logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element -- tenant logo, arbitrary host
            <img src={logoUrl} alt={appName} className="h-7 w-auto max-w-[140px] object-contain" />
          ) : (
            <span
              // Tracking is responsive because it is what overflowed. At 0.16em a default app
              // name ("<Couple> Originals", ~24 characters) spends ~42px on letter-spacing alone
              // and needed 209px in a 199px slot, so a 375px phone truncated the couple's own
              // name on the couple's own site. Wide tracking is the wordmark's whole character,
              // so it is tightened for small screens rather than abandoned.
              className="type-label truncate tracking-[0.09em] text-accent-hi md:text-[13px] md:tracking-[0.16em]"
              style={{ fontFamily: 'var(--font-display)' }}
            >
              {appName.toUpperCase()}
            </span>
          )}
        </Link>

        <div className="flex shrink-0 items-center gap-1">
          <LanguageToggle locale={locale} t={t} />

          {/*
            Share the wedding, not a film — the control that turns a guest into the next
            couple's referral (D-41). Inert in the customizer preview like the profile switcher.
          */}
          {shareUrl && !preview ? (
            <ShareButton url={shareUrl} text={shareText ?? appName} t={t} nav />
          ) : null}

          {!preview ? (
            <button
              type="button"
              onClick={() => setProfileId(null)}
              aria-label={t('nav.switchProfile')}
              className="flex h-11 w-11 items-center justify-center rounded-full"
            >
              <span
                aria-hidden
                className="flex h-8 w-8 items-center justify-center rounded text-[15px] font-black text-surface-0"
                style={{ background: colour, fontFamily: 'var(--font-display)' }}
              >
                {appName.trim().slice(0, 1).toUpperCase()}
              </span>
            </button>
          ) : null}
        </div>
      </div>
    </header>
  )
}

/**
 * The locale lives in a cookie rather than the URL: a guest arrives from WhatsApp on a link
 * the couple shared, and a `/hi` prefix in that link is one more thing to get wrong.
 */
function LanguageToggle({ locale, t }: { locale: Locale; t: Translator }) {
  const switchTo = (next: Locale) => {
    document.cookie = `mehfilbox_locale=${next}; path=/; max-age=${60 * 60 * 24 * 365}; samesite=lax`
    window.location.reload()
  }

  return (
    <div role="group" aria-label={t('nav.language')} className="flex items-center">
      {LOCALES.map((candidate) => (
        <button
          key={candidate}
          type="button"
          onClick={() => switchTo(candidate)}
          aria-pressed={candidate === locale}
          // Two things this control has to get right. Not `type-label`: 11px on a 1.2
          // line-height clips the matra on हिं (doc 04 §3, manual check M-6). And the active
          // state is a filled pill rather than red text — colour alone is not a state signal
          // (WCAG 1.4.1), and red-on-black at 13px is below 4.5:1 (doc 04 §2).
          className={`flex h-11 min-w-11 items-center justify-center rounded-[var(--radius-pill)] px-2 text-[13px] font-semibold leading-[1.7] tracking-[0.06em] ${
            candidate === locale
              ? 'bg-accent text-accent-ink'
              : 'text-text-lo hover:text-text-hi'
          }`}
        >
          {LOCALE_LABELS[candidate]}
        </button>
      ))}
    </div>
  )
}
