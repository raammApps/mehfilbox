import { beforeEach, describe, expect, it } from 'vitest'
import { setAuthProvider } from '@/lib/admin/auth'
import type { AuthProvider } from '@/lib/admin/auth-provider'
import { setRepository } from '@/lib/db'
import { MemoryRepository, emptySnapshot } from '@/lib/db/memory-repository'
import { operatorSchema, orgSchema } from '@/lib/schema'
import { makeCatalogue } from '../helpers/repository'

/**
 * N-36 — the message a couple's family forwards.
 *
 * Until now the operator wrote it themselves, so the first thing two hundred relatives saw of this
 * product was whatever a busy studio typed at eleven at night. What is tested is the two things
 * that make it safe to hand over: it is in the couple's language, and it cannot be sent pointing
 * at a page that is not there.
 */

const ORG = '11111111-1111-4111-8111-11111111111a'
const OPERATOR = '00000000-0000-4000-8000-000000000001'
const AT = '2026-01-01T00:00:00.000Z'

let repo: MemoryRepository
let catalogueId: string

function install(overrides: Parameters<typeof makeCatalogue>[0] = {}) {
  const catalogue = makeCatalogue({
    orgId: ORG,
    slug: 'aanya-vikram',
    status: 'published',
    ...overrides,
  })
  catalogueId = catalogue.id

  const snapshot = emptySnapshot()
  snapshot.orgs.push(
    orgSchema.parse({ id: ORG, name: 'Kalyanam', slug: 'kalyanam', createdAt: AT }),
  )
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
  snapshot.catalogues.push(catalogue)
  repo = new MemoryRepository(snapshot)
  setRepository(repo)
  setAuthProvider({
    name: 'stub',
    currentUser: async () => ({ id: OPERATOR, email: 'operator@example.test' }),
    signIn: async () => null,
    signOut: async () => {},
  } as unknown as AuthProvider)
}

async function post(email: string) {
  const { POST } = await import('@/app/api/admin/catalogues/[id]/deliver/route')
  const response = await POST(
    new Request('http://mehfilbox.test/api/admin/catalogues/x/deliver', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email }),
    }),
    { params: Promise.resolve({ id: catalogueId }) },
  )
  const body = (await response.json().catch(() => null)) as {
    error?: { message?: string }
  } | null
  return { status: response.status, message: body?.error?.message ?? '' }
}

beforeEach(() => install())

describe('sending the wedding to the couple', () => {
  it('queues a message rather than sending inside the click', async () => {
    const { status } = await post('couple@example.test')

    expect(status).toBe(200)
    const [queued] = await repo.listQueuedNotifications(10)
    expect(queued?.template).toBe('delivery')
    expect(queued?.address).toBe('couple@example.test')
  })

  it('writes it in the wedding’s language, not the operator’s', async () => {
    install({ locale: 'hi' })
    await post('couple@example.test')

    const [queued] = await repo.listQueuedNotifications(10)
    expect(queued?.locale).toBe('hi')
    // Devanagari in the body, so this fails if the locale is threaded but the render is not.
    expect(queued?.bodyText).toMatch(/[ऀ-ॿ]/)
  })

  /**
   * The refusal that matters. A delivery message pointing at "not yet available" is worse than no
   * message at all: the couple forwards it, and two hundred people open a page with nothing on it.
   */
  it('refuses to send a wedding that is not published', async () => {
    install({ status: 'draft' })

    // `route()` turns an ApiError into a response rather than throwing, so the refusal is read
    // rather than caught — and reading it also checks the operator is told *why*.
    const { status, message } = await post('couple@example.test')
    expect(status).toBe(400)
    expect(message).toMatch(/publish/i)
    expect(await repo.listQueuedNotifications(10)).toHaveLength(0)
  })

  it('refuses an address that is not one', async () => {
    const { status } = await post('not-an-email')
    expect(status).toBe(400)
    expect(await repo.listQueuedNotifications(10)).toHaveLength(0)
  })

  /**
   * Deliberately re-sendable. A couple who changed address, or a first attempt that went to spam,
   * is a normal thing to want fixed — and the notifications table records every attempt, so
   * "did we send it, and when" stays answerable either way.
   */
  it('lets a studio send it again', async () => {
    await post('couple@example.test')
    await post('other@example.test')

    expect(await repo.listQueuedNotifications(10)).toHaveLength(2)
  })
})
