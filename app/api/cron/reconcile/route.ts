import { NextResponse } from 'next/server'
import { getRepository } from '@/lib/db'
import { revalidateCatalogue } from '@/lib/catalogue-cache'
import { env } from '@/lib/env'
import { route } from '@/lib/http/handler'
import { runJob } from '@/lib/jobs/run'
import { log } from '@/lib/log'
import { alertOps } from '@/lib/notify/alert'
import { getVideoProvider, posterRoute } from '@/lib/video'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * Anything still in a non-terminal state after this long is presumed to have lost its webhook.
 * Configurable because a dead webhook makes the default wrong — see `RECONCILE_STALL_MINUTES`.
 */
const STALL_MINUTES = env.RECONCILE_STALL_MINUTES

/**
 * Nightly reconciliation (doc 05 §8, doc 07 webhooks).
 *
 * Webhooks get lost. A title silently missing from a couple's wedding catalogue is not
 * acceptable, so this polls the provider for anything stuck and settles it either way.
 */
export async function GET(request: Request) {
  return route('cron/reconcile', async () => {
    // Vercel signs cron invocations; anything else is rejected rather than left open.
    // Vercel sends `Authorization: Bearer $CRON_SECRET` — and *no header at all* when
    // CRON_SECRET is unset, which is why a forgotten variable shows up as jobs that never run
    // rather than as an error.
    const expected = `Bearer ${env.CRON_SECRET ?? env.SESSION_SECRET}`
    if (env.NODE_ENV === 'production' && request.headers.get('authorization') !== expected) {
      return new NextResponse(null, { status: 401 })
    }

    const result = await runJob('reconcile', () => reconcile())
    return NextResponse.json(result, { headers: { 'cache-control': 'no-store' } })
  })
}

async function reconcile(): Promise<{ examined: number; settled: number; failed: number }> {
    const repository = getRepository()
    const provider = getVideoProvider()
    const stalled = await repository.listStalledTitles(STALL_MINUTES)

    let settled = 0
    let failed = 0

    for (const title of stalled) {
      if (!title.providerId) {
        await repository.updateTitle(title.id, {
          status: 'failed',
          errorMessage: 'The upload never reached the video provider. Upload this film again.',
        })
        failed += 1
        continue
      }

      try {
        const status = await provider.getStatus(title.providerId)
        // Act only on a verdict. Now that `uploading` rows are examined too, a genuinely
        // in-flight upload — a six-gigabyte film on a slow line can outlast the stall window —
        // must be left alone rather than rewritten with the state it already has.
        if (status.state === 'processing' || status.state === 'uploading') continue

        const candidates = status.posterCandidates.map((file) => posterRoute(title.id, file))

        await repository.updateTitle(title.id, {
          status: status.state,
          durationS: status.durationS ?? title.durationS,
          // The webhook usually does this. When it is lost — the case this job exists for — the
          // title would otherwise keep the size the browser declared at upload forever.
          sizeBytes: status.storageBytes ?? title.sizeBytes,
          posterCandidates: candidates.length ? candidates : title.posterCandidates,
          posterUrl:
            title.posterSource === 'custom' ? title.posterUrl : (candidates[0] ?? title.posterUrl),
          thumbnailsUrl: status.thumbnailsUrl ?? title.thumbnailsUrl,
          errorMessage: status.errorMessage,
        })

        if (status.state === 'ready') {
          settled += 1
          const catalogue = await repository.getCatalogueById(title.catalogueId)
      // `revalidatePath` did nothing here: the guest route reads cookies, so it renders
      // per request and has no route cache to drop. The cached *data* is what needs
      // evicting, and that is keyed by tag.
          if (catalogue) revalidateCatalogue(catalogue.slug)
        } else {
          failed += 1
        }
      } catch (error) {
        // One unreachable asset must not stop the job settling the others.
        log.error('reconcile: provider poll failed', {
          titleId: title.id,
          reason: (error as Error).message,
        })
      }
    }

    log.info('reconcile: complete', { examined: stalled.length, settled, failed })

    /**
     * A settled title is evidence the webhook is not arriving (N-53).
     *
     * This job exists as a safety net, and when it catches something the net has done its work —
     * but the *reason* it had to is that Bunny told us nothing. That is precisely the fault that
     * ran undetected for weeks: the webhook pointed at a dead URL, uploads kept succeeding, and
     * films quietly took an hour to appear instead of a minute. A healthy webhook means this
     * number is zero, so any other number is worth an email.
     *
     * Deliberately not alerting on `failed`: a film the provider could not encode is the
     * operator's problem and already shows in their console. This is about our plumbing.
     */
    if (settled > 0) {
      await alertOps(
        'transcode webhook is not arriving',
        `Reconcile had to settle ${settled} title${settled === 1 ? '' : 's'} the webhook should ` +
          `have. Check the Bunny library's webhook URL against ${env.ROOT_DOMAIN}.`,
      )
    }

    return { examined: stalled.length, settled, failed }
}
