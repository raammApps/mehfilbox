import { beforeEach, describe, expect, it, vi } from 'vitest'
import { emptySnapshot } from '@/lib/db/memory-repository'
import { hashSecret, createPasscodeGrant } from '@/lib/auth'
import { installRepository, makeCatalogue, makeTitle } from '../helpers/repository'

/**
 * doc 10 §1 test 12 and E2E-6, at the unit level: a guest can never reach an unpublished title,
 * a draft catalogue, or another catalogue's rows — and a lapsed subscription never 404s.
 */

const cookieJar = new Map<string, string>()

vi.mock('next/headers', () => ({
  cookies: async () => ({
    get: (name: string) => {
      const value = cookieJar.get(name)
      return value ? { name, value } : undefined
    },
  }),
}))

describe('resolveAccess', () => {
  beforeEach(() => cookieJar.clear())

  it('serves a published, unlisted catalogue', async () => {
    const catalogue = makeCatalogue()
    installRepository({ ...emptySnapshot(), catalogues: [catalogue] })

    const { resolveAccess } = await import('@/lib/catalogue-access')
    expect((await resolveAccess(catalogue.slug)).kind).toBe('ok')
  })

  it('reports a draft catalogue as draft, not as missing', async () => {
    const catalogue = makeCatalogue({ status: 'draft' })
    installRepository({ ...emptySnapshot(), catalogues: [catalogue] })

    const { resolveAccess } = await import('@/lib/catalogue-access')
    expect((await resolveAccess(catalogue.slug)).kind).toBe('draft')
  })

  it('reports an unknown slug as missing', async () => {
    installRepository()
    const { resolveAccess } = await import('@/lib/catalogue-access')
    expect((await resolveAccess('nobody')).kind).toBe('missing')
  })

  it('locks a passcode catalogue until the cookie grant is present', async () => {
    const catalogue = makeCatalogue({ privacy: 'passcode', passcodeHash: hashSecret('varmala') })
    installRepository({ ...emptySnapshot(), catalogues: [catalogue] })

    const { resolveAccess } = await import('@/lib/catalogue-access')
    expect((await resolveAccess(catalogue.slug)).kind).toBe('locked')

    cookieJar.set(`mehfilbox_pc_${catalogue.slug}`, createPasscodeGrant(catalogue.id))
    expect((await resolveAccess(catalogue.slug)).kind).toBe('ok')
  })

  it('does not accept another catalogue’s passcode grant', async () => {
    const catalogue = makeCatalogue({ privacy: 'passcode', passcodeHash: hashSecret('varmala') })
    installRepository({ ...emptySnapshot(), catalogues: [catalogue] })

    cookieJar.set(`mehfilbox_pc_${catalogue.slug}`, createPasscodeGrant('some-other-catalogue-id'))

    const { resolveAccess } = await import('@/lib/catalogue-access')
    expect((await resolveAccess(catalogue.slug)).kind).toBe('locked')
  })

  it.each(['lapsed', 'cold', 'deleted'] as const)(
    'routes a %s subscription to renewal, never to a 404',
    async (subStatus) => {
      const catalogue = makeCatalogue({ subStatus })
      installRepository({ ...emptySnapshot(), catalogues: [catalogue] })

      const { resolveAccess } = await import('@/lib/catalogue-access')
      expect((await resolveAccess(catalogue.slug)).kind).toBe('lapsed')
    },
  )

  it.each(['included', 'active', 'grace'] as const)('keeps serving a %s subscription', async (subStatus) => {
    const catalogue = makeCatalogue({ subStatus })
    installRepository({ ...emptySnapshot(), catalogues: [catalogue] })

    const { resolveAccess } = await import('@/lib/catalogue-access')
    expect((await resolveAccess(catalogue.slug)).kind).toBe('ok')
  })
})

describe('loadBundle', () => {
  it('returns only films a Publish has carried live, and never a processing or failed one', async () => {
    const catalogue = makeCatalogue()
    const repository = installRepository({
      ...emptySnapshot(),
      catalogues: [catalogue],
      titles: [
        makeTitle(catalogue.id, { slug: 'live', published: true, status: 'ready' }),
        /**
         * Never carried live, which is what "staged" means now (N-57). `published: false` alone no
         * longer hides a film that a Publish has already sent out — a withdrawal waits for the
         * next Publish like every other change.
         */
        makeTitle(catalogue.id, { slug: 'staged', published: false, status: 'ready', liveAt: null }),
        makeTitle(catalogue.id, { slug: 'encoding', published: true, status: 'processing' }),
        makeTitle(catalogue.id, { slug: 'broken', published: true, status: 'failed' }),
      ],
    })
    void repository

    const { loadBundle } = await import('@/lib/catalogue-access')
    const bundle = await loadBundle(catalogue)
    expect(bundle.titles.map((title) => title.slug)).toEqual(['live'])
  })

  it('never reaches across catalogues', async () => {
    const mine = makeCatalogue({ slug: 'mine' })
    const theirs = makeCatalogue({ slug: 'theirs' })
    installRepository({
      ...emptySnapshot(),
      catalogues: [mine, theirs],
      titles: [
        makeTitle(mine.id, { slug: 'ours' }),
        makeTitle(theirs.id, { slug: 'not-ours' }),
      ],
    })

    const { loadBundle } = await import('@/lib/catalogue-access')
    const bundle = await loadBundle(mine)
    expect(bundle.titles.map((title) => title.slug)).toEqual(['ours'])
  })
})
