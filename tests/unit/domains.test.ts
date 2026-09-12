import { beforeEach, describe, expect, it } from 'vitest'
import { DELETE as removeDomain } from '@/app/api/admin/domains/[id]/route'
import { POST as checkDomain } from '@/app/api/admin/domains/[id]/check/route'
import { POST as addDomain } from '@/app/api/admin/domains/route'
import { POST as markAttached } from '@/app/api/admin/platform/domains/[id]/attached/route'
import { publicUrlOf } from '@/lib/address'
import { setAuthProvider } from '@/lib/admin/auth'
import type { AuthProvider } from '@/lib/admin/auth-provider'
import { setRepository } from '@/lib/db'
import { MemoryRepository, emptySnapshot } from '@/lib/db/memory-repository'
import { instructionsFor, isRootDomain, zoneOf } from '@/lib/domains/instructions'
import { FakeDomainProvider, setDomainProvider } from '@/lib/domains/provider'
import { checkDns, setDnsLookup, type DnsLookup } from '@/lib/domains/verify'
import { catalogueSchema, operatorSchema, orgSchema, platformAdminSchema } from '@/lib/schema'
import { env } from '@/lib/env'
import { isCustomHost, normaliseHost } from '@/lib/tenant'

/**
 * Custom domains (doc 16 §1). What has to hold: the records shown are generated from what was
 * typed and differ for a subdomain and a root; "Check DNS" says what it saw, in words; a verified
 * domain waits for attachment when no provider is configured and goes live at once when one is;
 * live means every catalogue it covers is served from it and every printed URL follows; removal
 * puts everything back; and our own host can never be somebody's domain.
 */

const ADMIN = '00000000-0000-4000-8000-00000000000a'
const OPERATOR = '00000000-0000-4000-8000-000000000001'
const ORG = '11111111-1111-4111-8111-11111111111a'
const OTHER = '11111111-1111-4111-8111-11111111111b'
const WEDDING = '22222222-2222-4222-8222-22222222222a'
const SECOND = '22222222-2222-4222-8222-22222222222b'
const THEIRS = '22222222-2222-4222-8222-22222222222c'
const AT = '2026-01-01T00:00:00.000Z'
const TARGETS = { cnameTarget: 'cname.mehfilbox.com', aRecord: '76.76.21.21', nameservers: ['ns1.vercel-dns.com', 'ns2.vercel-dns.com'] }

let repo: MemoryRepository
let current: { id: string; email: string }

function catalogue(id: string, orgId: string, slug: string, tenantSlug: string) {
  return catalogueSchema.parse({
    id,
    orgId,
    originOrgId: orgId,
    tenantSlug,
    slug,
    coupleName: { en: slug },
    appName: { en: `${slug} Originals` },
    weddingDate: '2026-02-14',
    includedUntil: '2027-02-14',
    createdAt: AT,
  })
}

/** Records the stub resolver answers with, keyed by name. */
function lookupOf(records: { txt?: Record<string, string[]>; cname?: Record<string, string[]>; a?: Record<string, string[]> }): DnsLookup {
  return {
    txt: async (name) => records.txt?.[name] ?? [],
    cname: async (name) => records.cname?.[name] ?? [],
    a: async (name) => records.a?.[name] ?? [],
  }
}

beforeEach(() => {
  const snapshot = emptySnapshot()
  snapshot.platformAdmins.push(platformAdminSchema.parse({ id: ADMIN, email: 'root@mehfilbox.test', name: 'Root', createdAt: AT }))
  snapshot.orgs.push(
    orgSchema.parse({ id: ORG, name: 'Kalyanam Weddings', slug: 'kalyanam', createdAt: AT }),
    orgSchema.parse({ id: OTHER, name: 'Other', slug: 'other', createdAt: AT }),
  )
  snapshot.operators.push(
    operatorSchema.parse({ id: OPERATOR, orgId: ORG, email: 'operator@example.test', name: 'Operator', role: 'admin', passwordHash: '', createdAt: AT }),
  )
  snapshot.catalogues.push(
    catalogue(WEDDING, ORG, 'aanya-vikram', 'kalyanam'),
    catalogue(SECOND, ORG, 'meera-arjun', 'kalyanam'),
    catalogue(THEIRS, OTHER, 'someone-else', 'other'),
  )
  repo = new MemoryRepository(snapshot)
  setRepository(repo)
  current = { id: OPERATOR, email: 'operator@example.test' }
  setAuthProvider({
    name: 'stub',
    currentUser: async () => current,
    signIn: async () => null,
    signOut: async () => {},
  } as unknown as AuthProvider)
  setDnsLookup(lookupOf({}))
  setDomainProvider(null)
})

const json = (body: unknown) => ({ method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })
const params = (id: string) => ({ params: Promise.resolve({ id }) })
async function add(body: unknown) {
  const response = await addDomain(new Request('http://mehfilbox.test/api/admin/domains', json(body)))
  return { status: response.status, body: await response.json() }
}
async function check(id: string) {
  const response = await checkDomain(new Request('http://mehfilbox.test/x', { method: 'POST' }), params(id))
  return { status: response.status, body: await response.json() }
}

describe('the records to add', () => {
  it('tells a root domain from a subdomain, public suffixes included', () => {
    expect(zoneOf('films.kalyanam.in')).toBe('kalyanam.in')
    expect(isRootDomain('kalyanam.in')).toBe(true)
    expect(isRootDomain('kalyanam.co.in')).toBe(true)
    expect(isRootDomain('films.kalyanam.co.in')).toBe(false)
  })

  it('gives a subdomain a CNAME and the TXT, and a root an A record, a www CNAME, and the email warning', () => {
    const sub = instructionsFor('films.kalyanam.in', 'tok', TARGETS)
    expect(sub.kind).toBe('subdomain')
    expect(sub.records.map((r) => [r.type, r.name, r.value])).toEqual([
      ['TXT', '_mehfilbox.films', 'tok'],
      ['CNAME', 'films', 'cname.mehfilbox.com'],
    ])
    expect(sub.warnings).toEqual([])

    const root = instructionsFor('AanyaAndVikram.in', 'tok', TARGETS)
    expect(root.kind).toBe('root')
    expect(root.records.map((r) => [r.type, r.name, r.value])).toEqual([
      ['TXT', '_mehfilbox', 'tok'],
      ['A', '@', '76.76.21.21'],
      ['CNAME', 'www', 'cname.mehfilbox.com'],
    ])
    expect(root.warnings.join(' ')).toMatch(/MX records/)
    expect(root.nameservers).toEqual(TARGETS.nameservers)
    expect(root.registrars.map((r) => r.name)).toContain('Hostinger')
  })
})

describe('checking DNS', () => {
  const domain = { host: 'films.kalyanam.in', verificationToken: 'mehfilbox-verify-abc' }

  it('needs the TXT and the CNAME, and says which is missing', async () => {
    const nothing = await checkDns(domain, TARGETS, lookupOf({}))
    expect(nothing.verified).toBe(false)
    expect(nothing.problem).toMatch(/No TXT record/)

    const owned = await checkDns(domain, TARGETS, lookupOf({ txt: { '_mehfilbox.films.kalyanam.in': ['mehfilbox-verify-abc'] } }))
    expect(owned.ownership).toBe(true)
    expect(owned.pointing).toBe(false)
    expect(owned.problem).toMatch(/no CNAME/)

    const wrong = await checkDns(domain, TARGETS, lookupOf({
      txt: { '_mehfilbox.films.kalyanam.in': ['mehfilbox-verify-abc'] },
      cname: { 'films.kalyanam.in': ['ghs.googlehosted.com.'] },
    }))
    expect(wrong.problem).toMatch(/points at ghs.googlehosted.com/)

    const right = await checkDns(domain, TARGETS, lookupOf({
      txt: { '_mehfilbox.films.kalyanam.in': ['mehfilbox-verify-abc'] },
      cname: { 'films.kalyanam.in': ['CNAME.mehfilbox.com.'] },
    }))
    expect(right.verified).toBe(true)
    expect(right.problem).toBeNull()
  })

  it('reads an A record for a root', async () => {
    const root = { host: 'aanyaandvikram.in', verificationToken: 'tok' }
    const result = await checkDns(root, TARGETS, lookupOf({
      txt: { '_mehfilbox.aanyaandvikram.in': ['tok'] },
      a: { 'aanyaandvikram.in': ['76.76.21.21'] },
    }))
    expect(result.verified).toBe(true)
  })
})

describe('adding one', () => {
  it('stores the intent with a token and answers with the records', async () => {
    const { status, body } = await add({ host: 'AanyaAndVikram.in', catalogueId: WEDDING })
    expect(status).toBe(201)
    expect(body.domain).toMatchObject({ host: 'aanyaandvikram.in', status: 'pending', catalogueId: WEDDING })
    expect(body.domain.verificationToken).toMatch(/^mehfilbox-verify-/)
    expect(body.instructions.records[0]).toMatchObject({ type: 'TXT', value: body.domain.verificationToken })
    // Nothing served yet.
    expect((await repo.getCatalogueById(WEDDING))?.servedAt).toBeNull()
  })

  it('refuses our own host, a wedding that is not ours, a second domain, and a duplicate', async () => {
    // Whatever the suite's root is, it and anything under it are ours.
    const root = normaliseHost(env.ROOT_DOMAIN)
    expect((await add({ host: root, catalogueId: WEDDING })).status).toBe(400)
    expect((await add({ host: `films.${root}` })).status).toBe(400)
    expect((await add({ host: 'x.example.in', catalogueId: THEIRS })).status).toBe(404)
    expect((await add({ host: 'films.kalyanam.in' })).status).toBe(201)
    expect((await add({ host: 'more.kalyanam.in' })).status).toBe(400)
    expect((await add({ host: 'films.kalyanam.in', catalogueId: WEDDING })).status).toBe(400)
  })
})

describe('going live', () => {
  it('waits at verified when nobody can attach it, and is attached by hand from the platform', async () => {
    const { body: made } = await add({ host: 'aanyaandvikram.in', catalogueId: WEDDING })
    setDnsLookup(lookupOf({ txt: { '_mehfilbox.aanyaandvikram.in': [made.domain.verificationToken] }, a: { 'aanyaandvikram.in': ['76.76.21.21'] } }))

    const checked = await check(made.domain.id)
    expect(checked.body.domain.status).toBe('verified')
    expect((await repo.getCatalogueById(WEDDING))?.servedAt).toBeNull()

    current = { id: ADMIN, email: 'root@mehfilbox.test' }
    const attached = await markAttached(new Request('http://mehfilbox.test/x', { method: 'POST' }), params(made.domain.id))
    expect(attached.status).toBe(200)
    expect((await attached.json()).domain.status).toBe('active')

    const wedding = (await repo.getCatalogueById(WEDDING))!
    expect(wedding.servedAt).toBe('https://aanyaandvikram.in')
    expect(publicUrlOf(wedding)).toBe('https://aanyaandvikram.in')
    expect(publicUrlOf(wedding, '/watch/the-ceremony')).toBe('https://aanyaandvikram.in/watch/the-ceremony')
    expect(await repo.getCatalogueByCustomDomain('aanyaandvikram.in')).toMatchObject({ id: WEDDING })
    expect((await repo.listPlatformAudit({ limit: 5 })).map((e) => e.action)).toEqual(['domain.attach'])
  })

  it('goes live at once with a provider, serving every wedding under a studio domain, and comes back off', async () => {
    const provider = new FakeDomainProvider()
    setDomainProvider(provider)
    const { body: made } = await add({ host: 'films.kalyanam.in' })
    setDnsLookup(lookupOf({ txt: { '_mehfilbox.films.kalyanam.in': [made.domain.verificationToken] }, cname: { 'films.kalyanam.in': ['cname.mehfilbox.com'] } }))

    const checked = await check(made.domain.id)
    expect(checked.body.domain.status).toBe('active')
    expect(provider.attached.has('films.kalyanam.in')).toBe(true)
    expect((await repo.getCatalogueById(WEDDING))?.servedAt).toBe('https://films.kalyanam.in/aanya-vikram')
    expect((await repo.getCatalogueById(SECOND))?.servedAt).toBe('https://films.kalyanam.in/meera-arjun')
    // Another studio's wedding is not touched.
    expect((await repo.getCatalogueById(THEIRS))?.servedAt).toBeNull()

    const removed = await removeDomain(new Request('http://mehfilbox.test/x', { method: 'DELETE' }), params(made.domain.id))
    expect(removed.status).toBe(200)
    expect((await repo.getCatalogueById(WEDDING))?.servedAt).toBeNull()
    expect(provider.attached.has('films.kalyanam.in')).toBe(false)
    expect(await repo.listDomains(ORG)).toEqual([])
  })

  it('records what a failed check saw, and keeps the domain pending', async () => {
    const { body: made } = await add({ host: 'films.kalyanam.in' })
    const checked = await check(made.domain.id)
    expect(checked.body.domain.status).toBe('pending')
    expect(checked.body.domain.error).toMatch(/No TXT record/)
    expect(checked.body.domain.lastCheckedAt).not.toBeNull()
  })
})

describe('what counts as a custom host', () => {
  it('is anything that is not ours or a loopback', () => {
    expect(isCustomHost('aanyaandvikram.in', 'mehfilbox.com')).toBe(true)
    expect(isCustomHost('mehfilbox.com', 'mehfilbox.com')).toBe(false)
    expect(isCustomHost('www.mehfilbox.com', 'mehfilbox.com')).toBe(false)
    expect(isCustomHost('localhost:3101', 'localhost:3101')).toBe(false)
    expect(isCustomHost('app.localhost', 'localhost:3000')).toBe(false)
    expect(isCustomHost(null, 'mehfilbox.com')).toBe(false)
  })
})
