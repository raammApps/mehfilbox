import { randomUUID } from 'node:crypto'
import { MemoryRepository, emptySnapshot, type Snapshot } from '@/lib/db/memory-repository'
import { demoSnapshot } from '@/lib/db/seed-data'
import { setRepository } from '@/lib/db'
import type { Catalogue, Title } from '@/lib/schema'

/**
 * Test fixtures.
 *
 * Every suite builds its own store and installs it, so no test depends on the order of another.
 * `withDemo` reuses the shipped demo snapshot, which means the fixture and the sales artefact
 * cannot drift apart.
 */

export function installRepository(snapshot: Snapshot = emptySnapshot()): MemoryRepository {
  const repository = new MemoryRepository(snapshot)
  setRepository(repository)
  return repository
}

export function installDemo(): MemoryRepository {
  return installRepository(demoSnapshot())
}

const ORG_ID = '99999999-9999-4999-8999-999999999999'

export function makeCatalogue(overrides: Partial<Catalogue> = {}): Catalogue {
  return {
    id: randomUUID(),
    orgId: ORG_ID,
    slug: 'test-wedding',
    tenantSlug: 'test-studio',
    originOrgId: null,
    customDomain: null,
    coupleName: { en: 'Test & Case' },
    appName: { en: 'Test Originals' },
    weddingDate: '2026-11-14',
    city: undefined,
    synopsis: undefined,
    occasion: 'wedding',
    branding: {},
    featuredTitleId: null,
    modules: [],
    draftModules: null,
    draftBranding: null,
    locale: 'en',
    template: null,
    status: 'published',
    privacy: 'unlisted',
    passcodeHash: null,
    coupleOrgId: null,
    supportAccessUntil: null,
    passcodeVersion: 1,
    presetId: null,
    includedUntil: '2027-01-01T00:00:00.000Z',
    subStatus: 'included',
    subPlan: null,
    subUntil: null,
    createdAt: '2026-07-01T00:00:00.000Z',
    publishedAt: '2026-07-01T00:00:00.000Z',
    ...overrides,
  }
}

export function makeTitle(catalogueId: string, overrides: Partial<Title> = {}): Title {
  return {
    id: randomUUID(),
    catalogueId,
    slug: 'a-film',
    name: { en: 'A Film' },
    synopsis: undefined,
    category: 'highlights',
    credits: [],
    provider: 'fake',
    providerId: `fake_${randomUUID()}`,
    durationS: 600,
    posterUrl: null,
    posterCandidates: [],
    posterSource: 'generated',
    sizeBytes: null,
    thumbnailsUrl: null,
    trailerUrl: null,
    captions: [],
    status: 'ready',
    errorMessage: null,
    published: true,
    /**
     * Live by default, matching `published: true` beside it: the helper describes a film on a
     * catalogue that has been published, which is what almost every test means by "a film".
     * A test about content *waiting* for Publish sets this to null explicitly (N-57).
     */
    liveAt: '2026-07-01T00:00:00.000Z',
    sortOrder: 0,
    publishedAt: '2026-07-01T00:00:00.000Z',
    createdAt: '2026-07-01T00:00:00.000Z',
    viewCount: 0,
    watchSeconds: 0,
    ...overrides,
  }
}

export { ORG_ID as TEST_ORG_ID }
