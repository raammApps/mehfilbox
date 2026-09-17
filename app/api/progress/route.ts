import { NextResponse } from 'next/server'
import { z } from 'zod'
import { requireServableCatalogue } from '@/lib/catalogue-access'
import { getRepository } from '@/lib/db'
import { noStore, readJson, route } from '@/lib/http/handler'
import { clientIp, enforce } from '@/lib/http/rate-limit'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/** Past this fraction a title counts as finished and leaves Continue Watching (doc 07). */
export const COMPLETION_THRESHOLD = 0.95
/** A play only counts toward analytics past this much watched (doc 06 §3). */
export const COUNTED_PLAY_S = 30

const bodySchema = z.object({
  catalogue: z.string().min(1),
  profileId: z.string().uuid(),
  titleId: z.string().uuid(),
  positionS: z.number().int().nonnegative(),
  deltaS: z.number().int().nonnegative().max(120),
  durationS: z.number().int().positive(),
})

/**
 * The 10-second heartbeat. Returns 204 and never blocks playback — a failed heartbeat is a
 * lost data point, not a broken film.
 */
export async function POST(request: Request) {
  return route('progress', async () => {
    const body = await readJson(request, bodySchema)

    await enforce(`progress:${clientIp(request)}`, 240, 60)

    const catalogue = await requireServableCatalogue(body.catalogue)
    const repository = getRepository()

    const [profile, title] = await Promise.all([
      repository.getProfile(body.profileId),
      repository.getTitle(body.titleId),
    ])

    // Both must belong to this catalogue. No cross-catalogue write is possible from here.
    if (!profile || profile.catalogueId !== catalogue.id) return new NextResponse(null, { status: 204 })
    if (!title || title.catalogueId !== catalogue.id) return new NextResponse(null, { status: 204 })

    const completed = body.positionS / body.durationS >= COMPLETION_THRESHOLD
    // Read before the upsert: this is what decides whether the play has just crossed the
    // 30-second bar and should count once.
    const previous = await repository.getProgress(profile.id, title.id)

    await repository.upsertProgress({
      profileId: profile.id,
      titleId: title.id,
      positionS: body.positionS,
      durationS: body.durationS,
      completed,
      updatedAt: new Date().toISOString(),
    })

    if (body.deltaS > 0) {
      await repository.recordPlayEvent({
        catalogueId: catalogue.id,
        titleId: title.id,
        profileId: profile.id,
        seconds: body.deltaS,
      })

      // Counting impressions would make the analytics a vanity number (doc 06 §3).
      const crossedThreshold =
        body.positionS >= COUNTED_PLAY_S && (previous?.positionS ?? 0) < COUNTED_PLAY_S
      if (crossedThreshold) {
        await repository.updateTitle(title.id, { viewCount: title.viewCount + 1 })
      }
    }

    return new NextResponse(null, { status: 204 })
  })
}

/** Resume positions for one profile, used to hydrate progress bars after the gate. */
export async function GET(request: Request) {
  return route('progress:list', async () => {
    const profileId = new URL(request.url).searchParams.get('profileId')
    if (!profileId) return noStore({ progress: [] })
    return noStore({ progress: await getRepository().listProgress(profileId) })
  })
}
