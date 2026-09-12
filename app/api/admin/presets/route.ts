import { randomUUID } from 'node:crypto'
import { z } from 'zod'
import { assertThemeExists, presetBodySchema, presetFromCatalogue } from '@/lib/admin/presets'
import { requireOperator, requireOwnedCatalogue } from '@/lib/admin/session'
import { getRepository } from '@/lib/db'
import { ApiError } from '@/lib/http/errors'
import { noStore, readJson, route } from '@/lib/http/handler'
import { log } from '@/lib/log'
import { presetSchema } from '@/lib/schema'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * `GET|POST /api/admin/presets` — a studio's house styles (D-36, doc 16 §5).
 *
 * Three ways a style comes to exist, and they are one route because they produce one thing: the
 * fields typed in; a catalogue's published look, captured (`fromCatalogueId`); or a copy of a
 * style that is frozen (`duplicateOf`). The org is the session's, never the body's — a studio
 * can only ever see and shape its own.
 */
const createSchema = presetBodySchema.extend({
  fromCatalogueId: z.string().uuid().optional(),
  duplicateOf: z.string().uuid().optional(),
})

export async function GET() {
  return route('admin/presets:list', async () => {
    const { orgId } = await requireOperator()
    return noStore({ presets: await getRepository().listPresets(orgId) })
  })
}

export async function POST(request: Request) {
  return route('admin/presets:create', async () => {
    const { orgId } = await requireOperator()
    const body = await readJson(request, createSchema)
    const repository = getRepository()
    const now = new Date().toISOString()

    let preset
    if (body.fromCatalogueId) {
      // Ownership is checked the way every catalogue route checks it: 404 for anyone else's.
      const { catalogue } = await requireOwnedCatalogue(body.fromCatalogueId)
      preset = presetFromCatalogue(catalogue, body.name, orgId)
      preset.isDefault = body.isDefault
    } else if (body.duplicateOf) {
      const source = await repository.getPreset(body.duplicateOf, orgId)
      if (!source) throw new ApiError('NOT_FOUND', 'House style not found')
      preset = presetSchema.parse({
        ...source,
        id: randomUUID(),
        name: body.name,
        isDefault: body.isDefault,
        createdAt: now,
        updatedAt: now,
      })
    } else {
      await assertThemeExists(body.branding)
      preset = presetSchema.parse({ ...body, id: randomUUID(), orgId, createdAt: now, updatedAt: now })
    }

    const saved = await repository.savePreset(preset)
    log.info('house style created', { orgId, presetId: saved.id, from: body.fromCatalogueId ? 'catalogue' : body.duplicateOf ? 'duplicate' : 'form' })
    return noStore({ preset: saved }, 201)
  })
}
