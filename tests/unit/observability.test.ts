import { beforeEach, describe, expect, it, vi } from 'vitest'
import { emptySnapshot, type MemoryRepository } from '@/lib/db/memory-repository'
import { reportError, requestId, setErrorSink } from '@/lib/observability'
import { setVideoProvider } from '@/lib/video'
import { FakeVideoProvider } from '@/lib/video/fake'
import { installRepository, makeCatalogue, makeTitle } from '../helpers/repository'

/**
 * Telemetry that has stopped reporting looks exactly like a system with no problems, so the
 * reporting paths get the same treatment as the features.
 */

vi.mock('next/headers', () => ({ cookies: async () => ({ get: () => undefined }) }))

describe('reportError', () => {
  beforeEach(() => {
    setErrorSink(() => {})
  })

  it('normalises anything thrown into a reportable shape', () => {
    const seen: unknown[] = []
    setErrorSink((input) => seen.push(input))

    reportError(new Error('boom'), { scope: 'test' })
    reportError('a bare string', { scope: 'test' })
    reportError({ weird: true }, { scope: 'test' })

    expect(seen).toHaveLength(3)
    for (const entry of seen as { message: string; severity: string }[]) {
      expect(typeof entry.message).toBe('string')
      expect(entry.message.length).toBeGreaterThan(0)
    }
  })

  it('carries the context through, so a report can be traced to a request', () => {
    let captured: { context: Record<string, unknown> } | undefined
    setErrorSink((input) => {
      captured = input
    })

    reportError(new Error('x'), { requestId: 'req-1', scope: 'playback', catalogueId: 'cat-1' })

    expect(captured?.context).toMatchObject({
      requestId: 'req-1',
      scope: 'playback',
      catalogueId: 'cat-1',
    })
  })

  it('never throws, even when the sink does', () => {
    setErrorSink(() => {
      throw new Error('the sink itself is broken')
    })
    // Reporting a failure must not become a second failure.
    expect(() => reportError(new Error('original'))).not.toThrow()
  })

  it('defaults to error severity and honours an explicit one', () => {
    const seen: { severity: string }[] = []
    setErrorSink((input) => seen.push(input))

    reportError(new Error('a'))
    reportError(new Error('b'), {}, 'warning')

    expect(seen.map((s) => s.severity)).toEqual(['error', 'warning'])
  })
})

describe('requestId', () => {
  it('prefers the platform header so logs can be lined up with the platform record', () => {
    const request = new Request('http://x/', { headers: { 'x-vercel-id': 'bom1::abc123' } })
    expect(requestId(request)).toBe('bom1::abc123')
  })

  it('always returns something, so every request is traceable', () => {
    expect(requestId(new Request('http://x/')).length).toBeGreaterThan(4)
  })
})

describe('POST /api/qoe', () => {
  let repository: MemoryRepository
  let slug: string
  let titleId: string

  beforeEach(() => {
    setVideoProvider(new FakeVideoProvider())
    const catalogue = makeCatalogue()
    const title = makeTitle(catalogue.id)
    slug = catalogue.slug
    titleId = title.id
    repository = installRepository({
      ...emptySnapshot(),
      catalogues: [catalogue],
      titles: [title],
    })
    void repository
  })

  async function beacon(body: unknown): Promise<Response> {
    const { POST } = await import('@/app/api/qoe/route')
    return POST(
      new Request('http://aanya-vikram.mehfilbox.app/api/qoe', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-forwarded-for': `10.9.0.${Math.floor(Math.random() * 250)}`,
        },
        body: JSON.stringify(body),
      }),
    )
  }

  it('accepts a playback-start beacon', async () => {
    const response = await beacon({
      catalogue: slug,
      titleId,
      event: 'start',
      startMs: 900,
      connection: '4g',
    })
    expect(response.status).toBe(204)
  })

  it('swallows a malformed beacon rather than erroring at a player mid-playback', async () => {
    expect((await beacon({ nonsense: true })).status).toBe(204)
    expect((await beacon({ catalogue: slug, titleId, event: 'nope' })).status).toBe(204)
  })

  it('still refuses to confirm that an unknown catalogue exists', async () => {
    const response = await beacon({
      catalogue: 'someone-elses-wedding',
      titleId,
      event: 'start',
      startMs: 100,
    })
    expect(response.status).toBe(404)
  })

  it('rejects an implausible start time rather than skewing the p75', async () => {
    // Schema rejects it, and the handler treats a schema failure as a no-op.
    expect((await beacon({ catalogue: slug, titleId, event: 'start', startMs: 999_999 })).status).toBe(204)
  })

  it('carries no guest identity — the payload cannot hold one', async () => {
    const { POST } = await import('@/app/api/qoe/route')
    void POST
    // doc 06 §5: the viewer side stays free of personal data, telemetry included. A profileId
    // in this payload would be silently dropped by the schema rather than recorded.
    const response = await beacon({
      catalogue: slug,
      titleId,
      event: 'start',
      startMs: 800,
      profileId: '77777777-7777-4777-8777-777777777777',
      email: 'guest@example.com',
    })
    expect(response.status).toBe(204)
  })
})

describe('the usage rollup (doc 05 §2 cost guardrails)', () => {
  it('records per-catalogue usage and flags a catalogue over the delivery threshold', async () => {
    const { DELIVERY_ALERT_GB } = await import('@/app/api/cron/usage/route')
    expect(DELIVERY_ALERT_GB).toBe(300)

    const catalogue = makeCatalogue()
    const repository = installRepository({
      ...emptySnapshot(),
      catalogues: [catalogue],
      titles: [makeTitle(catalogue.id, { providerId: 'asset-1' })],
    })

    setVideoProvider(new FakeVideoProvider())

    const { GET } = await import('@/app/api/cron/usage/route')
    const response = await GET(new Request('http://mehfilbox.app/api/cron/usage'))
    expect(response.status).toBe(200)

    const body = (await response.json()) as { examined: number }
    expect(body.examined).toBe(1)

    // The table was there and nothing wrote to it before; that is the actual fix.
    const usage = await repository.listUsage(catalogue.id)
    expect(usage).toHaveLength(1)
    expect(usage[0]!.month).toMatch(/^\d{4}-\d{2}-01$/)
  })

  it('walks every catalogue, because it is an operations job and not an operator request', async () => {
    const a = makeCatalogue({ slug: 'org-a-wedding' })
    const b = makeCatalogue({ slug: 'org-b-wedding', orgId: '00000000-0000-4000-8000-000000000001' })
    const repository = installRepository({ ...emptySnapshot(), catalogues: [a, b] })

    expect(await repository.listAllCatalogues()).toHaveLength(2)
    // …whereas the operator-facing method stays scoped.
    expect(await repository.listCatalogues({ orgId: a.orgId })).toHaveLength(1)
  })
})
