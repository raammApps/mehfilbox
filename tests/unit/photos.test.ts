import { afterEach, describe, expect, it } from 'vitest'
import { defaultAlbumId, photoKey, setPhotoProvider, signPhotos } from '@/lib/photos'
import { FakePhotoProvider } from '@/lib/photos/fake'
import type { PhotoProvider } from '@/lib/photos/provider'
import { photoSchema } from '@/lib/schema'

/**
 * Photographs upload several at a time, which is where the interesting failure lives.
 *
 * The first working version generated a fresh album id per request, so three photographs
 * dropped together produced three albums: every request reached "does an album exist?" before
 * any had finished creating one. Deriving the id makes the primary key arbitrate instead.
 */

const CATALOGUE = '79594419-9452-406b-9510-2b75c925919b'

describe('defaultAlbumId', () => {
  it('is stable, so parallel uploads converge on one album', () => {
    const ids = Array.from({ length: 8 }, () => defaultAlbumId(CATALOGUE))
    expect(new Set(ids).size).toBe(1)
  })

  it('differs per catalogue, so one couple never writes into another album', () => {
    expect(defaultAlbumId(CATALOGUE)).not.toBe(defaultAlbumId('11111111-1111-4111-8111-111111111111'))
  })

  it('is a valid v5 uuid, because the column is typed', () => {
    expect(defaultAlbumId(CATALOGUE)).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
    )
  })
})

describe('photoKey', () => {
  it('namespaces by catalogue, so deleting one sweeps a prefix', () => {
    expect(photoKey(CATALOGUE, 'photo-1', 'jpg')).toBe(`c/${CATALOGUE}/w2048/photo-1.jpg`)
  })

  it('normalises the extension however it arrives', () => {
    expect(photoKey(CATALOGUE, 'p', '.JPG')).toBe(`c/${CATALOGUE}/w2048/p.jpg`)
  })

  /**
   * The width is in the path so a URL says what it is — which is what lets `photoSrcSet`
   * derive the set, and tell a photograph stored before renditions from one stored after.
   */
  it('puts each rendition under its own width', () => {
    expect(photoKey(CATALOGUE, 'p', 'jpg', 480)).toBe(`c/${CATALOGUE}/w480/p.jpg`)
    expect(photoKey(CATALOGUE, 'p', 'jpg', 1024)).toBe(`c/${CATALOGUE}/w1024/p.jpg`)
  })

  it('keeps renditions of one photograph under one catalogue prefix', () => {
    const keys = [2048, 1024, 480].map((w) => photoKey(CATALOGUE, 'p', 'jpg', w))
    expect(keys.every((k) => k.startsWith(`c/${CATALOGUE}/`))).toBe(true)
    expect(new Set(keys).size).toBe(3)
  })
})

describe('the provider contract', () => {
  it('stores, serves and forgets', async () => {
    const provider = new FakePhotoProvider()
    const key = photoKey(CATALOGUE, 'p1', 'png')

    const stored = await provider.put(key, new ArrayBuffer(8), 'image/png')
    expect(stored.url).toBe(provider.urlFor(key))
    expect(provider.list()).toEqual([key])

    await provider.remove(key)
    expect(provider.list()).toEqual([])
  })

  it('treats deleting twice as success', async () => {
    const provider = new FakePhotoProvider()
    await expect(provider.remove('never-existed')).resolves.toBeUndefined()
  })

  it('signs nothing, because there is no real CDN behind it to enforce a token', () => {
    expect(new FakePhotoProvider().signPath('/c/cat-1/w2048/p1.jpg', 3600)).toBe('')
  })
})

/**
 * N-83 — every photograph is now signed, on every catalogue, whether or not it has a passcode
 * (Sandeep's call: a plain URL for WhatsApp's own preview fetch was the alternative, and
 * `docs/DEPLOYMENT.md`'s own note that WhatsApp caches a preview for days is what makes a
 * signed, TTL'd URL safe for that fetch too).
 *
 * File-scoped, not directory-scoped, and that distinction is load-bearing, not cosmetic: a first
 * version signed once per catalogue and shipped to production 403ing every photograph, because
 * this pull zone's Token Authentication only honours a token for the exact path it names. These
 * tests pin the current, verified-live shape — a stub that signs each path differently, so a bug
 * that reused one token across every file (the original mistake) would fail them.
 */
describe('signPhotos', () => {
  const PHOTO_1 = '11111111-1111-4111-8111-111111111111'
  const PHOTO_2 = '22222222-2222-4222-8222-222222222222'

  function photo(id: string, url: string) {
    return photoSchema.parse({ id, albumId: '44444444-4444-4444-8444-444444444444', url, sortOrder: 0 })
  }

  afterEach(() => {
    setPhotoProvider(new FakePhotoProvider())
  })

  it('signs each photograph by its own path, not one shared token', () => {
    setPhotoProvider(stubProvider((path) => `?token=for(${path})&expires=123`))
    const photos = [
      photo(PHOTO_1, 'https://cdn.example.net/c/cat-1/p1.jpg'),
      photo(PHOTO_2, 'https://cdn.example.net/c/cat-1/p2.jpg'),
    ]

    const signed = signPhotos(CATALOGUE, photos)

    expect(signed.map((p) => p.url)).toEqual([
      'https://cdn.example.net/c/cat-1/p1.jpg?token=for(/c/cat-1/p1.jpg)&expires=123',
      'https://cdn.example.net/c/cat-1/p2.jpg?token=for(/c/cat-1/p2.jpg)&expires=123',
    ])
  })

  it('signs every width in the srcset with its own token, not the master\'s', () => {
    setPhotoProvider(stubProvider((path) => `?token=for(${path})&expires=123`))
    const photos = [photo(PHOTO_1, 'https://cdn.example.net/c/cat-1/w2048/p1.jpg')]

    const [signed] = signPhotos(CATALOGUE, photos)

    expect(signed!.url).toBe(
      'https://cdn.example.net/c/cat-1/w2048/p1.jpg?token=for(/c/cat-1/w2048/p1.jpg)&expires=123',
    )
    expect(signed!.srcSet).toBe(
      [
        'https://cdn.example.net/c/cat-1/w2048/p1.jpg?token=for(/c/cat-1/w2048/p1.jpg)&expires=123 2048w',
        'https://cdn.example.net/c/cat-1/w1024/p1.jpg?token=for(/c/cat-1/w1024/p1.jpg)&expires=123 1024w',
        'https://cdn.example.net/c/cat-1/w480/p1.jpg?token=for(/c/cat-1/w480/p1.jpg)&expires=123 480w',
      ].join(', '),
    )
  })

  it('joins with `&`, not a second `?`, for a url that already has a query', () => {
    // Found live, not reasoned out: the demo catalogue's photographs reuse the poster-frame
    // generator (`/api/poster/frame?asset=…&n=1`), which already has a query string. A naive
    // `${url}${query}` concatenation wrote a second `?` into the URL and silently swallowed the
    // token inside the poster route's own `n` parameter instead of adding one.
    setPhotoProvider(stubProvider(() => '?token=abc&expires=123'))
    const photos = [photo(PHOTO_1, '/api/poster/frame?asset=demo-photo-1&n=1')]

    expect(signPhotos(CATALOGUE, photos)[0]!.url).toBe(
      '/api/poster/frame?asset=demo-photo-1&n=1&token=abc&expires=123',
    )
  })

  it('leaves the input array untouched', () => {
    setPhotoProvider(stubProvider(() => '?token=abc&expires=123'))
    const photos = [photo(PHOTO_1, 'https://cdn.example.net/c/cat-1/p1.jpg')]

    signPhotos(CATALOGUE, photos)

    expect(photos[0]!.url).toBe('https://cdn.example.net/c/cat-1/p1.jpg')
  })

  it('passes photographs through unchanged when the driver has nothing to sign', () => {
    setPhotoProvider(new FakePhotoProvider())
    const photos = [photo(PHOTO_1, '/fake-photos/c/cat-1/w2048/p1.jpg')]

    const [signed] = signPhotos(CATALOGUE, photos)

    expect(signed!.url).toBe(photos[0]!.url)
    // Still derives the (unsigned) srcset — `photoSrcSet`'s own job, untouched by signing.
    expect(signed!.srcSet).toContain('/fake-photos/c/cat-1/w480/p1.jpg 480w')
  })
})

function stubProvider(sign: (path: string) => string): PhotoProvider {
  return {
    name: 'stub',
    urlFor: (key) => key,
    put: async (key) => ({ url: key, key }),
    remove: async () => {},
    signPath: (path) => sign(path),
  }
}
