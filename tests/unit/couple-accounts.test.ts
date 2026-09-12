import { NextResponse } from 'next/server'
import { beforeEach, describe, expect, it } from 'vitest'
import { setAuthProvider } from '@/lib/admin/auth'
import { LocalAuthProvider } from '@/lib/admin/auth-local'
import type { AuthProvider } from '@/lib/admin/auth-provider'
import { getEditableCatalogue } from '@/lib/admin/session'
import { createPasscodeGrant, hashSecret, verifyPasscodeGrant, verifySecret } from '@/lib/auth'
import { setRepository } from '@/lib/db'
import { MemoryRepository, emptySnapshot } from '@/lib/db/memory-repository'
import { FakeNotificationProvider } from '@/lib/notify/fake'
import { setNotificationProvider } from '@/lib/notify'
import { operatorSchema, orgSchema } from '@/lib/schema'
import { makeCatalogue } from '../helpers/repository'

/**
 * Couple accounts (D-37): issued by the studio, linked before owned, handed over without a link,
 * and the studio's way back in — a window the couple opens and time closes.
 *
 * What is tested is where the boundaries fall. A linked couple can change the code and cannot
 * touch the letter; a supporting studio can edit and cannot hand over; an expired window is a
 * 404; and changing the code signs out everyone holding the old one.
 */

const STUDIO = '11111111-1111-4111-8111-11111111111a'
const OTHER_STUDIO = '11111111-1111-4111-8111-11111111111c'
const STUDIO_OPERATOR = '00000000-0000-4000-8000-000000000001'
const OTHER_OPERATOR = '00000000-0000-4000-8000-000000000003'
const AT = '2026-01-01T00:00:00.000Z'

let repo: MemoryRepository
let mail: FakeNotificationProvider
let catalogueId: string
let current: { id: string; email: string }

/** Whoever `current` names is signed in; every credential operation is the local driver's. */
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

beforeEach(() => {
  const snapshot = emptySnapshot()
  snapshot.orgs.push(
    orgSchema.parse({ id: STUDIO, name: 'Kalyanam Weddings', slug: 'kalyanam', createdAt: AT }),
    orgSchema.parse({ id: OTHER_STUDIO, name: 'Other Films', slug: 'other-films', createdAt: AT }),
  )
  snapshot.operators.push(
    operatorSchema.parse({
      id: STUDIO_OPERATOR, orgId: STUDIO, email: 'priya@kalyanam.test', name: 'Priya', role: 'admin', passwordHash: '', createdAt: AT,
    }),
    operatorSchema.parse({
      id: OTHER_OPERATOR, orgId: OTHER_STUDIO, email: 'raj@other.test', name: 'Raj', role: 'admin', passwordHash: '', createdAt: AT,
    }),
  )
  const catalogue = makeCatalogue({
    orgId: STUDIO,
    originOrgId: STUDIO,
    tenantSlug: 'kalyanam',
    slug: 'aanya-vikram-2026',
    status: 'draft',
    modules: [
      { id: 'm_bill', type: 'billboard', enabled: true, order: 0, title: { en: '' }, config: {} },
      {
        id: 'm_letter', type: 'letter', enabled: true, order: 1, title: { en: 'A message' },
        config: { body: { en: 'Old words', hi: 'पुराने शब्द' }, signature: { en: 'A & V' }, theme: 'plain' },
      },
    ],
  })
  catalogueId = catalogue.id
  snapshot.catalogues.push(catalogue)
  repo = new MemoryRepository(snapshot)
  setRepository(repo)
  mail = new FakeNotificationProvider()
  setNotificationProvider(mail)
  current = { id: STUDIO_OPERATOR, email: 'priya@kalyanam.test' }
  installAuth()
})

function json(path: string, method: string, body?: unknown): Request {
  return new Request(`http://mehfilbox.test${path}`, {
    method,
    headers: { 'content-type': 'application/json', 'x-forwarded-for': '10.0.0.1' },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
}

async function issueCouple(body: Record<string, unknown>) {
  const { POST } = await import('@/app/api/admin/catalogues/[id]/couple/route')
  const response = await POST(json(`/api/admin/catalogues/${catalogueId}/couple`, 'POST', body), {
    params: Promise.resolve({ id: catalogueId }),
  })
  return {
    status: response.status,
    body: (await response.json()) as {
      linked?: boolean
      existing?: boolean
      email?: string
      temporaryPassword?: string
      error?: { message?: string }
    },
  }
}

async function handOver() {
  const { POST } = await import('@/app/api/admin/catalogues/[id]/transfer/route')
  const response = await POST(json(`/api/admin/catalogues/${catalogueId}/transfer`, 'POST', { direct: true }), {
    params: Promise.resolve({ id: catalogueId }),
  })
  return { status: response.status, body: (await response.json()) as { transferred?: boolean; error?: { message?: string } } }
}

async function coupleEdit(body: Record<string, unknown>) {
  const { PATCH } = await import('@/app/api/my/catalogues/[id]/route')
  const response = await PATCH(json(`/api/my/catalogues/${catalogueId}`, 'PATCH', body), {
    params: Promise.resolve({ id: catalogueId }),
  })
  return { status: response.status, body: (await response.json()) as { error?: { message?: string } } }
}

async function coupleSession(): Promise<{ id: string; email: string; orgId: string }> {
  const operator = (await repo.getOperatorByEmail('aanya@example.test'))!
  return { id: operator.id, email: operator.email, orgId: operator.orgId }
}

describe('the studio issues the couple’s sign-in', () => {
  it('with a link: an account, a link email, and the catalogue linked to it', async () => {
    const reply = await issueCouple({ email: 'Aanya@Example.test', name: 'Aanya & Vikram', delivery: 'link' })
    expect(reply.status).toBe(201)
    expect(reply.body).toEqual({ linked: true, existing: false, email: 'aanya@example.test' })

    const couple = await coupleSession()
    const org = (await repo.getOrg(couple.orgId))!
    expect(org.kind).toBe('couple')
    expect((await repo.getOperator(couple.id))!.mustChangePassword).toBe(false)
    expect((await repo.getCatalogueById(catalogueId))!.coupleOrgId).toBe(org.id)

    const queued = await repo.listQueuedNotifications(10)
    expect(queued).toHaveLength(1)
    expect(queued[0]!.template).toBe('credential')
    expect(queued[0]!.address).toBe('aanya@example.test')
    expect(queued[0]!.bodyText).toContain('/set-password/')
  })

  it('with a temporary password: shown once, flagged, and no email', async () => {
    const reply = await issueCouple({ email: 'aanya@example.test', name: 'Aanya', delivery: 'temporary' })
    expect(reply.status).toBe(201)
    expect(reply.body.temporaryPassword).toMatch(/^[a-z]+-[a-z]+-\d{4}$/)

    const couple = await coupleSession()
    const operator = (await repo.getOperator(couple.id))!
    expect(operator.mustChangePassword).toBe(true)
    expect(verifySecret(reply.body.temporaryPassword!, operator.passwordHash)).toBe(true)
    expect(await repo.listQueuedNotifications(10)).toHaveLength(0)
  })

  it('links an address that already has a couple account rather than making a second', async () => {
    await issueCouple({ email: 'aanya@example.test', name: 'Aanya', delivery: 'link' })
    const first = await coupleSession()

    // A second wedding, from another studio.
    current = { id: OTHER_OPERATOR, email: 'raj@other.test' }
    const second = makeCatalogue({ orgId: OTHER_STUDIO, originOrgId: OTHER_STUDIO, slug: 'anniversary-2027' })
    await repo.createCatalogue(second)
    const { POST } = await import('@/app/api/admin/catalogues/[id]/couple/route')
    const response = await POST(
      json(`/api/admin/catalogues/${second.id}/couple`, 'POST', { email: 'aanya@example.test', name: 'Aanya', delivery: 'temporary' }),
      { params: Promise.resolve({ id: second.id }) },
    )
    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ linked: true, existing: true, email: 'aanya@example.test' })
    expect((await repo.getCatalogueById(second.id))!.coupleOrgId).toBe(first.orgId)
    expect((await repo.listOrgs('couple')).length).toBe(1)

    // Both weddings, from both studios, in the one account.
    expect((await repo.listCataloguesForCouple(first.orgId)).map((c) => c.slug).sort()).toEqual([
      'aanya-vikram-2026',
      'anniversary-2027',
    ])
  })

  it('refuses a studio’s own address', async () => {
    const reply = await issueCouple({ email: 'raj@other.test', name: 'Raj', delivery: 'link' })
    expect(reply.status).toBe(400)
    expect(reply.body.error?.message).toMatch(/studio account/)
    expect((await repo.getCatalogueById(catalogueId))!.coupleOrgId).toBeNull()
  })
})

describe('before the handover, a linked couple', () => {
  beforeEach(async () => {
    await issueCouple({ email: 'aanya@example.test', name: 'Aanya', delivery: 'link' })
    current = await coupleSession()
  })

  it('sees the wedding, as linked rather than owned', async () => {
    const couple = await coupleSession()
    const list = await repo.listCataloguesForCouple(couple.orgId)
    expect(list.map((c) => c.id)).toEqual([catalogueId])
    expect(list[0]!.orgId).toBe(STUDIO)
  })

  it('can set the guest code, and doing so signs out everyone holding the old one', async () => {
    const before = (await repo.getCatalogueById(catalogueId))!
    const oldGrant = createPasscodeGrant(before.id, before.passcodeVersion)

    expect((await coupleEdit({ passcode: '4821' })).status).toBe(200)
    const after = (await repo.getCatalogueById(catalogueId))!
    expect(after.privacy).toBe('passcode')
    expect(verifySecret('4821', after.passcodeHash)).toBe(true)
    expect(after.passcodeVersion).toBe(before.passcodeVersion + 1)
    expect(verifyPasscodeGrant(oldGrant, after.id, after.passcodeVersion)).toBe(false)
    expect(verifyPasscodeGrant(createPasscodeGrant(after.id, after.passcodeVersion), after.id, after.passcodeVersion)).toBe(true)
  })

  it('cannot rewrite the letter or open a window — the studio is still preparing it', async () => {
    const letter = await coupleEdit({ letter: { body: 'New words', signature: 'A' } })
    expect(letter.status).toBe(403)
    const window = await coupleEdit({ supportDays: 7 })
    expect(window.status).toBe(403)
  })
})

describe('the handover, with the account already there', () => {
  beforeEach(async () => {
    await issueCouple({ email: 'aanya@example.test', name: 'Aanya', delivery: 'link' })
    mail.reset()
  })

  it('moves ownership now, tells the couple, and closes the studio’s access', async () => {
    const reply = await handOver()
    expect(reply.status).toBe(200)
    expect(reply.body.transferred).toBe(true)

    const couple = await coupleSession()
    const catalogue = (await repo.getCatalogueById(catalogueId))!
    expect(catalogue.orgId).toBe(couple.orgId)
    expect(catalogue.originOrgId).toBe(STUDIO)
    expect(catalogue.supportAccessUntil).toBeNull()
    // The studio's credit was snapshotted while it still owned the row.
    expect(catalogue.branding.presentedBy).toBe('Kalyanam Weddings')

    const queued = await repo.listQueuedNotifications(10)
    expect(queued.some((n) => n.template === 'handover' && n.address === 'aanya@example.test')).toBe(true)

    // Gone from the studio's list, present in its Delivered view.
    expect(await repo.getCatalogue(catalogueId, STUDIO)).toBeNull()
    expect((await repo.listOriginatedCatalogues(STUDIO)).map((c) => c.id)).toEqual([catalogueId])
    expect(await getEditableCatalogue(catalogueId)).toBeNull()
  })

  it('refuses when no account is linked', async () => {
    await repo.updateCatalogue(catalogueId, STUDIO, { coupleOrgId: null })
    const reply = await handOver()
    expect(reply.status).toBe(400)
    expect((await repo.getCatalogueById(catalogueId))!.orgId).toBe(STUDIO)
  })
})

describe('after the handover, the couple', () => {
  beforeEach(async () => {
    await issueCouple({ email: 'aanya@example.test', name: 'Aanya', delivery: 'link' })
    await handOver()
    current = await coupleSession()
  })

  it('rewrites the letter, live, in their own language, keeping English as the fallback', async () => {
    const reply = await coupleEdit({ letter: { body: 'New words\n\nSecond paragraph', signature: 'Aanya & Vikram' } })
    expect(reply.status).toBe(200)
    const letter = (await repo.getCatalogueById(catalogueId))!.modules.find((m) => m.type === 'letter')!
    const config = letter.config as { body: Record<string, string>; signature: Record<string, string> }
    expect(config.body.en).toBe('New words\n\nSecond paragraph')
    expect(config.signature.en).toBe('Aanya & Vikram')
    // The Hindi that was there is not silently thrown away by an English rewrite.
    expect(config.body.hi).toBe('पुराने शब्द')
  })

  it('hides a section without losing it', async () => {
    expect((await coupleEdit({ sections: [{ id: 'm_letter', enabled: false }] })).status).toBe(200)
    const letter = (await repo.getCatalogueById(catalogueId))!.modules.find((m) => m.id === 'm_letter')!
    expect(letter.enabled).toBe(false)
    expect(letter.config).toMatchObject({ signature: { en: 'A & V' } })
  })

  it('opens a window the originating studio can edit through, and only that studio', async () => {
    expect((await coupleEdit({ supportDays: 7 })).status).toBe(200)
    const until = (await repo.getCatalogueById(catalogueId))!.supportAccessUntil!
    expect(new Date(until).getTime() - Date.now()).toBeGreaterThan(6.9 * 24 * 3600 * 1000)

    current = { id: STUDIO_OPERATOR, email: 'priya@kalyanam.test' }
    const editable = await getEditableCatalogue(catalogueId)
    expect(editable?.via).toBe('support')

    current = { id: OTHER_OPERATOR, email: 'raj@other.test' }
    expect(await getEditableCatalogue(catalogueId)).toBeNull()
  })

  it('closes the window on request, and time closes it on its own', async () => {
    await coupleEdit({ supportDays: 14 })
    await coupleEdit({ supportDays: 0 })
    current = { id: STUDIO_OPERATOR, email: 'priya@kalyanam.test' }
    expect(await getEditableCatalogue(catalogueId)).toBeNull()

    const couple = await coupleSession()
    await repo.updateCatalogue(catalogueId, couple.orgId, {
      supportAccessUntil: new Date(Date.now() - 1000).toISOString(),
    })
    expect(await getEditableCatalogue(catalogueId)).toBeNull()
  })

  it('a supporting studio may publish but may not hand over or read the settings route as owner', async () => {
    await coupleEdit({ supportDays: 7 })
    current = { id: STUDIO_OPERATOR, email: 'priya@kalyanam.test' }

    const { POST: publish } = await import('@/app/api/admin/catalogues/[id]/publish/route')
    const published = await publish(json(`/api/admin/catalogues/${catalogueId}/publish`, 'POST'), {
      params: Promise.resolve({ id: catalogueId }),
    })
    expect(published.status).toBe(200)

    const { POST: transfer } = await import('@/app/api/admin/catalogues/[id]/transfer/route')
    const moved = await transfer(json(`/api/admin/catalogues/${catalogueId}/transfer`, 'POST', { email: 'x@example.test' }), {
      params: Promise.resolve({ id: catalogueId }),
    })
    expect(moved.status).toBe(404)

    const { PATCH } = await import('@/app/api/admin/catalogues/[id]/route')
    const settings = await PATCH(json(`/api/admin/catalogues/${catalogueId}`, 'PATCH', { privacy: 'passcode', passcode: '1234' }), {
      params: Promise.resolve({ id: catalogueId }),
    })
    expect(settings.status).toBe(404)
    const branding = await PATCH(json(`/api/admin/catalogues/${catalogueId}`, 'PATCH', { draftBranding: { accent: '#0b5cd5' } }), {
      params: Promise.resolve({ id: catalogueId }),
    })
    expect(branding.status).toBe(200)
  })
})

describe('signing in as a couple', () => {
  it('lands in the account, not the console', async () => {
    await issueCouple({ email: 'aanya@example.test', name: 'Aanya', delivery: 'temporary' })
    const couple = await coupleSession()
    await repo.setOperatorPassword(couple.id, { passwordHash: hashSecret('a-password-of-my-own'), mustChangePassword: false })

    const { POST } = await import('@/app/api/admin/session/route')
    const response = await POST(
      json('/api/admin/session', 'POST', { email: 'aanya@example.test', password: 'a-password-of-my-own' }),
    )
    expect(response.status).toBe(200)
    expect(((await response.json()) as { landing: string }).landing).toBe('/my')
  })
})
