import { z } from 'zod'
import { recordPlatformAction, requirePlatformAdmin } from '@/lib/admin/platform'
import { addOperator } from '@/lib/admin/platform-accounts'
import { noStore, readJson, route } from '@/lib/http/handler'
import { log } from '@/lib/log'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * `POST /api/admin/platform/operators` — add a person who can sign in to an org (D-39).
 *
 * The recovery for the org that lost its only operator, and the second seat a studio asks for
 * by email. A set-password link goes to the new address; nobody here chooses their password.
 */
const bodySchema = z.object({
  orgId: z.string().uuid(),
  email: z.string().email(),
  name: z.string().trim().min(2).max(80),
  role: z.enum(['admin', 'uploader']).default('admin'),
})

export async function POST(request: Request) {
  return route('platform/operators:create', async () => {
    const admin = await requirePlatformAdmin()
    const body = await readJson(request, bodySchema)

    const { org, operator, link } = await addOperator(body)

    await recordPlatformAction({
      admin,
      action: 'operator.create',
      org: { id: org.id, slug: org.slug },
      detail: { email: operator.email, role: operator.role },
    })
    log.info('platform: operator added', { orgId: org.id, operatorId: operator.id, actor: admin.email })

    return noStore({ operator: { id: operator.id, email: operator.email, role: operator.role }, link }, 201)
  })
}
