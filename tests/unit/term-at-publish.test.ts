import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { DELETE as unpublish, POST as publish } from '@/app/api/admin/catalogues/[id]/publish/route'
import { POST as createCatalogue } from '@/app/api/admin/catalogues/route'
import { setAuthProvider } from '@/lib/admin/auth'
import type { AuthProvider } from '@/lib/admin/auth-provider'
import { makeCredits } from '@/lib/admin/credits'
import { setRepository } from '@/lib/db'
import { MemoryRepository, emptySnapshot, type Snapshot } from '@/lib/db/memory-repository'
import { SEED_PLANS } from '@/lib/db/seed-data'
import { GRACE_DAYS, nextSubStatus, runLifecycle } from '@/lib/lifecycle'
import { milestoneFor, queueDueWarnings } from '@/lib/notify/schedule'
import { render } from '@/lib/notify/templates'
import { CREDIT_PLAN_IDS, type CreditPlanId } from '@/lib/plans'
import { catalogueSchema, operatorSchema, orgSchema } from '@/lib/schema'
import { termEnd, termPhrase } from '@/lib/term'
import { installRepository, makeCatalogue } from '../helpers/repository'

/**
 * N-120, D-61 — a wedding's term starts at its first Publish, not when it is created, and its
 * length is the plan's.
 *
 * The writer is small. What this file is really about is the readers: a wedding that has never been
 * published has *no* term, and every place that compares a term to a date must read that as "not
 * started" and never as "expired" — `new Date(null)` is 1 January 1970, and a job that believed it
 * would put a wedding into grace on the first day it was live.
 */

vi.mock('next/headers', () => ({ cookies: async () => ({ get: () => undefined }) }))

const ORG = '11111111-1111-4111-8111-11111111111a'
const OPERATOR = '00000000-0000-4000-8000-000000000001'
const AT = '2026-01-01T00:00:00.000Z'
const NOW = new Date('2026-09-19T10:00:00.000Z')

const ids: Record<CreditPlanId, string> = {
  deliver: '22222222-2222-4222-8222-22222222222a',
  keep: '22222222-2222-4222-8222-22222222222b',
  cinema: '22222222-2222-4222-8222-22222222222c',
}

let repo: MemoryRepository
let snapshot: Snapshot
let slugs = 0

function draft(planId: CreditPlanId, over: Record<string, unknown> = {}) {
  return catalogueSchema.parse({
    id: ids[planId],
    orgId: ORG,
    tenantSlug: 'kalyanam',
    slug: `${planId}-wedding`,
    coupleName: { en: planId },
    appName: { en: `${planId} Originals` },
    weddingDate: '2026-12-14',
    includedUntil: null,
    createdAt: AT,
    planId,
    ...over,
  })
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(NOW)

  snapshot = emptySnapshot()
  snapshot.plans = structuredClone(SEED_PLANS)
  snapshot.orgs.push(orgSchema.parse({ id: ORG, name: 'Kalyanam Weddings', slug: 'kalyanam', createdAt: AT }))
  snapshot.operators.push(
    operatorSchema.parse({
      id: OPERATOR,
      orgId: ORG,
      email: 'operator@example.test',
      name: 'Operator',
      role: 'admin',
      passwordHash: '',
      createdAt: AT,
    }),
  )
  snapshot.catalogues.push(draft('deliver'), draft('keep'), draft('cinema'))
  snapshot.credits.push(
    ...CREDIT_PLAN_IDS.flatMap((planId) => makeCredits({ orgId: ORG, count: 2, planId, grantedBy: 'test' })),
  )
  repo = new MemoryRepository(snapshot)
  setRepository(repo)
  setAuthProvider({
    name: 'stub',
    currentUser: async () => ({ id: OPERATOR, email: 'operator@example.test' }),
    signIn: async () => null,
    signOut: async () => {},
  } as unknown as AuthProvider)
})

afterEach(() => vi.useRealTimers())

const params = (id: string) => ({ params: Promise.resolve({ id }) })
const publishOf = (planId: CreditPlanId) =>
  publish(new Request('http://mehfilbox.test/x', { method: 'POST' }), params(ids[planId]))
const unpublishOf = (planId: CreditPlanId) =>
  unpublish(new Request('http://mehfilbox.test/x', { method: 'DELETE' }), params(ids[planId]))
const termOf = async (planId: CreditPlanId) => (await repo.getCatalogue(ids[planId], ORG))?.includedUntil
const advance = (days: number) => vi.setSystemTime(new Date(NOW.getTime() + days * 24 * 60 * 60 * 1000))

describe('a new wedding has no term', () => {
  it.each(CREDIT_PLAN_IDS)('on %s — nothing counts down while it is a draft', async (planId) => {
    const response = await createCatalogue(
      new Request('http://mehfilbox.test/api/admin/catalogues', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          coupleName: { en: 'Aanya & Vikram' },
          appName: { en: 'Aanya & Vikram Originals' },
          weddingDate: '2026-12-14',
          slug: `aanya-vikram-${++slugs}`,
          planId,
        }),
      }),
    )

    expect(response.status).toBe(201)
    const { catalogue } = await response.json()
    expect(catalogue.includedUntil).toBeNull()
    expect((await repo.getCatalogue(catalogue.id, ORG))?.includedUntil).toBeNull()
  })
})

describe('the term starts at the first Publish, and its length is the plan’s', () => {
  it('runs Deliver for ninety days', async () => {
    expect((await publishOf('deliver')).status).toBe(200)

    expect(await termOf('deliver')).toBe('2026-12-18T10:00:00.000Z')
  })

  it.each(['keep', 'cinema'] as const)('runs %s for twelve calendar months', async (planId) => {
    expect((await publishOf(planId)).status).toBe(200)

    expect(await termOf(planId)).toBe('2027-09-19T10:00:00.000Z')
  })

  it('counts from the day it is published, not the day it was made', async () => {
    advance(200) // a wedding that sat as a draft for most of a year

    await publishOf('deliver')

    // 19 Sept 2026 + 200 days is 7 April 2027; ninety days on from there is 6 July.
    expect(await termOf('deliver')).toBe('2027-07-06T10:00:00.000Z')
  })

  it('reads the length from the plan row, so changing the row changes the term', async () => {
    const deliver = snapshot.plans.find((plan) => plan.id === 'deliver')!
    deliver.termDays = 30

    await publishOf('deliver')

    expect(await termOf('deliver')).toBe('2026-10-19T10:00:00.000Z')
  })

  it('shows the same end date on the record the response returns', async () => {
    const { catalogue } = await (await publishOf('deliver')).json()

    expect(catalogue.includedUntil).toBe('2026-12-18T10:00:00.000Z')
  })
})

describe('the term is never restarted', () => {
  it('survives an unpublish and a republish unchanged', async () => {
    await publishOf('deliver')
    const first = await termOf('deliver')

    await unpublishOf('deliver')
    advance(40)
    expect((await publishOf('deliver')).status).toBe(200)

    expect(await termOf('deliver')).toBe(first)
  })

  it('keeps an end date the platform set on purpose, before the first Publish', async () => {
    await repo.updateCatalogue(ids.keep, ORG, { includedUntil: '2030-01-01T00:00:00.000Z' })

    await publishOf('keep')

    expect(await termOf('keep')).toBe('2030-01-01T00:00:00.000Z')
  })

  it('leaves a wedding published before terms moved exactly as it was', async () => {
    await repo.updateCatalogue(ids.cinema, ORG, {
      includedUntil: '2026-11-01T00:00:00.000Z',
      publishedAt: '2026-01-15T00:00:00.000Z',
    })

    await publishOf('cinema')

    expect(await termOf('cinema')).toBe('2026-11-01T00:00:00.000Z')
  })
})

describe('a plan with no term refuses the publish and costs nothing', () => {
  it('when the row has no term', async () => {
    snapshot.plans.find((plan) => plan.id === 'deliver')!.termDays = null

    const response = await publishOf('deliver')

    expect(response.status).toBe(500)
    // Nothing moved: still a draft, still no term, and — the point — no credit was spent.
    const wedding = await repo.getCatalogue(ids.deliver, ORG)
    expect(wedding).toMatchObject({ status: 'draft', includedUntil: null, publishedAt: null })
    expect((await repo.creditBalance(ORG, NOW.toISOString())).byPlan.deliver).toMatchObject({
      available: 2,
      consumed: 0,
    })
  })

  it('when the price list could not supply the plan at all', async () => {
    snapshot.plans.length = 0

    expect((await publishOf('keep')).status).toBe(500)
    expect(await termOf('keep')).toBeNull()
  })

  it('and does not tell the studio our internals', async () => {
    snapshot.plans.find((plan) => plan.id === 'deliver')!.termDays = null

    const { error } = await (await publishOf('deliver')).json()

    expect(error.message).toBe('Something went wrong')
  })
})

describe('no term is not an expired term', () => {
  const TODAY = new Date('2026-06-01T09:00:00.000Z')

  it('serves a published wedding whose term has not started, rather than lapsing it', async () => {
    const wedding = makeCatalogue({ slug: 'no-term-live', includedUntil: null, status: 'published' })
    installRepository({ ...emptySnapshot(), catalogues: [wedding] })

    const { resolveAccess } = await import('@/lib/catalogue-access')
    expect((await resolveAccess(wedding.slug)).kind).toBe('ok')
  })

  it('reports an unpublished one as a draft, never as lapsed', async () => {
    const wedding = makeCatalogue({ slug: 'no-term-draft', includedUntil: null, status: 'draft' })
    installRepository({ ...emptySnapshot(), catalogues: [wedding] })

    const { resolveAccess } = await import('@/lib/catalogue-access')
    expect((await resolveAccess(wedding.slug)).kind).toBe('draft')
  })

  it('moves nothing down the ladder, whatever its status', () => {
    for (const subStatus of ['included', 'active', 'grace'] as const) {
      expect(nextSubStatus({ subStatus, includedUntil: null }, TODAY), subStatus).toBeNull()
    }
  })

  it('leaves a published wedding with no term in `included` when the job runs', async () => {
    const wedding = makeCatalogue({ includedUntil: null, subStatus: 'included', publishedAt: AT })
    const emptied = emptySnapshot()
    emptied.orgs.push(orgSchema.parse({ id: wedding.orgId, name: 'Kalyanam Weddings', slug: 'kalyanam', createdAt: AT }))
    emptied.catalogues.push(wedding)
    const local = new MemoryRepository(emptied)
    setRepository(local)

    const result = await runLifecycle(TODAY)

    expect(result).toMatchObject({ toGrace: 0, toCold: 0 })
    expect((await local.listAllCatalogues())[0]?.subStatus).toBe('included')
  })

  it('has no rung on the warning ladder, and queues nothing', async () => {
    expect(milestoneFor(null, TODAY)).toBeNull()

    const wedding = makeCatalogue({ includedUntil: null, status: 'published' })
    const emptied = emptySnapshot()
    emptied.orgs.push(orgSchema.parse({ id: wedding.orgId, name: 'Kalyanam Weddings', slug: 'kalyanam', createdAt: AT }))
    emptied.catalogues.push(wedding)
    const local = new MemoryRepository(emptied)
    setRepository(local)

    const result = await queueDueWarnings(TODAY)

    expect(result.queued).toBe(0)
    expect(await local.listQueuedNotifications(10)).toHaveLength(0)
  })

  it('still moves a wedding whose term really has ended — the guard is for none, not for late', () => {
    const ended = new Date(TODAY)
    ended.setUTCDate(ended.getUTCDate() - (GRACE_DAYS + 1))

    expect(nextSubStatus({ subStatus: 'grace', includedUntil: ended.toISOString() }, TODAY)).toBe('cold')
  })
})

describe('what the couple is told at a handover', () => {
  it('names the end date once there is one', () => {
    expect(termEnd('2027-02-14T00:00:00.000Z', 'en')).toBe('14 February 2027')
    expect(termPhrase('2027-02-14T00:00:00.000Z', 'en')).toBe('it runs to 14 February 2027')
  })

  it('says the term starts at first Publish while there is not', () => {
    expect(termEnd(null, 'en')).toBeNull()
    expect(termPhrase(null, 'en')).toBe('its term starts the day it is first published')
  })

  it.each(['en', 'hi'] as const)('reads as a whole sentence in %s, with no gap and no placeholder', (locale) => {
    for (const includedUntil of [null, '2027-02-14T00:00:00.000Z']) {
      const out = render('handover', locale, {
        coupleName: 'Aanya',
        studioName: 'Kalyanam',
        url: 'https://mehfilbox.com/x',
        term: termPhrase(includedUntil, locale),
      })

      expect(out.text, `${locale} ${includedUntil}`).not.toMatch(/\{[a-zA-Z]+\}/)
      expect(out.html, `${locale} ${includedUntil}`).not.toMatch(/\{[a-zA-Z]+\}/)
      // The old copy ended "…and it runs to ." when there was no date; a comma followed by nothing
      // is what that looks like.
      expect(out.text).not.toMatch(/(?:,|और) ?[.।]/)
    }
    expect(render('handover', 'en', { coupleName: 'A', studioName: 'S', url: 'u', term: termPhrase(null, 'en') }).text).toContain(
      'its term starts the day it is first published',
    )
  })
})
