import { requireOperator } from '@/lib/admin/session'
import { getRepository } from '@/lib/db'
import { deactivate } from '@/lib/domains'
import { ApiError } from '@/lib/http/errors'
import { noStore, route } from '@/lib/http/handler'
import { log } from '@/lib/log'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/** `DELETE /api/admin/domains/:id` — back to the mehfilbox path for everything the domain served. */
export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  return route('admin/domains:delete', async () => {
    const { orgId } = await requireOperator()
    const { id } = await params
    const repository = getRepository()
    const domain = await repository.getDomain(id, orgId)
    if (!domain) throw new ApiError('NOT_FOUND', 'Domain not found')

    await deactivate(domain)
    await repository.deleteDomain(id, orgId)
    log.info('domain removed', { orgId, host: domain.host })
    return noStore({ ok: true })
  })
}
