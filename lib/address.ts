import 'server-only'
import { headers } from 'next/headers'
import { redirect } from 'next/navigation'
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
 * Only path mode does this. In subdomain mode the host already is the address.
 */

export const TENANT_HEADER = 'x-mehfilbox-tenant'

export function addressOf(catalogue: Pick<Catalogue, 'slug' | 'tenantSlug'>): CatalogueAddress {
  return { slug: catalogue.slug, tenant: catalogue.tenantSlug || null }
}

/** The relative base every guest route hangs off — `''` in subdomain mode. */
export function basePathOf(catalogue: Pick<Catalogue, 'slug' | 'tenantSlug'>): string {
  return cataloguePath(addressOf(catalogue), env.TENANCY_MODE)
}

/** The absolute public address, for sharing, OG tags and messages. */
export function publicUrlOf(catalogue: Pick<Catalogue, 'slug' | 'tenantSlug'>, path = '/'): string {
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

/**
 * Redirect to the canonical address unless this request arrived on it.
 *
 * `suffix` is the guest-internal path being rendered (`/watch/<title>`, `/locked`…), and `search`
 * the query string to carry across, so a deep link with `?t=428` survives the hop.
 */
export async function requireCanonicalAddress(
  catalogue: Pick<Catalogue, 'slug' | 'tenantSlug'>,
  suffix = '',
  search = '',
): Promise<void> {
  if (env.TENANCY_MODE !== 'path' || !catalogue.tenantSlug) return
  const seen = (await headers()).get(TENANT_HEADER)
  if (seen === catalogue.tenantSlug) return
  redirect(`${basePathOf(catalogue)}${suffix}${search}`)
}
