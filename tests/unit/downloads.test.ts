import { beforeEach, describe, expect, it, vi } from 'vitest'
import { setRepository } from '@/lib/db'
import { MemoryRepository, emptySnapshot } from '@/lib/db/memory-repository'
import { makeCatalogue, makeTitle } from '../helpers/repository'

/**
 * N-22 — nobody is held to ransom for their own wedding.
 *
 * "Nothing is ever deleted" and "it archives rather than disappears" are in the handover email,
 * the FAQ and the pricing page. They are worth nothing if a couple cannot get their films out
 * once the plan lapses, so what is tested here is the two edges of that promise: it survives
 * lapsing, and it does **not** survive the passcode being unmet.
 */

const ORG = '11111111-1111-4111-8111-11111111111a'
const PUBLISHED_AT = '2026-03-01T00:00:00.000Z'

const cookieStore = { value: null as string | null }
vi.mock('next/headers', () => ({
  cookies: async () => ({ get: () => (cookieStore.value ? { value: cookieStore.value } : undefined) }),
}))

/**
 * Injects the fake video provider explicitly.
 *
 * `tests/setup.ts` loads `.env.local` so the integration suite finds real credentials, and that
 * file carries `VIDEO_DRIVER=bunny` — so a unit test that does not say otherwise reaches for
 * Bunny over the network and every film comes back unavailable. That is the *correct* behaviour
 * under a broken provider, which is exactly why it made a confusing test failure.
 */
async function install(overrides: Parameters<typeof makeCatalogue>[0] = {}) {
  const catalogue = makeCatalogue({
    orgId: ORG,
    slug: 'aanya-vikram',
    status: 'published',
    publishedAt: PUBLISHED_AT,
    ...overrides,
  })
  const snapshot = emptySnapshot()
  snapshot.catalogues.push(catalogue)
  snapshot.titles.push(makeTitle(catalogue.id, { slug: 'the-ceremony', published: true }))
  setRepository(new MemoryRepository(snapshot))

  const { setVideoProvider } = await import('@/lib/video')
  const { FakeVideoProvider } = await import('@/lib/video/fake')
  setVideoProvider(new FakeVideoProvider())

  return catalogue
}

beforeEach(() => {
  cookieStore.value = null
  vi.resetModules()
})

describe('who may download', () => {
  it('lets the couple download while the catalogue is serving', async () => {
    await install()
    const { resolveDownloadAccess } = await import('@/lib/downloads')
    expect((await resolveDownloadAccess('aanya-vikram')).kind).toBe('ok')
  })

  /**
   * The assertion the promise rests on. A lapsed catalogue shows a renewal screen instead of the
   * films — and the files must still come out, because lapsing is a billing state and the wedding
   * is not ours to withhold.
   */
  it('still lets them download after it has lapsed', async () => {
    await install({ subStatus: 'lapsed', includedUntil: '2026-01-01' })
    const { resolveDownloadAccess } = await import('@/lib/downloads')
    expect((await resolveDownloadAccess('aanya-vikram')).kind).toBe('ok')
  })

  it('still lets them download once it is archived', async () => {
    // `cold` is the archived sub-status — streaming paused, files retained (PRICING.md §2).
    await install({ status: 'archived', subStatus: 'cold', includedUntil: '2026-01-01' })
    const { resolveDownloadAccess } = await import('@/lib/downloads')
    expect((await resolveDownloadAccess('aanya-vikram')).kind).toBe('ok')
  })

  /**
   * The edge that would have been a hole. `resolveAccess` returns `lapsed` *before* it checks the
   * passcode, which is right for a page whose lapsed state shows a renewal screen with nothing
   * behind it — and would have been a leak here, handing a passcode-protected wedding to anyone
   * with the link the moment it expired.
   */
  it('refuses a passcode catalogue without the passcode, lapsed or not', async () => {
    await install({ privacy: 'passcode', subStatus: 'lapsed', includedUntil: '2026-01-01' })
    const { resolveDownloadAccess } = await import('@/lib/downloads')
    expect((await resolveDownloadAccess('aanya-vikram')).kind).toBe('locked')
  })

  it('has nothing to offer for a draft that was never handed over', async () => {
    await install({ status: 'draft', publishedAt: null })
    const { resolveDownloadAccess } = await import('@/lib/downloads')
    expect((await resolveDownloadAccess('aanya-vikram')).kind).toBe('missing')
  })

  it('has nothing to offer for a wedding that does not exist', async () => {
    await install()
    const { resolveDownloadAccess } = await import('@/lib/downloads')
    expect((await resolveDownloadAccess('not-a-wedding')).kind).toBe('missing')
  })
})

describe('the manifest', () => {
  it('lists a film with the quality actually handed over', async () => {
    const catalogue = await install()
    const { buildManifest } = await import('@/lib/downloads')

    const manifest = await buildManifest(catalogue)
    const film = manifest.items.find((i) => i.kind === 'film')

    expect(film?.name).toBe('A Film')
    // Named rather than implied: a couple handed a 720p fallback is told that is what it is.
    expect(film?.quality).toBe('original')
    expect(manifest.unavailable).toBe(0)
  })

  /**
   * A couple downloading their wedding at the end of a plan is the least forgiving moment this
   * product has. Nine films and a count of what could not be reached beats an error page.
   */
  it('reports what it could not reach rather than failing entirely', async () => {
    const catalogue = await install()
    const { setVideoProvider } = await import('@/lib/video')
    const { FakeVideoProvider } = await import('@/lib/video/fake')
    const provider = new FakeVideoProvider()
    provider.getDownloadUrl = async () => {
      throw new Error('provider is down')
    }
    setVideoProvider(provider)

    const { buildManifest } = await import('@/lib/downloads')
    const manifest = await buildManifest(catalogue)

    expect(manifest.items.filter((i) => i.kind === 'film')).toHaveLength(0)
    expect(manifest.unavailable).toBe(1)
  })
})
