import { describe, expect, it } from 'vitest'
import { seedModules } from '@/lib/admin/templates'
import { catalogueSchema, titleSchema, type Catalogue, type Title } from '@/lib/schema'

const CATALOGUE_ID = '11111111-1111-4111-8111-111111111111'

function catalogue(over: Partial<Catalogue> = {}): Catalogue {
  return catalogueSchema.parse({
    id: CATALOGUE_ID,
    orgId: '22222222-2222-4222-8222-222222222222',
    slug: 'aanya-vikram',
    coupleName: { en: 'Aanya & Vikram' },
    appName: { en: 'Aanya & Vikram Originals' },
    weddingDate: '2026-02-14',
    includedUntil: '2027-02-14',
    createdAt: '2025-11-01T00:00:00.000Z',
    ...over,
  })
}

function films(count: number): Title[] {
  return Array.from({ length: count }, (_, i) =>
    titleSchema.parse({
      id: `33333333-3333-4333-8333-${String(i + 1).padStart(12, '0')}`,
      catalogueId: CATALOGUE_ID,
      slug: `film-${i + 1}`,
      name: { en: `Film ${i + 1}` },
      category: 'highlights',
      credits: [],
      provider: 'fake',
      providerId: `p${i + 1}`,
      status: 'ready',
      published: true,
      sortOrder: i,
      createdAt: '2025-11-01T00:00:00.000Z',
    }),
  )
}

/** Every film id the seeded curated rows reference. */
function filmsInRows(modules: ReturnType<typeof seedModules>): string[] {
  return modules
    .filter((m) => m.type === 'curated_row')
    .flatMap((m) => ((m.config as { titleIds?: string[] }).titleIds ?? []))
}

/**
 * The featured film is kept out of the rows so a fresh catalogue does not show the same film
 * twice — right for a wedding with a dozen films, and wrong for one with two.
 *
 * Noticed on a real catalogue: two films, one featured, and the row beneath the billboard held a
 * single card. That reads as something broken rather than as curation, and it is the first thing
 * a partner sees after their first upload — when they are least willing to believe the product
 * works.
 */
describe('seedModules and the featured film', () => {
  it('keeps the featured film in the rows when there are only a few', () => {
    const featured = films(2)[0]!
    const modules = seedModules('keepsake', catalogue({ featuredTitleId: featured.id }), films(2), [])

    expect(filmsInRows(modules)).toContain(featured.id)
  })

  it('leaves it out once there are enough films for the rows to stand without it', () => {
    const all = films(8)
    const modules = seedModules('keepsake', catalogue({ featuredTitleId: all[0]!.id }), all, [])

    expect(filmsInRows(modules)).not.toContain(all[0]!.id)
  })

  /** The reason the exclusion exists at all: no duplication once there is enough to go round. */
  it('never repeats a film across rows', () => {
    const inRows = filmsInRows(seedModules('keepsake', catalogue(), films(8), []))
    expect(new Set(inRows).size).toBe(inRows.length)
  })

  it('leaves no curated row empty, at any catalogue size', () => {
    for (const count of [1, 2, 3, 5, 12]) {
      const all = films(count)
      const modules = seedModules('keepsake', catalogue({ featuredTitleId: all[0]!.id }), all, [])
      for (const row of modules.filter((m) => m.type === 'curated_row')) {
        const ids = (row.config as { titleIds?: string[] }).titleIds ?? []
        expect(ids.length, `a row was empty with ${count} film(s)`).toBeGreaterThan(0)
      }
    }
  })
})

describe('the blank layout (doc 16 §10)', () => {
  it('seeds nothing whatever the content — the Add menu is the whole editor for it', () => {
    expect(seedModules('blank', catalogue(), films(4), [])).toEqual([])
  })
})
