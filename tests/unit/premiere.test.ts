import { beforeEach, describe, expect, it } from 'vitest'
import { POST as createCatalogue } from '@/app/api/admin/catalogues/route'
import { PATCH as patchCatalogue } from '@/app/api/admin/catalogues/[id]/route'
import { setAuthProvider } from '@/lib/admin/auth'
import type { AuthProvider } from '@/lib/admin/auth-provider'
import { resolveAccess } from '@/lib/catalogue-access'
import { verifySecret } from '@/lib/crypto'
import { setRepository } from '@/lib/db'
import { MemoryRepository, emptySnapshot } from '@/lib/db/memory-repository'
import { catalogueSchema, operatorSchema, orgSchema } from '@/lib/schema'
import { formatInZone, isValidTimeZone, wallTimeIn, zonedTimeToUtc } from '@/lib/time'

/**
 * The wizard's third step and the premiere (doc 16 §10, N-69, N-72).
 *
 * A premiere is "seven in the evening where the couple is", so the clock arithmetic is the thing
 * to hold — either side of a DST change — and then: the create route takes the step's answers,
 * a typed guest code is hashed and a wanted one is made, and a published wedding before its
 * moment answers `premiere` rather than the films.
 */

const OPERATOR = '00000000-0000-4000-8000-000000000001'
const ORG = '11111111-1111-4111-8111-11111111111a'
const LIVE = '22222222-2222-4222-8222-22222222222a'
const AT = '2026-01-01T00:00:00.000Z'

let repo: MemoryRepository

beforeEach(() => {
  const snapshot = emptySnapshot()
  snapshot.orgs.push(orgSchema.parse({ id: ORG, name: 'Kalyanam Weddings', slug: 'kalyanam', createdAt: AT }))
  snapshot.operators.push(
    operatorSchema.parse({ id: OPERATOR, orgId: ORG, email: 'operator@example.test', name: 'Operator', role: 'admin', passwordHash: '', createdAt: AT }),
  )
  snapshot.catalogues.push(
    catalogueSchema.parse({
      id: LIVE,
      orgId: ORG,
      tenantSlug: 'kalyanam',
      slug: 'aanya-vikram',
      coupleName: { en: 'Aanya & Vikram' },
      appName: { en: 'Aanya & Vikram Originals' },
      weddingDate: '2026-11-14',
      includedUntil: '2027-11-14',
      status: 'published',
      publishedAt: AT,
      createdAt: AT,
    }),
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

describe('the couple’s clock', () => {
  it('turns a wall time in a zone into the instant, either side of a DST change', () => {
    expect(zonedTimeToUtc('2026-11-14', '19:00', 'Asia/Kolkata')).toBe('2026-11-14T13:30:00.000Z')
    expect(zonedTimeToUtc('2026-07-01', '12:00', 'Europe/London')).toBe('2026-07-01T11:00:00.000Z')
    expect(zonedTimeToUtc('2026-01-01', '12:00', 'Europe/London')).toBe('2026-01-01T12:00:00.000Z')
    expect(zonedTimeToUtc('2026-06-15', '20:30', 'America/New_York')).toBe('2026-06-16T00:30:00.000Z')
  })

  it('reads the wall time back for the form, and says it in the guest’s words', () => {
    expect(wallTimeIn('2026-11-14T13:30:00.000Z', 'Asia/Kolkata')).toEqual({ date: '2026-11-14', time: '19:00' })
    expect(formatInZone('2026-11-14T13:30:00.000Z', 'Asia/Kolkata', 'en')).toMatch(/14 November 2026.*7:00 pm/i)
    expect(formatInZone('2026-11-14T13:30:00.000Z', 'Asia/Kolkata', 'hi')).toMatch(/2026/)
    expect(isValidTimeZone('Asia/Kolkata')).toBe(true)
    expect(isValidTimeZone('Mars/Olympus')).toBe(false)
  })
})

describe('creating with the third step', () => {
  const create = async (extra: Record<string, unknown>) => {
    const response = await createCatalogue(
      new Request('http://mehfilbox.test/api/admin/catalogues', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          coupleName: { en: 'Meera & Arjun' },
          appName: { en: 'Meera & Arjun Originals' },
          weddingDate: '2026-12-01',
          slug: `meera-arjun-${Math.random().toString(36).slice(2, 8)}`,
          ...extra,
        }),
      }),
    )
    return { status: response.status, body: await response.json() }
  }

  it('hashes a typed guest code and keeps the clock and the premiere', async () => {
    const { status, body } = await create({
      occasion: 'engagement',
      privacy: 'passcode',
      passcode: '4821',
      timezone: 'Asia/Dubai',
      premiereAt: '2026-12-01T15:00:00.000Z',
    })
    expect(status).toBe(201)
    expect(body.catalogue).toMatchObject({ occasion: 'engagement', privacy: 'passcode', timezone: 'Asia/Dubai', premiereAt: '2026-12-01T15:00:00.000Z' })
    expect(verifySecret('4821', body.catalogue.passcodeHash)).toBe(true)
    // Typed by the operator, so not echoed back as if it were news.
    expect(body.passcode).toBeUndefined()
  })

  it('makes a code when one is wanted but not typed, and refuses a zone that does not exist', async () => {
    const made = await create({ privacy: 'passcode' })
    expect(made.status).toBe(201)
    expect(made.body.passcode).toMatch(/^\d{6}$/)
    expect(verifySecret(made.body.passcode, made.body.catalogue.passcodeHash)).toBe(true)

    expect((await create({ timezone: 'Mars/Olympus' })).status).toBe(400)
    const plain = await create({})
    expect(plain.body.catalogue).toMatchObject({ privacy: 'unlisted', timezone: 'Asia/Kolkata', premiereAt: null })
  })
})

describe('before the premiere', () => {
  const patch = (body: unknown) =>
    patchCatalogue(
      new Request(`http://mehfilbox.test/api/admin/catalogues/${LIVE}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      }),
      { params: Promise.resolve({ id: LIVE }) },
    )

  it('a published wedding answers premiere until the moment, then the films', async () => {
    const future = new Date(Date.now() + 60 * 60 * 1000).toISOString()
    expect((await patch({ premiereAt: future, timezone: 'Asia/Kolkata' })).status).toBe(200)
    expect((await resolveAccess('aanya-vikram')).kind).toBe('premiere')

    const past = new Date(Date.now() - 60 * 1000).toISOString()
    await patch({ premiereAt: past })
    expect((await resolveAccess('aanya-vikram')).kind).toBe('ok')

    await patch({ premiereAt: null })
    expect((await resolveAccess('aanya-vikram')).kind).toBe('ok')
  })

  it('does not outrank a draft, and comes before the guest code', async () => {
    const future = new Date(Date.now() + 60 * 60 * 1000).toISOString()
    await patch({ premiereAt: future, privacy: 'passcode', passcode: '123456' })
    expect((await resolveAccess('aanya-vikram')).kind).toBe('premiere')
    await repo.updateCatalogue(LIVE, ORG, { status: 'draft' })
    expect((await resolveAccess('aanya-vikram')).kind).toBe('draft')
  })
})
