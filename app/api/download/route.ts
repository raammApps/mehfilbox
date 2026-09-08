import { NextResponse } from 'next/server'
import { buildManifest, resolveDownloadAccess } from '@/lib/downloads'
import { ApiError } from '@/lib/http/errors'
import { route } from '@/lib/http/handler'
import { log } from '@/lib/log'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * `GET /api/download?catalogue=<slug>` — every film and photograph, as signed links (N-22).
 *
 * A manifest rather than a zip: a 40 GB archive assembled inside a serverless function is not a
 * thing that works, and pretending otherwise would fail at exactly the moment a couple needed it.
 *
 * **It works after expiry, through grace, and from archive.** That is the point rather than a
 * detail — "nothing is ever deleted" appears in the handover email, the FAQ and the pricing page,
 * and it is worth nothing if the couple cannot get their films out once the plan lapses.
 */
export async function GET(request: Request) {
  return route('download/manifest', async () => {
    const slug = new URL(request.url).searchParams.get('catalogue')
    if (!slug) throw new ApiError('VALIDATION_FAILED', 'Which wedding?')

    const verdict = await resolveDownloadAccess(slug)
    if (verdict.kind === 'missing') throw new ApiError('NOT_FOUND', 'Not found')
    if (verdict.kind === 'locked') {
      // The same answer a locked catalogue gives elsewhere: the passcode gates the files as much
      // as it gates the page, and lapsing does not relax it.
      throw new ApiError('FORBIDDEN', 'Enter the passcode first')
    }

    const manifest = await buildManifest(verdict.catalogue)
    log.info('download manifest built', {
      catalogueId: verdict.catalogue.id,
      items: manifest.items.length,
      unavailable: manifest.unavailable,
    })

    return NextResponse.json(manifest, { headers: { 'cache-control': 'no-store' } })
  })
}
