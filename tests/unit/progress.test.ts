import { beforeEach, describe, expect, it, vi } from 'vitest'
import { emptySnapshot } from '@/lib/db/memory-repository'
import { COMPLETION_THRESHOLD, COUNTED_PLAY_S } from '@/app/api/progress/route'
import { installRepository, makeCatalogue, makeTitle } from '../helpers/repository'
import type { MemoryRepository } from '@/lib/db/memory-repository'

/**
 * doc 10 §1 tests 5 and 6: a play counts toward the view count only past 30 seconds watched,
 * and progress marks `completed` past 95%.
 */

vi.mock('next/headers', () => ({ cookies: async () => ({ get: () => undefined }) }))

const PROFILE_ID = '77777777-7777-4777-8777-777777777777'
const OTHER_PROFILE_ID = '88888888-8888-4888-8888-888888888888'

let repository: MemoryRepository
let catalogueId: string
let titleId: string
let slug: string

function setup(options: { otherCatalogue?: boolean } = {}) {
  const catalogue = makeCatalogue()
  const title = makeTitle(catalogue.id, { durationS: 1000 })
  const other = makeCatalogue({ slug: 'someone-else' })

  repository = installRepository({
    ...emptySnapshot(),
    catalogues: options.otherCatalogue ? [catalogue, other] : [catalogue],
    titles: [title],
    profiles: [
      {
        id: PROFILE_ID,
        catalogueId: catalogue.id,
        label: 'Friends',
        avatarSeed: 'Friends',
        createdAt: '2026-07-01T00:00:00.000Z',
      },
      {
        id: OTHER_PROFILE_ID,
        catalogueId: other.id,
        label: 'Family',
        avatarSeed: 'Family',
        createdAt: '2026-07-01T00:00:00.000Z',
      },
    ],
  })

  catalogueId = catalogue.id
  titleId = title.id
  slug = catalogue.slug
}

async function beat(body: Record<string, unknown>): Promise<Response> {
  const { POST } = await import('@/app/api/progress/route')
  return POST(
    new Request('http://aanya-vikram.mehfilbox.app/api/progress', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-forwarded-for': `10.1.0.${Math.floor(Math.random() * 250)}`,
      },
      body: JSON.stringify({ catalogue: slug, profileId: PROFILE_ID, titleId, ...body }),
    }),
  )
}

describe('POST /api/progress', () => {
  beforeEach(() => setup())

  it('upserts a position and returns 204', async () => {
    const response = await beat({ positionS: 120, deltaS: 10, durationS: 1000 })
    expect(response.status).toBe(204)

    const progress = await repository.getProgress(PROFILE_ID, titleId)
    expect(progress).toMatchObject({ positionS: 120, completed: false })
  })

  it('marks completed past 95%', async () => {
    await beat({ positionS: Math.ceil(1000 * COMPLETION_THRESHOLD), deltaS: 10, durationS: 1000 })
    expect((await repository.getProgress(PROFILE_ID, titleId))!.completed).toBe(true)
  })

  it('does not mark completed just below 95%', async () => {
    await beat({ positionS: 940, deltaS: 10, durationS: 1000 })
    expect((await repository.getProgress(PROFILE_ID, titleId))!.completed).toBe(false)
  })

  it('counts a view only once the guest passes 30 seconds', async () => {
    await beat({ positionS: COUNTED_PLAY_S - 10, deltaS: 10, durationS: 1000 })
    expect((await repository.getTitle(titleId))!.viewCount).toBe(0)

    await beat({ positionS: COUNTED_PLAY_S + 5, deltaS: 10, durationS: 1000 })
    expect((await repository.getTitle(titleId))!.viewCount).toBe(1)
  })

  it('counts a view once, not once per heartbeat', async () => {
    await beat({ positionS: 40, deltaS: 10, durationS: 1000 })
    await beat({ positionS: 50, deltaS: 10, durationS: 1000 })
    await beat({ positionS: 60, deltaS: 10, durationS: 1000 })
    expect((await repository.getTitle(titleId))!.viewCount).toBe(1)
  })

  it('accumulates watch seconds from the delta, not from the position', async () => {
    await beat({ positionS: 400, deltaS: 10, durationS: 1000 })
    await beat({ positionS: 410, deltaS: 10, durationS: 1000 })
    expect((await repository.getTitle(titleId))!.watchSeconds).toBe(20)
  })

  it('records no play event when the guest was paused', async () => {
    await beat({ positionS: 400, deltaS: 0, durationS: 1000 })
    expect((await repository.getTitle(titleId))!.watchSeconds).toBe(0)
  })

  it('ignores a profile that belongs to another catalogue, without erroring', async () => {
    setup({ otherCatalogue: true })
    const { POST } = await import('@/app/api/progress/route')
    const response = await POST(
      new Request('http://x/api/progress', {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-forwarded-for': '10.2.0.1' },
        body: JSON.stringify({
          catalogue: slug,
          profileId: OTHER_PROFILE_ID,
          titleId,
          positionS: 100,
          deltaS: 10,
          durationS: 1000,
        }),
      }),
    )

    expect(response.status).toBe(204)
    expect(await repository.getProgress(OTHER_PROFILE_ID, titleId)).toBeNull()
  })

  it('rejects an implausible delta rather than trusting the client', async () => {
    const response = await beat({ positionS: 400, deltaS: 100_000, durationS: 1000 })
    expect(response.status).toBe(400)
  })
})
