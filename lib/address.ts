import 'server-only'
import { headers } from 'next/headers'
import { permanentRedirect, redirect } from 'next/navigation'
import { env } from './env'
import { cataloguePath, catalogueUrl, rootUrl, type CatalogueAddress } from './tenant'
import type { Catalogue } from './schema'

/**
 * A catalogue's canonical address, and the redirect that keeps every request on it (D-32).
 *
 * Middleware rewrites `/<studio>/<wedding>` onto the internal `/c/<wedding>` route and marks the
 * request with the studio segment it saw. A guest page that finds no mark was reached through the
 * legacy `/c/<wedding>` form — a link sent before the tenant path existed — and one that finds the
 * *wrong* studio was reached through somebody's typo. Both are answered with a redirect to the
 * one address the product prints, so there is exactly one URL per wedding in the world, and it is
 * the one in the OG tags.
 *
 * Since doc 16 §1 that one address may be somebody's own domain. `catalogues.served_at` carries it
 * once the domain is active; a request that arrives on that host stays on it, and a request on the
 * mehfilbox path is sent to it permanently, so links already in two hundred phones survive.
 *
 * Only path mode does the tenant check. In subdomain mode the host already is the address.
 */

export const TENANT_HEADER = 'x-mehfilbox-tenant'
/** Set by middleware when a request arrived on somebody's own domain. */
export const HOST_HEADER = 'x-mehfilbox-host'

type Addressed = Pick<Catalogue, 'slug' | 'tenantSlug' | 'servedAt'>

export function addressOf(catalogue: Pick<Catalogue, 'slug' | 'tenantSlug'>): CatalogueAddress {
  return { slug: catalogue.slug, tenant: catalogue.tenantSlug || null }
}

/** The relative base every guest route hangs off on the mehfilbox host — `''` in subdomain mode. */
export function basePathOf(catalogue: Pick<Catalogue, 'slug' | 'tenantSlug'>): string {
  return cataloguePath(addressOf(catalogue), env.TENANCY_MODE)
}

/** The absolute public address, for sharing, OG tags and messages: the domain when one serves. */
export function publicUrlOf(catalogue: Addressed, path = '/'): string {
  if (catalogue.servedAt) return path === '/' ? catalogue.servedAt : `${catalogue.servedAt}${path}`
  return catalogueUrl(addressOf(catalogue), env.ROOT_DOMAIN, path, env.TENANCY_MODE)
}

/**
 * The link-preview image. Off the **root** host with the catalogue named in the query, in both
 * modes: in path mode `/<studio>/<wedding>/api/og` is not a route, and the old
 * `${url}api/og` composition produced `/c/<wedding>api/og` — a 404, so every WhatsApp preview in
 * production was a grey box. Found while moving the address.
 */
export function ogImageUrlOf(catalogue: Pick<Catalogue, 'slug' | 'publishedAt' | 'createdAt'>): string {
  const version = encodeURIComponent(catalogue.publishedAt ?? catalogue.createdAt)
  return rootUrl(env.ROOT_DOMAIN, `/api/og?catalogue=${encodeURIComponent(catalogue.slug)}&v=${version}`)
}

/** What a guest page needs to know about where it is being rendered. */
export type GuestAddress = {
  /** The relative base for in-app links on *this* host. */
  basePath: string
  /** The absolute address to print and share. */
  publicUrl: string
  /** True when the request arrived on the catalogue's own active domain. */
  onDomain: boolean
}

export async function addressFor(catalogue: Addressed): Promise<GuestAddress> {
  const publicUrl = publicUrlOf(catalogue)
  if (catalogue.servedAt) {
    const served = new URL(catalogue.servedAt)
    const host = (await headers()).get(HOST_HEADER)
    if (host && host === served.host) {
      return { basePath: served.pathname.replace(/\/$/, ''), publicUrl, onDomain: true }
    }
  }
  return { basePath: basePathOf(catalogue), publicUrl, onDomain: false }
}

/**
 * Redirect to the canonical address unless this request arrived on it, and say where it is.
 *
 * `suffix` is the guest-internal path being rendered (`/watch/<title>`, `/locked`…), and `search`
 * the query string to carry across, so a deep link with `?t=428` survives the hop.
 */
export async function requireCanonicalAddress(
  catalogue: Addressed,
  suffix = '',
  search = '',
): Promise<GuestAddress> {
  const address = await addressFor(catalogue)
  if (address.onDomain) return address
  // An active domain is the address: the mehfilbox path moves there for good (doc 16 §1).
  if (catalogue.servedAt) permanentRedirect(`${catalogue.servedAt}${suffix}${search}`)
  if (env.TENANCY_MODE !== 'path' || !catalogue.tenantSlug) return address
  const seen = (await headers()).get(TENANT_HEADER)
  if (seen === catalogue.tenantSlug) return address
  redirect(`${basePathOf(catalogue)}${suffix}${search}`)
}
