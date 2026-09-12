import { recordPlatformAction, requirePlatformAdmin } from '@/lib/admin/platform'
import { getRepository } from '@/lib/db'
import { activate } from '@/lib/domains'
import { ApiError } from '@/lib/http/errors'
import { noStore, route } from '@/lib/http/handler'
import { log } from '@/lib/log'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * `POST /api/admin/platform/domains/:id/attached` — a person attached the domain at the host
 * (doc 16 §1, §8). The write for the deployment with no `DomainProvider`: DNS is verified, we
 * added the domain to the project by hand, and this is us saying so, on the record.
 */
export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  return route('platform/domain:attached', async () => {
    const admin = await requirePlatformAdmin()
    const { id } = await params
    const repository = getRepository()
    const domain = await repository.getDomainById(id)
    if (!domain) throw new ApiError('NOT_FOUND', 'Domain not found')
    if (domain.status === 'pending') {
      throw new ApiError('VALIDATION_FAILED', 'DNS has not been verified for this domain yet')
    }
    const org = await repository.getOrg(domain.orgId)

    const active = domain.status === 'active' ? domain : await activate(domain)
    await recordPlatformAction({
      admin,
      action: 'domain.attach',
      org: org ? { id: org.id, slug: org.slug } : null,
      detail: { host: domain.host, catalogueId: domain.catalogueId },
    })
    log.info('platform: domain attached', { host: domain.host, actor: admin.email })
    return noStore({ domain: active })
  })
}
