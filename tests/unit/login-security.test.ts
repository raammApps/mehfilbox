import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * Brute force (D-34): the address bucket, the device bucket, the lockout, and the challenge.
 *
 * The captcha driver is the suite's `fake` — a fixed token the verifier accepts — set before any
 * module reads the environment, because `lib/env` validates once at load.
 */
vi.hoisted(() => {
  process.env.CAPTCHA_DRIVER = 'fake'
})

import { setAuthProvider } from '@/lib/admin/auth'
import { LocalAuthProvider } from '@/lib/admin/auth-local'
import { hashSecret } from '@/lib/crypto'
import { setRepository } from '@/lib/db'
import { MemoryRepository, emptySnapshot } from '@/lib/db/memory-repository'
import { reset } from '@/lib/http/rate-limit'
import { operatorSchema, orgSchema, platformAdminSchema } from '@/lib/schema'
import { makeCatalogue } from '../helpers/repository'

const ORG = '11111111-1111-4111-8111-11111111111a'
const OPERATOR = '00000000-0000-4000-8000-000000000001'
const FLAGGED = '00000000-0000-4000-8000-000000000002'
const AT = '2026-01-01T00:00:00.000Z'
const PASSWORD = 'right-password-1234'

let repo: MemoryRepository

beforeEach(() => {
  const snapshot = emptySnapshot()
  snapshot.orgs.push(orgSchema.parse({ id: ORG, name: 'Kalyanam', slug: 'kalyanam', createdAt: AT }))
  snapshot.operators.push(
    operatorSchema.parse({
      id: OPERATOR,
      orgId: ORG,
      email: 'priya@kalyanam.test',
      name: 'Priya',
      role: 'admin',
      passwordHash: hashSecret(PASSWORD),
      createdAt: AT,
    }),
    operatorSchema.parse({
      id: FLAGGED,
      orgId: ORG,
      email: 'temp@kalyanam.test',
      name: 'Temp',
      role: 'admin',
      passwordHash: hashSecret(PASSWORD),
      mustChangePassword: true,
      createdAt: AT,
    }),
  )
  snapshot.catalogues.push(
    makeCatalogue({ orgId: ORG, slug: 'locked-wedding', privacy: 'passcode', passcodeHash: hashSecret('4321') }),
  )
  repo = new MemoryRepository(snapshot)
  setRepository(repo)
  setAuthProvider(new LocalAuthProvider())
  // The limiter is process memory and outlives the store; IPs are unique per test, addresses are not.
  for (const key of [
    'login:email:priya@kalyanam.test',
    'login:email:temp@kalyanam.test',
    'login:email:lock-me@kalyanam.test',
    'passcode:catalogue:locked-wedding',
  ]) {
    reset(key)
  }
})

function json(path: string, body: unknown, ip: string): Request {
  return new Request(`http://mehfilbox.test${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-forwarded-for': ip },
    body: JSON.stringify(body),
  })
}

type Reply = { status: number; body: { landing?: string; error?: { challenge?: boolean; message?: string } } }

async function signIn(email: string, password: string, ip: string, captchaToken?: string): Promise<Reply> {
  const { POST } = await import('@/app/api/admin/session/route')
  const response = await POST(json('/api/admin/session', { email, password, captchaToken }, ip))
  return { status: response.status, body: await response.json() }
}

describe('sign in', () => {
  /**
   * A token rides along from the first attempt: it is accepted before it is owed, and without one
   * a challenged attempt is refused *before* the password is checked or the bucket consumed — so
   * the lockout is only reachable by something that can pass the challenge, which is the point.
   */
  it('locks an address after five failures, however many devices they came from', async () => {
    const email = 'lock-me@kalyanam.test'
    for (let i = 0; i < 5; i += 1) {
      expect((await signIn(email, 'wrong', `10.10.0.${i}`, 'ok')).status).toBe(401)
    }
    const sixth = await signIn(email, 'wrong', '10.10.0.99', 'ok')
    expect(sixth.status).toBe(429)
    expect(sixth.body.error?.message).toMatch(/minutes/)
  })

  it('locks a device after ten failures, however many addresses it tried', async () => {
    for (let i = 0; i < 10; i += 1) {
      expect((await signIn(`guess-${i}@example.test`, 'wrong', '10.11.0.1', 'ok')).status).toBe(401)
    }
    expect((await signIn('guess-11@example.test', 'wrong', '10.11.0.1', 'ok')).status).toBe(429)
  })

  it('asks for a challenge after the third failure, refuses without one, and clears on success', async () => {
    const ip = '10.12.0.1'
    const first = await signIn('priya@kalyanam.test', 'wrong', ip)
    const second = await signIn('priya@kalyanam.test', 'wrong', ip)
    const third = await signIn('priya@kalyanam.test', 'wrong', ip)
    expect(first.body.error?.challenge).toBeUndefined()
    expect(second.body.error?.challenge).toBeUndefined()
    // The third refusal warns the form that the next attempt will be challenged.
    expect(third.body.error?.challenge).toBe(true)

    // The right password is not enough now.
    const unchecked = await signIn('priya@kalyanam.test', PASSWORD, ip)
    expect(unchecked.status).toBe(401)
    expect(unchecked.body.error?.challenge).toBe(true)

    const checked = await signIn('priya@kalyanam.test', PASSWORD, ip, 'ok')
    expect(checked.status).toBe(200)
    expect(checked.body.landing).toBe('/admin')

    // Success cleared both buckets: the next wrong guess is a first failure again.
    const again = await signIn('priya@kalyanam.test', 'wrong', ip)
    expect(again.status).toBe(401)
    expect(again.body.error?.challenge).toBeUndefined()
  })

  it('refuses a made-up challenge token, and never checks the password behind it', async () => {
    const ip = '10.13.0.1'
    for (let i = 0; i < 3; i += 1) await signIn('priya@kalyanam.test', 'wrong', ip)
    const forged = await signIn('priya@kalyanam.test', PASSWORD, ip, 'not-the-token')
    expect(forged.status).toBe(401)
    expect(forged.body.error?.challenge).toBe(true)
  })

  it('sends an account on a temporary password to change it before anything else', async () => {
    const reply = await signIn('temp@kalyanam.test', PASSWORD, '10.14.0.1')
    expect(reply.status).toBe(200)
    expect(reply.body.landing).toBe('/login/change-password')
  })

  it('says the same thing for a wrong password and an unknown address', async () => {
    const wrong = await signIn('priya@kalyanam.test', 'wrong', '10.15.0.1')
    const unknown = await signIn('nobody@example.test', 'wrong', '10.15.0.2')
    expect(wrong.status).toBe(unknown.status)
    expect(wrong.body.error?.message).toBe(unknown.body.error?.message)
  })
})

describe('the guest code', () => {
  async function tryCode(passcode: string, ip: string, captchaToken?: string): Promise<Reply> {
    const { POST } = await import('@/app/api/passcode/route')
    const response = await POST(
      json('/api/passcode', { catalogue: 'locked-wedding', passcode, captchaToken }, ip),
    )
    return { status: response.status, body: await response.json() }
  }

  it('challenges a device after three wrong codes', async () => {
    const ip = '10.20.0.1'
    await tryCode('0000', ip)
    await tryCode('0001', ip)
    const third = await tryCode('0002', ip)
    expect(third.body.error?.challenge).toBe(true)

    expect((await tryCode('4321', ip)).status).toBe(401)
    expect((await tryCode('4321', ip, 'ok')).status).toBe(200)
  })

  /**
   * The bucket the old gate did not have. Five per device stops a person; a script spreading a
   * four-digit guess across a hundred addresses never hits it, and the per-catalogue wall is what
   * it hits instead.
   */
  it('locks the catalogue after thirty wrong codes across every device', async () => {
    for (let i = 0; i < 30; i += 1) {
      const reply = await tryCode('9999', `10.21.${Math.floor(i / 250)}.${(i % 250) + 1}`)
      expect(reply.status).toBe(401)
    }
    expect((await tryCode('4321', '10.22.0.1')).status).toBe(429)
  })
})

describe('registration', () => {
  async function register(body: Record<string, unknown>, ip: string) {
    const { POST } = await import('@/app/api/partners/route')
    const response = await POST(json('/api/partners', body, ip))
    return { status: response.status, body: (await response.json()) as { error?: { challenge?: boolean } } }
  }

  const studio = {
    businessName: 'New Studio',
    contactName: 'Someone',
    email: 'new@studio.test',
    password: 'a-long-enough-password',
  }

  it('is refused without a challenge token when a driver is configured, on the first try', async () => {
    const reply = await register(studio, '10.30.0.1')
    expect(reply.status).toBe(400)
    expect(reply.body.error?.challenge).toBe(true)
    expect(await repo.listOrgs()).toHaveLength(1)
  })

  it('goes through with one', async () => {
    const reply = await register({ ...studio, captchaToken: 'ok' }, '10.30.0.2')
    expect(reply.status).toBe(201)
    expect(await repo.listOrgs()).toHaveLength(2)
  })
})

/**
 * The platform owner comes through the same door, and has no operator row by design (doc 15 §1).
 *
 * Written because the row was not enough: the route answered on the operator lookup alone, so
 * `platform_admins` could be populated and the console still could not be reached by anybody.
 * The authenticator is a stub here for the same reason the Supabase driver is the production
 * one — it can authenticate a person who is not an operator, which is precisely the case.
 */
describe('the platform door', () => {
  const ADMIN = '00000000-0000-4000-8000-00000000000a'
  const STRANGER = '00000000-0000-4000-8000-00000000000b'

  /** Authenticates against a list that owes nothing to `operators`, as Supabase Auth does. */
  class StubAuthProvider extends LocalAuthProvider {
    private readonly users: Record<string, string> = {
      'root@mehfilbox.test': ADMIN,
      'stranger@example.test': STRANGER,
    }

    override async signIn(email: string, password: string) {
      const id = this.users[email]
      if (!id || password !== PASSWORD) return null
      return { id, email }
    }
  }

  beforeEach(() => {
    // `snapshot()` clones, so the admin is added to a copy the repository is rebuilt from.
    const snapshot = repo.snapshot()
    snapshot.platformAdmins.push(
      platformAdminSchema.parse({
        id: ADMIN,
        email: 'root@mehfilbox.test',
        name: 'Platform Root',
        createdAt: AT,
      }),
    )
    repo = new MemoryRepository(snapshot)
    setRepository(repo)
    setAuthProvider(new StubAuthProvider())
    for (const key of ['login:email:root@mehfilbox.test', 'login:email:stranger@example.test']) {
      reset(key)
    }
  })

  it('lets an admin in, and sends them to the console written for them', async () => {
    const reply = await signIn('root@mehfilbox.test', PASSWORD, '10.40.0.1')
    expect(reply.status).toBe(200)
    expect(reply.body.landing).toBe('/admin/platform')
  })

  /** The property doc 15 §1 is built on: authenticating is still not membership of an org. */
  it('still refuses an account that is neither an operator nor an admin', async () => {
    const reply = await signIn('stranger@example.test', PASSWORD, '10.40.0.2')
    expect(reply.status).toBe(401)
    expect(reply.body.error?.message).toMatch(/did not work/)
  })

  /** And the wrong password is the wrong password, admin row or not. */
  it('does not let the row stand in for the credential', async () => {
    const reply = await signIn('root@mehfilbox.test', 'wrong', '10.40.0.3')
    expect(reply.status).toBe(401)
  })
})
