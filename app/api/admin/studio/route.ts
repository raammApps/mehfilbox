import { z } from 'zod'
import { requireOperator } from '@/lib/admin/session'
import { getRepository } from '@/lib/db'
import { noStore, route } from '@/lib/http/handler'
import { log } from '@/lib/log'
import { brandingSchema } from '@/lib/schema'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const bodySchema = z.object({ branding: brandingSchema })

/**
 * `PATCH /api/admin/studio` — the studio's own branding (N-26).
 *
 * Until now `orgs.branding` was written once at registration, holding nothing but the business
 * name, and **nothing could ever edit it**. So every wedding was created from that near-empty
 * default and the studio re-entered its colour, logo and typeface by hand, on every wedding,
 * forever — which makes *"all my weddings look like my studio"* not a feature they lacked but one
 * the product made impossible.
 *
 * The org id comes from the session and never from the body. This is the one write an operator
 * makes to their own org, and it is the same rule every other operator route follows: a studio can
 * only ever repaint itself.
 */
export async function PATCH(request: Request) {
  return route('admin/studio:branding', async () => {
    const session = await requireOperator()
    const body = bodySchema.parse(await request.json())

    const org = await getRepository().setOrgBranding(session.orgId, body.branding)

    log.info('studio branding updated', { orgId: session.orgId })
    // Existing weddings are untouched on purpose: this is the default new ones inherit, not a
    // retroactive repaint of pages couples already have.
    return noStore({ branding: org.branding })
  })
}
