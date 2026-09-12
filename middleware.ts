import { NextResponse, type NextRequest } from 'next/server'
import { isCustomHost, normaliseHost, parseTenantPath, resolveTenant } from '@/lib/tenant'

/**
 * Host and path → route rewrite (doc 05 §5, D-32).
 *
 * `resolveTenant` and `parseTenantPath` are pure functions tested exhaustively in
 * `tests/unit/tenant.test.ts`; this file only translates their verdicts into rewrites, so the
 * routing logic itself is testable without spinning up a server.
 */
export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|fonts/|media/|api/health).*)'],
}

/** Set on every rewrite onto a catalogue route, so the page can tell a canonical arrival from a legacy one. */
const TENANT_HEADER = 'x-mehfilbox-tenant'
const CATALOGUE_HEADER = 'x-mehfilbox-catalogue'
/** Set when the request arrived on somebody's own domain (doc 16 §1); `lib/address.ts` reads it. */
const HOST_HEADER = 'x-mehfilbox-host'

export function middleware(request: NextRequest) {
  const url = request.nextUrl.clone()
  const rootDomain = process.env.ROOT_DOMAIN ?? 'lvh.me:3000'

  /**
   * Path mode — what production runs (D-32). `/<studio>/<wedding>[/…]` is rewritten onto the
   * internal `/c/<wedding>[/…]` route and marked with the studio segment; everything else — the
   * consoles, the API, a legacy `/c/` link — passes straight through. A legacy link is answered by
   * the page with a redirect to its canonical address, because only the page knows which studio a
   * wedding belongs to and middleware must not query the database.
   */
  // The fallback matches `lib/env.ts`'s default, which middleware cannot import (it is server-only
  // and validates the whole environment at load).
  if ((process.env.TENANCY_MODE ?? 'path') === 'path') {
    /**
     * Somebody's own domain (doc 16 §1). Nothing hangs off a label of the root in path mode, so
     * any other host is a candidate; the database decides whether it serves, in `/d/<host>`,
     * which renders the same guest pages. The API passes through: the page's own calls arrive on
     * this host too.
     */
    const host = request.headers.get('host')
    if (isCustomHost(host, rootDomain) && !url.pathname.startsWith('/api')) {
      const bare = normaliseHost(host)
      url.pathname = `/d/${bare}${url.pathname === '/' ? '' : url.pathname}`
      const response = NextResponse.rewrite(url)
      response.headers.set(HOST_HEADER, bare)
      return response
    }

    const tenantPath = parseTenantPath(url.pathname)
    if (!tenantPath) return NextResponse.next()

    url.pathname = `/c/${tenantPath.slug}${tenantPath.rest}`
    const response = NextResponse.rewrite(url)
    response.headers.set(TENANT_HEADER, tenantPath.tenant)
    response.headers.set(CATALOGUE_HEADER, tenantPath.slug)
    return response
  }

  const resolution = resolveTenant(request.headers.get('host'), rootDomain)

  /**
   * `?__catalogue=` lets a plain `localhost:3000` reach a catalogue without wildcard DNS or an
   * /etc/hosts edit — which is what makes local development and CI possible at all.
   *
   * It is sticky: the first request stores the slug in a cookie, so client-side navigation to
   * `/watch/<slug>` resolves the same way a real subdomain would. Without that, Play from the
   * title modal 404s in dev and the E2E suite cannot exercise the real navigation path.
   *
   * Never available in a real deployment. `ALLOW_EPHEMERAL_DATA` already means "this process
   * is a test or a demo, not production", so it gates this too rather than adding a flag.
   */
  const overrideAllowed =
    process.env.NODE_ENV !== 'production' || process.env.ALLOW_EPHEMERAL_DATA === '1'
  const overrideParam = overrideAllowed ? url.searchParams.get('__catalogue') : null
  const override = overrideParam ?? (overrideAllowed ? request.cookies.get('__catalogue')?.value : null)

  switch (resolution.kind) {
    case 'admin':
      if (!url.pathname.startsWith('/admin') && !url.pathname.startsWith('/api')) {
        url.pathname = `/admin${url.pathname === '/' ? '' : url.pathname}`
        return NextResponse.rewrite(url)
      }
      return NextResponse.next()

    case 'catalogue': {
      if (url.pathname.startsWith('/api') || url.pathname.startsWith('/admin')) {
        const response = NextResponse.next()
        response.headers.set(CATALOGUE_HEADER, resolution.slug)
        return response
      }
      url.pathname = `/c/${resolution.slug}${url.pathname === '/' ? '' : url.pathname}`
      const response = NextResponse.rewrite(url)
      response.headers.set(CATALOGUE_HEADER, resolution.slug)
      return response
    }

    case 'custom-domain': {
      if (url.pathname.startsWith('/api')) return NextResponse.next()
      // The slug is unknown until the database is consulted, which middleware must not do.
      // `/d/<host>` resolves it in a server component instead.
      url.pathname = `/d/${resolution.host}${url.pathname === '/' ? '' : url.pathname}`
      return NextResponse.rewrite(url)
    }

    case 'marketing': {
      if (override && !url.pathname.startsWith('/api') && !url.pathname.startsWith('/admin')) {
        url.searchParams.delete('__catalogue')
        url.pathname = `/c/${override}${url.pathname === '/' ? '' : url.pathname}`
        const response = NextResponse.rewrite(url)
        if (overrideParam) {
          response.cookies.set('__catalogue', overrideParam, { path: '/', sameSite: 'lax' })
        }
        return response
      }
      return NextResponse.next()
    }

    default:
      return NextResponse.next()
  }
}
