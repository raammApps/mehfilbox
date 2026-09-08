import { z } from 'zod'
import { requireOwnedCatalogue } from '@/lib/admin/session'
import { env } from '@/lib/env'
import { formatWeddingDate } from '@/lib/format'
import { ApiError } from '@/lib/http/errors'
import { noStore, route } from '@/lib/http/handler'
import { resolveLocalised } from '@/lib/i18n'
import { log } from '@/lib/log'
import { enqueue } from '@/lib/notify/send'
import { catalogueUrl } from '@/lib/tenant'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const bodySchema = z.object({ email: z.string().email('Enter an email address') })

/**
 * `POST /api/admin/catalogues/:id/deliver` — tell the couple it is ready (N-36).
 *
 * **This is the moment the product gets forwarded to two hundred people**, and until now the
 * operator wrote that message themselves — so the first thing a couple's family ever saw of this
 * product was whatever a busy studio typed at eleven at night.
 *
 * Deliberately not de-duplicated. A studio resending because the couple changed address, or
 * because the first one went to spam, is a normal thing to want; the `notifications` table records
 * every attempt, so "did we send it, and when" stays answerable either way.
 */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  return route('admin/catalogue:deliver', async () => {
    const { id } = await params
    const { catalogue } = await requireOwnedCatalogue(id)

    if (catalogue.status !== 'published') {
      // A delivery message pointing at "not yet available" is worse than no message: the couple
      // forwards it, and two hundred people open a page that says nothing is there.
      throw new ApiError('VALIDATION_FAILED', 'Publish the wedding before sending it to the couple')
    }

    const body = bodySchema.parse(await request.json())

    const notification = await enqueue({
      template: 'delivery',
      channel: 'email',
      address: body.email,
      // The catalogue's language, not the operator's: the message is for the couple (N-29c).
      locale: catalogue.locale,
      orgId: catalogue.orgId,
      catalogueId: catalogue.id,
      params: {
        coupleName: resolveLocalised(catalogue.coupleName, catalogue.locale),
        studioName: catalogue.branding.presentedBy ?? 'your studio',
        url: catalogueUrl(catalogue.slug, env.ROOT_DOMAIN, '/', env.TENANCY_MODE),
        date: formatWeddingDate(catalogue.includedUntil, catalogue.locale),
      },
    })

    log.info('delivery message queued', { catalogueId: catalogue.id, to: body.email })
    return noStore({ queued: notification !== null })
  })
}
