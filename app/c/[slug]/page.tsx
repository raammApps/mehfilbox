import type { Metadata } from 'next'
import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { ThemeStyle } from '@/components/chrome/ThemeStyle'
import { CatalogueShell } from '@/components/streaming/CatalogueShell'
import { basePathOf, ogImageUrlOf, publicUrlOf, requireCanonicalAddress } from '@/lib/address'
import { loadBundle, resolveAccess } from '@/lib/catalogue-access'
import { getRepository } from '@/lib/db'
import { env } from '@/lib/env'
import { createTranslator, parseLocale, resolveLocalised } from '@/lib/i18n'
import { guestLocale } from '@/lib/guest-locale'
import { rootUrl } from '@/lib/tenant'
import { effectiveModules } from '@/lib/db/repository'
import { showsPlatformCredit, type PlaybackProgress } from '@/lib/schema'
import { resolveTheme } from '@/themes/resolve'

/**
 * The browse page. ISR — revalidated explicitly on publish (doc 05 §6), not on a timer, so a
 * published change is live immediately and an unpublished one never leaks.
 */
export const revalidate = 3600
export const dynamicParams = true

type Params = { slug: string }
type Search = { title?: string; profile?: string }

export async function generateMetadata({
  params,
}: {
  params: Promise<Params>
}): Promise<Metadata> {
  const { slug } = await params
  const verdict = await resolveAccess(slug)
  if (verdict.kind === 'missing') return { title: 'Mehfilbox' }

  const { catalogue } = verdict
  const locale = await guestLocale(catalogue)
  const coupleName = resolveLocalised(catalogue.coupleName, locale)
  const description = resolveLocalised(catalogue.synopsis, locale) || `${coupleName} — the films.`
  const url = publicUrlOf(catalogue)

  // The WhatsApp preview is a P0 feature, not polish (CLAUDE.md constraint 3). The image is
  // served off the root host with the catalogue named in the query (see `ogImageUrlOf`); `v=` is
  // a cache-buster the pre-handover runbook relies on — WhatsApp caches previews for days.
  const ogImage = ogImageUrlOf(catalogue)

  return {
    title: coupleName,
    description,
    robots: { index: false, follow: false },
    openGraph: {
      type: 'website',
      title: coupleName,
      description,
      url,
      images: [{ url: ogImage, width: 1200, height: 630, alt: coupleName }],
    },
    twitter: { card: 'summary_large_image', title: coupleName, description, images: [ogImage] },
  }
}

export default async function CataloguePage({
  params,
  searchParams,
}: {
  params: Promise<Params>
  searchParams: Promise<Search>
}) {
  const { slug } = await params
  const { title: titleParam, profile: profileParam } = await searchParams
  const verdict = await resolveAccess(slug)

  switch (verdict.kind) {
    case 'missing':
      // A wrong slug is the only genuine 404 on the guest surface.
      return <NotAvailable slug={slug} />
    case 'draft':
      return <NotAvailable slug={slug} draft />
    case 'locked':
      // Both of these are catalogue-scoped pages, so they hang off the catalogue's own base —
      // which in path mode is `/<studio>/<wedding>` and in subdomain mode is the root. A bare
      // `/locked` in path mode lands on the marketing site with nowhere to type the code.
      redirect(`${basePathOf(verdict.catalogue)}/locked`)
    case 'lapsed':
      redirect(`${basePathOf(verdict.catalogue)}/renew`)
    case 'ok':
      break
  }

  const { catalogue } = verdict

  // A legacy `/c/<wedding>` link, or a wrong studio segment, is sent to the one address the
  // product prints (D-32). The deep-link query rides along so `?title=` survives the hop.
  const query = new URLSearchParams()
  if (titleParam) query.set('title', titleParam)
  if (profileParam) query.set('profile', profileParam)
  const search = [...query.keys()].length > 0 ? `?${query.toString()}` : ''
  await requireCanonicalAddress(catalogue, '', search)

  const bundle = await loadBundle(catalogue)
  const locale = await guestLocale(catalogue)

  // Resume positions are server-rendered when a profile is already known, so a returning guest
  // sees progress bars in the first paint rather than after a round trip.
  let progress: PlaybackProgress[] = []
  if (profileParam) {
    const profile = await getRepository().getProfile(profileParam)
    if (profile?.catalogueId === catalogue.id) {
      progress = await getRepository().listProgress(profile.id)
    }
  }

  const publicUrl = publicUrlOf(catalogue)
  // The whole guest surface follows the theme (D-35); resolved once, custom-aware, here.
  const theme = await resolveTheme(catalogue.branding)

  return (
    <>
      <ThemeStyle branding={catalogue.branding} theme={theme} />
      <CatalogueShell
        palette={theme.tokens.posterPalette}
        bundle={bundle}
        modules={effectiveModules(catalogue, false)}
        locale={locale}
        initialTitleSlug={titleParam ?? null}
        initialProgress={progress}
        shareBaseUrl={publicUrl.replace(/\/$/, '')}
        publicUrl={publicUrl}
        basePath={basePathOf(catalogue)}
        platformCredit={showsPlatformCredit(catalogue.branding)}
        // The referral carries the studio segment, so a studio that keeps the line on gets the
        // enquiry it brought in (D-13, D-41).
        platformHref={rootUrl(env.ROOT_DOMAIN, `/?ref=${encodeURIComponent(catalogue.tenantSlug || catalogue.slug)}`)}
      />
    </>
  )
}

/** Draft catalogues get a neutral "not yet available" page, never a 404 (doc 02 §5). */
async function NotAvailable({ slug: _slug, draft = false }: { slug: string; draft?: boolean }) {
  const locale = parseLocale((await cookies()).get('mehfilbox_locale')?.value)
  const t = createTranslator(locale)
  return (
    <main className="gutter-x flex min-h-svh flex-col items-center justify-center text-center">
      <h1 className="type-display-lg mb-3">{t('state.draft.heading')}</h1>
      <p className="type-body-lg max-w-[46ch] text-text-mid">
        {draft ? t('state.draft.body') : t('state.empty.body')}
      </p>
    </main>
  )
}
