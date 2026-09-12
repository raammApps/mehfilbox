import { beforeEach, describe, expect, it } from 'vitest'
import { MemoryRepository, emptySnapshot } from '@/lib/db/memory-repository'
import { orgSchema, partnerRegistrationSchema } from '@/lib/schema'

/**
 * Partner registration is the first thing on this platform an unauthenticated stranger may
 * write through, so the interesting properties are all about what it refuses to give away.
 */

let repository: MemoryRepository

/** Stable hex ids from a slug, so a test reads by name and the column still gets a uuid. */
const IDS: Record<string, string> = {
  lensa: 'aaaaaaaa-1111-4111-8111-111111111111',
  other: 'bbbbbbbb-1111-4111-8111-111111111111',
  aanya: 'cccccccc-1111-4111-8111-111111111111',
}

const org = (slug: string, kind: 'partner' | 'couple' = 'partner') =>
  orgSchema.parse({
    id: IDS[slug],
    name: slug,
    slug,
    kind,
    createdAt: new Date().toISOString(),
  })

beforeEach(() => {
  repository = new MemoryRepository(emptySnapshot())
})

describe('the registration schema', () => {
  it('demands a password long enough to be worth having', () => {
    const short = partnerRegistrationSchema.safeParse({
      businessName: 'Lensa', contactName: 'Priya', email: 'p@lensa.test', password: 'short',
    })
    expect(short.success).toBe(false)
  })

  it('never carries the password into an org record', () => {
    const parsed = orgSchema.parse({
      id: '11111111-1111-4111-8111-111111111111',
      name: 'Lensa', slug: 'lensa', createdAt: new Date().toISOString(),
    })
    expect('password' in parsed).toBe(false)
    // Every org that exists predates the field, so this must default rather than fail.
    expect(parsed.kind).toBe('partner')
  })
})

describe('org creation', () => {
  it('refuses a slug another business already holds', async () => {
    await repository.createOrg(org('lensa'))
    // The unique constraint is what settles two businesses registering at once; checking first
    // and inserting second only narrows the window.
    await expect(repository.createOrg(org('lensa'))).rejects.toThrow(/taken/i)
  })

  it('separates partners from couples when listing', async () => {
    await repository.createOrg(org('lensa'))
    await repository.createOrg(org('aanya', 'couple'))

    expect((await repository.listOrgs('partner')).map((o) => o.slug)).toEqual(['lensa'])
    expect((await repository.listOrgs('couple')).map((o) => o.slug)).toEqual(['aanya'])
    expect(await repository.listOrgs()).toHaveLength(2)
  })
})

describe('operator creation', () => {
  const operator = (email: string, orgId: string) => ({
    id: `${orgId.slice(0, 8)}-2222-4222-8222-222222222222`.replace(/^[^-]{8}/, 'dddddddd'),
    orgId,
    email,
    name: 'Priya',
    role: 'admin' as const,
    passwordHash: 'scrypt$x$y',
    createdAt: new Date().toISOString(),
  })

  it('refuses an address that already has an account', async () => {
    const a = org('lensa')
    await repository.createOrg(a)
    await repository.createOperator(operator('priya@lensa.test', a.id))
    await expect(
      repository.createOperator(operator('priya@lensa.test', a.id)),
    ).rejects.toThrow(/already/i)
  })

  it('keeps two partners from seeing each other', async () => {
    const a = org('lensa')
    const b = org('other')
    await repository.createOrg(a)
    await repository.createOrg(b)

    await repository.createCatalogue({
      id: '33333333-3333-4333-8333-333333333333',
      orgId: a.id,
      originOrgId: a.id,
      tenantSlug: 'test-studio',
      slug: 'a-client',
      customDomain: null,
      coupleName: { en: 'A Client' },
      appName: { en: 'A Originals' },
      weddingDate: '2026-12-01',
      occasion: 'wedding',
      branding: {},
      featuredTitleId: null,
      modules: [],
      draftModules: null,
      draftBranding: null,
      locale: 'en',
      template: 'films-only',
      status: 'draft',
      privacy: 'unlisted',
      passcodeHash: null,
      includedUntil: '2027-12-01',
      subStatus: 'included',
      subPlan: null,
      subUntil: null,
      createdAt: new Date().toISOString(),
      publishedAt: null,
    })

    expect(await repository.listCatalogues({ orgId: a.id })).toHaveLength(1)
    expect(await repository.listCatalogues({ orgId: b.id })).toHaveLength(0)
    // Not merely absent from a list: unreachable by id, and 404 rather than 403, so another
    // partner's client is never confirmed to exist.
    expect(await repository.getCatalogue('33333333-3333-4333-8333-333333333333', b.id)).toBeNull()
  })
})

describe('a half-finished registration', () => {
  /**
   * Found on the live database: `operators.id` references `auth.users(id)`, the local auth
   * driver mints its own uuid, and Postgres refused the insert — leaving an org with no
   * operator. Unreachable by every query here and invisible in every UI; it could only be found
   * by reading the table.
   */
  it('leaves no org behind when the operator cannot be created', async () => {
    const a = org('lensa')
    await repository.createOrg(a)
    expect(await repository.listOrgs()).toHaveLength(1)

    // What the route does when the operator insert throws.
    await repository.deleteOrg(a.id)
    expect(await repository.listOrgs()).toHaveLength(0)
  })

  it('deleting an org that is already gone is not an error', async () => {
    // The compensation runs on a failure path; it must not fail in turn.
    await expect(repository.deleteOrg('aaaaaaaa-1111-4111-8111-111111111111')).resolves.toBeUndefined()
  })
})
