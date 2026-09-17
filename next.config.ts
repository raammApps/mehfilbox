import type { NextConfig } from 'next'

/**
 * Security headers applied to every response.
 *
 * `X-Robots-Tag` is deliberately global: a catalogue is somebody's wedding and must never be
 * indexable (doc 05 §4, doc 01 US-5). The admin has no reason to be indexed either, so the
 * blanket header is both the correct and the safest default — there is no public surface in
 * this product that wants a crawler.
 */
const securityHeaders = [
  { key: 'X-Robots-Tag', value: 'noindex, nofollow, noarchive, noimageindex' },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=(), interest-cohort=()' },
  { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains; preload' },
  { key: 'Content-Security-Policy', value: contentSecurityPolicy() },
]

/**
 * The last of the six headers doc 05 §4 asks for (N-86). Built from what the app actually
 * connects to, checked before writing a single directive rather than copied from a template:
 *
 *   - Fonts are self-hosted (`lib/fonts.ts`, `next/font/local`) — no Google Fonts, so `font-src`
 *     needs nothing beyond `'self'`.
 *   - Bunny is the only external host the browser ever talks to: HLS manifests and segments
 *     (`connect-src`, `media-src`), and every poster and photograph (`img-src`), both the video
 *     zone and the photo zone, both matched by `*.b-cdn.net`.
 *   - `data:` in `img-src` is the inline LQIP placeholder — a base64 string on the photo row
 *     itself, never fetched.
 *   - Cloudflare Turnstile is not live (`CAPTCHA_DRIVER=none` today) but its three directives are
 *     here now rather than left for whoever turns it on: `components/auth/Challenge.tsx` loads
 *     `api.js` as a plain `<script src>` and renders the widget as an iframe, both from
 *     `challenges.cloudflare.com` — Cloudflare's own embedding guidance lists all three
 *     (`script-src`, `frame-src`, `connect-src`) for exactly this widget.
 *   - `'unsafe-inline'` on `script-src` is the Next.js App Router's own RSC hydration payload,
 *     which ships as an inline `<script>` with no nonce infrastructure in this app; on
 *     `style-src` it is the tenant-theming pattern used throughout `components/` — reading a
 *     CSS custom property into a JSX `style={{...}}` attribute rather than a class, checked
 *     against 19 files that do this before deciding it was load-bearing rather than incidental.
 *     Both are a real, named trade-off, not an oversight: this CSP blocks a third-party
 *     `<script src="https://attacker">`, the single most common XSS payload shape, and does not
 *     block a same-origin inline-script injection — the existing `no-dangerouslySetInnerHTML`
 *     eslint rule on tenant and guest strings is what actually guards that path.
 *   - No websocket, no other iframe, no external form target anywhere in the app — checked by
 *     grep, not assumed — so nothing else needs a directive.
 */
function contentSecurityPolicy(): string {
  const directives: Record<string, string[]> = {
    'default-src': ["'self'"],
    'script-src': [
      "'self'",
      "'unsafe-inline'",
      'https://challenges.cloudflare.com',
      // `next dev`'s Fast Refresh patches modules via `eval`; production never needs this and
      // does not get it, so a build that forgets to set NODE_ENV stays on the strict policy.
      ...(process.env.NODE_ENV === 'production' ? [] : ["'unsafe-eval'"]),
    ],
    'style-src': ["'self'", "'unsafe-inline'"],
    'img-src': ["'self'", 'data:', 'https://*.b-cdn.net'],
    'font-src': ["'self'"],
    // `blob:` is load-bearing, not decoration: hls.js uses the Media Source Extensions API,
    // which assembles fetched segments (governed by connect-src, already listed) into a
    // MediaSource and assigns the video element's `src` to a `blob:` URL it mints itself — found
    // by actually playing a film against this policy, not by reasoning about it. Without this,
    // every film in the product refuses to play with `MEDIA_ELEMENT_ERROR: Media load rejected
    // by URL safety check`, and every route/page/component test still passes, because none of
    // them run a real browser against a real CSP.
    'media-src': ["'self'", 'blob:', 'https://*.b-cdn.net'],
    'connect-src': ["'self'", 'https://*.b-cdn.net', 'https://challenges.cloudflare.com'],
    'frame-src': ['https://challenges.cloudflare.com'],
    'frame-ancestors': ["'none'"],
    'object-src': ["'none'"],
    'base-uri': ["'self'"],
    'form-action': ["'self'"],
  }
  return Object.entries(directives)
    .map(([directive, sources]) => `${directive} ${sources.join(' ')}`)
    .join('; ')
}

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  // Emits a self-contained server bundle so the Docker image does not ship node_modules.
  output: process.env.NEXT_OUTPUT_STANDALONE === '1' ? 'standalone' : undefined,
  // `app/help/*/page.tsx` reads `docs/help/*.md` with `fs.readFileSync` (N-88) — a plain file
  // read, invisible to the build's dependency tracer, so without this the markdown is silently
  // absent from the deployed bundle and the page 500s in production while working fine locally.
  outputFileTracingIncludes: {
    '/help/*': ['./docs/help/*.md'],
  },
  experimental: {
    optimizePackageImports: ['lucide-react', 'framer-motion'],
  },
  images: {
    formats: ['image/avif', 'image/webp'],
    remotePatterns: [
      { protocol: 'https', hostname: '**.b-cdn.net' },
      { protocol: 'https', hostname: '**.supabase.co' },
    ],
  },
  async headers() {
    return [{ source: '/:path*', headers: securityHeaders }]
  },
}

export default nextConfig
