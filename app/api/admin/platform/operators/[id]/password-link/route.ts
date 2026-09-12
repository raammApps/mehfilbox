import { recordPlatformAction, requirePlatformAdmin } from '@/lib/admin/platform'
import { sendCredentialLink } from '@/lib/auth/credential-links'
import { getRepository } from '@/lib/db'
import { ApiError } from '@/lib/http/errors'
import { noStore, route } from '@/lib/http/handler'
import { log } from '@/lib/log'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * `POST /api/admin/platform/operators/:id/password-link` — send anyone a set-password link (D-39).
 *
 * The support answer to "I can't get in" for a studio or a couple, without the forgot-password
 * form's silence: the platform knows the account exists, so the link is queued and returned.
 */
export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  return route('platform/operator:password-link', async () => {
    const admin = await requirePlatformAdmin()
    const { id } = await params

    const repository = getRepository()
    const operator = await repository.getOperator(id)
    if (!operator) throw new ApiError('NOT_FOUND', 'Operator not found')
    const org = await repository.getOrg(operator.orgId)

    const { url } = await sendCredentialLink(operator, 'set-password')

    await recordPlatformAction({
      admin,
      action: 'operator.password-link',
      org: org ? { id: org.id, slug: org.slug } : null,
      detail: { email: operator.email },
    })
    log.info('platform: password link sent', { operatorId: operator.id, actor: admin.email })

    return noStore({ sent: true, email: operator.email, link: url })
  })
}
