import type { Metadata } from 'next'
import { cookies } from 'next/headers'
import { notFound, redirect } from 'next/navigation'
import { ThemeStyle } from '@/components/chrome/ThemeStyle'
import { WatchScreen } from '@/components/streaming/WatchScreen'
import { resolveAccess } from '@/lib/catalogue-access'
import { getRepository } from '@/lib/db'
import { env } from '@/lib/env'
import { cataloguePath } from '@/lib/tenant'
import { parseLocale, resolveLocalised } from '@/lib/i18n'
import { posterDataUri } from '@/lib/poster'

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
  const basePath = cataloguePath(slug, env.TENANCY_MODE)
  if (verdict.kind === 'locked') redirect(`${basePath}/locked`)
  if (verdict.kind === 'lapsed') redirect(`${basePath}/renew`)
  if (verdict.kind !== 'ok') notFound()

  const title = await getRepository().getTitleBySlug(verdict.catalogue.id, titleSlug)
  if (!title || !title.published) notFound()

  const locale = parseLocale((await cookies()).get('mehfilbox_locale')?.value)
  const name = resolveLocalised(title.name, locale)
  const startAt = timestamp ? Number.parseInt(timestamp, 10) : null

  return (
    <>
      <ThemeStyle branding={verdict.catalogue.branding} />
      <WatchScreen
        catalogueSlug={verdict.catalogue.slug}
        titleSlug={title.slug}
        titleId={title.id}
        titleName={name}
        posterUrl={
          title.posterUrl ??
          // The player's own chrome carries the title; the poster frame stays clean.
          posterDataUri({ slug: title.slug, label: '', width: 1600, height: 900 })
        }
        locale={locale}
        startAtS={Number.isFinite(startAt) ? startAt : null}
      />
    </>
  )
}
