import { RESERVED_SUBDOMAINS } from './schema'

/**
 * Host → what to serve, and the one place that knows how a catalogue is addressed. Pure — no
 * I/O — so it can be exhaustively unit tested (doc 05 §5, doc 10 §1 test 1) and run inside
 * middleware on the edge.
 *
 * **Two tenancy modes**, and since 12 September 2026 only one of them is a product (D-32):
 *
 * - `path` — `example.com/<studio>/<wedding>`. The studio segment is the originating org's slug,
 *   frozen on the catalogue at creation, so a handover never moves a link already in two hundred
 *   phones. One domain, one certificate, no wildcard DNS. This is what production runs.
 * - `subdomain` — `<wedding>.example.com`. Retired as a product mode; kept as configuration because
 *   the Playwright harness still boots a server this way, and because nothing about rendering
 *   differs between the two — only addressing does.
 *
 * `/c/<wedding>` is the internal route in both modes. Subdomain mode rewrites the host onto it;
 * path mode rewrites the tenant path onto it. Nothing downstream knows which is in use, and an
 * external request that reaches `/c/<wedding>` directly is a legacy link, answered with a redirect
 * to the canonical address (`lib/address.ts`).
 */

export type TenancyMode = 'subdomain' | 'path'

export type TenantResolution =
  | { kind: 'marketing' }
  | { kind: 'admin' }
  | { kind: 'catalogue'; slug: string; source: 'subdomain' }
  | { kind: 'custom-domain'; host: string }
  | { kind: 'unknown'; host: string }

/**
 * What a catalogue is addressed by.
 *
 * `tenant` is the studio segment of the path — `catalogues.tenant_slug`. It is optional only so a
 * row written before the column existed still produces *a* working link: with no tenant, path
 * mode falls back to the legacy `/c/<wedding>` form rather than emitting `//wedding`.
 */
export type CatalogueAddress = { slug: string; tenant?: string | null }

/**
 * Is this a development address rather than a public one?
 *
 * Governs http vs https, so getting it wrong produces links that silently do not open. A port
 * is the reliable tell — production roots never carry one — plus the loopback names. `lvh.me`
 * and `*.lvh.me` are public DNS that resolve to 127.0.0.1, which is what lets subdomain mode
 * work locally with no `/etc/hosts` edit.
 */
export function isLocalDomain(rootDomain: string): boolean {
  if (rootDomain.includes(':')) return true
  const host = normaliseHost(rootDomain)
  return (
    host === 'localhost' ||
    host.endsWith('.localhost') ||
    host === '127.0.0.1' ||
    host === 'lvh.me' ||
    host.endsWith('.lvh.me')
  )
}

/** Strip the port and any trailing dot, lowercase. `Host` headers are not normalised for us. */
export function normaliseHost(rawHost: string | null | undefined): string {
  if (!rawHost) return ''
  return rawHost.trim().toLowerCase().split(':')[0]!.replace(/\.$/, '')
}

export function resolveTenant(rawHost: string | null | undefined, rawRoot: string): TenantResolution {
  const host = normaliseHost(rawHost)
  const root = normaliseHost(rawRoot)

  if (!host) return { kind: 'unknown', host: '' }

  if (host === root || host === `www.${root}`) return { kind: 'marketing' }

  if (host.endsWith(`.${root}`)) {
    const label = host.slice(0, -(root.length + 1))

    // Only a single label is a catalogue. `a.b.mehfilbox.app` is not a tenant, it is a mistake.
    if (label.includes('.')) return { kind: 'unknown', host }

    if (label === 'admin') return { kind: 'admin' }
    if ((RESERVED_SUBDOMAINS as readonly string[]).includes(label)) return { kind: 'unknown', host }
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(label)) return { kind: 'unknown', host }

    return { kind: 'catalogue', slug: label, source: 'subdomain' }
  }

  // Anything else is either a configured custom domain or noise; the DB decides. A bare
  // loopback host is treated as marketing so `pnpm dev` lands somewhere useful.
  if (host === 'localhost' || host === '127.0.0.1' || host === 'lvh.me') {
    return { kind: 'marketing' }
  }

  return { kind: 'custom-domain', host }
}

/**
 * First path segments that can never be a studio.
 *
 * Every top-level route the application owns, plus the ones a browser or a crawler asks for on
 * its own. A studio whose slug collided with one of these would be unreachable, so
 * `RESERVED_SUBDOMAINS` (which registration already refuses) is folded in too.
 */
export const RESERVED_PATH_ROOTS: readonly string[] = [
  ...RESERVED_SUBDOMAINS,
  'c',
  'd',
  'claim',
  'my',
  'login',
  'register',
  'set-password',
  'privacy',
  'terms',
  'og',
  '_next',
  'fonts',
  'media',
  'favicon.ico',
  'robots.txt',
  'sitemap.xml',
  'manifest.json',
]

const SEGMENT = /^[a-z0-9]+(?:-[a-z0-9]+)*$/

export type TenantPath = { tenant: string; slug: string; rest: string }

/**
 * `/<studio>/<wedding>[/rest]` → its parts, or null when the path is something else.
 *
 * Pure and strict: both segments have to be slug-shaped, and the first must not be a route the
 * application owns. Middleware calls this on every request in path mode, so a false positive is a
 * broken admin console and a false negative is a wedding that 404s — hence a test for each shape.
 */
export function parseTenantPath(pathname: string): TenantPath | null {
  const match = /^\/([^/]+)\/([^/]+)(\/.*)?$/.exec(pathname)
  if (!match) return null
  const [, tenant, slug, rest = ''] = match
  if (!tenant || !slug) return null
  if (RESERVED_PATH_ROOTS.includes(tenant.toLowerCase())) return null
  if (!SEGMENT.test(tenant) || !SEGMENT.test(slug)) return null
  return { tenant, slug, rest }
}

/**
 * The public URL of a catalogue — share links, OG tags, the address shown to an operator.
 *
 * The single place that knows how a catalogue is addressed. Everything else asks this, so a
 * change of domain or of tenancy mode reaches the whole product without touching a component.
 */
export function catalogueUrl(
  address: CatalogueAddress,
  rootDomain: string,
  path = '/',
  mode: TenancyMode = 'subdomain',
): string {
  const protocol = isLocalDomain(rootDomain) ? 'http' : 'https'
  const suffix = path === '/' ? '' : path

  if (mode === 'path') return `${protocol}://${rootDomain}${cataloguePath(address, mode)}${suffix}`
  return `${protocol}://${address.slug}.${rootDomain}${path}`
}

/**
 * The in-app base path for a catalogue's own pages — the relative counterpart of
 * `catalogueUrl`.
 *
 * Client navigation cannot use `catalogueUrl`: that returns an absolute URL meant for sharing.
 * In subdomain mode the catalogue *is* the site root, so the base is empty and every guest path
 * is already correct. In path mode the catalogue hangs off `/<studio>/<wedding>`, and a component
 * that pushes `/watch/...` sends the guest to the marketing page instead of the film. Both modes
 * answer here rather than in a component, which is what makes addressing configuration.
 */
export function cataloguePath(address: CatalogueAddress, mode: TenancyMode = 'subdomain'): string {
  if (mode !== 'path') return ''
  return address.tenant ? `/${address.tenant}/${address.slug}` : `/c/${address.slug}`
}

/** Where the operator console lives, which also differs by mode. */
export function adminUrl(rootDomain: string, mode: TenancyMode = 'subdomain'): string {
  const protocol = isLocalDomain(rootDomain) ? 'http' : 'https'
  return mode === 'path' ? `${protocol}://${rootDomain}/admin` : `${protocol}://admin.${rootDomain}`
}

/**
 * A page belonging to no tenant and to no console — `/claim/<token>`, `/api/og`, `/login`.
 *
 * It exists because deriving one by stripping `/admin` off `adminUrl` is only correct in path
 * mode. In subdomain mode that produces `https://admin.<root>/claim/…`, and middleware rewrites
 * *everything* on the admin host into `/admin/*` — so the one link in the product a stranger has
 * to be able to open resolved to a 404, and only in the mode the E2E suite runs.
 *
 * The root host is the same in both modes, which is the whole point of putting it here.
 */
export function rootUrl(rootDomain: string, path: string): string {
  const protocol = isLocalDomain(rootDomain) ? 'http' : 'https'
  return `${protocol}://${rootDomain}${path.startsWith('/') ? path : `/${path}`}`
}
