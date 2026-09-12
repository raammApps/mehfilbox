'use client'

import { useEffect } from 'react'
import { SiteFooter } from '@/components/chrome/SiteFooter'
import { TopNav } from '@/components/chrome/TopNav'
import { createTranslator, resolveLocalised } from '@/lib/i18n'
import type { CatalogueBundle, Locale, ModuleInstance, PlaybackProgress } from '@/lib/schema'
import { firstRowInstanceId } from '@/modules/registry'
import { CatalogueProvider } from './CatalogueProvider'
import { ModuleRenderer } from './ModuleRenderer'
import { ProfileGate } from './ProfileGate'
import { TitleModal } from './TitleModal'

type Props = {
  bundle: CatalogueBundle
  modules: ModuleInstance[]
  locale: Locale
  initialTitleSlug: string | null
  initialProgress: PlaybackProgress[]
  shareBaseUrl: string
  /** The catalogue's own address, exactly as printed — what "share this wedding" sends (D-41). */
  publicUrl?: string
  /** '' in subdomain mode, '/<studio>/<wedding>' in path mode. See `cataloguePath`. */
  basePath?: string
  /** Set inside the customizer's preview pane: navigation, history and the gate go inert. */
  preview?: boolean
  /** Whether the footer says "Made with Mehfilbox" — a studio setting, on unless turned off (D-41). */
  platformCredit?: boolean
  /** Where that line points: the marketing site, carrying the studio that sent the guest. */
  platformHref?: string
}

/**
 * The whole guest surface, as one client tree.
 *
 * Doc 08 sketches `<ModuleRenderer>` as a server component. It is a client tree here for one
 * reason, and it is the reason doc 14 §5.4 gives: the customizer's preview pane must render
 * *the real guest components*, and a server component cannot mount inside the operator's
 * browser. One implementation that both surfaces share beats two that drift.
 *
 * The cost is contained — these are small presentational components, and the player, which is
 * the heavy chunk, still lives on its own route and is lazy-loaded.
 */
export function CatalogueShell({
  bundle,
  modules,
  locale,
  initialTitleSlug,
  initialProgress,
  shareBaseUrl,
  publicUrl,
  basePath = '',
  preview = false,
  platformCredit = true,
  platformHref,
}: Props) {
  const { catalogue, titles, albums, photos } = bundle
  /**
   * Keep `<html lang>` honest (N-29).
   *
   * The root layout sets it from the locale cookie, because it is the only place `<html>` exists
   * and it has no catalogue in scope. That was right while the cookie was the only input; now a
   * catalogue carries its own default, so a Hindi wedding opened by a guest who has never touched
   * the toggle rendered Hindi text inside `lang="en"` — which is what a screen reader acts on.
   *
   * Corrected here rather than by teaching the layout to resolve a tenant, which would put a
   * database read in front of every guest request to fix an attribute.
   */
  useEffect(() => {
    document.documentElement.lang = locale
  }, [locale])

  const t = createTranslator(locale)
  const appName = resolveLocalised(catalogue.appName, locale)
  const presentedBy = catalogue.branding.presentedBy ?? null
  const coupleName = resolveLocalised(catalogue.coupleName, locale)

  return (
    <CatalogueProvider
      locale={locale}
      catalogueSlug={catalogue.slug}
      basePath={basePath}
      initialTitleSlug={initialTitleSlug}
      initialProgress={initialProgress}
      firstRowId={firstRowInstanceId(modules)}
      preview={preview}
    >
      <a
        href="#content"
        className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-[90] focus:rounded focus:bg-surface-2 focus:px-4 focus:py-2 focus:text-text-hi"
      >
        {t('nav.skipToContent')}
      </a>

      <ProfileGate appName={appName} t={t} />
      <TopNav
        appName={appName}
        logoUrl={catalogue.branding.logoUrl || null}
        locale={locale}
        t={t}
        // The whole wedding, not one film: the share that brings the next studio in (D-41).
        shareUrl={publicUrl ?? `${shareBaseUrl}/`}
        shareText={t('share.catalogue', { couple: coupleName })}
      />

      <main id="content">
        {titles.length === 0 && photos.length === 0 ? (
          <EmptyState heading={t('state.empty.heading')} body={t('state.empty.body')} />
        ) : (
          <ModuleRenderer
            modules={modules}
            catalogue={catalogue}
            titles={titles}
            albums={albums}
            photos={photos}
            locale={locale}
            profileId={null}
          />
        )}
      </main>

      <SiteFooter
        presentedBy={presentedBy}
        t={t}
        // Off the catalogue's own base: `/c/…` was only right in path mode, and only until the
        // address moved (D-32).
        downloadHref={`${basePath}/download`}
        platformCredit={platformCredit}
        platformHref={platformHref ?? null}
      />

      <TitleModal
        catalogue={catalogue}
        titles={titles}
        locale={locale}
        t={t}
        shareBaseUrl={shareBaseUrl}
      />
    </CatalogueProvider>
  )
}

function EmptyState({ heading, body }: { heading: string; body: string }) {
  return (
    <div className="gutter-x flex min-h-[60svh] flex-col items-center justify-center text-center">
      <h1 className="type-display-lg mb-3">{heading}</h1>
      <p className="type-body-lg max-w-[46ch] text-text-mid">{body}</p>
    </div>
  )
}
