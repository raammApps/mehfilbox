import { z } from 'zod'
import { requireEditableCatalogue } from '@/lib/admin/session'
import { revalidateCatalogue } from '@/lib/catalogue-cache'
import { getRepository } from '@/lib/db'
import { ApiError } from '@/lib/http/errors'
import { noStore, readJson, route } from '@/lib/http/handler'
import {
  categorySchema,
  creditSchema,
  localisedRequiredSchema,
  localisedStringSchema,
  posterSourceSchema,
} from '@/lib/schema'
import { getVideoProvider } from '@/lib/video'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const patchSchema = z.object({
  name: localisedRequiredSchema.optional(),
  synopsis: localisedStringSchema.optional(),
  category: categorySchema.optional(),
  credits: z.array(creditSchema).optional(),
  posterUrl: z.string().nullable().optional(),
  posterSource: posterSourceSchema.optional(),
  published: z.boolean().optional(),
  sortOrder: z.number().int().optional(),
})

/** The right to edit is proven through the title's catalogue — never from a body-supplied org. */
async function loadOwned(titleId: string) {
  const title = await getRepository().getTitle(titleId)
  if (!title) throw new ApiError('NOT_FOUND', 'Title not found')
  const { catalogue } = await requireEditableCatalogue(title.catalogueId)
  return { title, catalogue }
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  return route('admin/title:patch', async () => {
    const { id } = await params
    const { title, catalogue } = await loadOwned(id)
    const body = await readJson(request, patchSchema)

    if (body.published && title.status !== 'ready') {
      throw new ApiError('TITLE_NOT_READY', 'This film is still processing, so it cannot be published yet')
    }

    const patch = {
      ...body,
      ...(body.published !== undefined
        ? { publishedAt: body.published ? (title.publishedAt ?? new Date().toISOString()) : null }
        : {}),
      // Choosing a poster by hand pins it, so a later webhook does not overwrite the choice.
      ...(body.posterUrl !== undefined && body.posterSource === undefined
        ? { posterSource: 'custom' as const }
        : {}),
    }

    const updated = await getRepository().updateTitle(id, patch)
    revalidateCatalogue(catalogue.slug)
    return noStore({ title: updated })
  })
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  return route('admin/title:delete', async () => {
    const { id } = await params
    const { title, catalogue } = await loadOwned(id)

    if (title.providerId) {
      // A provider that is already gone must not block the row from being removed.
      await getVideoProvider().deleteAsset(title.providerId).catch(() => {})
    }

    await getRepository().deleteTitle(id)
    revalidateCatalogue(catalogue.slug)
    return noStore({ ok: true })
  })
}
