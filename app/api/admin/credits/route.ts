import { requireOperator } from '@/lib/admin/session'
import { getRepository } from '@/lib/db'
import { noStore, route } from '@/lib/http/handler'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/** `GET /api/admin/credits` — this studio's balance and the rows behind it (D-38). */
export async function GET() {
  return route('admin/credits:balance', async () => {
    const { orgId } = await requireOperator()
    const repository = getRepository()
    const [balance, credits] = await Promise.all([
      repository.creditBalance(orgId, new Date().toISOString()),
      repository.listCredits(orgId),
    ])
    return noStore({ balance, credits })
  })
}
