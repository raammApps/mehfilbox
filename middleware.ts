import { NextResponse, type NextRequest } from 'next/server'
import { resolveTenant } from '@/lib/tenant'

/**
 * Host → route rewrite (doc 05 §5).
 *
 * `resolveTenant` is a pure function tested exhaustively in `tests/unit/tenant.test.ts`; this
 * file only translates its verdict into a rewrite, so the routing logic itself is testable
 * without spinning up a server.
 */
export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|fonts/|media/|api/health).*)'],
}

export function middleware(request: NextRequest) {
  const url = request.nextUrl.clone()
  const rootDomain = process.env.ROOT_DOMAIN ?? 'lvh.me:3000'

  /**
   * Path mode needs no host inspection at all: `/c/<slug>` and `/admin` are already the real
   * routes, and subdomain mode only exists to rewrite onto them. So the whole of this file is
   * a no-op here — which is the point, and why switching modes cannot break routing.
   */
  if ((process.env.TENANCY_MODE ?? 'subdomain') === 'path') return NextResponse.next()

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
        response.headers.set('x-mehfilbox-catalogue', resolution.slug)
        return response
      }
      url.pathname = `/c/${resolution.slug}${url.pathname === '/' ? '' : url.pathname}`
      const response = NextResponse.rewrite(url)
      response.headers.set('x-mehfilbox-catalogue', resolution.slug)
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
