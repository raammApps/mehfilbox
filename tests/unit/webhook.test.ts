import { createHash } from 'node:crypto'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { emptySnapshot, type MemoryRepository } from '@/lib/db/memory-repository'
import { setVideoProvider } from '@/lib/video'
import { FakeVideoProvider } from '@/lib/video/fake'
import { installRepository, makeCatalogue, makeTitle } from '../helpers/repository'

/**
 * doc 07 webhooks and doc 10 §5: the endpoint verifies the signature before anything else and
 * is idempotent, because the provider retries.
 *
 * The payload is treated as a *notification* only. Bunny's webhook `Status` enum is not the one
 * on the video object — the webhook calls Finished 3, the API calls it 4 — so the handler asks
 * the API what actually happened. These tests therefore drive state through the provider, not
 * through the payload.
 */

vi.mock('next/cache', () => ({
  // Pass-through, so these tests exercise what the cached function returns rather than
  // Next's caching. See tests/setup.ts for why.
  unstable_cache: <A extends unknown[], R>(fn: (...args: A) => R) => fn,
  revalidateTag: vi.fn(),
  revalidatePath: vi.fn(),
}))

const SECRET = process.env.SESSION_SECRET!

function sign(body: string): string {
  return createHash('sha256').update(`${SECRET}${body}`).digest('hex')
}

async function deliver(payload: object, signature?: string): Promise<Response> {
  const body = JSON.stringify(payload)
  const { POST } = await import('@/app/api/webhooks/bunny/route')
  return POST(
    new Request('http://mehfilbox.app/api/webhooks/bunny', {
      method: 'POST',
      headers: { 'x-bunny-signature': signature ?? sign(body) },
      body,
    }),
  )
}

let repository: MemoryRepository
let providerId: string
let titleId: string

beforeEach(() => {
  setVideoProvider(new FakeVideoProvider())

  const catalogue = makeCatalogue()
  const title = makeTitle(catalogue.id, { status: 'processing', durationS: null })
  providerId = title.providerId!
  titleId = title.id

  repository = installRepository({
    ...emptySnapshot(),
    catalogues: [catalogue],
    titles: [title],
  })
})

describe('POST /api/webhooks/bunny', () => {
  it('rejects an unsigned payload before parsing it', async () => {
    const response = await deliver({ VideoGuid: providerId, Status: 4 }, 'not-a-signature')
    expect(response.status).toBe(401)
    expect((await repository.getTitle(titleId))!.status).toBe('processing')
  })

  it('rejects a payload signed with the wrong secret', async () => {
    const body = JSON.stringify({ VideoGuid: providerId, Status: 4 })
    const wrong = createHash('sha256').update(`wrong-secret${body}`).digest('hex')
    expect((await deliver({ VideoGuid: providerId, Status: 4 }, wrong)).status).toBe(401)
  })

  it('rejects a replayed body whose payload was altered', async () => {
    const signature = sign(JSON.stringify({ VideoGuid: providerId, Status: 4 }))
    // Same signature, different body — the classic replay.
    const response = await deliver({ VideoGuid: providerId, Status: 5 }, signature)
    expect(response.status).toBe(401)
  })

  it('moves a title to ready and records its duration', async () => {
    const response = await deliver({ VideoGuid: providerId, Status: 4 })
    expect(response.status).toBe(204)

    const title = await repository.getTitle(titleId)
    expect(title!.status).toBe('ready')
    expect(title!.errorMessage).toBeNull()
  })

  it('is idempotent — a retried "finished" does not change anything a second time', async () => {
    await deliver({ VideoGuid: providerId, Status: 4 })
    const first = await repository.getTitle(titleId)

    await deliver({ VideoGuid: providerId, Status: 4 })
    const second = await repository.getTitle(titleId)

    expect(second).toEqual(first)
  })

  it('records a failure with a reason rather than dropping the title', async () => {
    // The provider is the source of truth, so that is where the failure comes from.
    const provider = new FakeVideoProvider()
    vi.spyOn(provider, 'getStatus').mockResolvedValue({
      state: 'failed',
      durationS: null,
      storageBytes: null,
      posterCandidates: [],
      thumbnailsUrl: null,
      errorMessage: 'The provider could not encode this file',
    })
    setVideoProvider(provider)

    const response = await deliver({ VideoGuid: providerId, Status: 5 })
    expect(response.status).toBe(204)

    const title = await repository.getTitle(titleId)
    expect(title!.status).toBe('failed')
    expect(title!.errorMessage).toBeTruthy()
  })

  it('asks the API rather than believing the payload', async () => {
    // A payload claiming "finished" while the API says otherwise must not publish a title —
    // the two enums genuinely disagree, so the payload cannot be trusted.
    const provider = new FakeVideoProvider()
    const getStatus = vi.spyOn(provider, 'getStatus').mockResolvedValue({
      state: 'processing',
      durationS: null,
      storageBytes: null,
      posterCandidates: [],
      thumbnailsUrl: null,
      errorMessage: null,
    })
    setVideoProvider(provider)

    await deliver({ VideoGuid: providerId, Status: 4 })

    expect(getStatus).toHaveBeenCalledWith(providerId)
    expect((await repository.getTitle(titleId))!.status).toBe('processing')
  })

  it('acknowledges an unknown asset instead of making the provider retry forever', async () => {
    const response = await deliver({ VideoGuid: 'never-seen-this', Status: 4 })
    expect(response.status).toBe(204)
  })

  it('does not overwrite a poster the operator chose by hand', async () => {
    await repository.updateTitle(titleId, {
      posterUrl: 'https://cdn.example/chosen.jpg',
      posterSource: 'custom',
    })

    await deliver({ VideoGuid: providerId, Status: 4 })

    const title = await repository.getTitle(titleId)
    expect(title!.posterUrl).toBe('https://cdn.example/chosen.jpg')
    expect(title!.posterSource).toBe('custom')
  })
})
