import type { Metadata } from 'next'
import { notFound, redirect } from 'next/navigation'
import { ThemeStyle } from '@/components/chrome/ThemeStyle'
import { WatchScreen } from '@/components/streaming/WatchScreen'
import { resolveAccess } from '@/lib/catalogue-access'
import { getRepository } from '@/lib/db'
import { addressFor, requireCanonicalAddress } from '@/lib/address'
import {resolveLocalised} from '@/lib/i18n'
import { guestLocale } from '@/lib/guest-locale'
import { posterDataUri } from '@/lib/poster'
import { resolveTheme } from '@/themes/resolve'

/** Dynamic — every visit needs a fresh playback token (doc 05 §6). */
export const dynamic = 'force-dynamic'

type Params = { slug: string; titleSlug: string }

export async function generateMetadata({ params }: { params: Promise<Params> }): Promise<Metadata> {
  const { slug, titleSlug } = await params
  const verdict = await resolveAccess(slug)
  if (verdict.kind !== 'ok') return { title: 'Mehfilbox' }
  const title = await getRepository().getTitleBySlug(verdict.catalogue.id, titleSlug)
  return { title: title ? title.name.en : 'Mehfilbox', robots: { index: false, follow: false } }
}

export default async function WatchPage({
  params,
  searchParams,
}: {
  params: Promise<Params>
  searchParams: Promise<{ t?: string; profile?: string }>
}) {
  const { slug, titleSlug } = await params
  const { t: timestamp } = await searchParams

  const verdict = await resolveAccess(slug)
  // Catalogue-scoped, so they need the base path — see the note in the browse page.
  if (verdict.kind === 'locked') redirect(`${(await addressFor(verdict.catalogue)).basePath}/locked`)
  if (verdict.kind === 'lapsed') redirect(`${(await addressFor(verdict.catalogue)).basePath}/renew`)
  if (verdict.kind === 'premiere') redirect(`${(await addressFor(verdict.catalogue)).basePath}/premiere`)
  if (verdict.kind !== 'ok') notFound()

  // A forwarded deep link keeps its `?t=` across the redirect to the canonical address (D-32).
  await requireCanonicalAddress(
    verdict.catalogue,
    `/watch/${encodeURIComponent(titleSlug)}`,
    timestamp ? `?t=${encodeURIComponent(timestamp)}` : '',
  )

  const title = await getRepository().getTitleBySlug(verdict.catalogue.id, titleSlug)
  if (!title || !title.published) notFound()

  const locale = await guestLocale(verdict.catalogue)
  const name = resolveLocalised(title.name, locale)
  const startAt = timestamp ? Number.parseInt(timestamp, 10) : null
  const theme = await resolveTheme(verdict.catalogue.branding)

  return (
    <>
      <ThemeStyle branding={verdict.catalogue.branding} theme={theme} />
      <WatchScreen
        catalogueSlug={verdict.catalogue.slug}
        titleSlug={title.slug}
        titleId={title.id}
        titleName={name}
        posterUrl={
          title.posterUrl ??
          // The player's own chrome carries the title; the poster frame stays clean.
          posterDataUri({
            slug: title.slug,
            label: '',
            width: 1600,
            height: 900,
            palette: theme.tokens.posterPalette,
          })
        }
        locale={locale}
        startAtS={Number.isFinite(startAt) ? startAt : null}
      />
    </>
  )
}
