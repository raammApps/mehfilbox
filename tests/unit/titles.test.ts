import { beforeEach, describe, expect, it } from 'vitest'
import { setRepository } from '@/lib/db'
import { MemoryRepository, emptySnapshot } from '@/lib/db/memory-repository'
import { ApiError } from '@/lib/http/errors'
import { findRenamedTitle, resolveSlugChange } from '@/lib/titles'
import { makeCatalogue, makeTitle } from '../helpers/repository'

/**
 * N-84 — a film's address stops being its upload filename forever.
 *
 * `resolveSlugChange` is the whole rule in one function: a slug follows the name exactly once —
 * the first rename after upload — then never moves again, whatever the operator later renames it
 * to. `findRenamedTitle` is the other half — the 90-day grace window that keeps a link already
 * forwarded from dying the moment that first rename saves.
 */

let repo: MemoryRepository
let catalogueId: string

beforeEach(() => {
  const catalogue = makeCatalogue({ slug: 'aanya-vikram' })
  catalogueId = catalogue.id
  const snapshot = emptySnapshot()
  snapshot.catalogues.push(catalogue)
  repo = new MemoryRepository(snapshot)
  setRepository(repo)
})

describe('resolveSlugChange — the first rename after upload', () => {
  it('re-derives the slug from the new name, and remembers the old one', async () => {
    const title = await repo.createTitle(
      makeTitle(catalogueId, { slug: 'whatsapp-video-2026-08-12-at-02-07-21', slugChangedAt: null }),
    )

    const change = await resolveSlugChange(title, { name: { en: 'Sangeet' } })

    expect(change).toEqual({
      slug: 'sangeet',
      previousSlug: 'whatsapp-video-2026-08-12-at-02-07-21',
      slugChangedAt: expect.any(String),
    })
  })

  it('does nothing when the new name happens to slugify to the same address', async () => {
    const title = await repo.createTitle(makeTitle(catalogueId, { slug: 'sangeet', slugChangedAt: null }))

    expect(await resolveSlugChange(title, { name: { en: 'Sangeet' } })).toBeNull()
  })

  it('avoids a sibling film’s address, the same way upload does', async () => {
    await repo.createTitle(makeTitle(catalogueId, { slug: 'sangeet', name: { en: 'Sangeet' } }))
    const title = await repo.createTitle(
      makeTitle(catalogueId, { slug: 'whatsapp-video-9912', slugChangedAt: null }),
    )

    const change = await resolveSlugChange(title, { name: { en: 'Sangeet' } })

    expect(change?.slug).toBe('sangeet-2')
  })

  it('never happens twice — a title already renamed once keeps its slug through every later rename', async () => {
    const title = await repo.createTitle(
      makeTitle(catalogueId, {
        slug: 'sangeet',
        previousSlug: 'whatsapp-video-2026-08-12-at-02-07-21',
        slugChangedAt: '2026-01-01T00:00:00.000Z',
      }),
    )

    expect(await resolveSlugChange(title, { name: { en: 'The Sangeet Night' } })).toBeNull()
  })

  it('leaves the slug alone when neither name nor slug is in the patch', async () => {
    const title = await repo.createTitle(makeTitle(catalogueId, { slug: 'sangeet', slugChangedAt: null }))
    expect(await resolveSlugChange(title, {})).toBeNull()
  })
})

describe('resolveSlugChange — an operator editing the address directly', () => {
  it('accepts a free address, whatever slugChangedAt says', async () => {
    const title = await repo.createTitle(
      makeTitle(catalogueId, {
        slug: 'sangeet',
        previousSlug: 'whatsapp-video-9912',
        slugChangedAt: '2026-01-01T00:00:00.000Z',
      }),
    )

    const change = await resolveSlugChange(title, { slug: 'sangeet-night' })

    expect(change).toEqual({
      slug: 'sangeet-night',
      previousSlug: 'sangeet',
      slugChangedAt: expect.any(String),
    })
  })

  it('refuses one a sibling film already has', async () => {
    await repo.createTitle(makeTitle(catalogueId, { slug: 'sangeet', name: { en: 'Sangeet' } }))
    const title = await repo.createTitle(makeTitle(catalogueId, { slug: 'reception' }))

    await expect(resolveSlugChange(title, { slug: 'sangeet' })).rejects.toThrow(ApiError)
  })

  it('does nothing when the address did not actually change', async () => {
    const title = await repo.createTitle(makeTitle(catalogueId, { slug: 'sangeet' }))
    expect(await resolveSlugChange(title, { slug: 'sangeet' })).toBeNull()
  })

  it('wins over an automatic rederivation when both a new name and a new slug arrive together', async () => {
    const title = await repo.createTitle(makeTitle(catalogueId, { slug: 'old-slug', slugChangedAt: null }))

    const change = await resolveSlugChange(title, { name: { en: 'Something Else' }, slug: 'chosen-by-hand' })

    expect(change?.slug).toBe('chosen-by-hand')
  })
})

describe('findRenamedTitle — the 90-day redirect', () => {
  const NOW = Date.now()

  it('finds the film a retired slug now points to', async () => {
    await repo.createTitle(
      makeTitle(catalogueId, {
        slug: 'sangeet',
        previousSlug: 'whatsapp-video-2026-08-12-at-02-07-21',
        slugChangedAt: new Date(NOW - 1000).toISOString(),
        published: true,
        liveAt: new Date(NOW - 1000).toISOString(),
      }),
    )

    const found = await findRenamedTitle(catalogueId, 'whatsapp-video-2026-08-12-at-02-07-21')
    expect(found?.slug).toBe('sangeet')
  })

  it('stops redirecting once the 90-day window has passed', async () => {
    const ninetyOneDaysAgo = new Date(NOW - 91 * 24 * 60 * 60 * 1000).toISOString()
    await repo.createTitle(
      makeTitle(catalogueId, {
        slug: 'sangeet',
        previousSlug: 'old-address',
        slugChangedAt: ninetyOneDaysAgo,
        published: true,
      }),
    )

    expect(await findRenamedTitle(catalogueId, 'old-address')).toBeNull()
  })

  it('has nothing to offer for a slug no film has ever retired', async () => {
    await repo.createTitle(makeTitle(catalogueId, { slug: 'sangeet' }))
    expect(await findRenamedTitle(catalogueId, 'never-existed')).toBeNull()
  })

  it('does not redirect to a film a guest could not see anyway', async () => {
    await repo.createTitle(
      makeTitle(catalogueId, {
        slug: 'sangeet',
        previousSlug: 'old-address',
        slugChangedAt: new Date(NOW - 1000).toISOString(),
        published: false,
        liveAt: null,
      }),
    )

    expect(await findRenamedTitle(catalogueId, 'old-address')).toBeNull()
  })
})
