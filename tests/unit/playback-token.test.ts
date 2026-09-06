import { beforeEach, describe, expect, it, vi } from 'vitest'
import { setVideoProvider } from '@/lib/video'
import { FakeVideoProvider } from '@/lib/video/fake'
import { installRepository, makeCatalogue, makeTitle } from '../helpers/repository'

/**
 * doc 10 §1 test 7: a playback token is scoped to catalogue **and** title — a token for title A
 * cannot fetch title B. Plus the access rules in doc 07 that guard the endpoint.
 */

vi.mock('next/headers', () => ({
  cookies: async () => ({ get: () => undefined }),
}))

async function post(body: unknown): Promise<Response> {
  const { POST } = await import('@/app/api/playback/token/route')
  return POST(
    new Request('http://aanya-vikram.mehfilbox.app/api/playback/token', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-forwarded-for': `10.0.0.${Math.floor(Math.random() * 250)}` },
      body: JSON.stringify(body),
    }),
  )
}

describe('POST /api/playback/token', () => {
  beforeEach(() => {
    setVideoProvider(new FakeVideoProvider())
  })

  it('mints a scoped, expiring token for a published, ready title', async () => {
    const catalogue = makeCatalogue()
    const title = makeTitle(catalogue.id, { slug: 'the-ceremony' })
    installRepository({
      ...(await emptyStore()),
      catalogues: [catalogue],
      titles: [title],
    })

    const response = await post({ catalogue: catalogue.slug, titleSlug: title.slug })
    expect(response.status).toBe(200)

    const body = (await response.json()) as { playbackUrl: string; expiresAt: string }

    // The URL carries a signature and an expiry. The asset it points at is the provider's
    // business — the `fake` driver serves one shared sample clip — so what is asserted here is
    // the shape of the grant, not the path. Scoping is the next test.
    const url = new URL(body.playbackUrl, 'http://localhost')
    expect(url.searchParams.get('token')).toBeTruthy()
    expect(Number(url.searchParams.get('expires'))).toBeGreaterThan(Date.now() / 1000)

    expect(new Date(body.expiresAt).getTime()).toBeGreaterThan(Date.now())
    expect(response.headers.get('cache-control')).toBe('no-store')
  })

  it('produces a different signature per title, so one token cannot fetch another', async () => {
    const catalogue = makeCatalogue()
    const a = makeTitle(catalogue.id, { slug: 'film-a' })
    const b = makeTitle(catalogue.id, { slug: 'film-b' })
    installRepository({ ...(await emptyStore()), catalogues: [catalogue], titles: [a, b] })

    const [tokenA, tokenB] = await Promise.all([
      post({ catalogue: catalogue.slug, titleSlug: 'film-a' }).then((r) => r.json()),
      post({ catalogue: catalogue.slug, titleSlug: 'film-b' }).then((r) => r.json()),
    ])

    const signature = (url: string) => new URL(url, 'http://x').searchParams.get('token')
    expect(signature(tokenA.playbackUrl)).not.toBe(signature(tokenB.playbackUrl))
  })

  it('binds the signature to the catalogue as well as the title', async () => {
    const provider = new FakeVideoProvider()
    const one = await provider.getPlaybackToken({
      providerId: 'shared',
      scope: { catalogueId: 'catalogue-1', titleId: 'title-1' },
      ttlS: 3600,
    })
    const two = await provider.getPlaybackToken({
      providerId: 'shared',
      scope: { catalogueId: 'catalogue-2', titleId: 'title-1' },
      ttlS: 3600,
    })
    expect(one.playbackUrl).not.toBe(two.playbackUrl)
  })

  it('refuses an unpublished title as if it did not exist', async () => {
    const catalogue = makeCatalogue()
    const title = makeTitle(catalogue.id, { slug: 'staged', published: false })
    installRepository({ ...(await emptyStore()), catalogues: [catalogue], titles: [title] })

    const response = await post({ catalogue: catalogue.slug, titleSlug: 'staged' })
    expect(response.status).toBe(404)
    expect((await response.json()).error.code).toBe('CATALOGUE_NOT_FOUND')
  })

  it('says a processing title is not ready, rather than pretending it is missing', async () => {
    const catalogue = makeCatalogue()
    const title = makeTitle(catalogue.id, { slug: 'encoding', status: 'processing' })
    installRepository({ ...(await emptyStore()), catalogues: [catalogue], titles: [title] })

    const response = await post({ catalogue: catalogue.slug, titleSlug: 'encoding' })
    expect(response.status).toBe(409)
    expect((await response.json()).error.code).toBe('TITLE_NOT_READY')
  })

  it('refuses a draft catalogue', async () => {
    const catalogue = makeCatalogue({ status: 'draft' })
    installRepository({
      ...(await emptyStore()),
      catalogues: [catalogue],
      titles: [makeTitle(catalogue.id)],
    })

    const response = await post({ catalogue: catalogue.slug, titleSlug: 'a-film' })
    expect(response.status).toBe(404)
  })

  it('routes a lapsed subscription to renewal rather than to a 404', async () => {
    const catalogue = makeCatalogue({ subStatus: 'lapsed' })
    installRepository({
      ...(await emptyStore()),
      catalogues: [catalogue],
      titles: [makeTitle(catalogue.id)],
    })

    const response = await post({ catalogue: catalogue.slug, titleSlug: 'a-film' })
    expect(response.status).toBe(402)
    expect((await response.json()).error.code).toBe('SUBSCRIPTION_INACTIVE')
  })

  it('keeps serving through the 60-day grace period', async () => {
    const catalogue = makeCatalogue({ subStatus: 'grace' })
    installRepository({
      ...(await emptyStore()),
      catalogues: [catalogue],
      titles: [makeTitle(catalogue.id)],
    })

    const response = await post({ catalogue: catalogue.slug, titleSlug: 'a-film' })
    expect(response.status).toBe(200)
  })

  it('returns the resume position for a known profile', async () => {
    const catalogue = makeCatalogue()
    const title = makeTitle(catalogue.id)
    const profileId = '77777777-7777-4777-8777-777777777777'

    installRepository({
      ...(await emptyStore()),
      catalogues: [catalogue],
      titles: [title],
      profiles: [
        {
          id: profileId,
          catalogueId: catalogue.id,
          label: 'Friends',
          avatarSeed: 'Friends',
          createdAt: '2026-07-01T00:00:00.000Z',
        },
      ],
      progress: [
        {
          profileId,
          titleId: title.id,
          positionS: 428,
          durationS: 1284,
          completed: false,
          updatedAt: '2026-07-01T00:00:00.000Z',
        },
      ],
    })

    const response = await post({ catalogue: catalogue.slug, titleSlug: title.slug, profileId })
    expect((await response.json()).resumeAtS).toBe(428)
  })

  it('does not offer to resume a title watched to the end', async () => {
    const catalogue = makeCatalogue()
    const title = makeTitle(catalogue.id)
    const profileId = '77777777-7777-4777-8777-777777777777'

    installRepository({
      ...(await emptyStore()),
      catalogues: [catalogue],
      titles: [title],
      profiles: [
        {
          id: profileId,
          catalogueId: catalogue.id,
          label: 'Family',
          avatarSeed: 'Family',
          createdAt: '2026-07-01T00:00:00.000Z',
        },
      ],
      progress: [
        {
          profileId,
          titleId: title.id,
          positionS: 1270,
          durationS: 1284,
          completed: true,
          updatedAt: '2026-07-01T00:00:00.000Z',
        },
      ],
    })

    const response = await post({ catalogue: catalogue.slug, titleSlug: title.slug, profileId })
    expect((await response.json()).resumeAtS).toBe(0)
  })
})

async function emptyStore() {
  const { emptySnapshot } = await import('@/lib/db/memory-repository')
  return emptySnapshot()
}
