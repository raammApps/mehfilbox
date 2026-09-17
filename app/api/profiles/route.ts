import { randomUUID } from 'node:crypto'
import { z } from 'zod'
import { requireServableCatalogue } from '@/lib/catalogue-access'
import { getRepository } from '@/lib/db'
import { noStore, readJson, route } from '@/lib/http/handler'
import { clientIp, enforce } from '@/lib/http/rate-limit'
import { profileLabelSchema } from '@/lib/schema'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * Profiles are labels, not people (doc 06 §5). `label` is a fixed enum, which is what keeps the
 * entire viewer side of the product free of personal data — and therefore keeps almost all
 * DPDP surface off the highest-traffic path.
 */
const bodySchema = z.object({
  catalogue: z.string().min(1),
  label: profileLabelSchema,
  avatarSeed: z.string().max(40),
})

export async function POST(request: Request) {
  return route('profiles', async () => {
    const body = await readJson(request, bodySchema)
    await enforce(`profiles:${clientIp(request)}`, 20, 60)

    const catalogue = await requireServableCatalogue(body.catalogue)

    const profile = await getRepository().createProfile({
      id: randomUUID(),
      catalogueId: catalogue.id,
      label: body.label,
      avatarSeed: body.avatarSeed || body.label,
      createdAt: new Date().toISOString(),
    })

    return noStore({ profileId: profile.id })
  })
}
