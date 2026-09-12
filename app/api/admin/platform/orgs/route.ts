import { z } from 'zod'
import { MAX_GRANT } from '@/lib/admin/credits'
import { recordPlatformAction, requirePlatformAdmin } from '@/lib/admin/platform'
import { createStudio } from '@/lib/admin/platform-accounts'
import { noStore, readJson, route } from '@/lib/http/handler'
import { log } from '@/lib/log'
import { localeSchema } from '@/lib/schema'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * `POST /api/admin/platform/orgs` — create a studio from the platform console (D-39).
 *
 * For the studio that was sold over the phone and would rather not fill in a form: the org, its
 * first operator, a set-password link in their inbox, and — when the sale included them — its
 * opening credits, in one recorded action. Self-registration stays open beside it.
 */
const bodySchema = z.object({
  name: z.string().trim().min(2).max(80),
  email: z.string().email(),
  contactName: z.string().trim().min(2).max(80),
  locale: localeSchema.default('en'),
  credits: z.number().int().min(0).max(MAX_GRANT).default(0),
  reason: z.string().trim().max(500).optional(),
})

export async function POST(request: Request) {
  return route('platform/orgs:create', async () => {
    const admin = await requirePlatformAdmin()
    const body = await readJson(request, bodySchema)

    const { org, operator, link } = await createStudio({ admin, ...body })

    await recordPlatformAction({
      admin,
      action: 'org.create',
      org: { id: org.id, slug: org.slug },
      detail: {
        email: operator.email,
        credits: body.credits,
        ...(body.reason ? { reason: body.reason } : {}),
      },
    })
    log.info('platform: studio created', { orgId: org.id, slug: org.slug, actor: admin.email })

    return noStore({ org, operator: { id: operator.id, email: operator.email }, link }, 201)
  })
}
