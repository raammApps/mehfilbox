import { randomUUID } from 'node:crypto'
import { z } from 'zod'
import { requireEditableCatalogue } from '@/lib/admin/session'
import { revalidateCatalogue } from '@/lib/catalogue-cache'
import { getRepository } from '@/lib/db'
import { ApiError } from '@/lib/http/errors'
import { noStore, route } from '@/lib/http/handler'
import { defaultAlbumId, getPhotoProvider, photoKey, PHOTO_WIDTHS } from '@/lib/photos'
import { albumSchema, photoSchema } from '@/lib/schema'
import { resolveLimits, storageCheck } from '@/lib/entitlements'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * Photographs for one catalogue.
 *
 * Bytes proxy through here rather than going browser-to-origin the way films do: authenticating
 * a direct browser PUT would mean shipping the storage zone's write password to the client, and
 * that password can delete every catalogue's photographs. Films are gigabytes and get a
 * short-lived TUS ticket; photographs are megabytes, so proxying is the cheaper trade.
 */

/**
 * Below the platform's own body limit, which is the real ceiling.
 *
 * Vercel rejects a request over ~4.5MB with FUNCTION_PAYLOAD_TOO_LARGE before this route runs,
 * so a larger limit here is a promise the code cannot keep: the operator sees a bare 413 and no
 * message this file could have written. The browser resizes anything big before sending, so
 * this only catches what slipped past that.
 */
const MAX_BYTES = 4 * 1024 * 1024

/**
 * The narrower renditions that accompany the master, matching `RENDITIONS` in `<PhotoManager>`.
 * Kept as a bare list because the server only needs to know what to look for and where to put
 * it — the widths themselves are a client display concern.
 */
const RENDITION_SUFFIXES = ['-1024', '-480'] as const

/** Suffix the browser sends → the width segment it is stored under. */
const SUFFIX_WIDTH: Record<string, number> = { '-1024': 1024, '-480': 480 }

const ACCEPTED: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/avif': 'avif',
}

/**
 * The blurred placeholder, generated in the browser where the image is already decoded.
 *
 * Bounded and format-checked because it is operator-supplied and ends up in a `src`. It is
 * never interpolated into markup — `dangerouslySetInnerHTML` on tenant strings is a lint error.
 */
const lqipSchema = z
  .string()
  .max(4096)
  .regex(/^data:image\/(jpeg|webp);base64,[A-Za-z0-9+/=]+$/, 'lqip must be a small inline image')

const metaSchema = z.object({
  albumId: z.string().uuid().optional(),
  width: z.coerce.number().int().positive().max(20_000).optional(),
  height: z.coerce.number().int().positive().max(20_000).optional(),
  lqip: lqipSchema.optional(),
})

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  return route('admin/photos:list', async () => {
    const { id } = await params
    await requireEditableCatalogue(id)

    const repository = getRepository()
    const albums = await repository.listAlbums(id)
    const photos = await repository.listPhotosForCatalogue(id)

    return noStore({ albums, photos })
  })
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  return route('admin/photos:create', async () => {
    const { id } = await params
    const { catalogue } = await requireEditableCatalogue(id)

    const form = await request.formData().catch(() => null)
    const file = form?.get('file')
    if (!form || !(file instanceof File)) {
      throw new ApiError('VALIDATION_FAILED', 'Expected a multipart form with a file')
    }

    const extension = ACCEPTED[file.type]
    if (!extension) {
      throw new ApiError('VALIDATION_FAILED', 'Use a JPEG, PNG, WebP or AVIF photograph')
    }
    if (file.size > MAX_BYTES) {
      throw new ApiError('VALIDATION_FAILED', 'That photograph is larger than 25MB')
    }

    const meta = metaSchema.parse({
      albumId: form.get('albumId') ?? undefined,
      width: form.get('width') ?? undefined,
      height: form.get('height') ?? undefined,
      lqip: form.get('lqip') ?? undefined,
    })

    const repository = getRepository()

    // One album per catalogue until the operator asks for more: a gallery that demands you name
    // an album before you can drop a photograph in is a gate in front of the only thing you
    // came here to do.
    //
    // The id is derived rather than generated, because a browser uploads several photographs at
    // once and every one of those requests arrives here before any has finished creating an
    // album. With a fresh uuid each, three photographs made three albums.
    let album = meta.albumId
      ? ((await repository.listAlbums(id)).find((a) => a.id === meta.albumId) ?? null)
      : await repository.getAlbum(defaultAlbumId(id))
    if (meta.albumId && !album) throw new ApiError('NOT_FOUND', 'Album not found')

    if (!album) {
      const fresh = albumSchema.parse({
        id: defaultAlbumId(id),
        catalogueId: id,
        name: { en: 'Photographs', hi: 'तस्वीरें' },
        createdAt: new Date().toISOString(),
      })
      // A parallel upload may have won the race; the primary key says so, and re-reading is the
      // correct response rather than surfacing a conflict the operator cannot act on.
      album = await repository.createAlbum(fresh).catch(async () => {
        const existing = await repository.getAlbum(fresh.id)
        if (!existing) throw new ApiError('INTERNAL', 'Could not create the album')
        return existing
      })
    }

    /**
     * The cap doc 01 §4 calls a real cap, enforced rather than merely declared.
     *
     * A count cap lived here — sixty photographs — on doc 05 §2's argument that caps are a
     * curation requirement first. The plans sell gigabytes now (`docs/PRICING.md`), so the check
     * is storage, and it counts **every rendition**: a photograph is stored at three widths and
     * billing does not care that they came from one file.
     */
    const grants = await repository.getEntitlements(id, catalogue.orgId)
    const limits = resolveLimits(grants.catalogue, grants.org)

    const usedBytes = await repository.catalogueStorageBytes(catalogue.id)
    const room = storageCheck(usedBytes, file.size, limits)

    if (!room.fits) {
      throw new ApiError(
        'UPLOAD_LIMIT',
        `This catalogue holds ${room.limitGb} GB and ${room.usedGb.toFixed(1)} GB is already used. ` +
          `Add storage, or remove something first.`,
      )
    }

    const photoId = randomUUID()
    const provider = getPhotoProvider()

    // The browser sends one decode cut to several widths. Storing them together means a
    // photograph is never live at only some sizes, which would 404 inside a `srcset` and show
    // a guest a hole in the gallery.
    const master = await provider.put(
      photoKey(catalogue.id, photoId, extension, PHOTO_WIDTHS[0]),
      await file.arrayBuffer(),
      file.type,
    )

    // Every rendition counts toward storage — one photograph occupies three files.
    let storedBytes = file.size

    for (const suffix of RENDITION_SUFFIXES) {
      const rendition = form.get(`file${suffix}`)
      if (!(rendition instanceof File) || !ACCEPTED[rendition.type]) continue
      if (rendition.size > MAX_BYTES) continue
      storedBytes += rendition.size
      await provider.put(
        photoKey(catalogue.id, photoId, ACCEPTED[rendition.type]!, SUFFIX_WIDTH[suffix]),
        await rendition.arrayBuffer(),
        rendition.type,
      )
    }
    const stored = master

    const existing = await repository.listPhotos(album.id)
    const photo = photoSchema.parse({
      id: photoId,
      albumId: album.id,
      url: stored.url,
      lqip: meta.lqip ?? null,
      width: meta.width ?? null,
      height: meta.height ?? null,
      sizeBytes: storedBytes,
      sortOrder: existing.length,
    })
    await repository.createPhoto(photo)

    revalidateCatalogue(catalogue.slug)
    return noStore({ photo, album })
  })
}
