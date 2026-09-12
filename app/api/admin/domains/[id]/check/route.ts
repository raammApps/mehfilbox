import { requireOperator } from '@/lib/admin/session'
import { getRepository } from '@/lib/db'
import { checkAndAdvance, instructionsOf } from '@/lib/domains'
import { ApiError } from '@/lib/http/errors'
import { noStore, route } from '@/lib/http/handler'
import { log } from '@/lib/log'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * `POST /api/admin/domains/:id/check` — "Check DNS" (doc 16 §1).
 *
 * Resolves the records from the server and says what it saw. Both records right moves the domain
 * to `verified`; with a provider configured it is attached at once and goes `active`, and every
 * URL the product prints for what it serves changes on the spot.
 */
export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  return route('admin/domains:check', async () => {
    const { orgId } = await requireOperator()
    const { id } = await params
    const existing = await getRepository().getDomain(id, orgId)
    if (!existing) throw new ApiError('NOT_FOUND', 'Domain not found')

    const { domain, check } = await checkAndAdvance(existing)
    log.info('domain checked', { host: domain.host, status: domain.status, verified: check.verified })
    return noStore({ domain, check, instructions: instructionsOf(domain) })
  })
}
