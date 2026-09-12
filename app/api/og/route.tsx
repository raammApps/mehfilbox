import { ImageResponse } from 'next/og'
import { OG_MAX_BYTES, OG_SIZE } from '@/lib/budgets'
import { resolveAccess } from '@/lib/catalogue-access'
import { formatWeddingDate } from '@/lib/format'
import { parseLocale, resolveLocalised } from '@/lib/i18n'
import { paletteFor } from '@/lib/poster'
import { resolveTheme } from '@/themes/resolve'

export const runtime = 'nodejs'

export { OG_MAX_BYTES, OG_SIZE }

/**
 * `GET /api/og` — the WhatsApp link preview (doc 07, CLAUDE.md constraint 3).
 *
 * ~90% of guests arrive from a WhatsApp link, and a grey box there costs more opens than any
 * amount of on-page polish saves. Rendered from the catalogue's own gradient so the preview
 * and the site look like the same product.
 */
export async function GET(request: Request) {
  const url = new URL(request.url)
  const slug = url.searchParams.get('catalogue') ?? request.headers.get('x-mehfilbox-catalogue')

  const verdict = slug ? await resolveAccess(slug) : { kind: 'missing' as const }
  if (verdict.kind === 'missing') {
    return new Response('Not found', { status: 404 })
  }

  const { catalogue } = verdict
  const locale = parseLocale(url.searchParams.get('locale'))
  const coupleName = resolveLocalised(catalogue.coupleName, locale)
  const appName = resolveLocalised(catalogue.appName, locale)
  const theme = await resolveTheme(catalogue.branding)
  const palette = paletteFor(catalogue.slug, theme.tokens.posterPalette)
  const accent = catalogue.branding.accent ?? theme.tokens.accent

  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'flex-end',
          background: `linear-gradient(145deg, ${palette.from}, ${palette.to})`,
          padding: 72,
          position: 'relative',
        }}
      >
        <div
          style={{
            position: 'absolute',
            inset: 0,
            background: 'linear-gradient(to top, #0c0c0d 12%, rgba(12,12,13,0.55) 55%, rgba(12,12,13,0.2) 100%)',
            display: 'flex',
          }}
        />

        <div style={{ display: 'flex', flexDirection: 'column', position: 'relative' }}>
          <div
            style={{
              fontSize: 26,
              letterSpacing: 10,
              color: accent,
              textTransform: 'uppercase',
              display: 'flex',
            }}
          >
            {appName}
          </div>

          <div
            style={{
              fontSize: 88,
              fontWeight: 800,
              color: '#f5f5f6',
              letterSpacing: -2,
              lineHeight: 1.02,
              marginTop: 18,
              display: 'flex',
            }}
          >
            {coupleName}
          </div>

          <div style={{ fontSize: 30, color: '#c4c4c8', marginTop: 18, display: 'flex' }}>
            {formatWeddingDate(catalogue.weddingDate, locale)}
            {catalogue.branding.presentedBy ? `  ·  ${catalogue.branding.presentedBy}` : ''}
          </div>
        </div>
      </div>
    ),
    {
      ...OG_SIZE,
      headers: {
        // Keyed on the publish timestamp by the caller, so immutable is safe and WhatsApp's
        // multi-day preview cache works for us rather than against us.
        'cache-control': 'public, max-age=31536000, immutable',
      },
    },
  )
}
