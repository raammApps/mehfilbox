import { beforeEach, describe, expect, it } from 'vitest'
import { POST as createCatalogue } from '@/app/api/admin/catalogues/route'
import { DELETE, PATCH } from '@/app/api/admin/presets/[id]/route'
import { POST } from '@/app/api/admin/presets/route'
import { setAuthProvider } from '@/lib/admin/auth'
import type { AuthProvider } from '@/lib/admin/auth-provider'
import { hashSecret, verifySecret } from '@/lib/crypto'
import { setRepository } from '@/lib/db'
import { MemoryRepository, emptySnapshot } from '@/lib/db/memory-repository'
import { catalogueSchema, operatorSchema, orgSchema, presetSchema, type Catalogue } from '@/lib/schema'

/**
 * House styles (D-36, doc 16 §5).
 *
 * The two rules worth holding: a style's values are *copied* into a wedding at creation, so
 * editing the style never moves a delivered page; and a style a published wedding was made from
 * is frozen — refused with the count, with a duplicate as the way forward. Around them: the
 * capture from a delivered wedding, one default per studio, and the org boundary.
 */

const MINE = '11111111-1111-4111-8111-11111111111a'
const THEIRS = '11111111-1111-4111-8111-11111111111b'
const OPERATOR = '00000000-0000-4000-8000-000000000001'
const DELIVERED = '22222222-2222-4222-8222-222222222221'
const THEIR_STYLE = '33333333-3333-4333-8333-333333333331'
const AT = '2026-01-01T00:00:00.000Z'

let repo: MemoryRepository

beforeEach(() => {
  const snapshot = emptySnapshot()
  snapshot.orgs.push(
    orgSchema.parse({
      id: MINE,
      name: 'Kalyanam Weddings',
      slug: 'kalyanam',
      branding: { presentedBy: 'Kalyanam Weddings', accent: '#d11a2a' },
      createdAt: AT,
    }),
    orgSchema.parse({ id: THEIRS, name: 'Other', slug: 'other', createdAt: AT }),
  )
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
  // A wedding this studio delivered: Carnival, the anniversary layout, Hindi, a guest code.
  snapshot.catalogues.push(
    catalogueSchema.parse({
      id: DELIVERED,
      orgId: MINE,
      tenantSlug: 'kalyanam',
      slug: 'delivered',
      coupleName: { en: 'Meera & Arjun' },
      appName: { en: 'Meera & Arjun Originals' },
      weddingDate: '2025-12-01',
      includedUntil: '2026-12-01',
      branding: { theme: 'carnival', accent: '#f2933a', presentedBy: 'Kalyanam Weddings' },
      template: 'anniversary',
      locale: 'hi',
      status: 'published',
      privacy: 'passcode',
      passcodeHash: hashSecret('4821'),
      createdAt: AT,
    }),
  )
  snapshot.presets.push(
    presetSchema.parse({
      id: THEIR_STYLE,
      orgId: THEIRS,
      name: 'Not ours',
      createdAt: AT,
      updatedAt: AT,
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

const json = (body: unknown, method: string) => ({
  method,
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify(body),
})

async function postStyle(body: unknown) {
  const response = await POST(new Request('http://mehfilbox.test/api/admin/presets', json(body, 'POST')))
  return { status: response.status, body: await response.json() }
}
async function patchStyle(id: string, body: unknown) {
  const response = await PATCH(
    new Request(`http://mehfilbox.test/api/admin/presets/${id}`, json(body, 'PATCH')),
    { params: Promise.resolve({ id }) },
  )
  return { status: response.status, body: await response.json() }
}
async function deleteStyle(id: string) {
  const response = await DELETE(
    new Request(`http://mehfilbox.test/api/admin/presets/${id}`, { method: 'DELETE' }),
    { params: Promise.resolve({ id }) },
  )
  return { status: response.status, body: await response.json() }
}
let slugs = 0
async function create(extra: Record<string, unknown>) {
  const response = await createCatalogue(
    new Request(
      'http://mehfilbox.test/api/admin/catalogues',
      json(
        {
          coupleName: { en: 'Aanya & Vikram' },
          appName: { en: 'Aanya & Vikram Originals' },
          weddingDate: '2026-02-14',
          slug: `aanya-vikram-${++slugs}`,
          ...extra,
        },
        'POST',
      ),
    ),
  )
  return { status: response.status, body: (await response.json()) as { catalogue: Catalogue; passcode?: string; error?: { code: string } } }
}

const SANGEET = {
  name: 'Sangeet',
  isDefault: true,
  templateId: 'films-only',
  branding: { theme: 'carnival', accent: '#f2933a' },
  locale: 'hi',
  passcodeOn: true,
}

describe('making a style', () => {
  it('captures a delivered wedding’s look — what the couple was given, by name', async () => {
    const { status, body } = await postStyle({ name: 'Winter classic', fromCatalogueId: DELIVERED })
    expect(status).toBe(201)
    expect(body.preset).toMatchObject({
      name: 'Winter classic',
      templateId: 'anniversary',
      branding: { theme: 'carnival', accent: '#f2933a', presentedBy: 'Kalyanam Weddings' },
      locale: 'hi',
      passcodeOn: true,
      isDefault: false,
    })
    expect((await repo.listPresets(MINE)).map((p) => p.name)).toEqual(['Winter classic'])
  })

  it('keeps one default per studio', async () => {
    await postStyle({ ...SANGEET, name: 'A' })
    await postStyle({ ...SANGEET, name: 'B' })
    const defaults = (await repo.listPresets(MINE)).filter((p) => p.isDefault).map((p) => p.name)
    expect(defaults).toEqual(['B'])
  })

  it('refuses a layout or theme that does not exist', async () => {
    expect((await postStyle({ ...SANGEET, templateId: 'nope' })).status).toBe(400)
    expect((await postStyle({ ...SANGEET, branding: { theme: 'nope' } })).status).toBe(400)
  })
})

describe('a wedding created from a style', () => {
  it('starts in it — layout, branding, language, and a code shown once', async () => {
    const { body: made } = await postStyle(SANGEET)
    const { status, body } = await create({ presetId: made.preset.id })
    expect(status).toBe(201)

    const catalogue = body.catalogue
    expect(catalogue.presetId).toBe(made.preset.id)
    expect(catalogue.template).toBe('films-only')
    expect(catalogue.locale).toBe('hi')
    // The style's branding on top of the studio's: the theme and accent from the style, the
    // "presented by" the studio always carries.
    expect(catalogue.branding).toMatchObject({
      theme: 'carnival',
      accent: '#f2933a',
      presentedBy: 'Kalyanam Weddings',
    })
    expect(catalogue.draftModules?.length).toBeGreaterThan(0)

    // The code is generated here, hashed on the row, and returned exactly once.
    expect(body.passcode).toMatch(/^\d{6}$/)
    expect(catalogue.privacy).toBe('passcode')
    // Salted, so verified rather than compared.
    expect(verifySecret(body.passcode!, catalogue.passcodeHash)).toBe(true)
  })

  it('still lets the wizard’s own fields win', async () => {
    const { body: made } = await postStyle(SANGEET)
    const { body } = await create({ presetId: made.preset.id, locale: 'en', template: 'keepsake' })
    expect(body.catalogue.locale).toBe('en')
    expect(body.catalogue.template).toBe('keepsake')
  })

  it('can start blank, which seeds nothing', async () => {
    const { body } = await create({ template: 'blank' })
    expect(body.catalogue.template).toBe('blank')
    expect(body.catalogue.draftModules).toEqual([])
    expect(body.passcode).toBeUndefined()
  })
})

describe('the freeze (D-36)', () => {
  it('fixes a style’s look once a wedding made from it is published, and frees its copy', async () => {
    const { body: made } = await postStyle(SANGEET)
    const id = made.preset.id as string
    const { body: created } = await create({ presetId: id })
    await repo.updateCatalogue(created.catalogue.id, MINE, { status: 'published' })

    const refused = await patchStyle(id, { branding: { theme: 'classic' } })
    expect(refused.status).toBe(409)
    expect(refused.body.error.code).toBe('FROZEN')
    expect(refused.body.error.fields.count).toBe('1')
    expect(refused.body.error.message).toMatch(/duplicate/i)
    expect((await repo.getPreset(id, MINE))?.branding.theme).toBe('carnival')

    // Renaming and choosing the default touch no wedding.
    expect((await patchStyle(id, { name: 'Sangeet 2025', isDefault: false })).status).toBe(200)
    // Sending the same look back is not a change.
    expect((await patchStyle(id, { templateId: 'films-only' })).status).toBe(200)
    expect((await deleteStyle(id)).status).toBe(409)

    const copy = await postStyle({ name: 'Sangeet 2026', duplicateOf: id })
    expect(copy.status).toBe(201)
    expect(copy.body.preset).toMatchObject({ templateId: 'films-only', locale: 'hi', passcodeOn: true })
    expect(copy.body.preset.id).not.toBe(id)
    expect((await patchStyle(copy.body.preset.id, { branding: { theme: 'classic' } })).status).toBe(200)
    expect((await deleteStyle(copy.body.preset.id)).status).toBe(200)

    // And the delivered wedding never moved.
    expect((await repo.getCatalogue(created.catalogue.id, MINE))?.branding.theme).toBe('carnival')
  })

  it('does not freeze for a draft — nobody has been given that look yet', async () => {
    const { body: made } = await postStyle(SANGEET)
    await create({ presetId: made.preset.id })
    expect((await patchStyle(made.preset.id, { branding: { theme: 'classic' } })).status).toBe(200)
    expect((await deleteStyle(made.preset.id)).status).toBe(200)
  })
})

describe('the org boundary', () => {
  it('answers another studio’s style with a 404, to touch and to start from', async () => {
    expect((await patchStyle(THEIR_STYLE, { name: 'Mine now' })).status).toBe(404)
    expect((await deleteStyle(THEIR_STYLE)).status).toBe(404)
    expect((await postStyle({ name: 'Copy', duplicateOf: THEIR_STYLE })).status).toBe(404)
    expect((await create({ presetId: THEIR_STYLE })).status).toBe(404)
    expect(await repo.getPreset(THEIR_STYLE, THEIRS)).toMatchObject({ name: 'Not ours' })
  })
})
