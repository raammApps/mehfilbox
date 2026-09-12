import { recordPlatformAction, requirePlatformAdmin } from '@/lib/admin/platform'
import { assertThemeReadable } from '@/lib/admin/themes'
import { getRepository } from '@/lib/db'
import { ApiError } from '@/lib/http/errors'
import { noStore, readJson, route } from '@/lib/http/handler'
import { log } from '@/lib/log'
import { customThemeSchema } from '@/themes/contract'
import { getBuiltInTheme } from '@/themes/registry'
import { revalidateThemes } from '@/themes/resolve'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * `PATCH /api/admin/platform/themes/:id` — change or withdraw a platform-authored theme (D-35).
 *
 * Withdrawing (`enabled: false`) hides the theme from every picker and **repaints nothing**: a
 * wedding already on it keeps rendering with it, because the couple was given that look and a
 * platform decision must not take it away. Changing its tokens does repaint those weddings — that
 * is what editing a shared theme means, and the console says so before the button.
 *
 * Built-in themes are code, not rows; they answer NOT_FOUND here, as anything not in the table does.
 */
const patchSchema = customThemeSchema
  .pick({ name: true, description: true, tokens: true, enabled: true })
  .partial()

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  return route('platform/themes:update', async () => {
    const admin = await requirePlatformAdmin()
    const { id } = await params
    const body = await readJson(request, patchSchema)

    const repository = getRepository()
    const existing = await repository.getCustomTheme(id)
    if (!existing) {
      throw new ApiError(
        'NOT_FOUND',
        getBuiltInTheme(id) ? 'Built-in themes are changed in code, not here' : 'Theme not found',
      )
    }

    const next = customThemeSchema.parse({ ...existing, ...body, updatedAt: new Date().toISOString() })
    assertThemeReadable(next.tokens)
    const theme = await repository.saveCustomTheme(next)

    const flipped = body.enabled !== undefined && body.enabled !== existing.enabled
    await recordPlatformAction({
      admin,
      action: flipped ? (body.enabled ? 'theme.restore' : 'theme.withdraw') : 'theme.update',
      detail: { id, changed: Object.keys(body) },
    })
    revalidateThemes()
    log.info('platform: theme changed', { id, changed: Object.keys(body), actor: admin.email })

    return noStore({ theme })
  })
}
