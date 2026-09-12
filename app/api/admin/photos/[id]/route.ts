import { requireEditableCatalogue } from '@/lib/admin/session'
import { revalidateCatalogue } from '@/lib/catalogue-cache'
import { getRepository } from '@/lib/db'
import { ApiError } from '@/lib/http/errors'
import { noStore, readJson, route } from '@/lib/http/handler'
import { getPhotoProvider } from '@/lib/photos'
import { localisedStringSchema } from '@/lib/schema'
import { z } from 'zod'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const patchSchema = z.object({ caption: localisedStringSchema.nullable() })

/**
 * A caption, which had no way of being written at all (N-30).
 *
 * `photoSchema` has carried the field since the beginning and the guest lightbox renders it, so
 * the only thing missing was the means to set one — the manager could upload and delete and
 * nothing else. A field that exists in the schema, renders on the guest page, and cannot be
 * edited is the most confusing kind of gap: it looks like a bug in saving rather than a feature
 * that was never built.
 */
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  return route('admin/photo:update', async () => {
    const { id } = await params
    const body = await readJson(request, patchSchema)

    const repository = getRepository()
    const photo = await repository.getPhoto(id)
    if (!photo) throw new ApiError('NOT_FOUND', 'Photograph not found')

    // Ownership runs through the album's catalogue, exactly as deletion does — never from
    // anything the request supplied.
    const album = await repository.getAlbum(photo.albumId)
    if (!album) throw new ApiError('NOT_FOUND', 'Photograph not found')
    const { catalogue } = await requireEditableCatalogue(album.catalogueId)

    const updated = await repository.updatePhoto(id, { caption: body.caption ?? undefined })

    revalidateCatalogue(catalogue.slug)
    return noStore({ photo: updated })
  })
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  return route('admin/photo:delete', async () => {
    const { id } = await params

    const repository = getRepository()
    const photo = await repository.getPhoto(id)
    if (!photo) throw new ApiError('NOT_FOUND', 'Photograph not found')

    // Ownership runs through the album's catalogue — never from anything the request supplied.
    const album = await repository.getAlbum(photo.albumId)
    if (!album) throw new ApiError('NOT_FOUND', 'Photograph not found')
    const { catalogue } = await requireEditableCatalogue(album.catalogueId)

    // Row first, file second. The reverse can leave a row pointing at nothing, which renders a
    // broken image on a wedding page; a file with no row is invisible and costs a fraction of a
    // penny until the storage zone is swept.
    await repository.deletePhoto(id)
    await getPhotoProvider().remove(photoKeyFromUrl(photo.url))

    revalidateCatalogue(catalogue.slug)
    return noStore({ deleted: id })
  })
}

/**
 * Recover the storage key from the stored public URL.
 *
 * `photos.url` is the durable public URL rather than a key, because that is what the guest page
 * renders. Deletion is the only caller that needs the key back, so it is derived here rather
 * than adding a column that would have to be kept in step.
 */
function photoKeyFromUrl(url: string): string {
  try {
    return new URL(url).pathname.replace(/^\//, '')
  } catch {
    return url.replace(/^\//, '')
  }
}
