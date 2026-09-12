import { z } from 'zod'
import { hashSecret } from '@/lib/auth'
import { revalidateCatalogue } from '@/lib/catalogue-cache'
import { getRepository } from '@/lib/db'
import { ApiError } from '@/lib/http/errors'
import { noStore, readJson, route } from '@/lib/http/handler'
import { log } from '@/lib/log'
import { requireCoupleCatalogue } from '@/lib/my/session'
import type { ModuleInstance } from '@/lib/schema'
import { getModule } from '@/modules/registry'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/** Seven days at a time; a window that could be left open for a year is a permanent key. */
const SUPPORT_DAYS = [0, 7, 14] as const

const bodySchema = z
  .object({
    /** A new guest code, or `null` to remove it. Linked and owned alike. */
    passcode: z.string().trim().min(4).max(64).nullable().optional(),
    /** The letter, rewritten. Owned only. */
    letter: z.object({ body: z.string().max(20_000), signature: z.string().max(200) }).optional(),
    /** Sections shown or hidden, config kept. Owned only. */
    sections: z.array(z.object({ id: z.string().min(1), enabled: z.boolean() })).max(50).optional(),
    /** The studio's window: 7 or 14 days from now, or 0 to close it. Owned only. */
    supportDays: z.union([z.literal(0), z.literal(7), z.literal(14)]).optional(),
  })
  .strict()

/**
 * `PATCH /api/my/catalogues/:id` — the six things a couple actually does (D-37), on one route.
 *
 * Live, not draft. The couple has no Publish button and would not want one: a code change that
 * waited for a publish is a code change that did not happen. The letter and the section toggles
 * write to `modules` directly and to `draft_modules` when the studio has one open, so a studio
 * fix in progress does not silently put the old letter back.
 */
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  return route('my/catalogue:patch', async () => {
    const { id } = await params
    const { catalogue, relation, org } = await requireCoupleCatalogue(id)
    const body = await readJson(request, bodySchema)
    const repository = getRepository()
    const owner = catalogue.orgId

    const wantsOwnership = body.letter !== undefined || body.sections !== undefined || body.supportDays !== undefined
    if (wantsOwnership && relation !== 'owned') {
      throw new ApiError(
        'FORBIDDEN',
        'Your studio is still preparing this one. Ask them to make the change, or to hand it over.',
      )
    }

    const patch: Parameters<typeof repository.updateCatalogue>[2] = {}

    if (body.passcode !== undefined) {
      patch.privacy = body.passcode ? 'passcode' : 'unlisted'
      patch.passcodeHash = body.passcode ? hashSecret(body.passcode) : null
      // Everyone holding the old code is signed out by this line (N-71).
      patch.passcodeVersion = catalogue.passcodeVersion + 1
    }

    if (body.letter !== undefined || body.sections !== undefined) {
      // The first section that can be rewritten as prose is "the letter" — decided by the module
      // contract, so no type is named here (`tests/unit/registry.test.ts` holds that line).
      const proseOf = (instance: ModuleInstance) => getModule(instance.type)?.prose ?? null
      if (body.letter && !catalogue.modules.some((m) => proseOf(m))) {
        throw new ApiError('VALIDATION_FAILED', 'This page has no message section to rewrite')
      }

      const apply = (list: ModuleInstance[]): ModuleInstance[] => {
        let rewritten = false
        return list.map((instance) => {
          let next = instance
          const toggle = body.sections?.find((s) => s.id === instance.id)
          if (toggle) next = { ...next, enabled: toggle.enabled }
          const prose = body.letter && !rewritten ? proseOf(next) : null
          if (prose && body.letter) {
            rewritten = true
            const parsed = getModule(next.type)!.schema.safeParse(next.config)
            if (parsed.success) {
              next = {
                ...next,
                config: prose.write(parsed.data, { ...body.letter, locale: org.locale }) as Record<string, unknown>,
              }
            }
          }
          return next
        })
      }

      patch.modules = apply(catalogue.modules)
      // A studio fix in progress must not put the old letter back at its next Publish.
      if (catalogue.draftModules) patch.draftModules = apply(catalogue.draftModules)
    }

    if (body.supportDays !== undefined) {
      if (!SUPPORT_DAYS.includes(body.supportDays)) throw new ApiError('VALIDATION_FAILED', 'Choose 7 or 14 days')
      patch.supportAccessUntil =
        body.supportDays === 0
          ? null
          : new Date(Date.now() + body.supportDays * 24 * 60 * 60 * 1000).toISOString()
    }

    if (Object.keys(patch).length === 0) return noStore({ catalogue })

    const updated = await repository.updateCatalogue(catalogue.id, owner, patch)
    revalidateCatalogue(updated.slug)
    log.info('couple changed their catalogue', {
      catalogueId: catalogue.id,
      relation,
      fields: Object.keys(patch),
    })

    return noStore({ catalogue: updated })
  })
}
