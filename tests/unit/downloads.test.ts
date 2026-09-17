import { beforeEach, describe, expect, it, vi } from 'vitest'
import { setAuthProvider } from '@/lib/admin/auth'
import type { AuthProvider } from '@/lib/admin/auth-provider'
import { setRepository } from '@/lib/db'
import { MemoryRepository, emptySnapshot } from '@/lib/db/memory-repository'
import { operatorSchema, orgSchema } from '@/lib/schema'
import { makeCatalogue, makeTitle } from '../helpers/repository'

/**
 * N-22 — nobody is held to ransom for their own wedding.
 *
 * "Nothing is ever deleted" and "it archives rather than disappears" are in the handover email,
 * the FAQ and the pricing page. They are worth nothing if a couple cannot get their films out
 * once the plan lapses, so what is tested here is the two edges of that promise: it survives
 * lapsing, and it does **not** survive the passcode being unmet.
 *
 * N-85 / D-43 — and a third edge, added later: the passcode is view-only. Downloading needs the
 * signed-in account this wedding belongs to, not merely the code, so most of what is below now
 * signs a session in first and asserts the *anonymous* case separately.
 */

const ORG = '11111111-1111-4111-8111-11111111111a'
const OTHER_ORG = '11111111-1111-4111-8111-11111111111b'
const OPERATOR = '00000000-0000-4000-8000-000000000002'
const PUBLISHED_AT = '2026-03-01T00:00:00.000Z'

const cookieStore = { value: null as string | null }
vi.mock('next/headers', () => ({
  cookies: async () => ({ get: () => (cookieStore.value ? { value: cookieStore.value } : undefined) }),
}))

function noOneSignedIn(): AuthProvider {
  return {
    name: 'stub',
    currentUser: async () => null,
    signIn: async () => null,
    signOut: async () => {},
  } as unknown as AuthProvider
}

function signedInAs(userId: string): AuthProvider {
  return {
    name: 'stub',
    currentUser: async () => ({ id: userId, email: 'session@mehfilbox.test' }),
    signIn: async () => null,
    signOut: async () => {},
  } as unknown as AuthProvider
}

/**
 * Injects the fake video provider explicitly.
 *
 * `tests/setup.ts` loads `.env.local` so the integration suite finds real credentials, and that
 * file carries `VIDEO_DRIVER=bunny` — so a unit test that does not say otherwise reaches for
 * Bunny over the network and every film comes back unavailable. That is the *correct* behaviour
 * under a broken provider, which is exactly why it made a confusing test failure.
 */
async function install(overrides: Parameters<typeof makeCatalogue>[0] = {}) {
  const catalogue = makeCatalogue({
    orgId: ORG,
    slug: 'aanya-vikram',
    status: 'published',
    publishedAt: PUBLISHED_AT,
    ...overrides,
  })
  const snapshot = emptySnapshot()
  snapshot.catalogues.push(catalogue)
  snapshot.titles.push(makeTitle(catalogue.id, { slug: 'the-ceremony', published: true }))
  // An org and an operator row for every org a test might sign in as — `getOperatorSession`
  // requires both to exist (a session whose org has vanished is not a session), and looks the
  // operator up by the auth provider's user id, which here is just the org id, kept simple.
  for (const orgId of [ORG, OTHER_ORG]) {
    snapshot.orgs.push(
      orgSchema.parse({ id: orgId, name: 'Studio', slug: `studio-${orgId.slice(-4)}`, kind: 'partner', createdAt: PUBLISHED_AT }),
    )
    snapshot.operators.push(
      operatorSchema.parse({
        id: orgId,
        orgId,
        email: `${orgId}@mehfilbox.test`,
        name: 'Operator',
        role: 'admin',
        passwordHash: '',
        createdAt: PUBLISHED_AT,
      }),
    )
  }
  setRepository(new MemoryRepository(snapshot))

  const { setVideoProvider } = await import('@/lib/video')
  const { FakeVideoProvider } = await import('@/lib/video/fake')
  setVideoProvider(new FakeVideoProvider())

  return catalogue
}

beforeEach(() => {
  cookieStore.value = null
  setAuthProvider(noOneSignedIn())
  vi.resetModules()
})

describe('who may reach the download page at all', () => {
  it('is reachable for an anonymous guest, unpublished-or-not', async () => {
    await install()
    const { resolveDownloadAccess } = await import('@/lib/downloads')
    // Reachable, but see the "who may actually download" suite: reachable is not authorised.
    expect((await resolveDownloadAccess('aanya-vikram')).kind).not.toBe('missing')
  })

  it('refuses a passcode catalogue without the passcode, lapsed or not', async () => {
    await install({ privacy: 'passcode', subStatus: 'lapsed', includedUntil: '2026-01-01' })
    const { resolveDownloadAccess } = await import('@/lib/downloads')
    expect((await resolveDownloadAccess('aanya-vikram')).kind).toBe('locked')
  })

  it('has nothing to offer for a draft that was never handed over', async () => {
    await install({ status: 'draft', publishedAt: null })
    const { resolveDownloadAccess } = await import('@/lib/downloads')
    expect((await resolveDownloadAccess('aanya-vikram')).kind).toBe('missing')
  })

  it('has nothing to offer for a wedding that does not exist', async () => {
    await install()
    const { resolveDownloadAccess } = await import('@/lib/downloads')
    expect((await resolveDownloadAccess('not-a-wedding')).kind).toBe('missing')
  })
})

/**
 * D-43: a guest who has the code watches; the couple who own the wedding, and the studio that
 * made it, download. The passcode alone — with or without a session behind it — is not enough.
 */
describe('who may actually download (D-43)', () => {
  it('does not let an anonymous guest download, even with no passcode set', async () => {
    await install()
    const { resolveDownloadAccess } = await import('@/lib/downloads')
    expect((await resolveDownloadAccess('aanya-vikram')).kind).toBe('signin')
  })

  it('does not let a guest holding a valid passcode download either', async () => {
    const catalogue = await install({ privacy: 'passcode' })
    const { createPasscodeGrant } = await import('@/lib/auth')
    cookieStore.value = createPasscodeGrant(catalogue.id, catalogue.passcodeVersion)
    const { resolveDownloadAccess } = await import('@/lib/downloads')
    expect((await resolveDownloadAccess('aanya-vikram')).kind).toBe('signin')
  })

  it('lets the owning org download', async () => {
    await install()
    setAuthProvider(signedInAs(ORG))
    const { resolveDownloadAccess } = await import('@/lib/downloads')
    expect((await resolveDownloadAccess('aanya-vikram')).kind).toBe('ok')
  })

  it('lets a couple linked before handover download, not only one that owns it', async () => {
    // `orgId` is still the studio's; `coupleOrgId` is the couple's account, linked but not yet
    // handed over — `/my/c/[id]` already offers this state the download link (doc comment there:
    // "Linked … open, share, download"), so the access check has to agree.
    await install({ coupleOrgId: OTHER_ORG })
    setAuthProvider(signedInAs(OTHER_ORG))
    const { resolveDownloadAccess } = await import('@/lib/downloads')
    expect((await resolveDownloadAccess('aanya-vikram')).kind).toBe('ok')
  })

  it('lets the originating studio keep downloading after a handover moves orgId to the couple', async () => {
    await install({ orgId: OTHER_ORG, originOrgId: ORG })
    setAuthProvider(signedInAs(ORG))
    const { resolveDownloadAccess } = await import('@/lib/downloads')
    expect((await resolveDownloadAccess('aanya-vikram')).kind).toBe('ok')
  })

  it('refuses a signed-in session that belongs to neither org', async () => {
    await install()
    setAuthProvider(signedInAs(OTHER_ORG))
    const { resolveDownloadAccess } = await import('@/lib/downloads')
    expect((await resolveDownloadAccess('aanya-vikram')).kind).toBe('signin')
  })

  it('lets the owner in without the passcode — the same courtesy playback and editing extend', async () => {
    await install({ privacy: 'passcode' })
    setAuthProvider(signedInAs(ORG))
    const { resolveDownloadAccess } = await import('@/lib/downloads')
    expect((await resolveDownloadAccess('aanya-vikram')).kind).toBe('ok')
  })

  /**
   * The assertion the promise rests on. A lapsed catalogue shows a renewal screen instead of the
   * films — and the files must still come out for whoever is authorised, because lapsing is a
   * billing state and the wedding is not ours to withhold.
   */
  it('still lets an authorised org download after it has lapsed', async () => {
    await install({ subStatus: 'lapsed', includedUntil: '2026-01-01' })
    setAuthProvider(signedInAs(ORG))
    const { resolveDownloadAccess } = await import('@/lib/downloads')
    expect((await resolveDownloadAccess('aanya-vikram')).kind).toBe('ok')
  })

  it('still lets an authorised org download once it is archived', async () => {
    // `cold` is the archived sub-status — streaming paused, files retained (PRICING.md §2).
    await install({ status: 'archived', subStatus: 'cold', includedUntil: '2026-01-01' })
    setAuthProvider(signedInAs(ORG))
    const { resolveDownloadAccess } = await import('@/lib/downloads')
    expect((await resolveDownloadAccess('aanya-vikram')).kind).toBe('ok')
  })
})

describe('the manifest', () => {
  it('lists a film with the quality actually handed over', async () => {
    const catalogue = await install()
    const { buildManifest } = await import('@/lib/downloads')

    const manifest = await buildManifest(catalogue)
    const film = manifest.items.find((i) => i.kind === 'film')

    expect(film?.name).toBe('A Film')
    // Named rather than implied: a couple handed a 720p fallback is told that is what it is.
    expect(film?.quality).toBe('original')
    expect(manifest.unavailable).toBe(0)
  })

  /**
   * A couple downloading their wedding at the end of a plan is the least forgiving moment this
   * product has. Nine films and a count of what could not be reached beats an error page.
   */
  it('reports what it could not reach rather than failing entirely', async () => {
    const catalogue = await install()
    const { setVideoProvider } = await import('@/lib/video')
    const { FakeVideoProvider } = await import('@/lib/video/fake')
    const provider = new FakeVideoProvider()
    provider.getDownloadUrl = async () => {
      throw new Error('provider is down')
    }
    setVideoProvider(provider)

    const { buildManifest } = await import('@/lib/downloads')
    const manifest = await buildManifest(catalogue)

    expect(manifest.items.filter((i) => i.kind === 'film')).toHaveLength(0)
    expect(manifest.unavailable).toBe(1)
  })
})
