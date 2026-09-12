import type { Branding } from '@/lib/schema'
import type { ThemeDefinition } from '@/themes/contract'
import { themeCss } from '@/themes/css'
import { themeFrom } from '@/themes/registry'

/**
 * Per-tenant theming (CLAUDE.md constraint 4 — every colour comes from tenant config), and
 * since D-35 the whole guest surface rather than only the accent.
 *
 * `theme` is the resolved definition when the caller has one — a guest page that looked up a
 * platform-authored theme, or the preview pane holding the list — and falls back to the built-in
 * registry for the id the branding names. Unknown and withdrawn ids render as Marquee: a wedding
 * on a theme that was later disabled keeps its page.
 *
 * A style element built only from validated hex, a stack chosen from a fixed map, and numbers —
 * never interpolated user text.
 */
export function ThemeStyle({
  branding,
  theme,
  scope = ':root',
}: {
  branding: Branding
  theme?: ThemeDefinition
  /**
   * Where the variables land. `:root` on a guest page; the preview passes its own container so
   * a tenant's theme cannot repaint the admin chrome around it.
   */
  scope?: string
}) {
  const resolved = theme ?? themeFrom(branding)
  return <style data-tenant-theme={resolved.id}>{themeCss(resolved.tokens, branding, scope)}</style>
}
