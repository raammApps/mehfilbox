import { describe, expect, it } from 'vitest'
import {
  adminUrl,
  cataloguePath,
  rootUrl,
  catalogueUrl,
  isLocalDomain,
  normaliseHost,
  parseTenantPath,
  RESERVED_PATH_ROOTS,
  resolveTenant,
} from '@/lib/tenant'

/**
 * doc 10 §1 test 1: `resolveTenant` for every host shape.
 *
 * This function decides which of two applications a request reaches, on every request, so it
 * gets exhaustive coverage rather than representative coverage.
 */
const ROOT = 'mehfilbox.app'

describe('resolveTenant', () => {
  it('treats the root domain and www as marketing', () => {
    expect(resolveTenant('mehfilbox.app', ROOT)).toEqual({ kind: 'marketing' })
    expect(resolveTenant('www.mehfilbox.app', ROOT)).toEqual({ kind: 'marketing' })
  })

  it('routes the admin subdomain to the admin app', () => {
    expect(resolveTenant('admin.mehfilbox.app', ROOT)).toEqual({ kind: 'admin' })
  })

  it('resolves a catalogue from a single subdomain label', () => {
    expect(resolveTenant('aanya-vikram.mehfilbox.app', ROOT)).toEqual({
      kind: 'catalogue',
      slug: 'aanya-vikram',
      source: 'subdomain',
    })
  })

  it('is case-insensitive and ignores the port', () => {
    expect(resolveTenant('Aanya-Vikram.Mehfilbox.App:3000', ROOT)).toEqual({
      kind: 'catalogue',
      slug: 'aanya-vikram',
      source: 'subdomain',
    })
  })

  it('ignores a trailing dot in the Host header', () => {
    expect(resolveTenant('aanya-vikram.mehfilbox.app.', ROOT)).toMatchObject({ kind: 'catalogue' })
  })

  it.each(['api', 'cdn', 'static', 'assets', 'demo', 'staging', 'help', 'status', 'blog', 'docs', 'app'])(
    'refuses the reserved subdomain %s',
    (label) => {
      expect(resolveTenant(`${label}.mehfilbox.app`, ROOT).kind).toBe('unknown')
    },
  )

  it('refuses a multi-label subdomain rather than guessing', () => {
    expect(resolveTenant('a.b.mehfilbox.app', ROOT)).toEqual({ kind: 'unknown', host: 'a.b.mehfilbox.app' })
  })

  it('refuses a label that is not slug-shaped', () => {
    expect(resolveTenant('not_a_slug.mehfilbox.app', ROOT).kind).toBe('unknown')
    expect(resolveTenant('-leading.mehfilbox.app', ROOT).kind).toBe('unknown')
  })

  it('treats an unrelated host as a candidate custom domain', () => {
    expect(resolveTenant('aanyaandvikram.in', ROOT)).toEqual({
      kind: 'custom-domain',
      host: 'aanyaandvikram.in',
    })
  })

  it('treats bare localhost as marketing so `pnpm dev` lands somewhere', () => {
    expect(resolveTenant('localhost:3000', 'mehfilbox.localhost:3000')).toEqual({ kind: 'marketing' })
    expect(resolveTenant('127.0.0.1:3000', 'mehfilbox.localhost:3000')).toEqual({ kind: 'marketing' })
  })

  it('resolves a catalogue under a localhost root domain', () => {
    expect(resolveTenant('aanya-vikram.mehfilbox.localhost:3000', 'mehfilbox.localhost:3000')).toEqual({
      kind: 'catalogue',
      slug: 'aanya-vikram',
      source: 'subdomain',
    })
  })

  it('handles a missing Host header', () => {
    expect(resolveTenant(null, ROOT)).toEqual({ kind: 'unknown', host: '' })
    expect(resolveTenant('', ROOT)).toEqual({ kind: 'unknown', host: '' })
  })
})

describe('normaliseHost', () => {
  it('strips port, case and a trailing dot', () => {
    expect(normaliseHost('  Example.COM.:8443 ')).toBe('example.com')
  })
})

describe('catalogueUrl', () => {
  const wedding = { slug: 'aanya-vikram', tenant: 'kalyanam' }

  it('uses https in production and http for a localhost root', () => {
    expect(catalogueUrl(wedding, 'mehfilbox.app')).toBe('https://aanya-vikram.mehfilbox.app/')
    expect(catalogueUrl(wedding, 'mehfilbox.localhost:3000')).toBe(
      'http://aanya-vikram.mehfilbox.localhost:3000/',
    )
  })

  /**
   * The product address (D-32): the studio segment first, then the wedding. The domain and the
   * addressing strategy are both configuration; nothing downstream may assume either.
   */
  it('puts the studio in the path when the mode says so', () => {
    expect(catalogueUrl(wedding, 'mehfilbox.com', '/', 'path')).toBe(
      'https://mehfilbox.com/kalyanam/aanya-vikram',
    )
    expect(catalogueUrl(wedding, 'mehfilbox.com', '/watch/x', 'path')).toBe(
      'https://mehfilbox.com/kalyanam/aanya-vikram/watch/x',
    )
  })

  /**
   * A row written before the column existed has no studio segment yet. It still gets a link that
   * opens — the legacy form — rather than `//aanya-vikram`, which opens nothing.
   */
  it('falls back to the legacy /c/ form when the studio segment is unknown', () => {
    expect(catalogueUrl({ slug: 'aanya-vikram' }, 'mehfilbox.com', '/', 'path')).toBe(
      'https://mehfilbox.com/c/aanya-vikram',
    )
    expect(catalogueUrl({ slug: 'aanya-vikram', tenant: null }, 'mehfilbox.com', '/', 'path')).toBe(
      'https://mehfilbox.com/c/aanya-vikram',
    )
  })

  it('keeps the subdomain shape when the mode says so', () => {
    expect(catalogueUrl(wedding, 'raammcorp.in', '/watch/x', 'subdomain')).toBe(
      'https://aanya-vikram.raammcorp.in/watch/x',
    )
  })

  it('works for any domain, which is the whole point', () => {
    for (const domain of ['mehfilbox.app', 'raammcorp.in', 'marquee.film', 'example.co.uk']) {
      expect(catalogueUrl({ slug: 'couple', tenant: 'studio' }, domain)).toBe(`https://couple.${domain}/`)
      expect(catalogueUrl({ slug: 'couple', tenant: 'studio' }, domain, '/', 'path')).toBe(
        `https://${domain}/studio/couple`,
      )
    }
  })
})

describe('cataloguePath', () => {
  const wedding = { slug: 'aanya-vikram', tenant: 'kalyanam' }

  /**
   * The relative counterpart of `catalogueUrl`, and the fix for a bug that made the player
   * unreachable in path mode: components pushed `/watch/<slug>`, which is the catalogue root
   * only when the catalogue *is* the site root. In path mode that is the marketing page.
   */
  it('is empty in subdomain mode, where the catalogue is already the root', () => {
    expect(cataloguePath(wedding, 'subdomain')).toBe('')
    expect(cataloguePath(wedding)).toBe('')
  })

  it('prefixes every guest route with the studio and the wedding in path mode', () => {
    expect(cataloguePath(wedding, 'path')).toBe('/kalyanam/aanya-vikram')
    expect(cataloguePath({ slug: 'aanya-vikram' }, 'path')).toBe('/c/aanya-vikram')
  })

  it('composes into the same place `catalogueUrl` points at, in both modes', () => {
    for (const mode of ['subdomain', 'path'] as const) {
      const absolute = catalogueUrl(wedding, 'raammcorp.in', '/watch/the-ceremony', mode)
      const relative = `${cataloguePath(wedding, mode)}/watch/the-ceremony`
      expect(absolute.endsWith(relative)).toBe(true)
    }
  })
})

/**
 * What middleware does on every request in path mode (D-32). A false positive here is a broken
 * console; a false negative is a wedding that 404s — so every shape gets its own case.
 */
describe('parseTenantPath', () => {
  it('splits a studio and a wedding, keeping whatever follows', () => {
    expect(parseTenantPath('/kalyanam/aanya-vikram')).toEqual({
      tenant: 'kalyanam',
      slug: 'aanya-vikram',
      rest: '',
    })
    expect(parseTenantPath('/kalyanam/aanya-vikram/watch/the-ceremony')).toEqual({
      tenant: 'kalyanam',
      slug: 'aanya-vikram',
      rest: '/watch/the-ceremony',
    })
    expect(parseTenantPath('/kalyanam/aanya-vikram/')).toEqual({
      tenant: 'kalyanam',
      slug: 'aanya-vikram',
      rest: '/',
    })
  })

  it.each(['/', '/kalyanam', '/admin', '/admin/c/123', '/api/health', '/c/aanya-vikram', '/my/account', '/login', '/claim/abc', '/privacy', '/_next/static/x.js'])(
    'leaves %s to the application',
    (pathname) => {
      expect(parseTenantPath(pathname)).toBeNull()
    },
  )

  it.each(['/Kalyanam/aanya-vikram', '/kal_yanam/aanya', '/kalyanam/aanya vikram', '/-kalyanam/aanya', '/kalyanam/aanya-'])(
    'refuses a segment that is not slug-shaped (%s)',
    (pathname) => {
      expect(parseTenantPath(pathname)).toBeNull()
    },
  )

  it('never treats a reserved word as a studio, even one a studio could try to register', () => {
    for (const root of RESERVED_PATH_ROOTS) {
      expect(parseTenantPath(`/${root}/aanya-vikram`), root).toBeNull()
    }
  })
})

describe('isLocalDomain', () => {
  it.each(['localhost:3000', 'lvh.me:3000', 'lvh.me', 'app.localhost', '127.0.0.1:3000'])(
    'treats %s as local, so links use http',
    (domain) => {
      expect(isLocalDomain(domain)).toBe(true)
    },
  )

  it.each(['raammcorp.in', 'marquee.film', 'mehfilbox.app'])(
    'treats %s as public, so links use https',
    (domain) => {
      expect(isLocalDomain(domain)).toBe(false)
    },
  )
})

describe('adminUrl', () => {
  it('follows the tenancy mode too', () => {
    expect(adminUrl('raammcorp.in')).toBe('https://admin.raammcorp.in')
    expect(adminUrl('raammcorp.in', 'path')).toBe('https://raammcorp.in/admin')
    expect(adminUrl('lvh.me:3000', 'path')).toBe('http://lvh.me:3000/admin')
  })
})

/**
 * The claim link is the one URL in the product that a stranger — a couple who has never used
 * this app — has to be able to open. It is also the only one built for a host that is neither
 * the console nor a tenant.
 */
describe('rootUrl', () => {
  it('is the root host in both modes, because that is the point of it', () => {
    expect(rootUrl('raammcorp.in', '/claim/abc')).toBe('https://raammcorp.in/claim/abc')
    expect(rootUrl('mehfilbox.localhost:3000', '/claim/abc')).toBe(
      'http://mehfilbox.localhost:3000/claim/abc',
    )
  })

  it('tolerates a path given without its leading slash', () => {
    expect(rootUrl('raammcorp.in', 'claim/abc')).toBe('https://raammcorp.in/claim/abc')
  })

  /**
   * The regression. The claim link was built by stripping `/admin` off `adminUrl`, which is a
   * no-op in subdomain mode — leaving `https://admin.<root>/claim/…`, a host whose middleware
   * rewrites every path into `/admin/*`. Production runs path mode, where the strip worked, so
   * the broken half was the half nothing exercised.
   */
  it('never points a claim link at the admin host', () => {
    for (const mode of ['subdomain', 'path'] as const) {
      const stripped = adminUrl('raammcorp.in', mode).replace(/\/admin$/, '')
      const correct = rootUrl('raammcorp.in', '/claim/abc')
      expect(correct).not.toContain('admin.')
      // And the old derivation really does differ, in exactly one of the two modes.
      expect(`${stripped}/claim/abc` === correct).toBe(mode === 'path')
    }
  })
})

describe('resolveTenant against a real registrable domain', () => {
  // Guards against anything that quietly assumed a `.app` TLD or a two-label domain.
  it('handles a .in domain identically', () => {
    expect(resolveTenant('raammcorp.in', 'raammcorp.in')).toEqual({ kind: 'marketing' })
    expect(resolveTenant('admin.raammcorp.in', 'raammcorp.in')).toEqual({ kind: 'admin' })
    expect(resolveTenant('aanya-vikram.raammcorp.in', 'raammcorp.in')).toEqual({
      kind: 'catalogue',
      slug: 'aanya-vikram',
      source: 'subdomain',
    })
  })

  it('handles a root that is itself a subdomain', () => {
    // `marquee.raammcorp.in` as the root makes `<slug>.marquee.raammcorp.in` a catalogue.
    expect(resolveTenant('marquee.raammcorp.in', 'marquee.raammcorp.in')).toEqual({
      kind: 'marketing',
    })
    expect(resolveTenant('aanya-vikram.marquee.raammcorp.in', 'marquee.raammcorp.in')).toEqual({
      kind: 'catalogue',
      slug: 'aanya-vikram',
      source: 'subdomain',
    })
  })
})
