import { assertThemeExists, LOOK_FIELDS, presetBodySchema } from '@/lib/admin/presets'
import { requireOperator } from '@/lib/admin/session'
import { getRepository } from '@/lib/db'
import { ApiError } from '@/lib/http/errors'
import { noStore, readJson, route } from '@/lib/http/handler'
import { log } from '@/lib/log'
import { presetSchema } from '@/lib/schema'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * `PATCH|DELETE /api/admin/presets/:id` — change or remove a house style (D-36).
 *
 * **A style a published wedding was made from is frozen.** Its look — layout, branding, language,
 * the code — cannot change and it cannot be deleted, because `catalogues.preset_id` is the record
 * of what the couple was delivered and a style that drifts is a record that lies. The refusal
 * carries the count, and the console's answer is *Duplicate and edit*: the copy is free to change.
 * Renaming and choosing which style is the default touch no wedding, so they always go through.
 */
const patchSchema = presetBodySchema.partial()

function frozenError(count: number): ApiError {
  return new ApiError(
    'FROZEN',
    `${count} published wedding${count === 1 ? ' was' : 's were'} delivered in this style, so its look is fixed. Duplicate it and edit the copy instead.`,
    { fields: { count: String(count) } },
  )
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  return route('admin/presets:update', async () => {
    const { orgId } = await requireOperator()
    const { id } = await params
    const body = await readJson(request, patchSchema)

    const repository = getRepository()
    const existing = await repository.getPreset(id, orgId)
    if (!existing) throw new ApiError('NOT_FOUND', 'House style not found')

    const lookChanged = LOOK_FIELDS.filter(
      (field) => body[field] !== undefined && JSON.stringify(body[field]) !== JSON.stringify(existing[field]),
    )
    if (lookChanged.length > 0) {
      const count = await repository.countPublishedCataloguesOnPreset(id)
      if (count > 0) throw frozenError(count)
      if (body.branding) await assertThemeExists(body.branding)
    }

    const saved = await repository.savePreset(
      presetSchema.parse({ ...existing, ...body, updatedAt: new Date().toISOString() }),
    )
    log.info('house style updated', { orgId, presetId: id, changed: Object.keys(body) })
    return noStore({ preset: saved })
  })
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  return route('admin/presets:delete', async () => {
    const { orgId } = await requireOperator()
    const { id } = await params
    const repository = getRepository()
    const existing = await repository.getPreset(id, orgId)
    if (!existing) throw new ApiError('NOT_FOUND', 'House style not found')

    const count = await repository.countPublishedCataloguesOnPreset(id)
    if (count > 0) throw frozenError(count)

    await repository.deletePreset(id, orgId)
    log.info('house style deleted', { orgId, presetId: id })
    return noStore({ ok: true })
  })
}
