import type { NextResponse } from 'next/server'
import { beforeEach, describe, expect, it } from 'vitest'
import { PATCH as studioPatch } from '@/app/api/admin/catalogues/[id]/route'
import { POST as offline } from '@/app/api/admin/platform/catalogues/[id]/offline/route'
import { POST as term } from '@/app/api/admin/platform/catalogues/[id]/term/route'
import { POST as passwordLink } from '@/app/api/admin/platform/operators/[id]/password-link/route'
import { POST as addOperator } from '@/app/api/admin/platform/operators/route'
import { POST as createStudio } from '@/app/api/admin/platform/orgs/route'
import { setAuthProvider } from '@/lib/admin/auth'
import { LocalAuthProvider } from '@/lib/admin/auth-local'
import type { AuthProvider } from '@/lib/admin/auth-provider'
import { setRepository } from '@/lib/db'
import { MemoryRepository, emptySnapshot } from '@/lib/db/memory-repository'
import { catalogueSchema, operatorSchema, orgSchema, platformAdminSchema } from '@/lib/schema'

/**
 * The platform console's writes (D-39, doc 16 §8), each recorded.
 *
 * Creating a studio is registration done by us; adding a person and sending a password link are
 * the support answers to "I can't get in"; the term is a renewal made real, and it left the
 * studio's own settings for exactly the reason a test can show — a studio can no longer move its
 * own date; offline is for abuse. And every one of them is a 404 to anyone who is not us.
 */

const ADMIN = '00000000-0000-4000-8000-00000000000a'
const OPERATOR = '00000000-0000-4000-8000-000000000001'
const ORG = '11111111-1111-4111-8111-11111111111a'
const LIVE = '22222222-2222-4222-8222-22222222222a'
const NEVER = '22222222-2222-4222-8222-22222222222b'
const AT = '2026-01-01T00:00:00.000Z'

let repo: MemoryRepository
let current: { id: string; email: string }

function installAuth() {
  const local = new LocalAuthProvider()
  setAuthProvider({
    name: 'local',
    currentUser: async () => current,
    signIn: (e: string, p: string, r: NextResponse) => local.signIn(e, p, r),
    signOut: async () => {},
    signUp: (e: string, p: string) => local.signUp(e, p),
    createUser: (e: string, p: string) => local.createUser(e, p),
    setPassword: (id: string, p: string) => local.setPassword(id, p),
  } as AuthProvider)
}
const asAdmin = () => {
  current = { id: ADMIN, email: 'root@mehfilbox.test' }
}
const asOperator = () => {
  current = { id: OPERATOR, email: 'operator@example.test' }
}

beforeEach(() => {
  const snapshot = emptySnapshot()
  snapshot.platformAdmins.push(
    platformAdminSchema.parse({ id: ADMIN, email: 'root@mehfilbox.test', name: 'Root', createdAt: AT }),
  )
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
  snapshot.catalogues.push(
    catalogueSchema.parse({
      id: LIVE,
      orgId: ORG,
      tenantSlug: 'kalyanam',
      slug: 'meera-arjun',
      coupleName: { en: 'Meera & Arjun' },
      appName: { en: 'Meera & Arjun Originals' },
      weddingDate: '2025-06-14',
      includedUntil: '2026-06-14T00:00:00.000Z',
      status: 'published',
      publishedAt: '2025-07-01T00:00:00.000Z',
      subStatus: 'lapsed',
      createdAt: AT,
    }),
    catalogueSchema.parse({
      id: NEVER,
      orgId: ORG,
      tenantSlug: 'kalyanam',
      slug: 'never',
      coupleName: { en: 'Never & Published' },
      appName: { en: 'Never Originals' },
      weddingDate: '2026-12-01',
      includedUntil: '2027-12-01T00:00:00.000Z',
      createdAt: AT,
    }),
  )
  repo = new MemoryRepository(snapshot)
  setRepository(repo)
  installAuth()
  asAdmin()
})

const json = (body: unknown) => ({
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify(body),
})
const params = (id: string) => ({ params: Promise.resolve({ id }) })
const queued = () => repo.listQueuedNotifications(20)
const actions = async () => (await repo.listPlatformAudit({ limit: 20 })).map((entry) => entry.action)

describe('creating a studio', () => {
  it('makes the org, its first operator, a set-password link and its opening credits', async () => {
    const response = await createStudio(
      new Request('http://mehfilbox.test/api/admin/platform/orgs', json({
        name: 'Lensa Films',
        email: 'Priya@lensa.test',
        contactName: 'Priya',
        locale: 'hi',
        credits: 3,
        reason: 'Studio plan, paid 12 Sept',
      })),
    )
    expect(response.status).toBe(201)
    const body = await response.json()
    expect(body.org).toMatchObject({ kind: 'partner', slug: 'lensa-films', locale: 'hi' })
    expect(body.operator.email).toBe('priya@lensa.test')
    expect(body.link).toMatch(/\/set-password\/[A-Za-z0-9_-]{20,}$/)

    const operators = await repo.listOperators(body.org.id)
    expect(operators).toHaveLength(1)
    expect(operators[0]).toMatchObject({ email: 'priya@lensa.test', role: 'admin', mustChangePassword: false })

    const mail = await queued()
    expect(mail).toHaveLength(1)
    expect(mail[0]).toMatchObject({ template: 'credential', address: 'priya@lensa.test', locale: 'hi' })

    expect(await repo.creditBalance(body.org.id, new Date().toISOString())).toEqual({ available: 3, consumed: 0, expired: 0 })
    const audit = await repo.listPlatformAudit({ limit: 5 })
    expect(audit[0]).toMatchObject({ action: 'org.create', orgSlug: 'lensa-films' })
    expect(audit[0]!.detail).toMatchObject({ email: 'priya@lensa.test', credits: 3 })
  })

  it('refuses an address that already has an account, and leaves no org behind', async () => {
    const response = await createStudio(
      new Request('http://mehfilbox.test/api/admin/platform/orgs', json({
        name: 'Second Kalyanam',
        email: 'operator@example.test',
        contactName: 'Someone',
      })),
    )
    expect(response.status).toBe(400)
    expect((await response.json()).error.fields.email).toBeDefined()
    expect(await repo.listOrgs('partner')).toHaveLength(1)
    expect(await queued()).toHaveLength(0)
  })
})

describe('people', () => {
  it('adds a person to an org and sends them a link', async () => {
    const response = await addOperator(
      new Request('http://mehfilbox.test/api/admin/platform/operators', json({
        orgId: ORG,
        email: 'second@kalyanam.test',
        name: 'Second Seat',
        role: 'uploader',
      })),
    )
    expect(response.status).toBe(201)
    expect(await repo.listOperators(ORG)).toHaveLength(2)
    expect((await queued())[0]).toMatchObject({ template: 'credential', address: 'second@kalyanam.test' })
    expect(await actions()).toEqual(['operator.create'])
  })

  it('sends anyone a set-password link, and returns it for the cases email cannot reach', async () => {
    const response = await passwordLink(
      new Request(`http://mehfilbox.test/api/admin/platform/operators/${OPERATOR}/password-link`, { method: 'POST' }),
      params(OPERATOR),
    )
    expect(response.status).toBe(200)
    expect((await response.json()).link).toMatch(/\/set-password\//)
    expect((await queued())[0]).toMatchObject({ template: 'credential', address: 'operator@example.test' })
    expect(await actions()).toEqual(['operator.password-link'])
  })
})

describe('a wedding’s term', () => {
  it('is set here with a reason, and a lapsed wedding comes back on the air as paid', async () => {
    const response = await term(
      new Request(`http://mehfilbox.test/api/admin/platform/catalogues/${LIVE}/term`, json({
        includedUntil: '2027-06-14',
        reason: 'Keep renewal, ₹2,500 paid',
      })),
      params(LIVE),
    )
    expect(response.status).toBe(200)
    const catalogue = await repo.getCatalogueById(LIVE)
    expect(catalogue?.includedUntil).toBe('2027-06-14T00:00:00.000Z')
    expect(catalogue?.subStatus).toBe('active')
    const audit = await repo.listPlatformAudit({ limit: 5 })
    expect(audit[0]).toMatchObject({ action: 'catalogue.term' })
    expect(audit[0]!.detail).toMatchObject({
      catalogueId: LIVE,
      from: '2026-06-14T00:00:00.000Z',
      to: '2027-06-14T00:00:00.000Z',
      reason: 'Keep renewal, ₹2,500 paid',
    })
  })

  it('can no longer be moved by the studio itself', async () => {
    asOperator()
    const response = await studioPatch(
      new Request(`http://mehfilbox.test/api/admin/catalogues/${LIVE}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ includedUntil: '2030-01-01' }),
      }),
      params(LIVE),
    )
    expect(response.status).toBe(200)
    expect((await repo.getCatalogueById(LIVE))?.includedUntil).toBe('2026-06-14T00:00:00.000Z')
  })
})

describe('on and off the air', () => {
  it('takes a wedding offline for a reason and puts it back for free', async () => {
    const off = await offline(
      new Request(`http://mehfilbox.test/api/admin/platform/catalogues/${LIVE}/offline`, json({ offline: true, reason: 'Copyright complaint' })),
      params(LIVE),
    )
    expect(off.status).toBe(200)
    expect((await repo.getCatalogueById(LIVE))?.status).toBe('draft')

    const on = await offline(
      new Request(`http://mehfilbox.test/api/admin/platform/catalogues/${LIVE}/offline`, json({ offline: false, reason: 'Resolved' })),
      params(LIVE),
    )
    expect(on.status).toBe(200)
    expect((await repo.getCatalogueById(LIVE))?.status).toBe('published')
    expect((await actions()).sort()).toEqual(['catalogue.offline', 'catalogue.online'])
    // Nothing was spent: a wedding that was up has spent its one already.
    expect(await repo.listCredits(ORG)).toEqual([])
  })

  it('will not publish a wedding its studio never has', async () => {
    const response = await offline(
      new Request(`http://mehfilbox.test/api/admin/platform/catalogues/${NEVER}/offline`, json({ offline: false, reason: 'no' })),
      params(NEVER),
    )
    expect(response.status).toBe(400)
    expect((await repo.getCatalogueById(NEVER))?.status).toBe('draft')
  })
})

describe('who may', () => {
  it('answers an operator with a 404 on every route', async () => {
    asOperator()
    const results = await Promise.all([
      createStudio(new Request('http://mehfilbox.test/api/admin/platform/orgs', json({ name: 'X Y', email: 'x@y.test', contactName: 'X Y' }))),
      addOperator(new Request('http://mehfilbox.test/api/admin/platform/operators', json({ orgId: ORG, email: 'x@y.test', name: 'X Y' }))),
      passwordLink(new Request('http://mehfilbox.test/x', { method: 'POST' }), params(OPERATOR)),
      term(new Request('http://mehfilbox.test/x', json({ includedUntil: '2030-01-01', reason: 'r' })), params(LIVE)),
      offline(new Request('http://mehfilbox.test/x', json({ offline: true, reason: 'r' })), params(LIVE)),
    ])
    expect(results.map((response) => response.status)).toEqual([404, 404, 404, 404, 404])
    expect(await repo.listPlatformAudit({ limit: 5 })).toEqual([])
    expect(await queued()).toHaveLength(0)
  })
})
