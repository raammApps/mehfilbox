import { beforeEach, describe, expect, it } from 'vitest'
import { PATCH } from '@/app/api/admin/platform/themes/[id]/route'
import { POST } from '@/app/api/admin/platform/themes/route'
import { setAuthProvider } from '@/lib/admin/auth'
import type { AuthProvider } from '@/lib/admin/auth-provider'
import { setRepository } from '@/lib/db'
import { MemoryRepository, emptySnapshot } from '@/lib/db/memory-repository'
import { operatorSchema, orgSchema, platformAdminSchema } from '@/lib/schema'
import { getBuiltInTheme } from '@/themes/registry'
import { availableThemes, resolveTheme } from '@/themes/resolve'

/**
 * Platform-authored themes (D-35, doc 16 §4).
 *
 * What has to hold: a theme that clears the gate reaches every picker and every guest resolver
 * at once; one that fails is refused with the failing pair named; an id can never shadow a
 * built-in; withdrawing hides without repainting; and the whole surface is a 404 to anyone who
 * is not a platform admin.
 */

const ADMIN = '00000000-0000-4000-8000-000000000001'
const OPERATOR = '00000000-0000-4000-8000-000000000002'
const ORG = '11111111-1111-4111-8111-11111111111a'
const AT = '2026-01-01T00:00:00.000Z'

const MARQUEE = getBuiltInTheme('marquee')!.tokens
const CARNIVAL = getBuiltInTheme('carnival')!.tokens

const HOUSE = {
  id: 'house-purple',
  name: 'House purple',
  description: 'Carnival, but ours.',
  tokens: { ...CARNIVAL, radiusCard: 8 },
  enabled: true,
}

function signedInAs(id: string): AuthProvider {
  return {
    name: 'stub',
    currentUser: async () => ({ id, email: 'someone@mehfilbox.test' }),
    signIn: async () => null,
    signOut: async () => {},
  } as unknown as AuthProvider
}

function post(body: unknown) {
  return POST(
    new Request('http://mehfilbox.test/api/admin/platform/themes', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    }),
  )
}

function patch(id: string, body: unknown) {
  return PATCH(
    new Request(`http://mehfilbox.test/api/admin/platform/themes/${id}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    }),
    { params: Promise.resolve({ id }) },
  )
}

let repo: MemoryRepository

beforeEach(() => {
  const snapshot = emptySnapshot()
  snapshot.platformAdmins.push(
    platformAdminSchema.parse({ id: ADMIN, email: 'root@mehfilbox.test', name: 'Root', createdAt: AT }),
  )
  snapshot.orgs.push(
    orgSchema.parse({ id: ORG, name: 'Kalyanam Weddings', slug: 'kalyanam', kind: 'partner', createdAt: AT }),
  )
  snapshot.operators.push(
    operatorSchema.parse({
      id: OPERATOR,
      orgId: ORG,
      email: 'operator@mehfilbox.test',
      name: 'Operator',
      role: 'admin',
      passwordHash: '',
      createdAt: AT,
    }),
  )
  repo = new MemoryRepository(snapshot)
  setRepository(repo)
  setAuthProvider(signedInAs(ADMIN))
})

describe('adding a theme', () => {
  it('reaches every picker and every guest resolver the moment it is saved', async () => {
    const response = await post(HOUSE)
    expect(response.status).toBe(201)

    expect((await availableThemes()).map((t) => t.id)).toContain('house-purple')
    const resolved = await resolveTheme({ theme: 'house-purple' })
    expect(resolved).toMatchObject({ id: 'house-purple', name: 'House purple', source: 'custom' })
    expect(resolved.tokens.radiusCard).toBe(8)

    const audit = await repo.listPlatformAudit({ limit: 5 })
    expect(audit.map((entry) => entry.action)).toEqual(['theme.create'])
    expect(audit[0]!.actorEmail).toBe('root@mehfilbox.test')
  })

  it('refuses an id that shadows a built-in, and a duplicate of its own', async () => {
    const shadow = await post({ ...HOUSE, id: 'marquee' })
    expect(shadow.status).toBe(400)
    expect((await shadow.json()).error.fields.id).toMatch(/built-in/i)

    expect((await post(HOUSE)).status).toBe(201)
    const again = await post(HOUSE)
    expect(again.status).toBe(400)
    expect((await again.json()).error.fields.id).toMatch(/in use/i)
  })

  it('refuses a theme that would be hard to read, and names the pair', async () => {
    const response = await post({
      ...HOUSE,
      id: 'murky',
      // Dark grey body copy on near-black: the classic unreadable page.
      tokens: { ...MARQUEE, textMid: '#3a3a3f' },
    })
    expect(response.status).toBe(400)
    const body = await response.json()
    expect(body.error.message).toMatch(/body text on the page/)
    expect(body.error.message).not.toMatch(/headings on the page/)
    expect((await availableThemes()).map((t) => t.id)).not.toContain('murky')
  })
})

describe('changing a theme', () => {
  it('withdrawing hides it from pickers and repaints nothing', async () => {
    await post(HOUSE)
    const response = await patch('house-purple', { enabled: false })
    expect(response.status).toBe(200)

    expect((await availableThemes()).map((t) => t.id)).not.toContain('house-purple')
    // A wedding already on it keeps its look — withdrawal is about the picker, not the page.
    expect((await resolveTheme({ theme: 'house-purple' })).id).toBe('house-purple')

    const actions = (await repo.listPlatformAudit({ limit: 5 })).map((entry) => entry.action)
    expect(actions.sort()).toEqual(['theme.create', 'theme.withdraw'])
  })

  it('holds an edit to the same gate as a new theme', async () => {
    await post(HOUSE)
    const response = await patch('house-purple', { tokens: { ...CARNIVAL, textHi: '#2a1a40' } })
    expect(response.status).toBe(400)
    expect((await resolveTheme({ theme: 'house-purple' })).tokens.textHi).toBe(CARNIVAL.textHi)
  })

  it('treats a built-in as not a row', async () => {
    expect((await patch('marquee', { name: 'Not yours' })).status).toBe(404)
  })
})

describe('who may', () => {
  it('answers an operator with a 404, not a refusal that confirms the surface exists', async () => {
    setAuthProvider(signedInAs(OPERATOR))
    expect((await post(HOUSE)).status).toBe(404)
    expect((await patch('house-purple', { enabled: false })).status).toBe(404)
    expect(await repo.listPlatformAudit({ limit: 5 })).toEqual([])
  })
})
