import { z } from 'zod'
import { requireEditableCatalogue } from '@/lib/admin/session'
import { getRepository } from '@/lib/db'
import { resolveLimits, storageUsage } from '@/lib/entitlements'
import { env } from '@/lib/env'
import { noStore, readJson, route } from '@/lib/http/handler'
import { log } from '@/lib/log'
import { enqueue } from '@/lib/notify/send'
import { rootUrl } from '@/lib/tenant'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * `POST /api/admin/storage/request` — a studio (or a couple, from a support window) out of room
 * asks for more (N-79, D-60). Credits already have this shape (`credits/request`); this is the
 * catalogue-scoped version quota needed once a tier made it possible for one wedding to be full
 * while the rest of a studio's are nowhere near it.
 */
const bodySchema = z.object({ catalogueId: z.string().uuid() })

export async function POST(request: Request) {
  return route('admin/storage:request', async () => {
    const body = await readJson(request, bodySchema)
    const { catalogue } = await requireEditableCatalogue(body.catalogueId)
    const repository = getRepository()

    const [org, grants, usedBytes] = await Promise.all([
      repository.getOrg(catalogue.orgId),
      repository.getEntitlements(catalogue.id, catalogue.orgId),
      repository.catalogueStorageBytes(catalogue.id),
    ])
    const usage = storageUsage(usedBytes, resolveLimits(grants.catalogue, grants.org))

    const day = new Date().toISOString().slice(0, 10)
    const queued = await enqueue({
      template: 'storage-request',
      channel: 'email',
      address: env.SUPPORT_EMAIL,
      // Addressed to us, so English regardless of the studio's language.
      locale: 'en',
      orgId: catalogue.orgId,
      catalogueId: catalogue.id,
      dedupeKey: `storage-request:${catalogue.id}:${day}`,
      params: {
        studio: org?.name ?? 'a studio',
        slug: catalogue.slug,
        couple: catalogue.coupleName.en,
        usedGb: usage.usedGb.toFixed(1),
        limitGb: String(usage.limitGb),
        url: rootUrl(env.ROOT_DOMAIN, `/admin/platform/catalogues/${catalogue.id}`),
      },
    })

    log.info('storage requested', { catalogueId: catalogue.id, queued: queued !== null })
    return noStore({ requested: true, repeated: queued === null })
  })
}
