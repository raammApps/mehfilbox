import { z } from 'zod'
import { getOperatorSession } from '@/lib/admin/session'
import { requireServableCatalogue } from '@/lib/catalogue-access'
import { getRepository } from '@/lib/db'
import { env } from '@/lib/env'
import { ApiError } from '@/lib/http/errors'
import { noStore, readJson, route } from '@/lib/http/handler'
import { clientIp, enforce } from '@/lib/http/rate-limit'
import { getVideoProvider } from '@/lib/video'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const bodySchema = z.object({
  catalogue: z.string().min(1),
  titleSlug: z.string().min(1),
  profileId: z.string().uuid().nullish(),
})

/**
 * `POST /api/playback/token` — the endpoint the core metric runs through (doc 07).
 *
 * Target p99 under 120ms, so it does exactly three things: authorise, mint, and look up the
 * resume position. Nothing else belongs here.
 */
export async function POST(request: Request) {
  return route('playback/token', async () => {
    const body = await readJson(request, bodySchema)

    enforce(`playback:${clientIp(request)}:${body.catalogue}`, 60, 60)

    const catalogue = await requireServableCatalogue(body.catalogue)
    const repository = getRepository()

    const title = await repository.getTitleBySlug(catalogue.id, body.titleSlug)

    /**
     * `live_at`, not `published` alone (N-89b — the twin of N-89a, one layer up). `published` is
     * the operator's tick; `live_at` is whether a Publish actually carried the film to guests.
     * Gating on `published` alone meant a ticked-but-unpublished film could mint a working,
     * TTL'd playback URL to anyone who knew its slug, on any catalogue that had ever been
     * published once — independent of whether *this* film had.
     *
     * The customizer's own preview deliberately calls this same endpoint for real
     * (`components/streaming/TitleModal.tsx`'s manifest prefetch, unconditional, no `preview`
     * check — that is what wins the sub-1.5s playback target once Play is actually pressed by a
     * guest), and an operator previewing a film they have ticked but not yet published is the
     * whole reason that prefetch exists. So the guest gate and the owner's gate are different,
     * on purpose: a guest needs `live_at`; an operator whose session's org owns this catalogue
     * needs only the tick, same as the console already shows them.
     *
     * The operator-session lookup only runs when the guest gate has already failed, so a real
     * guest on a live film — the overwhelming majority of calls, and the one this route's own
     * p99 budget is written for — costs nothing extra.
     */
    const knownToGuests = title?.published && title.liveAt !== null
    let allowed = Boolean(knownToGuests)
    if (!allowed && title?.published) {
      const session = await getOperatorSession()
      allowed = session !== null && session.orgId === catalogue.orgId
    }
    if (!title || !allowed) {
      // Indistinguishable from a missing film to anyone this was not for.
      throw new ApiError('CATALOGUE_NOT_FOUND', 'No such film')
    }
    if (title.status !== 'ready' || !title.providerId) {
      throw new ApiError('TITLE_NOT_READY', 'This film is still being prepared')
    }

    const ticket = await getVideoProvider().getPlaybackToken({
      providerId: title.providerId,
      // Bound to catalogue AND title, so one leaked token does not unlock the library.
      scope: { catalogueId: catalogue.id, titleId: title.id },
      ttlS: env.PLAYBACK_TOKEN_TTL_S,
    })

    let resumeAtS = 0
    if (body.profileId) {
      const progress = await repository.getProgress(body.profileId, title.id)
      if (progress && !progress.completed) resumeAtS = progress.positionS
    }

    return noStore({
      playbackUrl: ticket.playbackUrl,
      thumbnailsUrl: ticket.thumbnailsUrl ?? title.thumbnailsUrl,
      durationS: title.durationS,
      resumeAtS,
      expiresAt: ticket.expiresAt,
      captions: title.captions,
    })
  })
}
