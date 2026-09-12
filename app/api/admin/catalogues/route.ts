import { randomUUID } from 'node:crypto'
import { z } from 'zod'
import { requireOperator } from '@/lib/admin/session'
import { generatePasscode } from '@/lib/admin/presets'
import { seedModules } from '@/lib/admin/templates'
import { hashSecret } from '@/lib/crypto'
import { isValidTimeZone } from '@/lib/time'
import { getRepository } from '@/lib/db'
import { ApiError } from '@/lib/http/errors'
import { noStore, readJson, route } from '@/lib/http/handler'
import {
  appNameSchema,
  brandingSchema,
  localeSchema,
  localisedRequiredSchema,
  localisedStringSchema,
  occasionSchema,
  privacySchema,
  slugSchema,
} from '@/lib/schema'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const createSchema = z.object({
  coupleName: localisedRequiredSchema,
  // Rejects anything matching /flix$/i — doc 12 §1 rule 3, doc 10 §1 test 13.
  appName: appNameSchema,
  weddingDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD'),
  slug: slugSchema,
  city: localisedStringSchema.optional(),
  synopsis: localisedStringSchema.optional(),
  occasion: occasionSchema.default('wedding'),
  branding: brandingSchema.default({}),
  /**
   * Per wedding, not per studio (N-29c). A Jaipur studio serves a Hindi family and an English one
   * in the same month; the org's choice is the default, not the rule. Optional so the studio's
   * own language applies when the wizard does not ask.
   */
  locale: localeSchema.optional(),
  template: z.string().optional(),
  /**
   * A house style to start from (D-36). Its layout, branding, language and guest-code choice are
   * copied in now and recorded on the row; the fields above still win where they are given.
   */
  presetId: z.string().uuid().optional(),
  /**
   * The wizard's third step (doc 16 §10): who can watch and when. A typed guest code is hashed
   * here; asking for a code without typing one generates it and returns it exactly once.
   */
  privacy: privacySchema.optional(),
  passcode: z.string().min(4).max(64).optional(),
  timezone: z.string().refine(isValidTimeZone, 'Unknown time zone').default('Asia/Kolkata'),
  premiereAt: z.string().datetime().nullable().optional(),
})

/**
 * Twelve months, which is what the plans sell (`docs/PRICING.md`).
 *
 * It was three, from doc 01 §7's original model where the couple picked up a subscription in
 * month four. That model is superseded: a studio can sell "a year", and explaining a three-month
 * window plus a renewal conversation in the same breath is how a sale stalls. Every catalogue
 * created under the old constant expired nine months early.
 */
const INCLUDED_MONTHS = 12

export async function GET() {
  return route('admin/catalogues:list', async () => {
    const { orgId } = await requireOperator()
    return noStore({ catalogues: await getRepository().listCatalogues({ orgId }) })
  })
}

export async function POST(request: Request) {
  return route('admin/catalogues:create', async () => {
    const { orgId } = await requireOperator()
    const body = await readJson(request, createSchema)
    const repository = getRepository()

    const now = new Date()
    const includedUntil = new Date(now)
    includedUntil.setMonth(includedUntil.getMonth() + INCLUDED_MONTHS)

    const org = await repository.getOrg(orgId)
    // Scoped to the org, so another studio's style is a 404 rather than a copy.
    const preset = body.presetId ? await repository.getPreset(body.presetId, orgId) : null
    if (body.presetId && !preset) throw new ApiError('NOT_FOUND', 'House style not found')

    const template = body.template ?? preset?.templateId ?? 'keepsake'
    // A studio with its own domain serves every wedding it makes from it (doc 16 §1).
    const studioDomain = (await repository.listDomains(orgId)).find(
      (domain) => domain.status === 'active' && domain.catalogueId === null,
    )
    // A code the operator typed, or one generated because the step (or the style) asked for one —
    // returned once, so the wizard can show it with the couple present.
    const wantsCode = body.privacy === 'passcode' || (body.privacy === undefined && preset?.passcodeOn === true)
    const passcode = wantsCode ? (body.passcode ?? generatePasscode()) : null
    const generated = wantsCode && !body.passcode

    const catalogue = await repository.createCatalogue({
      id: randomUUID(),
      orgId,
      // Who built it, recorded now and never changed. After a handover `orgId` becomes the
      // couple's and this still says the partner — which is the only thing that survives to
      // credit them, since they lose every other trace of ownership.
      originOrgId: orgId,
      slug: body.slug,
      // The studio segment of the address, frozen now (D-32). `org` is null only for a session
      // whose org vanished mid-request; the fallback keeps the row valid and the link legacy-shaped.
      tenantSlug: org?.slug ?? '',
      customDomain: null,
      coupleName: body.coupleName,
      appName: body.appName,
      weddingDate: body.weddingDate,
      city: body.city,
      synopsis: body.synopsis,
      occasion: body.occasion,
      // Org defaults are inherited, then the style's, then overridden — most operators skip the
      // branding step, and a style is the studio's own decision made once.
      branding: { ...(org?.branding ?? {}), ...(preset?.branding ?? {}), ...body.branding },
      /**
       * Copied from the studio rather than read through it (N-29), so a studio changing its own
       * default later does not silently change the language of weddings already delivered.
       */
      // The operator's choice for this wedding, falling back to the studio's own (N-29c).
      locale: body.locale ?? preset?.locale ?? org?.locale ?? 'en',
      featuredTitleId: null,
      modules: [],
      draftModules: null,
      draftBranding: null,
      template,
      presetId: preset?.id ?? null,
      status: 'draft',
      privacy: passcode ? 'passcode' : 'unlisted',
      passcodeHash: passcode ? hashSecret(passcode) : null,
      coupleOrgId: null,
      supportAccessUntil: null,
      passcodeVersion: 1,
      timezone: body.timezone,
      premiereAt: body.premiereAt ?? null,
      servedAt: studioDomain ? `https://${studioDomain.host}/${body.slug}` : null,
      includedUntil: includedUntil.toISOString(),
      subStatus: 'included',
      subPlan: null,
      subUntil: null,
      createdAt: now.toISOString(),
      publishedAt: null,
    })

    // Seed the draft from the template. There is no content yet, so the sections come out
    // empty — the customizer fills them as titles finish uploading.
    const modules = seedModules(template, catalogue, [], [])
    const withModules = await repository.updateCatalogue(catalogue.id, orgId, {
      draftModules: modules,
    })

    return noStore({ catalogue: withModules, ...(generated && passcode ? { passcode } : {}) }, 201)
  })
}
