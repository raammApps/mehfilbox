import { z } from 'zod'
import { requireEditableCatalogue } from '@/lib/admin/session'
import { getRepository } from '@/lib/db'
import { ApiError } from '@/lib/http/errors'
import { noStore, readJson, route } from '@/lib/http/handler'
import { moduleInstanceSchema } from '@/lib/schema'
import { getModule } from '@/modules/registry'

// No cache invalidation here on purpose: this saves *draft* modules, which no guest sees, and
// it fires on every keystroke of the customizer's autosave. Publish is what changes the page.
export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const bodySchema = z.object({ modules: z.array(moduleInstanceSchema) })

/**
 * `PUT /api/admin/catalogues/:id/modules` — the customizer's autosave (doc 07).
 *
 * Writes the whole array to `draft_modules`, **never** to `modules`. An unknown type is a 400,
 * not a silent drop: silently discarding a section an operator can see in their editor is how
 * you lose their trust in the tool.
 */
export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  return route('admin/catalogue:modules', async () => {
    const { id } = await params
    // Owner, or the originating studio inside the couple's support window (doc 16 §3).
    const { catalogue: owned } = await requireEditableCatalogue(id)
    const body = await readJson(request, bodySchema)

    const fields: Record<string, string> = {}

    body.modules.forEach((instance, index) => {
      const definition = getModule(instance.type)
      if (!definition) {
        fields[`modules.${index}.type`] = `Unknown section type "${instance.type}"`
        return
      }
      const parsed = definition.schema.safeParse(instance.config)
      if (!parsed.success) {
        fields[`modules.${index}.config`] =
          parsed.error.issues[0]?.message ?? 'This section is not configured correctly'
      }
    })

    if (Object.keys(fields).length > 0) {
      throw new ApiError('VALIDATION_FAILED', 'Some sections are not valid', { fields })
    }

    // Order is derived from array position, so a reorder cannot leave two sections claiming
    // the same slot.
    const normalised = body.modules.map((instance, index) => ({ ...instance, order: index }))

    const catalogue = await getRepository().updateCatalogue(id, owned.orgId, {
      draftModules: normalised,
    })

    return noStore({ draftModules: catalogue.draftModules, savedAt: new Date().toISOString() })
  })
}
