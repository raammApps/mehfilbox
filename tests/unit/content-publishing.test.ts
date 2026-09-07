import { beforeEach, describe, expect, it } from 'vitest'
import { MemoryRepository, emptySnapshot } from '@/lib/db/memory-repository'
import { albumSchema, photoSchema } from '@/lib/schema'
import { makeCatalogue, makeTitle } from '../helpers/repository'

/**
 * N-57 — films and photographs wait for Publish, like sections and branding.
 *
 * Before this, one wedding page had three different answers to "when does the couple see this".
 * Sections waited in `draft_modules`. Branding waited in `draft_branding` (N-56). Films went live
 * the instant an operator ticked a checkbox, and a photograph the instant it finished uploading.
 *
 * `published` is the operator's intent; `liveAt` is whether a Publish has carried it out. The
 * distinction is the whole feature, and it is what lets the console say "three films will go live
 * when you publish" rather than silently doing it — which is the failure mode this risks creating.
 */

const ALBUM = '44444444-4444-4444-8444-444444444444'
let repo: MemoryRepository
let catalogueId: string

function photo(id: string, liveAt: string | null) {
  return photoSchema.parse({
    id,
    albumId: ALBUM,
    url: `/p/${id}`,
    sortOrder: 0,
    liveAt,
  })
}

beforeEach(() => {
  const catalogue = makeCatalogue({ slug: 'aanya-vikram' })
  catalogueId = catalogue.id
  const snapshot = emptySnapshot()
  snapshot.catalogues.push(catalogue)
  snapshot.albums.push(
    albumSchema.parse({
      id: ALBUM,
      catalogueId: catalogue.id,
      name: { en: 'The day' },
      createdAt: '2026-07-01T00:00:00.000Z',
    }),
  )
  repo = new MemoryRepository(snapshot)
})

describe('a film ticked but not yet published', () => {
  beforeEach(async () => {
    await repo.createTitle(makeTitle(catalogueId, { slug: 'new-cut', published: true, liveAt: null }))
  })

  it('is invisible to a guest, however emphatically it is ticked', async () => {
    const guestSees = await repo.listTitles(catalogueId, { publishedOnly: true })
    expect(guestSees).toHaveLength(0)
  })

  it('is still visible to the operator, or they could not find what they ticked', async () => {
    const consoleSees = await repo.listTitles(catalogueId)
    expect(consoleSees.map((t) => t.slug)).toEqual(['new-cut'])
  })

  it('is counted as pending, so the console can say why it is not showing', async () => {
    expect(await repo.countPendingContent(catalogueId)).toEqual({ titles: 1, photos: 0 })
  })

  it('goes live on Publish, and only then', async () => {
    const result = await repo.publishCatalogueContent(catalogueId)
    expect(result.published).toBe(1)

    const guestSees = await repo.listTitles(catalogueId, { publishedOnly: true })
    expect(guestSees.map((t) => t.slug)).toEqual(['new-cut'])
    expect(await repo.countPendingContent(catalogueId)).toEqual({ titles: 0, photos: 0 })
  })
})

describe('a film that is still encoding', () => {
  it('does not go live on Publish, however the operator ticked it', async () => {
    await repo.createTitle(
      makeTitle(catalogueId, { slug: 'encoding', published: true, status: 'processing', liveAt: null }),
    )

    const result = await repo.publishCatalogueContent(catalogueId)

    // Publishing a half-encoded film would put a broken player in front of a couple, which is
    // worse than an absent film — `ready` is a precondition, not a preference.
    expect(result.published).toBe(0)
    expect(await repo.listTitles(catalogueId, { publishedOnly: true })).toHaveLength(0)
  })
})

describe('withdrawing a film', () => {
  it('waits for Publish as well, so a takedown arrives with everything else', async () => {
    const title = await repo.createTitle(
      makeTitle(catalogueId, { slug: 'shown', published: true }),
    )
    expect(await repo.listTitles(catalogueId, { publishedOnly: true })).toHaveLength(1)

    await repo.updateTitle(title.id, { published: false })
    // Still visible: un-ticking is a change like any other and does not take effect on its own.
    expect(await repo.listTitles(catalogueId, { publishedOnly: true })).toHaveLength(1)
    expect(await repo.countPendingContent(catalogueId)).toEqual({ titles: 1, photos: 0 })

    const result = await repo.publishCatalogueContent(catalogueId)
    expect(result.withdrawn).toBe(1)
    expect(await repo.listTitles(catalogueId, { publishedOnly: true })).toHaveLength(0)
  })
})

describe('photographs', () => {
  beforeEach(() => {
    repo = new MemoryRepository({
      ...emptySnapshot(),
      catalogues: [makeCatalogue({ id: catalogueId, slug: 'aanya-vikram' })],
      albums: [
        albumSchema.parse({
          id: ALBUM,
          catalogueId,
          name: { en: 'The day' },
          createdAt: '2026-07-01T00:00:00.000Z',
        }),
      ],
      photos: [
        photo('55555555-5555-4555-8555-555555555551', '2026-07-01T00:00:00.000Z'),
        photo('55555555-5555-4555-8555-555555555552', null),
      ],
    })
  })

  it('shows a guest only the ones a Publish has carried', async () => {
    const guestSees = await repo.listPhotosForCatalogue(catalogueId, { liveOnly: true })
    expect(guestSees).toHaveLength(1)
  })

  it('shows the operator both, because they have to be able to arrange them', async () => {
    expect(await repo.listPhotosForCatalogue(catalogueId)).toHaveLength(2)
  })

  it('carries the waiting one live on Publish', async () => {
    await repo.publishCatalogueContent(catalogueId)
    expect(await repo.listPhotosForCatalogue(catalogueId, { liveOnly: true })).toHaveLength(2)
  })
})
