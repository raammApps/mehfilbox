import { NextResponse } from 'next/server'
import { loadBundle, resolveAccess } from '@/lib/catalogue-access'
import { env } from '@/lib/env'
import { route } from '@/lib/http/handler'
import { runJob } from '@/lib/jobs/run'
import { log } from '@/lib/log'
import { alertOps } from '@/lib/notify/alert'
import { getVideoProvider } from '@/lib/video'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * Walk a guest's path to a playing film, and complain when it breaks (N-53, D-24).
 *
 * **`/api/health` proves the app booted. It does not prove anyone can watch anything.** It reports
 * which drivers are configured, which is exactly the check that stayed green through every real
 * fault this product has had: the webhook pointing at a dead URL, the storage column nothing
 * wrote, the SMTP credential that authenticated but could not send. A green health endpoint next
 * to a broken product is worse than no endpoint, because it is consulted and believed.
 *
 * So this does the four things a guest does, against real data, and each can fail on its own:
 *
 *   1. resolve the catalogue — the authorisation path every guest route shares
 *   2. load its bundle — the cached read that feeds the page
 *   3. find a film that claims to be ready
 *   4. mint a playback token for it — the step that actually gates playing
 *
 * It stops short of fetching the manifest from the CDN. That would be the last honest mile, and it
 * would also make a Bunny edge hiccup page us about our own app; the token is where our
 * responsibility ends and theirs begins.
 */
type Step = { step: string; ok: boolean; detail?: string }

export async function GET(request: Request) {
  return route('cron/synthetic', async () => {
    const expected = `Bearer ${env.CRON_SECRET ?? env.SESSION_SECRET}`
    if (env.NODE_ENV === 'production' && request.headers.get('authorization') !== expected) {
      return new NextResponse(null, { status: 401 })
    }

    // Recorded as a job run either way (D-40): the job ran; whether the guest path did is `ok`.
    const { steps } = await runJob('synthetic', async () => {
      const walked = await walk()
      return { ok: walked.every((step) => step.ok), steps: walked }
    })
    return respond(steps)
  })
}

/** The four things a guest does, in order, stopping at the first that fails. */
async function walk(): Promise<Step[]> {
  const slug = env.DEMO_CATALOGUE_SLUG
  const steps: Step[] = []
  const fail = (step: string, detail: string) => {
    steps.push({ step, ok: false, detail })
    return steps
  }

  const verdict = await resolveAccess(slug)
  if (verdict.kind !== 'ok') {
    // 'locked' is a pass in one sense — the app worked — but this check exists to be run
    // against a catalogue a guest can open, so anything but `ok` means it is pointed at the
    // wrong catalogue or the catalogue has changed underneath us. Both are worth knowing.
    return fail('resolve', `catalogue "${slug}" resolved as ${verdict.kind}`)
  }
  steps.push({ step: 'resolve', ok: true })

  const bundle = await loadBundle(verdict.catalogue)
  steps.push({ step: 'bundle', ok: true, detail: `${bundle.titles.length} titles` })

  const playable = bundle.titles.find((t) => t.status === 'ready' && t.providerId)
  if (!playable) {
    return fail('film', `no ready film with a provider id in "${slug}"`)
  }
  steps.push({ step: 'film', ok: true, detail: playable.slug })

  try {
    const ticket = await getVideoProvider().getPlaybackToken({
      providerId: playable.providerId!,
      scope: { catalogueId: verdict.catalogue.id, titleId: playable.id },
      ttlS: 60,
    })
    if (!ticket.playbackUrl) return fail('playback', 'no playback URL was issued')
    steps.push({ step: 'playback', ok: true })
  } catch (error) {
    return fail('playback', (error as Error).message)
  }

  return steps
}

async function respond(steps: Step[]): Promise<NextResponse> {
  const broken = steps.find((s) => !s.ok)
  if (broken) {
    log.error('synthetic: guest path is broken', { step: broken.step, detail: broken.detail })
    await alertOps(
      'a guest cannot play a film',
      `The synthetic check failed at "${broken.step}": ${broken.detail}. ` +
        `/api/health will still be green — it reports drivers, not whether anyone can watch.`,
    )
  }
  return NextResponse.json(
    { ok: !broken, steps },
    { status: broken ? 503 : 200, headers: { 'cache-control': 'no-store' } },
  )
}
