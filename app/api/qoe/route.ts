import { NextResponse } from 'next/server'
import { z } from 'zod'
import { requireServableCatalogue } from '@/lib/catalogue-access'
import { PLAYBACK_START_MS, REBUFFER_RATIO } from '@/lib/budgets'
import { route } from '@/lib/http/handler'
import { clientIp, enforce } from '@/lib/http/rate-limit'
import { log } from '@/lib/log'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * Playback quality-of-experience beacons.
 *
 * doc 05 §6: "Playback start time is the metric the product lives or dies on", with a p75 under
 * 1.5s on 4G and a rebuffer ratio under 1%. Doc 01 §8 puts targets on both. Until now they were
 * constants in `lib/budgets.ts` and nothing produced a number — a target nobody measures is a
 * wish.
 *
 * This is deliberately not a page-view analytics endpoint. It records three facts about
 * playback and nothing about the guest: no id, no session, no user agent string beyond a coarse
 * connection label. Doc 06 §5 keeps the viewer side free of personal data and that constraint
 * does not get relaxed for telemetry.
 */
const bodySchema = z.object({
  catalogue: z.string().min(1),
  titleId: z.string().uuid(),
  event: z.enum(['start', 'rebuffer', 'error']),
  /** Press-play → first frame, milliseconds. Only on `start`. */
  startMs: z.number().int().nonnegative().max(120_000).optional(),
  /** Cumulative seconds spent rebuffering, and seconds watched, for the ratio. */
  stalledS: z.number().nonnegative().max(86_400).optional(),
  watchedS: z.number().nonnegative().max(86_400).optional(),
  /** `4g`, `3g`, `slow-2g`, `wifi`, `unknown` — coarse by design. */
  connection: z.string().max(12).optional(),
  reason: z.string().max(120).optional(),
})

export async function POST(request: Request) {
  return route('qoe', async () => {
    let body: z.infer<typeof bodySchema>
    try {
      body = bodySchema.parse(await request.json())
    } catch {
      // A malformed beacon is never worth a 4xx to a player mid-playback.
      return new NextResponse(null, { status: 204 })
    }

    await enforce(`qoe:${clientIp(request)}`, 120, 60)

    // Still authorise: this endpoint should not confirm that an unknown catalogue exists.
    const catalogue = await requireServableCatalogue(body.catalogue)

    if (body.event === 'start' && body.startMs !== undefined) {
      // One line per playback start. p75 is computed from these — the number doc 01 §8 targets.
      log.info('qoe.playback_start', {
        catalogueId: catalogue.id,
        titleId: body.titleId,
        startMs: body.startMs,
        connection: body.connection ?? 'unknown',
        // Pre-computed so an alert can filter on a boolean rather than parse a threshold.
        overBudget: body.startMs > PLAYBACK_START_MS,
      })
    }

    if (body.event === 'rebuffer' && body.watchedS && body.watchedS > 0) {
      const ratio = (body.stalledS ?? 0) / body.watchedS
      log.info('qoe.rebuffer', {
        catalogueId: catalogue.id,
        titleId: body.titleId,
        ratio: Number(ratio.toFixed(4)),
        watchedS: Math.round(body.watchedS),
        connection: body.connection ?? 'unknown',
        overBudget: ratio > REBUFFER_RATIO,
      })
    }

    if (body.event === 'error') {
      log.warn('qoe.playback_error', {
        catalogueId: catalogue.id,
        titleId: body.titleId,
        reason: body.reason ?? 'unknown',
        connection: body.connection ?? 'unknown',
      })
    }

    return new NextResponse(null, { status: 204 })
  })
}
