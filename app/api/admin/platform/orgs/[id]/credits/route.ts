import { z } from 'zod'
import { makeCredits, MAX_GRANT } from '@/lib/admin/credits'
import { recordPlatformAction, requirePlatformAdmin } from '@/lib/admin/platform'
import { getRepository } from '@/lib/db'
import { ApiError } from '@/lib/http/errors'
import { noStore, readJson, route } from '@/lib/http/handler'
import { log } from '@/lib/log'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * `POST /api/admin/platform/orgs/:id/credits` — grant a studio credits (D-38, D-39).
 *
 * The platform's answer to a credit request until payment is online: a count, a reason on the
 * audit row, and rows in `credits` that read as their own receipt. Granting is additive only —
 * there is no "take credits away" here, because a credit a studio was told it had is a promise.
 */
const bodySchema = z.object({
  count: z.number().int().min(1).max(MAX_GRANT),
  reason: z.string().trim().min(1).max(500),
})

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  return route('platform/org:credits', async () => {
    const admin = await requirePlatformAdmin()
    const { id } = await params
    const body = await readJson(request, bodySchema)

    const repository = getRepository()
    const org = await repository.getOrg(id)
    if (!org) throw new ApiError('NOT_FOUND', 'Org not found')

    const granted = await repository.grantCredits(
      makeCredits({ orgId: org.id, count: body.count, grantedBy: admin.email, reason: body.reason }),
    )

    await recordPlatformAction({
      admin,
      action: 'credits.grant',
      org: { id: org.id, slug: org.slug },
      detail: { count: body.count, reason: body.reason },
    })
    log.info('platform: credits granted', { orgId: org.id, count: body.count, actor: admin.email })

    const balance = await repository.creditBalance(org.id, new Date().toISOString())
    return noStore({ granted: granted.length, balance }, 201)
  })
}
