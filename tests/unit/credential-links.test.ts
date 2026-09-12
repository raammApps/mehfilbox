import { NextResponse } from 'next/server'
import { beforeEach, describe, expect, it } from 'vitest'
import { setAuthProvider } from '@/lib/admin/auth'
import { LocalAuthProvider } from '@/lib/admin/auth-local'
import type { AuthProvider } from '@/lib/admin/auth-provider'
import {
  hashToken,
  issueCredentialLink,
  redeemableLink,
  sendCredentialLink,
} from '@/lib/auth/credential-links'
import { hashSecret, verifySecret } from '@/lib/crypto'
import { setRepository } from '@/lib/db'
import { MemoryRepository, emptySnapshot } from '@/lib/db/memory-repository'
import { reset } from '@/lib/http/rate-limit'
import { FakeNotificationProvider } from '@/lib/notify/fake'
import { setNotificationProvider } from '@/lib/notify'
import { operatorSchema, orgSchema } from '@/lib/schema'

/**
 * Credential links (D-33) — the one way a password is set without typing the old one.
 *
 * What is worth testing is what makes a link safe to email: it is stored only as a hash, it works
 * once, it expires, and the forgot-password route says the same thing whether or not the address
 * exists. A test that only checked "a link was made" would pass for a design that leaked all four.
 */

const ORG = '11111111-1111-4111-8111-11111111111a'
const COUPLE_ORG = '11111111-1111-4111-8111-11111111111b'
const OPERATOR = '00000000-0000-4000-8000-000000000001'
const COUPLE = '00000000-0000-4000-8000-000000000002'
const AT = '2026-01-01T00:00:00.000Z'

let repo: MemoryRepository
let mail: FakeNotificationProvider

beforeEach(() => {
  const snapshot = emptySnapshot()
  snapshot.orgs.push(
    orgSchema.parse({ id: ORG, name: 'Kalyanam', slug: 'kalyanam', locale: 'hi', createdAt: AT }),
    orgSchema.parse({ id: COUPLE_ORG, name: 'Aanya & Vikram', slug: 'aanya-vikram', kind: 'couple', createdAt: AT }),
  )
  snapshot.operators.push(
    operatorSchema.parse({
      id: OPERATOR,
      orgId: ORG,
      email: 'priya@kalyanam.test',
      name: 'Priya',
      role: 'admin',
      passwordHash: hashSecret('the-old-password-1'),
      createdAt: AT,
    }),
    operatorSchema.parse({
      id: COUPLE,
      orgId: COUPLE_ORG,
      email: 'aanya@example.test',
      name: 'Aanya',
      role: 'admin',
      passwordHash: hashSecret('temporary-password-9'),
      mustChangePassword: true,
      createdAt: AT,
    }),
  )
  repo = new MemoryRepository(snapshot)
  setRepository(repo)
  setAuthProvider(new LocalAuthProvider())
  mail = new FakeNotificationProvider()
  setNotificationProvider(mail)
  // The limiter is process memory and outlives the store; each test starts with a clean address.
  reset('forgot:email:priya@kalyanam.test')
})

function json(path: string, body: unknown, ip = '10.0.0.1'): Request {
  return new Request(`http://mehfilbox.test${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-forwarded-for': ip },
    body: JSON.stringify(body),
  })
}

describe('issuing a link', () => {
  it('stores only the hash, and the URL carries the token', async () => {
    const { url, link } = await issueCredentialLink({ operatorId: OPERATOR, purpose: 'reset' })
    const token = url.split('/set-password/')[1]!
    expect(token.length).toBeGreaterThan(30)
    expect(link.tokenHash).toBe(hashToken(token))
    expect(url).not.toContain(link.tokenHash)
    expect((await repo.getCredentialLinkByHash(link.tokenHash))?.id).toBe(link.id)
  })

  it('is redeemable once, then never', async () => {
    const { url, link } = await issueCredentialLink({ operatorId: OPERATOR, purpose: 'reset' })
    const token = url.split('/set-password/')[1]!
    expect((await redeemableLink(token))?.id).toBe(link.id)

    await repo.markCredentialLinkUsed(link.id)
    expect(await redeemableLink(token)).toBeNull()
  })

  it('expires', async () => {
    const { url } = await issueCredentialLink({ operatorId: OPERATOR, purpose: 'reset', ttlS: -1 })
    expect(await redeemableLink(url.split('/set-password/')[1]!)).toBeNull()
  })

  it('answers null for garbage without touching the store', async () => {
    expect(await redeemableLink('')).toBeNull()
    expect(await redeemableLink('short')).toBeNull()
    expect(await redeemableLink('x'.repeat(300))).toBeNull()
  })

  it("queues the email in the org's language, with the link in it", async () => {
    const { url } = await sendCredentialLink((await repo.getOperator(OPERATOR))!, 'reset')
    const queued = await repo.listQueuedNotifications(10)
    expect(queued).toHaveLength(1)
    expect(queued[0]!.template).toBe('credential')
    expect(queued[0]!.locale).toBe('hi')
    expect(queued[0]!.address).toBe('priya@kalyanam.test')
    expect(queued[0]!.bodyText).toContain(url)
    // Never sent from the request that decided to send it.
    expect(mail.sent).toHaveLength(0)
  })
})

describe('POST /api/auth/forgot', () => {
  async function forgot(email: string, ip?: string) {
    const { POST } = await import('@/app/api/auth/forgot/route')
    const response = await POST(json('/api/auth/forgot', { email }, ip))
    return { status: response.status, body: (await response.json()) as { message?: string } }
  }

  it('says the same sentence for a known and an unknown address', async () => {
    const known = await forgot('priya@kalyanam.test', '10.1.0.1')
    const unknown = await forgot('nobody@example.test', '10.1.0.2')
    expect(known.status).toBe(200)
    expect(unknown.status).toBe(200)
    expect(known.body).toEqual(unknown.body)
  })

  it('queues a link for a known address and nothing for an unknown one', async () => {
    await forgot('nobody@example.test', '10.1.1.1')
    expect(await repo.listQueuedNotifications(10)).toHaveLength(0)

    await forgot('PRIYA@kalyanam.test', '10.1.1.2')
    const queued = await repo.listQueuedNotifications(10)
    expect(queued).toHaveLength(1)
    expect(queued[0]!.address).toBe('priya@kalyanam.test')
  })

  it('stops sending after three asks for one address, without changing its answer', async () => {
    const answers = []
    for (let i = 0; i < 5; i += 1) answers.push(await forgot('priya@kalyanam.test', `10.1.2.${i}`))
    expect(new Set(answers.map((a) => a.status))).toEqual(new Set([200]))
    expect(new Set(answers.map((a) => a.body.message))).toHaveProperty('size', 1)
    expect(await repo.listQueuedNotifications(10)).toHaveLength(3)
  })
})

describe('POST /api/auth/set-password', () => {
  async function setPassword(token: string, password: string, ip = '10.2.0.1') {
    const { POST } = await import('@/app/api/auth/set-password/route')
    const response = await POST(json('/api/auth/set-password', { token, password }, ip))
    return {
      status: response.status,
      body: (await response.json()) as { email?: string; door?: string; error?: { message?: string } },
    }
  }

  it('sets the password, spends the link, and says which door to use', async () => {
    const { url, link } = await issueCredentialLink({ operatorId: COUPLE, purpose: 'set-password' })
    const token = url.split('/set-password/')[1]!

    const first = await setPassword(token, 'a-brand-new-password')
    expect(first.status).toBe(200)
    expect(first.body).toEqual({ email: 'aanya@example.test', door: 'couple' })

    const operator = (await repo.getOperator(COUPLE))!
    expect(verifySecret('a-brand-new-password', operator.passwordHash)).toBe(true)
    expect(verifySecret('temporary-password-9', operator.passwordHash)).toBe(false)
    // A first credential clears the temporary-password flag.
    expect(operator.mustChangePassword).toBe(false)
    expect((await repo.getCredentialLinkByHash(link.tokenHash))?.usedAt).not.toBeNull()

    const second = await setPassword(token, 'another-password-entirely')
    expect(second.status).toBe(404)
  })

  it('refuses a short password before spending anything', async () => {
    const { url } = await issueCredentialLink({ operatorId: OPERATOR, purpose: 'reset' })
    const token = url.split('/set-password/')[1]!
    expect((await setPassword(token, 'short')).status).toBe(400)
    expect(await redeemableLink(token)).not.toBeNull()
  })

  it('answers a missing, an expired and a spent link identically', async () => {
    const spent = await issueCredentialLink({ operatorId: OPERATOR, purpose: 'reset' })
    await repo.markCredentialLinkUsed(spent.link.id)
    const expired = await issueCredentialLink({ operatorId: OPERATOR, purpose: 'reset', ttlS: -5 })

    const answers = await Promise.all([
      setPassword('not-a-real-token-at-all-000000', 'a-brand-new-password', '10.2.1.1'),
      setPassword(spent.url.split('/set-password/')[1]!, 'a-brand-new-password', '10.2.1.2'),
      setPassword(expired.url.split('/set-password/')[1]!, 'a-brand-new-password', '10.2.1.3'),
    ])
    expect(answers.map((a) => a.status)).toEqual([404, 404, 404])
    expect(new Set(answers.map((a) => a.body.error?.message))).toHaveProperty('size', 1)
  })
})

describe('POST /api/auth/change-password', () => {
  /** Signed in as the given operator; the credential itself is still the local driver's. */
  function signedInAs(id: string, email: string) {
    const local = new LocalAuthProvider()
    setAuthProvider({
      name: 'stub',
      currentUser: async () => ({ id, email }),
      signIn: (e: string, p: string, r: NextResponse) => local.signIn(e, p, r),
      signOut: async () => {},
      signUp: async () => null,
      createUser: async () => null,
      setPassword: (userId: string, password: string) => local.setPassword(userId, password),
    } as AuthProvider)
  }

  async function change(body: unknown, ip = '10.3.0.1') {
    const { POST } = await import('@/app/api/auth/change-password/route')
    const response = await POST(json('/api/auth/change-password', body, ip))
    return { status: response.status, body: (await response.json()) as { error?: { fields?: Record<string, string> } } }
  }

  it('needs the current password from an ordinary account', async () => {
    signedInAs(OPERATOR, 'priya@kalyanam.test')

    const wrong = await change({ current: 'not-it', password: 'a-brand-new-password' })
    expect(wrong.status).toBe(400)
    expect(wrong.body.error?.fields?.current).toBeDefined()
    expect(verifySecret('the-old-password-1', (await repo.getOperator(OPERATOR))!.passwordHash)).toBe(true)

    const right = await change({ current: 'the-old-password-1', password: 'a-brand-new-password' })
    expect(right.status).toBe(200)
    expect(verifySecret('a-brand-new-password', (await repo.getOperator(OPERATOR))!.passwordHash)).toBe(true)
  })

  it('needs no current password from an account on a temporary one, and clears the flag', async () => {
    signedInAs(COUPLE, 'aanya@example.test')

    const response = await change({ password: 'a-password-of-my-own' })
    expect(response.status).toBe(200)
    const operator = (await repo.getOperator(COUPLE))!
    expect(operator.mustChangePassword).toBe(false)
    expect(verifySecret('a-password-of-my-own', operator.passwordHash)).toBe(true)
  })

  it('refuses without a session', async () => {
    setAuthProvider({
      name: 'stub',
      currentUser: async () => null,
    } as unknown as AuthProvider)
    expect((await change({ current: 'x', password: 'a-brand-new-password' })).status).toBe(401)
  })
})
