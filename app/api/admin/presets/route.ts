import { randomUUID } from 'node:crypto'
import { z } from 'zod'
import { assertThemeExists, presetBodySchema, presetFromCatalogue, presetFromTheme } from '@/lib/admin/presets'
import { requireOperator, requireOwnedCatalogue } from '@/lib/admin/session'
import { getRepository } from '@/lib/db'
import { ApiError } from '@/lib/http/errors'
import { noStore, readJson, route } from '@/lib/http/handler'
import { log } from '@/lib/log'
import { presetSchema } from '@/lib/schema'
import { allThemes } from '@/themes/resolve'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * `GET|POST /api/admin/presets` — a studio's house styles (D-36, doc 16 §5).
 *
 * Four ways a style comes to exist, and they are one route because they produce one thing: the
 * fields typed in; a catalogue's published look, captured (`fromCatalogueId`); a copy of a style
 * that is frozen (`duplicateOf`, a preset id); or a copy of a **theme**, built-in or
 * platform-authored (`duplicateOf`, a theme id — D-57, N-115). The last two share one field
 * because they are the same studio action, "make a copy, edit, save as new," aimed at two kinds
 * of source; the handler below tries a preset first (a UUID the studio owns) and falls back to a
 * theme (checked against the full list, not just enabled ones — a studio duplicating a style
 * already on a withdrawn theme must still be able to duplicate it). The org is the session's,
 * never the body's — a studio can only ever see and shape its own.
 */
const createSchema = presetBodySchema.extend({
  fromCatalogueId: z.string().uuid().optional(),
  duplicateOf: z.string().min(1).max(40).optional(),
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
    let from: 'catalogue' | 'duplicate-style' | 'duplicate-theme' | 'form'
    if (body.fromCatalogueId) {
      // Ownership is checked the way every catalogue route checks it: 404 for anyone else's.
      const { catalogue } = await requireOwnedCatalogue(body.fromCatalogueId)
      preset = presetFromCatalogue(catalogue, body.name, orgId)
      preset.isDefault = body.isDefault
      from = 'catalogue'
    } else if (body.duplicateOf) {
      const source = await repository.getPreset(body.duplicateOf, orgId)
      if (source) {
        preset = presetSchema.parse({
          ...source,
          id: randomUUID(),
          name: body.name,
          isDefault: body.isDefault,
          createdAt: now,
          updatedAt: now,
        })
        from = 'duplicate-style'
      } else {
        const theme = (await allThemes()).find((candidate) => candidate.id === body.duplicateOf)
        if (!theme) throw new ApiError('NOT_FOUND', 'House style or theme not found')
        const org = await repository.getOrg(orgId)
        preset = presetFromTheme(theme, body.name, orgId, org?.branding ?? {}, new Date(now))
        preset.isDefault = body.isDefault
        from = 'duplicate-theme'
      }
    } else {
      await assertThemeExists(body.branding)
      preset = presetSchema.parse({ ...body, id: randomUUID(), orgId, createdAt: now, updatedAt: now })
      from = 'form'
    }

    const saved = await repository.savePreset(preset)
    log.info('house style created', { orgId, presetId: saved.id, from })
    return noStore({ preset: saved }, 201)
  })
}
