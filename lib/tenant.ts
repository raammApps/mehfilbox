import { RESERVED_SUBDOMAINS } from './schema'

/**
 * Host → what to serve. A pure function with no I/O so it can be exhaustively unit tested
 * (doc 05 §5, doc 10 §1 test 1) and run inside middleware on the edge.
 *
 * **Two tenancy modes**, because the domain is not the only thing that changes between
 * environments:
 *
 * - `subdomain` — `<slug>.example.com`, `admin.example.com`. What doc 02 §1 specifies and what
 *   production should use: a couple's link reads as their own site, which is the product.
 * - `path` — `example.com/c/<slug>`, `example.com/admin`. Needs one ordinary CNAME instead of
 *   a wildcard, and a wildcard on Vercel requires delegating the whole domain's nameservers.
 *   For a domain that already carries email, that is a real cost during a dev phase.
 *
 * Both are configuration (`TENANCY_MODE`), so moving between them is an environment variable,
 * never a code change. `/c/<slug>` is the internal route in both modes — subdomain mode simply
 * rewrites onto it — so nothing downstream knows which is in use.
 */

export type TenancyMode = 'subdomain' | 'path'

export type TenantResolution =
  | { kind: 'marketing' }
  | { kind: 'admin' }
  | { kind: 'catalogue'; slug: string; source: 'subdomain' }
  | { kind: 'custom-domain'; host: string }
  | { kind: 'unknown'; host: string }

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
 * The public URL of a catalogue — share links, OG tags, the address shown to an operator.
 *
 * The single place that knows how a catalogue is addressed. Everything else asks this, so a
 * change of domain or of tenancy mode reaches the whole product without touching a component.
 */
export function catalogueUrl(
  slug: string,
  rootDomain: string,
  path = '/',
  mode: TenancyMode = 'subdomain',
): string {
  const protocol = isLocalDomain(rootDomain) ? 'http' : 'https'
  const suffix = path === '/' ? '' : path

  if (mode === 'path') return `${protocol}://${rootDomain}/c/${slug}${suffix}`
  return `${protocol}://${slug}.${rootDomain}${path}`
}

/**
 * The in-app base path for a catalogue's own pages — the relative counterpart of
 * `catalogueUrl`.
 *
 * Client navigation cannot use `catalogueUrl`: that returns an absolute URL meant for sharing.
 * In subdomain mode the catalogue *is* the site root, so the base is empty and every guest path
 * is already correct. In path mode the catalogue hangs off `/c/<slug>`, and a component that
 * pushes `/watch/...` sends the guest to the marketing page instead of the film. Both modes
 * answer here rather than in a component, which is what makes addressing configuration.
 */
export function cataloguePath(slug: string, mode: TenancyMode = 'subdomain'): string {
  return mode === 'path' ? `/c/${slug}` : ''
}

/** Where the operator console lives, which also differs by mode. */
export function adminUrl(rootDomain: string, mode: TenancyMode = 'subdomain'): string {
  const protocol = isLocalDomain(rootDomain) ? 'http' : 'https'
  return mode === 'path' ? `${protocol}://${rootDomain}/admin` : `${protocol}://admin.${rootDomain}`
}

/**
 * A page belonging to no tenant and to no console — today, `/claim/<token>`.
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
