import { z } from 'zod'
import { requireOperator } from '@/lib/admin/session'
import { getRepository } from '@/lib/db'
import { env } from '@/lib/env'
import { ApiError } from '@/lib/http/errors'
import { noStore, readJson, route } from '@/lib/http/handler'
import { log } from '@/lib/log'
import { enqueue } from '@/lib/notify/send'
import { rootUrl } from '@/lib/tenant'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * `POST /api/admin/credits/request` — a studio with none left asks for one (D-38).
 *
 * Until online payment lands (N-20), "the way to add one" is a message the platform sees and
 * answers by granting from the console. It goes through the notification queue like every other
 * message, and one per studio per day: a studio that clicks four times sends one email.
 */
const bodySchema = z.object({ catalogueId: z.string().uuid().optional() })

export async function POST(request: Request) {
  return route('admin/credits:request', async () => {
    const session = await requireOperator()
    const body = await readJson(request, bodySchema).catch(() => ({ catalogueId: undefined }))
    const repository = getRepository()

    const org = await repository.getOrg(session.orgId)
    if (!org) throw new ApiError('NOT_FOUND', 'Org not found')
    const catalogue = body.catalogueId
      ? await repository.getCatalogue(body.catalogueId, session.orgId)
      : null
    const balance = await repository.creditBalance(session.orgId, new Date().toISOString())

    const day = new Date().toISOString().slice(0, 10)
    const queued = await enqueue({
      template: 'credit-request',
      channel: 'email',
      address: env.SUPPORT_EMAIL,
      // Addressed to us, so English regardless of the studio's language.
      locale: 'en',
      orgId: org.id,
      catalogueId: catalogue?.id ?? null,
      dedupeKey: `credit-request:${org.id}:${day}`,
      params: {
        studio: org.name,
        slug: org.slug,
        couple: catalogue?.coupleName.en ?? 'a wedding',
        email: session.operator.email,
        available: balance.available,
        consumed: balance.consumed,
        url: rootUrl(env.ROOT_DOMAIN, `/admin/platform/orgs/${org.id}`),
      },
    })

    log.info('credit requested', { orgId: org.id, queued: queued !== null })
    return noStore({ requested: true, repeated: queued === null, balance })
  })
}
