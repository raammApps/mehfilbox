import { z } from 'zod'
import { requireEditableCatalogue } from '@/lib/admin/session'
import { getRepository } from '@/lib/db'
import { noStore, readJson, route } from '@/lib/http/handler'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const bodySchema = z.object({
  catalogueId: z.string().uuid(),
  order: z.array(z.object({ id: z.string().uuid(), sortOrder: z.number().int() })),
})

/** Bulk reorder in one transaction — a half-applied reorder is visible to guests (doc 07). */
export async function POST(request: Request) {
  return route('admin/titles:reorder', async () => {
    const body = await readJson(request, bodySchema)
    const { catalogue } = await requireEditableCatalogue(body.catalogueId)
    await getRepository().reorderTitles(catalogue.id, body.order)
    return noStore({ ok: true })
  })
}
