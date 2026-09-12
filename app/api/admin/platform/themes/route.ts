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
 * `POST /api/admin/platform/themes` — add a theme every studio can pick (D-35, doc 16 §4).
 *
 * A platform write in the N-27 mould: one action, recorded. The theme is validated for contrast
 * before it is stored, so the picker never offers something unreadable, and its id may not shadow
 * a built-in — a catalogue names its theme by id, and two themes answering to one name would
 * repaint weddings depending on which list was consulted.
 */
const createSchema = customThemeSchema.pick({
  id: true,
  name: true,
  description: true,
  tokens: true,
  enabled: true,
})

export async function POST(request: Request) {
  return route('platform/themes:create', async () => {
    const admin = await requirePlatformAdmin()
    const body = await readJson(request, createSchema)

    if (getBuiltInTheme(body.id)) {
      throw new ApiError('VALIDATION_FAILED', 'That id belongs to a built-in theme', {
        fields: { id: 'Taken by a built-in theme' },
      })
    }
    const repository = getRepository()
    if (await repository.getCustomTheme(body.id)) {
      throw new ApiError('VALIDATION_FAILED', 'A theme with that id already exists', {
        fields: { id: 'Already in use' },
      })
    }
    assertThemeReadable(body.tokens)

    const now = new Date().toISOString()
    const theme = await repository.saveCustomTheme(
      customThemeSchema.parse({ ...body, createdBy: admin.email, createdAt: now, updatedAt: now }),
    )

    await recordPlatformAction({
      admin,
      action: 'theme.create',
      detail: { id: theme.id, name: theme.name },
    })
    // Guest pages and pickers read themes through one cached list; a new theme drops it.
    revalidateThemes()
    log.info('platform: theme created', { id: theme.id, actor: admin.email })

    return noStore({ theme }, 201)
  })
}
