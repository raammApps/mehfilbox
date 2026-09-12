import type { Metadata } from 'next'
import { headers } from 'next/headers'
import { notFound } from 'next/navigation'
import CataloguePage, { generateMetadata as browseMetadata } from '@/app/c/[slug]/page'
import DownloadPage from '@/app/c/[slug]/download/page'
import LockedPage from '@/app/c/[slug]/locked/page'
import PremierePage from '@/app/c/[slug]/premiere/page'
import RenewPage from '@/app/c/[slug]/renew/page'
import WatchPage, { generateMetadata as watchMetadata } from '@/app/c/[slug]/watch/[titleSlug]/page'
import { HOST_HEADER } from '@/lib/address'
import { getRepository } from '@/lib/db'

export const dynamic = 'force-dynamic'

/**
 * A request on somebody's own domain (doc 16 §1).
 *
 * Middleware cannot query the database, so it rewrites an unrecognised host here with the path it
 * carried. This resolves the host to a catalogue — the one a couple's domain serves at its root,
 * or the wedding named by the first segment under a studio's domain — and renders **the same page
 * components** `/c/<wedding>` renders. Nothing is duplicated: the guest tree does not know which
 * host it is on, and `addressFor` keeps its links on this one.
 *
 * Only a request middleware routed here counts. `/d/<anything>` typed on the root host carries no
 * host mark and resolves to nothing.
 */
type Props = {
  params: Promise<{ host: string; rest?: string[] }>
  searchParams: Promise<Record<string, string | undefined>>
}

type Target = { slug: string; rest: string[] }

async function resolve(hostParam: string, rest: string[]): Promise<Target | null> {
  const host = decodeURIComponent(hostParam).toLowerCase()
  if ((await headers()).get(HOST_HEADER) !== host) return null

  const repository = getRepository()
  const domain = await repository.getDomainByHost(host)
  if (!domain || domain.status !== 'active') return null

  if (domain.catalogueId) {
    const catalogue = await repository.getCatalogueById(domain.catalogueId)
    return catalogue ? { slug: catalogue.slug, rest } : null
  }

  // A studio's domain: `films.kalyanam.in/<wedding>[/…]`, for the weddings it serves and no other.
  const [slug, ...more] = rest
  if (!slug) return null
  const catalogue = await repository.getCatalogueBySlug(slug)
  if (!catalogue || !catalogue.servedAt?.startsWith(`https://${host}/`)) return null
  return { slug: catalogue.slug, rest: more }
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { host, rest = [] } = await params
  const target = await resolve(host, rest)
  if (!target) return { title: 'Mehfilbox' }
  if (target.rest.length === 0) return browseMetadata({ params: Promise.resolve({ slug: target.slug }) })
  if (target.rest[0] === 'watch' && target.rest[1]) {
    return watchMetadata({ params: Promise.resolve({ slug: target.slug, titleSlug: target.rest[1] }) })
  }
  return { title: 'Mehfilbox' }
}

export default async function DomainPage({ params, searchParams }: Props) {
  const { host, rest = [] } = await params
  const target = await resolve(host, rest)
  if (!target) notFound()

  const slugParams = Promise.resolve({ slug: target.slug })
  const [first, second] = target.rest

  if (target.rest.length === 0) return <CataloguePage params={slugParams} searchParams={searchParams} />
  if (first === 'watch' && second && target.rest.length === 2) {
    return (
      <WatchPage
        params={Promise.resolve({ slug: target.slug, titleSlug: second })}
        searchParams={searchParams}
      />
    )
  }
  if (target.rest.length === 1) {
    if (first === 'locked') return <LockedPage params={slugParams} />
    if (first === 'renew') return <RenewPage params={slugParams} />
    if (first === 'premiere') return <PremierePage params={slugParams} />
    if (first === 'download') return <DownloadPage params={slugParams} />
  }
  notFound()
}
