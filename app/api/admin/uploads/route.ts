import { randomUUID } from 'node:crypto'
import { z } from 'zod'
import { requireOwnedCatalogue } from '@/lib/admin/session'
import { getRepository } from '@/lib/db'
import { slugify, titleFromFilename } from '@/lib/format'
import { ApiError } from '@/lib/http/errors'
import { noStore, readJson, route } from '@/lib/http/handler'
import { log } from '@/lib/log'
import { resolveLimits, storageCheck } from '@/lib/entitlements'
import { getVideoProvider, isAcceptedVideo, MAX_UPLOAD_BYTES } from '@/lib/video'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const bodySchema = z.object({
  catalogueId: z.string().uuid(),
  filename: z.string().min(1).max(255),
  sizeBytes: z.number().int().positive(),
  mimeType: z.string().max(120).optional(),
  kind: z.literal('video').default('video'),
})

/**
 * `POST /api/admin/uploads` (doc 05 §3, doc 07).
 *
 * Creates the provider object and hands back a resumable endpoint. **Bytes never pass through
 * our server** — a Vercel route handler has payload limits and would make us pay egress twice.
 *
 * The `titles` row is created at `uploading` immediately, so a refresh mid-upload shows the
 * file rather than losing it.
 */
export async function POST(request: Request) {
  return route('admin/uploads', async () => {
    const body = await readJson(request, bodySchema)
    const { catalogue } = await requireOwnedCatalogue(body.catalogueId)
    const repository = getRepository()

    if (!isAcceptedVideo(body.filename, body.mimeType)) {
      throw new ApiError('VALIDATION_FAILED', 'That file type is not supported', {
        fields: { filename: 'Use MP4, MOV, MKV, WebM or AVI.' },
      })
    }

    if (body.sizeBytes > MAX_UPLOAD_BYTES) {
      throw new ApiError('UPLOAD_LIMIT', 'That file is larger than the per-file cap')
    }

    // The title cap is a curation feature first and a cost ceiling second (doc 01 §4). It is
    // resolved rather than imported now (doc 15 §3): a couple who buys space must not stay
    // capped by the tier of a partner who has already left the relationship.
    const [existing, grants] = await Promise.all([
      repository.listTitles(catalogue.id),
      repository.getEntitlements(catalogue.id, catalogue.orgId),
    ])
    const limits = resolveLimits(grants.catalogue, grants.org)

    /**
     * Storage, not a count.
     *
     * There was a fifteen-film cap here. It came from doc 05 §2's argument that a cap is a
     * curation requirement first — written when a wedding meant a highlights film and a ceremony
     * edit. A real wedding is every function from both sides, and a count cap refused content the
     * customer had paid to store. The plans sell gigabytes now (`docs/PRICING.md`).
     *
     * Checked against the **declared** size, which is an estimate: what is stored is the encoding
     * ladder, and the real figure only arrives when the provider finishes. Good enough to refuse
     * something that obviously will not fit, which is all a pre-flight check should do.
     */
    const usedBytes = await repository.catalogueStorageBytes(catalogue.id)
    const room = storageCheck(usedBytes, body.sizeBytes, limits)

    if (!room.fits) {
      throw new ApiError(
        'VALIDATION_FAILED',
        `This catalogue holds ${room.limitGb} GB and ${room.usedGb.toFixed(1)} GB is already used. ` +
          `Add storage, or remove a film first.`,
        { fields: { catalogueId: 'Not enough space' } },
      )
    }

    const draftName = titleFromFilename(body.filename)
    const ticket = await getVideoProvider().createUpload({
      title: `${catalogue.slug}/${draftName}`,
      sizeBytes: body.sizeBytes,
    })

    const title = await repository.createTitle({
      id: randomUUID(),
      catalogueId: catalogue.id,
      slug: uniqueSlug(draftName, existing.map((t) => t.slug)),
      name: { en: draftName },
      category: 'highlights',
      credits: [],
      provider: getVideoProvider().name,
      providerId: ticket.providerId,
      durationS: null,
      posterUrl: null,
      posterCandidates: [],
      posterSource: 'generated',
      thumbnailsUrl: null,
      trailerUrl: null,
      captions: [],
      status: 'uploading',
      errorMessage: null,
      published: false,
      // A new film is not live until a Publish carries it (N-57), whatever the operator ticks.
      liveAt: null,
      // The declared size, so the next upload's pre-flight has something to add up. Corrected
      // from the provider once encoding finishes — see the webhook.
      sizeBytes: body.sizeBytes,
      sortOrder: existing.length,
    })

    log.info('upload ticket issued', {
      titleId: title.id,
      catalogueId: catalogue.id,
      sizeBytes: body.sizeBytes,
    })

    return noStore({
      titleId: title.id,
      tusEndpoint: ticket.tusEndpoint,
      headers: ticket.headers,
      chunkSizeBytes: ticket.chunkSizeBytes,
    })
  })
}

/** Slugs are per-catalogue and appear in share links, so collisions get a numeric suffix. */
function uniqueSlug(name: string, taken: string[]): string {
  const base = slugify(name) || 'film'
  if (!taken.includes(base)) return base
  let n = 2
  while (taken.includes(`${base}-${n}`)) n += 1
  return `${base}-${n}`
}
