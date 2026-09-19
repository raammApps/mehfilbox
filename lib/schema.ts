import { z } from 'zod'
import { CREDIT_PLAN_IDS, type CreditPlanId } from '@/lib/plans'

/**
 * The domain vocabulary, mirroring the Postgres schema in doc 06 §1 and doc 14 §6.
 *
 * Every type in the app is inferred from these — there are no hand-written interfaces for
 * persisted data, so a schema change surfaces as a type error rather than as a runtime shape
 * mismatch on a wedding day.
 */

// ── Localised strings ─────────────────────────────────────────────────────────
export const LOCALES = ['en', 'hi'] as const
export const localeSchema = z.enum(LOCALES)
export type Locale = z.infer<typeof localeSchema>
export const DEFAULT_LOCALE: Locale = 'en'

/** English is mandatory; every other locale is an optional overlay that falls back silently. */
export const localisedStringSchema = z
  .object({ en: z.string(), hi: z.string().optional() })
  .strict()
export type LocalisedString = z.infer<typeof localisedStringSchema>

export const localisedRequiredSchema = localisedStringSchema.refine((v) => v.en.trim().length > 0, {
  message: 'English text is required',
})

// ── Categories (doc 06 §2) ────────────────────────────────────────────────────
export const CATEGORIES = [
  'highlights',
  'pre_wedding',
  'mehendi',
  'haldi',
  'sangeet',
  'ceremony',
  'reception',
  'full_films',
  'aerial',
  'guest_wishes',
  'behind_scenes',
] as const
export const categorySchema = z.enum(CATEGORIES)
export type Category = z.infer<typeof categorySchema>

// ── Enumerations ──────────────────────────────────────────────────────────────
export const OCCASIONS = [
  'wedding',
  'engagement',
  'anniversary',
  'birthday',
  'proposal',
  /** The two a couple starts for themselves most often (doc 16 §6). */
  'baby-shower',
  'naming-day',
  /** What the Light storage tier is sized for (D-60, N-80) — a fashion show, a recital. */
  'performance',
  'event',
] as const
export const occasionSchema = z.enum(OCCASIONS)
export type Occasion = z.infer<typeof occasionSchema>

export const catalogueStatusSchema = z.enum(['draft', 'published', 'archived'])
export type CatalogueStatus = z.infer<typeof catalogueStatusSchema>

export const privacySchema = z.enum(['unlisted', 'passcode'])
export type Privacy = z.infer<typeof privacySchema>

export const subStatusSchema = z.enum(['included', 'active', 'grace', 'lapsed', 'cold', 'deleted'])
export type SubStatus = z.infer<typeof subStatusSchema>

/** Sub-states in which content is still served. Everything else routes to /renew. */
export const SERVING_SUB_STATUSES: readonly SubStatus[] = ['included', 'active', 'grace']

export const titleStatusSchema = z.enum(['uploading', 'processing', 'ready', 'failed'])
export type TitleStatus = z.infer<typeof titleStatusSchema>

export const posterSourceSchema = z.enum(['auto', 'custom', 'generated'])

export const PROFILE_LABELS = ["Bride's side", "Groom's side", 'Friends', 'Family'] as const
export const profileLabelSchema = z.enum(PROFILE_LABELS)
export type ProfileLabel = z.infer<typeof profileLabelSchema>

// ── Slugs and names ───────────────────────────────────────────────────────────
export const RESERVED_SUBDOMAINS = [
  'www',
  'admin',
  'api',
  'app',
  'cdn',
  'static',
  'assets',
  'demo',
  'staging',
  'help',
  'status',
  'blog',
  'docs',
] as const

export const slugSchema = z
  .string()
  .trim()
  .toLowerCase()
  .min(3, 'Slug must be at least 3 characters')
  .max(48, 'Slug must be 48 characters or fewer')
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'Use lowercase letters, numbers and single hyphens')
  .refine((s) => !(RESERVED_SUBDOMAINS as readonly string[]).includes(s), {
    message: 'That address is reserved',
  })

/**
 * A film's own address within its catalogue (N-84) — `…/watch/<slug>`. Looser than `slugSchema`:
 * a title's slug is scoped to one wedding and is never a subdomain, so the reserved-word
 * refinement that protects `admin`/`api`/… would refuse a film legitimately named after one.
 */
export const titleSlugSchema = z
  .string()
  .trim()
  .toLowerCase()
  .min(1, 'Slug must not be empty')
  .max(64, 'Slug must be 64 characters or fewer')
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'Use lowercase letters, numbers and single hyphens')

/**
 * doc 12 §1 rule 2: no `-flix` in any name we ship, including the per-couple app name an
 * operator types. Enforced at creation rather than in review, because the operator is the one
 * who will reach for it.
 */
export const FLIX_SUFFIX = /flix\s*$/i

export const appNameSchema = localisedRequiredSchema.superRefine((value, ctx) => {
  for (const [locale, text] of Object.entries(value)) {
    if (typeof text === 'string' && FLIX_SUFFIX.test(text)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: [locale],
        message: 'Try "…Stream", "…Originals" or "The … Files" instead — the -flix suffix is out',
      })
    }
  }
})

// ── Branding ──────────────────────────────────────────────────────────────────
export const hexColourSchema = z
  .string()
  .trim()
  .regex(/^#[0-9a-fA-F]{6}$/, 'Use a 6-digit hex colour, e.g. #d11a2a')

/**
 * Typefaces an operator may choose for display text.
 *
 * Only faces actually shipped in `public/fonts` belong here. The list previously offered
 * `fraunces`, which was never added and never applied anywhere — a setting that could be saved
 * and would change nothing. Adding a face is a licensed woff2 in `public/fonts`, an entry in
 * `lib/fonts.ts`, and one line here.
 */
export const DISPLAY_FONTS = ['archivo', 'mukta', 'inter'] as const
export const brandingSchema = z
  .object({
    accent: hexColourSchema.optional(),
    logoUrl: z.string().url().or(z.literal('')).optional(),
    presentedBy: z.string().max(80).optional(),
    displayFont: z.enum(DISPLAY_FONTS).optional(),
    /**
     * Whether the guest footer carries "Made with Mehfilbox" (D-41). Absent means **on** — the
     * default is the platform's, and a studio that would rather its client saw no supplier turns
     * it off in one click. Copied into a catalogue with the rest of the branding at creation.
     */
    platformCredit: z.boolean().optional(),
    /**
     * The theme's id (D-35) — `marquee` when absent, which is every catalogue that predates
     * themes. In branding rather than its own column so it is a draft that reaches guests at
     * Publish, previews live, and travels with the studio's default, exactly as the accent does.
     */
    theme: z.string().max(40).optional(),
  })
  .strict()
export type Branding = z.infer<typeof brandingSchema>

/** The footer credit is on unless a studio switched it off. One place, so the two footers agree. */
export function showsPlatformCredit(branding: Pick<Branding, 'platformCredit'>): boolean {
  return branding.platformCredit !== false
}

// ── Module instances (doc 14 §3) ──────────────────────────────────────────────
export const moduleInstanceSchema = z.object({
  id: z.string().min(1),
  type: z.string().min(1),
  enabled: z.boolean(),
  order: z.number().int().nonnegative(),
  title: localisedStringSchema,
  config: z.record(z.unknown()),
})
export type ModuleInstance = z.infer<typeof moduleInstanceSchema>

// ── Entities ──────────────────────────────────────────────────────────────────
/**
 * A partner sells weddings; a couple owns one. They differ in what they may do, never in how
 * they are isolated — both are orgs, and `org_id` scoping is unchanged (doc 15 §1).
 */
export const orgKindSchema = z.enum(['partner', 'couple'])
export type OrgKind = z.infer<typeof orgKindSchema>

/**
 * Suspension is an org state and never a catalogue one (N-27). A catalogue lapses on the schedule
 * `PRICING.md` §2 sets; an org is suspended for non-payment or abuse. Conflating them would expire
 * weddings a studio has already delivered, which is the one thing this product promises not to do.
 */
export const orgStatusSchema = z.enum(['active', 'suspended'])
export type OrgStatus = z.infer<typeof orgStatusSchema>

export const orgSchema = z.object({
  id: z.string().uuid(),
  name: z.string().min(1),
  slug: slugSchema,
  kind: orgKindSchema.default('partner'),
  status: orgStatusSchema.default('active'),
  /** The studio's own language, chosen at registration and inherited by its catalogues (N-29). */
  locale: localeSchema.default('en'),
  branding: brandingSchema.default({}),
  createdAt: z.string(),
})

/**
 * One recorded platform-admin action (N-27).
 *
 * `actorEmail` and `orgSlug` are denormalised on purpose: an audit row has to stay readable after
 * the admin's account or the org is deleted, which is precisely when someone is reading it.
 */
export const platformAuditSchema = z.object({
  id: z.string().uuid(),
  actorId: z.string().uuid(),
  actorEmail: z.string(),
  action: z.string().min(1),
  orgId: z.string().uuid().nullable().default(null),
  orgSlug: z.string().nullable().default(null),
  detail: z.record(z.string(), z.unknown()).default({}),
  createdAt: z.string(),
})
export type PlatformAudit = z.infer<typeof platformAuditSchema>

/**
 * A house style (D-36, doc 16 §5): what a studio's new weddings start from, by name.
 *
 * Theme, layout, branding, language and whether a guest code is on — the five things a studio
 * decides the same way every time. The theme rides inside `branding.theme`, exactly as it does on
 * a catalogue, so a style and a catalogue's look are the same shape and copy across in one line.
 */
export const presetSchema = z.object({
  id: z.string().uuid(),
  orgId: z.string().uuid(),
  name: z.string().trim().min(1).max(60),
  /** One per studio; the wizard preselects it. */
  isDefault: z.boolean().default(false),
  /** A template id, or `blank` — an empty page the customizer fills section by section. */
  templateId: z.string().min(1).default('keepsake'),
  branding: brandingSchema.default({}),
  locale: localeSchema.default('en'),
  /** Whether a wedding created from this starts with a guest code, generated at creation. */
  passcodeOn: z.boolean().default(false),
  createdAt: z.string(),
  updatedAt: z.string(),
})
export type Preset = z.infer<typeof presetSchema>

/**
 * One wedding's first publish (D-38, doc 16 §7). Registration grants a studio one; a catalogue's
 * first publish consumes one; a republish consumes nothing. `grantedBy` is `registration`, a
 * platform admin's email, or later a payment id — the row is its own receipt.
 */
export const publishCreditSchema = z.object({
  id: z.string().uuid(),
  orgId: z.string().uuid(),
  /**
   * Which plan this credit pays for (N-119, D-61). It is spent only by a first publish of a wedding on
   * the same plan — a Cinema credit does not publish a Deliver wedding, and an empty Deliver basket
   * refuses a Deliver publish even while Cinema credits remain.
   */
  planId: z.enum(CREDIT_PLAN_IDS).default('deliver'),
  grantedBy: z.string().min(1).default('registration'),
  reason: z.string().max(500).default(''),
  purchasedAt: z.string(),
  /** `purchasedAt` + 24 months (REQUIREMENTS.md §9). An expired credit publishes nothing. */
  expiresAt: z.string(),
  consumedByCatalogueId: z.string().uuid().nullable().default(null),
  consumedAt: z.string().nullable().default(null),
})
export type PublishCredit = z.infer<typeof publishCreditSchema>

/** How many credits are spendable, spent, and lapsed. */
export type CreditCounts = { available: number; consumed: number; expired: number }

/**
 * What a studio sees (N-119): the totals, and the same three numbers **per plan** — a studio holds
 * a basket of Deliver, Keep and Cinema credits, not one pile. Every credit plan is present even at
 * zero, so a caller never has to ask whether a basket exists before reading it.
 */
export type CreditBalance = CreditCounts & { byPlan: Record<CreditPlanId, CreditCounts> }

/**
 * What a `plans` row is for, which is also how it is fulfilled (N-20): the Studio plan grants a
 * credit bundle; a catalogue plan or storage tier is what a wedding is *on*; a renewal extends a
 * term; an archive keeps one cold; an add-on is bought on top of a wedding that already exists.
 */
export const PLAN_KINDS = ['partner', 'catalogue', 'renewal', 'archive', 'addon'] as const
export type PlanKind = (typeof PLAN_KINDS)[number]

/**
 * One line of the platform's price list (N-118, D-61) — the only place a price lives.
 *
 * `pricePaise` is whole paise, **ex-GST**, and `null` means *not for sale*, which is a state an
 * admin can put a product in and a checkout must respect — it is not zero, and zero is not "free
 * until someone notices". `unit` says what one price buys, because "25" is a number and "₹25 per
 * GB per month" is a price. `grants` is the typed credit bundle a purchase hands over (only the
 * Studio plan has one); the retail range is advisory copy about what a studio might charge a
 * couple, kept here purely so no rupee figure has to live in a source file.
 */
export const planSchema = z.object({
  id: z.string().min(1),
  kind: z.enum(PLAN_KINDS),
  name: z.string().min(1),
  unit: z.string().min(1).default('each'),
  pricePaise: z.number().int().nonnegative().nullable().default(null),
  storageGb: z.number().int().positive().nullable().default(null),
  grants: z.record(z.string(), z.number().int().nonnegative()).default({}),
  position: z.number().int().default(100),
  retailMinPaise: z.number().int().nonnegative().nullable().default(null),
  retailMaxPaise: z.number().int().nonnegative().nullable().default(null),
  /**
   * How long a wedding on this plan is served, counted from its first Publish (N-120, D-61) — held
   * here so the length is a setting, not a constant. **At most one is set.** Deliver is 90 *days*
   * and Keep and Cinema are 12 *months*, and the two are not interchangeable: twelve months is
   * calendar months (a wedding published on 1 March is served to 1 March), not 365 days. A plan
   * with neither has no term — a storage tier, a renewal, an add-on.
   */
  termMonths: z.number().int().positive().nullable().default(null),
  termDays: z.number().int().positive().nullable().default(null),
})
export type Plan = z.infer<typeof planSchema>

/** One run of a scheduled job (D-40): every cron writes one, the health page reads the newest. */
export const jobRunSchema = z.object({
  id: z.string().uuid(),
  job: z.string().min(1),
  startedAt: z.string(),
  finishedAt: z.string(),
  ok: z.boolean(),
  detail: z.record(z.string(), z.unknown()).default({}),
})
export type JobRun = z.infer<typeof jobRunSchema>

/** A bare, lowercased host — `films.kalyanam.in`. No protocol, no path, no port. */
export const hostSchema = z
  .string()
  .trim()
  .toLowerCase()
  .max(253)
  .regex(
    /^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/,
    'Enter a domain like films.example.com',
  )

export const DOMAIN_STATUSES = ['pending', 'verified', 'active', 'failed'] as const
export const domainStatusSchema = z.enum(DOMAIN_STATUSES)
export type DomainStatus = z.infer<typeof domainStatusSchema>

/**
 * A custom domain (doc 16 §1): a studio's, serving every wedding it makes under `/<wedding>`, or a
 * couple's, serving one wedding at its root. `pending` until DNS proves ownership (the TXT) and
 * pointing (the CNAME or A); `verified` until the host has it attached; `active` once it serves.
 */
export const domainSchema = z.object({
  id: z.string().uuid(),
  orgId: z.string().uuid(),
  /** Set for a single-catalogue domain; null for a studio's. */
  catalogueId: z.string().uuid().nullable().default(null),
  host: hostSchema,
  /** Expected in a TXT record at `_mehfilbox.<host>`. */
  verificationToken: z.string().min(8),
  status: domainStatusSchema.default('pending'),
  lastCheckedAt: z.string().nullable().default(null),
  error: z.string().nullable().default(null),
  createdAt: z.string(),
})
export type Domain = z.infer<typeof domainSchema>

/** The notification queue as the health page reads it. */
export type QueueStats = { queued: number; failedSince: number; oldestQueuedAt: string | null }

/**
 * A catalogue mid-handover.
 *
 * The token itself is never in here — only its hash reaches the database, and the plaintext is
 * shown to the partner once, at creation, the way a password reset link works.
 */
export const transferSchema = z.object({
  id: z.string().uuid(),
  catalogueId: z.string().uuid(),
  fromOrgId: z.string().uuid(),
  toEmail: z.string().email(),
  tokenHash: z.string().min(1),
  expiresAt: z.string(),
  claimedAt: z.string().nullable().default(null),
  claimedOrgId: z.string().uuid().nullable().default(null),
  createdAt: z.string(),
})
export type Transfer = z.infer<typeof transferSchema>

/** What a couple fills in to take ownership. */
export const claimSchema = z.object({
  token: z.string().min(20).max(200),
  coupleName: z.string().trim().min(2).max(80),
  /**
   * A new password when the address has no account, the existing one when it does (D-37). The
   * twelve-character floor for a new one is applied in the route, which is the only place that
   * knows which case this is.
   */
  password: z.string().min(1).max(200),
})

/** What a partner signs up with. The password never lands in this object. */
export const partnerRegistrationSchema = z.object({
  businessName: z.string().trim().min(2).max(80),
  contactName: z.string().trim().min(2).max(80),
  email: z.string().email(),
  password: z.string().min(12, 'Use at least 12 characters').max(200),
  /**
   * Defaulted rather than required, so an existing client that does not send it still registers —
   * and so the choice can be a radio pair rather than a blocking step in a form whose whole job is
   * to be short.
   */
  locale: localeSchema.default('en'),
  /** The challenge token, when a captcha driver is configured (D-34). */
  captchaToken: z.string().max(4000).optional(),
})
export type PartnerRegistration = z.infer<typeof partnerRegistrationSchema>
export type Org = z.infer<typeof orgSchema>

export const operatorSchema = z.object({
  id: z.string().uuid(),
  orgId: z.string().uuid(),
  email: z.string().email(),
  name: z.string().min(1),
  role: z.enum(['admin', 'uploader']),
  passwordHash: z.string(),
  /**
   * Set when a studio handed this person a temporary password in the room (D-33). The next
   * sign-in lands on the change-password screen before anything else; a password somebody else
   * has seen is a password to replace, not to keep.
   */
  mustChangePassword: z.boolean().default(false),
  createdAt: z.string(),
})
export type Operator = z.infer<typeof operatorSchema>

/**
 * A single-use, expiring link that lets its holder set a password (D-33).
 *
 * The token itself is never here — only its hash, exactly as a handover token is stored (doc 15
 * §2). `set-password` is a first credential; `reset` replaces one. The pages read identically;
 * the record does not.
 */
export const credentialLinkSchema = z.object({
  id: z.string().uuid(),
  operatorId: z.string().uuid(),
  tokenHash: z.string().min(1),
  purpose: z.enum(['set-password', 'reset']),
  expiresAt: z.string(),
  usedAt: z.string().nullable().default(null),
  createdAt: z.string(),
})
export type CredentialLink = z.infer<typeof credentialLinkSchema>

/**
 * Whoever runs the platform (doc 15 §1).
 *
 * **No `orgId`, and that is the whole design.** If "admin" were a membership, every org-scoped
 * query in the product would have to ask whether this member happens to be special — and
 * cross-tenant leaks live in exactly that branch. Keeping a platform admin outside the org graph
 * means no scoped query changes at all; the cost is that platform-wide views must be written one
 * at a time, deliberately, which is the trade doc 15 §1 argues for.
 */
export const platformAdminSchema = z.object({
  id: z.string().uuid(),
  email: z.string().email(),
  name: z.string().min(1),
  createdAt: z.string(),
})
export type PlatformAdmin = z.infer<typeof platformAdminSchema>

export const creditSchema = z.object({ role: z.string().min(1), name: z.string().min(1) })
export type Credit = z.infer<typeof creditSchema>

export const captionSchema = z.object({ lang: localeSchema, url: z.string() })

export const titleSchema = z.object({
  id: z.string().uuid(),
  catalogueId: z.string().uuid(),
  slug: z.string().min(1),
  /**
   * The slug this one replaced, still resolvable for 90 days from `slugChangedAt` (N-84) — a
   * forwarded link outlives the rename that would otherwise have broken it.
   */
  previousSlug: z.string().nullable().default(null),
  /**
   * When the current slug was set. Null means it is still exactly what upload derived from the
   * filename — the next rename is free to re-derive it. Once set, a rename never touches the
   * slug again, because by then the link may already be in someone's phone.
   */
  slugChangedAt: z.string().nullable().default(null),

  name: localisedRequiredSchema,
  synopsis: localisedStringSchema.optional(),
  category: categorySchema,
  credits: z.array(creditSchema).default([]),

  provider: z.string().default('bunny'),
  providerId: z.string().nullable().default(null),
  durationS: z.number().int().nonnegative().nullable().default(null),
  posterUrl: z.string().nullable().default(null),
  posterCandidates: z.array(z.string()).default([]),
  posterSource: posterSourceSchema.default('generated'),
  thumbnailsUrl: z.string().nullable().default(null),
  trailerUrl: z.string().nullable().default(null),
  captions: z.array(captionSchema).default([]),

  status: titleStatusSchema,
  errorMessage: z.string().nullable().default(null),
  /**
   * What this film occupies, in bytes.
   *
   * Seeded from the size the browser declares at upload, then **corrected from the provider**
   * once transcoding finishes — the two differ, sometimes by a lot, because what is stored is the
   * encoding ladder rather than the file that was sent. The declared figure is good enough to
   * refuse an upload that obviously will not fit; only the provider's is good enough to bill on.
   */
  sizeBytes: z.number().int().nonnegative().nullable().default(null),

  published: z.boolean().default(false),

  /**
   * When a catalogue Publish last carried this film live (N-57). Null means the couple cannot see
   * it, whatever `published` says.
   *
   * `published` is the operator's intent — "this one is ready to go out". `liveAt` is whether it
   * has actually gone out. They were the same thing until Publish became the only way anything
   * reaches a couple, and keeping them separate is what lets the console say "three films will go
   * live when you publish" instead of silently doing it.
   */
  liveAt: z.string().nullable().default(null),
  sortOrder: z.number().int().default(0),
  publishedAt: z.string().nullable().default(null),
  createdAt: z.string(),

  viewCount: z.number().int().nonnegative().default(0),
  watchSeconds: z.number().int().nonnegative().default(0),
})
export type Title = z.infer<typeof titleSchema>

export const photoSchema = z.object({
  id: z.string().uuid(),
  albumId: z.string().uuid(),
  url: z.string(),
  lqip: z.string().nullable().default(null),
  caption: localisedStringSchema.optional(),
  width: z.number().int().positive().nullable().default(null),
  height: z.number().int().positive().nullable().default(null),
  /** Every rendition together — photographs are resized to three widths before upload. */
  sizeBytes: z.number().int().nonnegative().nullable().default(null),
  sortOrder: z.number().int().default(0),
  /** As on a film (N-57): null means the couple cannot see this photograph yet. */
  liveAt: z.string().nullable().default(null),
})
export type Photo = z.infer<typeof photoSchema>

export const albumSchema = z.object({
  id: z.string().uuid(),
  catalogueId: z.string().uuid(),
  name: localisedRequiredSchema,
  createdAt: z.string(),
})
export type Album = z.infer<typeof albumSchema>

export const catalogueSchema = z.object({
  id: z.string().uuid(),
  orgId: z.string().uuid(),
  slug: slugSchema,
  /**
   * The studio segment of the public address — `mehfilbox.com/<tenantSlug>/<slug>` (D-32).
   *
   * Frozen at creation from the originating org's slug and never rewritten: the address is in
   * two hundred phones the day it is sent, and a handover or a studio rename must not move it.
   * Defaulted to '' rather than required so fixtures and stores written before the column existed
   * still parse; every driver fills an empty value from the org on the way out, and `cataloguePath`
   * falls back to the legacy `/c/<slug>` form rather than ever printing `//<slug>`.
   */
  tenantSlug: z.string().default(''),
  customDomain: z.string().nullable().default(null),
  /**
   * The partner who built this, kept permanently — including after a handover moves `orgId` to
   * the couple. Attribution and support outlive ownership; a live claim on the wedding does not.
   */
  originOrgId: z.string().uuid().nullable().default(null),

  coupleName: localisedRequiredSchema,
  appName: appNameSchema,
  weddingDate: z.string(),
  city: localisedStringSchema.optional(),
  synopsis: localisedStringSchema.optional(),
  occasion: occasionSchema.default('wedding'),

  branding: brandingSchema.default({}),
  featuredTitleId: z.string().uuid().nullable().default(null),

  modules: z.array(moduleInstanceSchema).default([]),
  draftModules: z.array(moduleInstanceSchema).nullable().default(null),
  /**
   * Branding the operator is still working on (N-56). Null means nothing pending.
   *
   * Mirrors `draftModules` deliberately. Branding used to write straight to the live row, so a
   * studio trying a colour repainted the couple's page while they were still choosing — one
   * screen with two save models, and no gate on the more visible half.
   */
  draftBranding: brandingSchema.nullable().default(null),
  /**
   * What a guest sees **before** they touch the toggle (N-29). Copied from the org at creation
   * rather than read through it, so a studio changing its own default later does not silently
   * change the language of weddings already delivered.
   */
  locale: localeSchema.default('en'),
  template: z.string().nullable().default(null),
  /** Where the couple is (N-69): a premiere at "seven in the evening" means their evening. */
  timezone: z.string().default('Asia/Kolkata'),
  /**
   * The instant before which a published wedding shows a countdown rather than the films
   * (N-72). Null is no premiere — live the moment it is published.
   */
  premiereAt: z.string().nullable().default(null),
  /**
   * The absolute address this catalogue is served from while a custom domain is active (doc 16
   * §1): `https://aanyaandvikram.in`, or `https://films.kalyanam.in/aanya-vikram-2026` under a
   * studio's domain. Null means the mehfilbox path. Stamped on activation, cleared on removal, and
   * the one column every printed URL reads — so it is on the row rather than joined.
   */
  servedAt: z.string().nullable().default(null),
  /**
   * The house style this catalogue was created from (D-36), if any. A record, not a link: the
   * values were copied at creation and the style may since have been renamed or deleted.
   */
  presetId: z.string().uuid().nullable().default(null),

  /**
   * The couple's account, linked from the moment the studio creates it (D-37). Until the
   * handover the studio owns the row and the couple sees it as "being prepared"; afterwards
   * `orgId` is the couple's and this still says who it was for.
   */
  coupleOrgId: z.string().uuid().nullable().default(null),
  /**
   * The originating studio's way back in after a handover (doc 16 §3): while this is in the
   * future the studio may open the customizer. Set from the couple's account, seven days at a
   * time, and it closes on its own. Read in exactly one place, `lib/admin/session.ts`.
   */
  supportAccessUntil: z.string().nullable().default(null),

  status: catalogueStatusSchema.default('draft'),
  privacy: privacySchema.default('unlisted'),
  passcodeHash: z.string().nullable().default(null),
  /**
   * Bumped whenever the guest code changes (N-71). The grant cookie carries the version it was
   * issued under, so changing the code signs out everyone who typed the old one — which is what
   * the couple who changed it expects, and what the console tells them.
   */
  passcodeVersion: z.number().int().positive().default(1),

  /**
   * When this wedding stops being served, or `null` while its term has not started (N-120, D-61).
   *
   * The term starts at the first Publish, not at creation — a wedding built over three months has
   * delivered nothing yet, and charging it for the months it was a draft is the thing D-61 ended.
   * **`null` means "not started", never "expired"**: every reader that compares this to a date must
   * treat it as no date at all, which `new Date(null)` — 1 January 1970 — would get exactly backwards.
   */
  includedUntil: z.string().nullable(),
  subStatus: subStatusSchema.default('included'),
  subPlan: z.enum(['monthly', 'yearly']).nullable().default(null),
  /**
   * The plan this wedding is on — Deliver, Keep or Cinema (N-119, D-61). **Not `subPlan`**, which is
   * a billing cadence and unrelated. It decides which basket the first publish spends from, and it
   * may be changed until that publish, after which it is fixed: a credit of this plan was spent.
   * Every catalogue that existed before this column is Deliver, because every credit ever granted was.
   */
  planId: z.enum(CREDIT_PLAN_IDS).default('deliver'),
  subUntil: z.string().nullable().default(null),

  createdAt: z.string(),
  publishedAt: z.string().nullable().default(null),
})
export type Catalogue = z.infer<typeof catalogueSchema>

export const profileSchema = z.object({
  id: z.string().uuid(),
  catalogueId: z.string().uuid(),
  label: profileLabelSchema,
  avatarSeed: z.string(),
  createdAt: z.string(),
})
export type Profile = z.infer<typeof profileSchema>

export const progressSchema = z.object({
  profileId: z.string().uuid(),
  titleId: z.string().uuid(),
  positionS: z.number().int().nonnegative(),
  durationS: z.number().int().positive(),
  completed: z.boolean(),
  updatedAt: z.string(),
})
export type PlaybackProgress = z.infer<typeof progressSchema>

/** What a like can be attached to. Films and photographs, and nothing else yet (N-31). */
export const likeSubjectSchema = z.enum(['title', 'photo'])
export type LikeSubject = z.infer<typeof likeSubjectSchema>

/** `subjectId` keyed by type, so one map carries both films and photographs. */
export type LikeCounts = Record<string, number>

/** A queued or recorded notification (N-50). */
export const notificationSchema = z.object({
  id: z.string().uuid(),
  template: z.string().min(1),
  channel: z.enum(['email', 'whatsapp', 'sms']),
  address: z.string().min(1),
  locale: z.enum(['en', 'hi']).default('en'),
  subject: z.string(),
  bodyText: z.string(),
  bodyHtml: z.string().nullable().default(null),
  orgId: z.string().uuid().nullable().default(null),
  catalogueId: z.string().uuid().nullable().default(null),
  status: z.enum(['queued', 'sent', 'failed']).default('queued'),
  provider: z.string().nullable().default(null),
  providerId: z.string().nullable().default(null),
  error: z.string().nullable().default(null),
  attempts: z.number().int().nonnegative().default(0),
  /**
   * What makes a scheduled message send once (N-21).
   *
   * `<template>:<catalogueId>:<milestone>` — e.g. `expiry:5f3…:30`. The warning cron re-derives
   * the same milestone every run until the day passes, so without this a couple gets the 30-day
   * warning thirty times and learns to ignore all of them. Null for anything sent once by an
   * action rather than by a schedule.
   */
  dedupeKey: z.string().nullable().default(null),
  createdAt: z.string(),
  sentAt: z.string().nullable().default(null),
})
export type Notification = z.infer<typeof notificationSchema>

export const moduleStateSchema = z.object({
  profileId: z.string().uuid(),
  moduleId: z.string(),
  state: z.record(z.unknown()),
  updatedAt: z.string(),
})
export type ModuleState = z.infer<typeof moduleStateSchema>

export const playEventSchema = z.object({
  id: z.string(),
  catalogueId: z.string().uuid(),
  titleId: z.string().uuid(),
  profileId: z.string().uuid().nullable(),
  seconds: z.number().int().nonnegative(),
  at: z.string(),
})
export type PlayEvent = z.infer<typeof playEventSchema>

/**
 * A catalogue plus everything the guest page renders from it. Assembled once per request by
 * the route; presentational components never fetch (CLAUDE.md working agreements).
 */
export type CatalogueBundle = {
  catalogue: Catalogue
  titles: Title[]
  albums: Album[]
  photos: Photo[]
}

// Content caps used to live here as `MAX_TITLES` / `MAX_PHOTOS`. They are entitlements now —
// see `lib/entitlements.ts` and doc 15 §3. A constant cannot be sold.