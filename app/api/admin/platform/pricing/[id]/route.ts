import { z } from 'zod'
import { recordPlatformAction, requirePlatformAdmin } from '@/lib/admin/platform'
import { getRepository } from '@/lib/db'
import { formatRupees } from '@/lib/format'
import { ApiError } from '@/lib/http/errors'
import { noStore, route } from '@/lib/http/handler'
import { log } from '@/lib/log'
import { CREDIT_PLAN_IDS, MAX_BUNDLE_QUANTITY, MAX_PRICE_PAISE } from '@/lib/plans'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * `POST /api/admin/platform/pricing/:id` — change one line of the price list (N-118, D-61).
 *
 * Exactly one of three things per request, so every audit row says one thing:
 *
 * - `pricePaise` — whole paise, ex-GST. `null` takes the product off sale, which is not zero.
 * - `retail` — the advisory "studios typically charge" range, both ends or `null` for none.
 * - `grants` — the typed credit bundle a purchase hands over. Only the Studio plan has one.
 *
 * A price cannot create a product: an id that is not on the list is a 404, never an insert, so a
 * typo in a URL cannot become a new thing for sale.
 */
const paise = z.number().int().min(0).max(MAX_PRICE_PAISE)

const bodySchema = z
  .object({
    pricePaise: paise.nullable().optional(),
    retail: z
      .object({ minPaise: paise, maxPaise: paise })
      .refine((range) => range.minPaise <= range.maxPaise, {
        message: 'The lower end of the range cannot be above the upper end',
      })
      .nullable()
      .optional(),
    grants: z.record(z.string(), z.number().int().min(0).max(MAX_BUNDLE_QUANTITY)).optional(),
    reason: z.string().max(500).optional(),
  })
  .superRefine((body, ctx) => {
    const changes = [body.pricePaise, body.retail, body.grants].filter((value) => value !== undefined)
    if (changes.length !== 1) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Change one thing at a time: a price, a retail range, or a credit bundle',
      })
    }
    for (const key of Object.keys(body.grants ?? {})) {
      if (!(CREDIT_PLAN_IDS as readonly string[]).includes(key)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['grants', key],
          message: `A credit is for ${CREDIT_PLAN_IDS.join(', ')} — not "${key}"`,
        })
      }
    }
  })

const rupees = (value: number | null) => (value === null ? null : formatRupees(value))

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  return route('platform/pricing', async () => {
    const admin = await requirePlatformAdmin()
    const { id } = await params
    const body = bodySchema.parse(await request.json())

    const repository = getRepository()
    const before = await repository.getPlan(id)
    if (!before) throw new ApiError('NOT_FOUND', 'That is not on the price list')

    const reason = body.reason ? { reason: body.reason } : {}
    const subject = { planId: before.id, name: before.name }
    let action: string
    let detail: Record<string, unknown>
    let updated

    if (body.pricePaise !== undefined) {
      updated = await repository.setPlanPrice(id, body.pricePaise)
      action = body.pricePaise === null ? 'pricing.clear' : 'pricing.set'
      // Paise for the record, rupees for whoever reads it: an audit row has to be unambiguous now
      // and legible in a year, and `199900` is only the first of those.
      detail = {
        ...subject,
        unit: before.unit,
        from: before.pricePaise,
        to: body.pricePaise,
        fromRupees: rupees(before.pricePaise),
        toRupees: rupees(body.pricePaise),
        ...reason,
      }
    } else if (body.retail !== undefined) {
      updated = await repository.setPlanRetail(id, body.retail)
      action = body.retail === null ? 'pricing.retail.clear' : 'pricing.retail.set'
      detail = {
        ...subject,
        from: [before.retailMinPaise, before.retailMaxPaise],
        to: body.retail ? [body.retail.minPaise, body.retail.maxPaise] : null,
        ...reason,
      }
    } else {
      // The superRefine above guarantees `grants` is what is left.
      const grants = body.grants ?? {}
      if (before.kind !== 'partner') {
        throw new ApiError('VALIDATION_FAILED', 'Only the studio plan grants credits')
      }
      updated = await repository.setPlanGrants(id, grants)
      action = 'pricing.grants.set'
      detail = { ...subject, from: before.grants, to: grants, ...reason }
    }

    await recordPlatformAction({ admin, action, org: null, detail })

    log.info('platform: price list changed', { action, planId: before.id, actor: admin.email })

    return noStore({ plan: updated })
  })
}
