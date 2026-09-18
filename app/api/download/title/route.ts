import { NextResponse } from 'next/server'
import { getCachedBundle } from '@/lib/catalogue-cache'
import { DOWNLOAD_TTL_S, resolveDownloadAccess } from '@/lib/downloads'
import { ApiError } from '@/lib/http/errors'
import { route } from '@/lib/http/handler'
import { log } from '@/lib/log'
import { getVideoProvider } from '@/lib/video'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * `GET /api/download/title?catalogue=<slug>&titleSlug=<slug>` — one film, signed on demand (N-22b).
 *
 * `/api/download` builds a manifest of everything; this exists for the small case — a guest
 * watching one film who wants that one film, without a trip to a page listing forty photographs.
 * Same authorisation as the manifest (`resolveDownloadAccess`, D-43: the passcode never grants
 * this, only the couple's or the studio's own sign-in does), so a title-modal control that is
 * only rendered for an authorised session still cannot be turned into an open redirect by anyone
 * who copies the URL.
 */
export async function GET(request: Request) {
  return route('download/title', async () => {
    const url = new URL(request.url)
    const slug = url.searchParams.get('catalogue')
    const titleSlug = url.searchParams.get('titleSlug')
    if (!slug || !titleSlug) throw new ApiError('VALIDATION_FAILED', 'Which film?')

    const verdict = await resolveDownloadAccess(slug)
    if (verdict.kind === 'missing') throw new ApiError('NOT_FOUND', 'Not found')
    if (verdict.kind === 'locked') throw new ApiError('FORBIDDEN', 'Enter the passcode first')
    if (verdict.kind === 'signin') throw new ApiError('UNAUTHORIZED', 'Sign in to download')

    const bundle = await getCachedBundle(verdict.catalogue)
    const title = bundle.titles.find((candidate) => candidate.slug === titleSlug)
    if (!title?.providerId) throw new ApiError('NOT_FOUND', 'Not found')

    const file = await getVideoProvider()
      .getDownloadUrl({ providerId: title.providerId, ttlS: DOWNLOAD_TTL_S })
      .catch(() => null)
    if (!file) throw new ApiError('NOT_FOUND', 'Not available right now')

    log.info('download: one title', { catalogueId: verdict.catalogue.id, titleId: title.id })
    return NextResponse.redirect(new URL(file.url, request.url), {
      status: 302,
      headers: { 'cache-control': 'no-store' },
    })
  })
}
