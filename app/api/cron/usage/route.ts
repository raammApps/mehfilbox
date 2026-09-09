import { NextResponse } from 'next/server'
import { getRepository } from '@/lib/db'
import { env } from '@/lib/env'
import { route } from '@/lib/http/handler'
import { log } from '@/lib/log'
import { reportError } from '@/lib/observability'
import { getVideoProvider } from '@/lib/video'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * Per-catalogue usage rollup and the delivery alert.
 *
 * doc 05 §2 is explicit that these are to be built rather than documented: "per-catalogue
 * monthly usage recorded and visible in admin" and "alert at 300 GB delivered in a month". The
 * `usage_rollup` table and `provider.getUsage()` both existed already and nothing called them,
 * which is the worst state for a guardrail to be in — it reads as done.
 *
 * The alert is about *knowing*, not billing. At roughly ₹150 per catalogue per year, 300GB
 * either means the couple is flaunting it hard (good, and worth knowing) or the link has leaked
 * (worth acting on). Those need different responses, so the job reports rather than reacts.
 */

/** doc 05 §2. Delivered gigabytes in a calendar month, per catalogue. */
export const DELIVERY_ALERT_GB = 300

export async function GET(request: Request) {
  return route('cron/usage', async () => {
    // Vercel sends `Authorization: Bearer $CRON_SECRET` — and *no header at all* when
    // CRON_SECRET is unset, which is why a forgotten variable shows up as jobs that never run
    // rather than as an error.
    const expected = `Bearer ${env.CRON_SECRET ?? env.SESSION_SECRET}`
    if (env.NODE_ENV === 'production' && request.headers.get('authorization') !== expected) {
      return new NextResponse(null, { status: 401 })
    }

    const repository = getRepository()
    const provider = getVideoProvider()
    const month = new Date().toISOString().slice(0, 7) + '-01'

    // Org-agnostic: this is an operations job, not an operator request, so it walks every
    // catalogue rather than one org's. It is the only place that legitimately does.
    const catalogues = await repository.listAllCatalogues()

    let examined = 0
    let alerted = 0

    for (const catalogue of catalogues) {
      try {
        const titles = await repository.listTitles(catalogue.id)
        let storedGb = 0
        let deliveredGb = 0
        let watchSeconds = 0

        for (const title of titles) {
          if (!title.providerId) continue
          const usage = await provider.getUsage(title.providerId)
          storedGb += usage.storedGb
          deliveredGb += usage.deliveredGb
          watchSeconds += usage.watchSeconds
        }

        await repository.upsertUsage({
          catalogueId: catalogue.id,
          month,
          storedGb: Number(storedGb.toFixed(3)),
          deliveredGb: Number(deliveredGb.toFixed(3)),
          // Kept beside the derived figure (N-25): if the bitrate assumption is ever corrected,
          // history can be recomputed instead of being wrong forever.
          watchSeconds: Math.round(watchSeconds),
        })
        examined += 1

        if (deliveredGb >= DELIVERY_ALERT_GB) {
          alerted += 1
          // Deliberately `warn`, not `error`: this is not a fault. It is a fact someone should
          // look at, and it should be alertable without polluting the error budget.
          log.warn('usage.delivery_alert', {
            catalogueId: catalogue.id,
            slug: catalogue.slug,
            month,
            deliveredGb: Number(deliveredGb.toFixed(1)),
            thresholdGb: DELIVERY_ALERT_GB,
            note: 'either it is being flaunted hard or the link leaked — both worth knowing',
          })
        }
      } catch (error) {
        // One unreachable catalogue must not stop the rest being rolled up.
        reportError(error, { scope: 'cron/usage', catalogueId: catalogue.id }, 'warning')
      }
    }

    log.info('usage rollup complete', { examined, alerted, month })
    return NextResponse.json(
      { examined, alerted, month },
      { headers: { 'cache-control': 'no-store' } },
    )
  })
}
