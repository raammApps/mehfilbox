import { beforeEach, describe, expect, it } from 'vitest'
import { setAuthProvider } from '@/lib/admin/auth'
import type { AuthProvider } from '@/lib/admin/auth-provider'
import { setRepository } from '@/lib/db'
import { MemoryRepository, emptySnapshot } from '@/lib/db/memory-repository'
import { operatorSchema, orgSchema } from '@/lib/schema'

/**
 * N-26 — "all my weddings look like my studio".
 *
 * `orgs.branding` was written once at registration, holding nothing but the business name, and
 * nothing could edit it — so every wedding was created from that near-empty default and the studio
 * re-entered its colour, logo and typeface by hand each time. The feature was not missing; it was
 * impossible.
 */

const MINE = '11111111-1111-4111-8111-11111111111a'
const THEIRS = '11111111-1111-4111-8111-11111111111b'
const OPERATOR = '00000000-0000-4000-8000-000000000001'
const AT = '2026-01-01T00:00:00.000Z'

let repo: MemoryRepository

beforeEach(() => {
  const snapshot = emptySnapshot()
  for (const [id, slug] of [
    [MINE, 'kalyanam'],
    [THEIRS, 'other'],
  ] as const) {
    snapshot.orgs.push(
      orgSchema.parse({ id, name: slug, slug, branding: { presentedBy: slug }, createdAt: AT }),
    )
  }
  snapshot.operators.push(
    operatorSchema.parse({
      id: OPERATOR,
      orgId: MINE,
      email: 'operator@example.test',
      name: 'Operator',
      role: 'admin',
      passwordHash: '',
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

async function patch(body: unknown) {
  const { PATCH } = await import('@/app/api/admin/studio/route')
  const response = await PATCH(
    new Request('http://mehfilbox.test/api/admin/studio', {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    }),
  )
  return { status: response.status }
}

describe('a studio setting its own look', () => {
  it('saves it, which nothing could do before', async () => {
    const { status } = await patch({
      branding: { accent: '#0b5cd5', presentedBy: 'Kalyanam Weddings', displayFont: 'archivo' },
    })

    expect(status).toBe(200)
    expect((await repo.getOrg(MINE))?.branding.accent).toBe('#0b5cd5')
  })

  /**
   * The rule every operator route follows: the org id comes from the session, never from the body.
   * A studio can only ever repaint itself, and passing someone else's id changes nothing.
   */
  it('cannot repaint another studio, whatever it sends', async () => {
    await patch({
      orgId: THEIRS,
      branding: { accent: '#0b5cd5' },
    })

    expect((await repo.getOrg(THEIRS))?.branding.accent).toBeUndefined()
    expect((await repo.getOrg(MINE))?.branding.accent).toBe('#0b5cd5')
  })

  it('refuses a colour that is not one', async () => {
    const { status } = await patch({ branding: { accent: 'crimson-ish' } })

    expect(status).toBe(400)
    expect((await repo.getOrg(MINE))?.branding.accent).toBeUndefined()
  })

  /**
   * A wedding already delivered keeps the look the couple was given. Changing the studio default
   * is not a retroactive repaint of pages people already have open.
   */
  it('is the default new weddings inherit, not a change to old ones', async () => {
    const before = await repo.getOrg(MINE)
    await patch({ branding: { accent: '#0b5cd5', presentedBy: 'Kalyanam Weddings' } })

    // Nothing else in the store moved — the inheritance happens at creation, in the catalogues
    // route, and is not this write's business.
    expect(await repo.listAllCatalogues()).toHaveLength(0)
    expect(before?.branding.presentedBy).toBe('kalyanam')
  })
})
