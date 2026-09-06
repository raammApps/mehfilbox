import { beforeEach, describe, expect, it, vi } from 'vitest'
import { emptySnapshot, type MemoryRepository } from '@/lib/db/memory-repository'
import { categoryEyebrow, eyebrowFor } from '@/lib/poster'
import { setVideoProvider } from '@/lib/video'
import { FakeVideoProvider } from '@/lib/video/fake'
import { installRepository, makeCatalogue, makeTitle } from '../helpers/repository'

/**
 * Posters under a token-protected CDN.
 *
 * Enabling token authentication on the Bunny zone protects every file in it, posters included.
 * The failure this guards against is nasty precisely because it is delayed: persist a signed
 * URL in `titles.poster_url` and every poster works for four hours, then 403s — in ISR-cached
 * pages and in the OG card, discovered when someone reopens their wedding.
 */

vi.mock('next/cache', () => ({
  // Pass-through, so these tests exercise what the cached function returns rather than
  // Next's caching. See tests/setup.ts for why.
  unstable_cache: <A extends unknown[], R>(fn: (...args: A) => R) => fn,
  revalidateTag: vi.fn(),
  revalidatePath: vi.fn(),
}))
vi.mock('next/headers', () => ({ cookies: async () => ({ get: () => undefined }) }))

let repository: MemoryRepository

beforeEach(() => {
  setVideoProvider(new FakeVideoProvider())
})

describe('posterRoute', () => {
  it('produces a stable app URL, never a provider URL', async () => {
    const { posterRoute } = await import('@/lib/video')
    const url = posterRoute('title-1', 'thumbnail_1.jpg')

    expect(url).toBe('/api/poster/title-1?file=thumbnail_1.jpg')
    // The two things that make a stored URL rot: a host that can change and a token that expires.
    expect(url).not.toMatch(/^https?:/)
    expect(url).not.toMatch(/token|expires/)
  })

  it('escapes the file name rather than trusting it into a URL', async () => {
    const { posterRoute } = await import('@/lib/video')
    expect(posterRoute('t', '../../secret.jpg')).toBe('/api/poster/t?file=..%2F..%2Fsecret.jpg')
  })
})

describe('the provider contract for assets', () => {
  it('returns poster candidates as file names, not URLs', async () => {
    const provider = new FakeVideoProvider()
    const ticket = await provider.createUpload({ title: 'x', sizeBytes: 1 })

    // The fake settles to ready on a timer; poll rather than sleep a fixed amount.
    let candidates: string[] = []
    for (let i = 0; i < 40 && candidates.length === 0; i++) {
      await new Promise((r) => setTimeout(r, 100))
      candidates = (await provider.getStatus(ticket.providerId)).posterCandidates
    }

    expect(candidates.length).toBeGreaterThan(0)
    for (const candidate of candidates) {
      expect(candidate).not.toMatch(/^https?:|^\//)
    }
  })

  it('signs an asset URL on demand', async () => {
    const provider = new FakeVideoProvider()
    const url = await provider.getAssetUrl({ providerId: 'abc', file: 'frame-1', ttlS: 3600 })
    expect(url).toContain('abc')
  })
})

describe('GET /api/poster/[titleId]', () => {
  async function get(titleId: string, file?: string): Promise<Response> {
    const { GET } = await import('@/app/api/poster/[titleId]/route')
    const query = file ? `?file=${encodeURIComponent(file)}` : ''
    return GET(new Request(`http://aanya-vikram.mehfilbox.app/api/poster/${titleId}${query}`), {
      params: Promise.resolve({ titleId }),
    })
  }

  it('redirects to a freshly signed provider URL', async () => {
    const catalogue = makeCatalogue()
    const title = makeTitle(catalogue.id, { providerId: 'asset-1' })
    repository = installRepository({
      ...emptySnapshot(),
      catalogues: [catalogue],
      titles: [title],
    })

    const response = await get(title.id, 'thumbnail_1.jpg')
    expect(response.status).toBe(302)
    expect(response.headers.get('location')).toContain('asset-1')
  })

  it('caches the redirect for less time than the signature is valid for', async () => {
    const catalogue = makeCatalogue()
    const title = makeTitle(catalogue.id, { providerId: 'asset-1' })
    installRepository({ ...emptySnapshot(), catalogues: [catalogue], titles: [title] })

    const cacheControl = (await get(title.id)).headers.get('cache-control') ?? ''
    const maxAge = Number(/max-age=(\d+)/.exec(cacheControl)?.[1] ?? 0)

    expect(maxAge).toBeGreaterThan(0)
    // Otherwise a cached 302 outlives the URL it points at.
    expect(maxAge).toBeLessThan(60 * 60)
  })

  it('refuses a file name that tries to leave the asset directory', async () => {
    const catalogue = makeCatalogue()
    const title = makeTitle(catalogue.id, { providerId: 'asset-1' })
    installRepository({ ...emptySnapshot(), catalogues: [catalogue], titles: [title] })

    expect((await get(title.id, '../../../etc/passwd')).status).toBe(400)
  })

  it('serves a poster for an unpublished title inside a live catalogue, for the admin', async () => {
    const catalogue = makeCatalogue()
    const title = makeTitle(catalogue.id, { providerId: 'asset-1', published: false })
    installRepository({ ...emptySnapshot(), catalogues: [catalogue], titles: [title] })

    expect((await get(title.id)).status).toBe(302)
  })

  it('serves a poster for a draft catalogue, which only its operator can reach', async () => {
    const catalogue = makeCatalogue({ status: 'draft' })
    const title = makeTitle(catalogue.id, { providerId: 'asset-1' })
    installRepository({ ...emptySnapshot(), catalogues: [catalogue], titles: [title] })

    expect((await get(title.id)).status).toBe(302)
  })

  it('refuses to leak imagery from a lapsed catalogue', async () => {
    const catalogue = makeCatalogue({ subStatus: 'lapsed' })
    const title = makeTitle(catalogue.id, { providerId: 'asset-1' })
    installRepository({ ...emptySnapshot(), catalogues: [catalogue], titles: [title] })

    expect((await get(title.id)).status).toBe(404)
  })

  it('404s for an unknown title and for one that was never uploaded', async () => {
    const catalogue = makeCatalogue()
    const noAsset = makeTitle(catalogue.id, { providerId: null })
    installRepository({ ...emptySnapshot(), catalogues: [catalogue], titles: [noAsset] })

    expect((await get('44444444-4444-4444-8444-000000000000')).status).toBe(404)
    expect((await get(noAsset.id)).status).toBe(404)
  })
})

describe('the webhook stores a durable poster URL', () => {
  it('never writes a signed or absolute provider URL into the database', async () => {
    const { createHash } = await import('node:crypto')

    // Register the asset with the provider so it actually reports poster candidates — an
    // asset it has never seen has none, and the test would pass for the wrong reason.
    const provider = new FakeVideoProvider()
    setVideoProvider(provider)
    const ticket = await provider.createUpload({ title: 'webhook', sizeBytes: 1 })
    for (let i = 0; i < 40; i++) {
      if ((await provider.getStatus(ticket.providerId)).posterCandidates.length > 0) break
      await new Promise((r) => setTimeout(r, 100))
    }

    const catalogue = makeCatalogue()
    const title = makeTitle(catalogue.id, {
      status: 'processing',
      durationS: null,
      providerId: ticket.providerId,
    })
    repository = installRepository({
      ...emptySnapshot(),
      catalogues: [catalogue],
      titles: [title],
    })

    const body = JSON.stringify({ VideoGuid: ticket.providerId, Status: 4 })
    const signature = createHash('sha256')
      .update(`${process.env.SESSION_SECRET}${body}`)
      .digest('hex')

    const { POST } = await import('@/app/api/webhooks/bunny/route')
    await POST(
      new Request('http://mehfilbox.app/api/webhooks/bunny', {
        method: 'POST',
        headers: { 'x-bunny-signature': signature },
        body,
      }),
    )

    const updated = await repository.getTitle(title.id)
    expect(updated!.posterCandidates.length).toBeGreaterThan(0)
    expect(updated!.posterUrl).toMatch(/^\/api\/poster\//)
    expect(updated!.posterUrl).not.toMatch(/token=|expires=/)
    for (const candidate of updated!.posterCandidates) {
      expect(candidate).toMatch(/^\/api\/poster\//)
    }
  })
})

describe('eyebrowFor', () => {
  /**
   * Operators name a film after the event it shows, so the category lands on top of the name it
   * was meant to qualify. "The Ceremony / The Ceremony" reads as a rendering fault, not design.
   */
  it('drops an eyebrow that only repeats the title', () => {
    expect(eyebrowFor('The Ceremony', 'ceremony')).toBeNull()
    expect(eyebrowFor('Reception', 'reception')).toBeNull()
  })

  it('drops it when the title already contains it', () => {
    expect(eyebrowFor('Haldi Morning', 'haldi')).toBeNull()
    expect(eyebrowFor('The Reception', 'reception')).toBeNull()
  })

  it('keeps an eyebrow that tells the guest something new', () => {
    expect(eyebrowFor('How We Met', 'pre_wedding')).toBe(categoryEyebrow('pre_wedding'))
    expect(eyebrowFor('Sangeet Night', 'highlights')).toBe(categoryEyebrow('highlights'))
  })

  it('ignores case and leading articles rather than being literal', () => {
    expect(eyebrowFor('the CEREMONY', 'ceremony')).toBeNull()
  })
})
