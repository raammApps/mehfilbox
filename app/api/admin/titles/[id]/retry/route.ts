import { requireEditableCatalogue } from '@/lib/admin/session'
import { revalidateCatalogue } from '@/lib/catalogue-cache'
import { getRepository } from '@/lib/db'
import { ApiError } from '@/lib/http/errors'
import { noStore, route } from '@/lib/http/handler'
import { log } from '@/lib/log'
import { getVideoProvider, posterRoute } from '@/lib/video'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * Re-poll the provider for a title that failed or got stuck.
 *
 * A failed transcode must never be silently missing from a couple's catalogue (doc 05 §8), so
 * this is the operator-facing half of that promise; the nightly reconciliation job is the
 * automatic half.
 */
export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  return route('admin/title:retry', async () => {
    const { id } = await params
    const title = await getRepository().getTitle(id)
    if (!title) throw new ApiError('NOT_FOUND', 'Title not found')
    const { catalogue } = await requireEditableCatalogue(title.catalogueId)

    if (!title.providerId) {
      throw new ApiError('VALIDATION_FAILED', 'This film was never uploaded. Upload it again.')
    }

    const status = await getVideoProvider().getStatus(title.providerId)
    log.info('title retry polled', { titleId: id, state: status.state })

    const candidates = status.posterCandidates.map((file) => posterRoute(id, file))

    const updated = await getRepository().updateTitle(id, {
      status: status.state,
      durationS: status.durationS ?? title.durationS,
      posterCandidates: candidates.length ? candidates : title.posterCandidates,
      posterUrl:
        title.posterSource === 'custom' ? title.posterUrl : (candidates[0] ?? title.posterUrl),
      thumbnailsUrl: status.thumbnailsUrl ?? title.thumbnailsUrl,
      errorMessage: status.errorMessage,
    })

    revalidateCatalogue(catalogue.slug)
    return noStore({ title: updated })
  })
}
