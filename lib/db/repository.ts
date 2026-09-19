import type { CreditPlanId } from '@/lib/plans'
import type { Entitlement } from '@/lib/entitlements'
import type { CustomTheme } from '@/themes/contract'
import type {
  Album,
  Catalogue,
  CredentialLink,
  LikeCounts,
  LikeSubject,
  Notification,
  ModuleInstance,
  ModuleState,
  Operator,
  OrgStatus,
  PlatformAudit,
  Org,
  PlatformAdmin,
  Transfer,
  PlaybackProgress,
  Photo,
  Profile,
  Title,
  Preset,
  CreditBalance,
  Coupon,
  CouponRedemption,
  Plan,
  PublishCredit,
  JobRun,
  QueueStats,
  Domain,
} from '@/lib/schema'

/**
 * The persistence seam.
 *
 * Doc 06 specifies Postgres, and production runs on it. This interface exists so that the
 * unit and component suites, CI, and an offline planner demo can all run against an in-memory
 * store with identical semantics — the alternative is a test suite that needs a database,
 * which in practice becomes a test suite nobody runs.
 *
 * Isolation note (doc 10 §5): every operator-facing method takes `orgId` and every guest-facing
 * one takes a catalogue. No method can read across catalogues, in any driver.
 */

export type CatalogueFilter = { orgId: string }

/**
 * Counts the catalogue list shows, for every catalogue in an org.
 *
 * A separate method rather than a field on `Catalogue` because these are derived: writing them
 * onto the row would mean every title upload and every photo delete had to remember to keep a
 * counter honest, and the first one that forgot would be invisible.
 *
 * It exists at all because the alternative on the list page is `listTitles` per row. A partner
 * with thirty weddings would make sixty round trips to draw one screen, and the page would get
 * slower every wedding they sold.
 */
export type CatalogueCounts = {
  titles: number
  /** Playable — what a guest would actually find, which is the number an operator cares about. */
  ready: number
  published: number
  failed: number
  photos: number
}

export type CreateTitleInput = Omit<
  Title,
  'createdAt' | 'publishedAt' | 'viewCount' | 'watchSeconds'
> &
  Partial<Pick<Title, 'createdAt' | 'publishedAt' | 'viewCount' | 'watchSeconds'>>

/** The verdict a rate-limit consume returns — defined here, not in `lib/http`, because a
 *  driver returns it and the http layer is the caller, not the source (N-86). */
export type LimitResult = { allowed: boolean; remaining: number; retryAfterS: number }

/** What `Repository.redeemCoupon` takes: the redemption to record, the credits it hands over, and "now". */
export type RedeemCoupon = {
  redemption: CouponRedemption
  credits: PublishCredit[]
  nowIso: string
}

export interface Repository {
  // ── Orgs & operators ────────────────────────────────────────────────────────
  getOrg(id: string): Promise<Org | null>
  getOrgBySlug(slug: string): Promise<Org | null>
  /** Partner sign-up. Fails if the slug is taken, which is how a race is settled. */
  createOrg(org: Org): Promise<Org>
  /** Every org on the platform. Platform-admin only — no route may call this org-scoped. */
  listOrgs(kind?: Org['kind']): Promise<Org[]>
  createOperator(operator: Operator): Promise<Operator>

  /** Everyone who can sign in to an org. Platform-console only — an operator sees their own org
   *  through the console's own scoped queries, never through this. */
  listOperators(orgId: string): Promise<Operator[]>

  /**
   * Suspend or restore an org (N-27).
   *
   * Org-level, and never touches a catalogue: suspending a studio must not expire the weddings it
   * has already delivered.
   */
  setOrgStatus(orgId: string, status: OrgStatus): Promise<Org>

  /**
   * The operator row plus the org's status, in one read.
   *
   * Deliberately not `getOperator` + `getOrg`. `getSessionOrg` is separate precisely so that a
   * write does not pay for an org row nobody displays, and suspension has to be checked on every
   * authenticated request — so the status rides along with the lookup that already happens.
   */
  getOperatorWithOrgStatus(id: string): Promise<{ operator: Operator; orgStatus: OrgStatus } | null>

  // ── Platform audit (N-27) ───────────────────────────────────────────────────
  /** Record a platform-admin action. An unaudited platform write is indistinguishable from an
   *  intrusion after the fact, so every write path calls this. */
  /**
   * How many of one template were created since a moment — the de-duplication an alert needs
   * (N-53). A cron that notices a dead webhook every fifteen minutes must not send ninety-six
   * emails a day about it; an alert nobody can bear to read is an alert nobody reads.
   */
  /**
   * Carry this catalogue's content live (N-57).
   *
   * Films the operator has ticked and photographs that have finished uploading get a `liveAt`;
   * films the operator has *un*ticked lose theirs, so hiding a film also waits for Publish and
   * arrives with everything else. Returns what moved, so the console can say so.
   */
  publishCatalogueContent(catalogueId: string): Promise<{ published: number; withdrawn: number }>

  /** How much content is waiting for the next Publish — the number the console shows. */
  countPendingContent(catalogueId: string): Promise<{ titles: number; photos: number }>

  countNotificationsSince(template: string, sinceIso: string): Promise<number>

  recordPlatformAudit(entry: PlatformAudit): Promise<PlatformAudit>
  listPlatformAudit(options?: { orgId?: string; limit?: number }): Promise<PlatformAudit[]>
  /** Compensation for a half-finished registration. Not a user-facing delete. */
  deleteOrg(id: string): Promise<void>

  // ── Platform-authored themes (D-35) ─────────────────────────────────────────
  // ── Custom domains (doc 16 §1) ───────────────────────────────────────────
  listDomains(orgId: string): Promise<Domain[]>
  /** Platform only: every domain, awaiting attachment first. */
  listAllDomains(): Promise<Domain[]>
  getDomain(id: string, orgId: string): Promise<Domain | null>
  /** Platform only. */
  getDomainById(id: string): Promise<Domain | null>
  /** The guest path: a host arrives and the row says whose it is and whether it serves. */
  getDomainByHost(host: string): Promise<Domain | null>
  saveDomain(domain: Domain): Promise<Domain>
  deleteDomain(id: string, orgId: string): Promise<void>

  // ── Jobs and health (D-40) ───────────────────────────────────────────────
  recordJobRun(run: JobRun): Promise<JobRun>
  /** The newest run of every job that has ever run. */
  latestJobRuns(): Promise<JobRun[]>
  notificationQueueStats(failedSinceIso: string): Promise<QueueStats>

  // ── Rate limiting (N-86) ─────────────────────────────────────────────────
  /**
   * One fixed window per key, incremented atomically and reset once it expires — the read, the
   * reset-or-increment decision and the write happen as one operation in whichever driver
   * implements this, which is what makes it safe under concurrent callers on the same key
   * (`lib/http/rate-limit.ts` is the one place that calls this; nothing else should).
   */
  consumeRateLimit(key: string, limit: number, windowS: number): Promise<LimitResult>
  /** How many times a key has been consumed in its current window, without consuming it. */
  peekRateLimit(key: string): Promise<number>
  /** Clears a bucket — after a successful passcode entry, a successful sign-in, and by tests. */
  resetRateLimit(key: string): Promise<void>

  // ── Credits (D-38) ───────────────────────────────────────────────────────
  listCredits(orgId: string): Promise<PublishCredit[]>
  grantCredits(credits: PublishCredit[]): Promise<PublishCredit[]>
  /**
   * Spend one **of this plan** (N-119): the soonest-to-expire credit of `planId` that is unconsumed
   * and unexpired, marked as spent by this catalogue. `null` when that basket is empty — even if
   * others are not, which is the publish gate's whole question.
   */
  consumeCredit(
    orgId: string,
    catalogueId: string,
    planId: CreditPlanId,
    nowIso: string,
  ): Promise<PublishCredit | null>
  creditBalance(orgId: string, nowIso: string): Promise<CreditBalance>

  // ── The price list (N-118, D-61) ─────────────────────────────────────────
  /**
   * Every product the platform sells, in console order. Not scoped to an org: the price list is
   * the platform's, and a studio and a direct couple read the same one.
   */
  listPlans(): Promise<Plan[]>
  getPlan(id: string): Promise<Plan | null>
  /**
   * Whole paise, ex-GST. `null` takes the product **off sale** — which is not zero: a checkout must
   * refuse a product with no price rather than sell it for nothing. Returns the updated row, or
   * `null` for an id that is not on the list; a price cannot create a product.
   */
  setPlanPrice(id: string, pricePaise: number | null): Promise<Plan | null>
  /** The advisory "studios typically charge" range, both ends or neither. Same return as above. */
  setPlanRetail(id: string, range: { minPaise: number; maxPaise: number } | null): Promise<Plan | null>
  /** Replaces the typed credit bundle a purchase grants (`{ deliver: 2, cinema: 1 }`). Same return. */
  setPlanGrants(id: string, grants: Record<string, number>): Promise<Plan | null>

  // ── Coupons (N-121, D-61) ─────────────────────────────────────────────────
  /** Not scoped to an org: coupons are the platform's. A code already in use is a `VALIDATION_FAILED`. */
  createCoupon(coupon: Coupon): Promise<Coupon>
  listCoupons(): Promise<Coupon[]>
  getCoupon(id: string): Promise<Coupon | null>
  /** By the code as stored — upper-case (`normalizeCode`) — or `null`. */
  getCouponByCode(code: string): Promise<Coupon | null>
  /** The only edit a coupon allows: a redeemed code is history, so it is disabled, never changed or deleted. */
  setCouponActive(id: string, active: boolean): Promise<Coupon | null>
  /** How many times a coupon has been redeemed, in total and by one payer — the numbers a quote checks. */
  countCouponRedemptions(couponId: string, payerOrgId: string): Promise<{ total: number; byPayer: number }>
  /**
   * The one atomic step for "may this be redeemed, and if so record it and hand over what it grants".
   *
   * Returns the redemption, or `null` when it may not be: unknown or disabled, outside its window, or a
   * limit reached — deliberately one answer for all of them. The limits are checked *here*, under a lock,
   * not just in the caller: a check followed by a write lets two requests for the last redemption both
   * pass. `credits` (a reward's) are stored in the same step, so a redemption with no credits, or credits
   * with no redemption, cannot exist.
   */
  redeemCoupon(input: RedeemCoupon): Promise<CouponRedemption | null>
  listCouponRedemptions(): Promise<CouponRedemption[]>

  // ── House styles (D-36) ─────────────────────────────────────────────────
  listPresets(orgId: string): Promise<Preset[]>
  getPreset(id: string, orgId: string): Promise<Preset | null>
  /** Upsert. Marking one default clears the org's previous default in the same write. */
  savePreset(preset: Preset): Promise<Preset>
  deletePreset(id: string, orgId: string): Promise<void>
  /** Published catalogues created from this style — the number that freezes it. */
  countPublishedCataloguesOnPreset(presetId: string): Promise<number>

  listCustomThemes(): Promise<CustomTheme[]>
  getCustomTheme(id: string): Promise<CustomTheme | null>
  /** Insert or replace by id. The route has already validated the tokens. */
  saveCustomTheme(theme: CustomTheme): Promise<CustomTheme>

  // ── Platform admin (doc 15 §1) ──────────────────────────────────────────────
  /**
   * Looked up by the authenticated user's id, never by anything in a request.
   *
   * Returns null for everyone else, which is what makes "am I a platform admin" a single
   * question with a single answer rather than a predicate spread across routes.
   */
  getPlatformAdmin(id: string): Promise<PlatformAdmin | null>
  /**
   * How many catalogues each org holds, for the platform list. Unscoped by definition — it is
   * the one view whose whole purpose is to cross org boundaries, which is why it sits here
   * beside `listAllCatalogues` rather than anywhere a request path would reach for it.
   */
  catalogueCountsByOrg(): Promise<Record<string, number>>

  // ── Entitlements (doc 15 §3) ────────────────────────────────────────────────
  /**
   * The grants that apply to a catalogue: its own, and its owning org's.
   *
   * Returned as a pair rather than pre-resolved because the *order* is a product decision
   * (catalogue beats org, per field) and belongs in `lib/entitlements.ts` where it can be tested
   * without a database — not duplicated across three drivers.
   */
  getEntitlements(
    catalogueId: string,
    orgId: string,
  ): Promise<{ catalogue: Entitlement | null; org: Entitlement | null }>

  /**
   * Update the studio's own branding (N-26).
   *
   * Scoped by the caller, never by a body: `requireOperator` supplies the org id, so a studio can
   * only ever repaint itself. Deliberately narrow — this is not `updateOrg`, because the only
   * field an operator has any business changing about their own org is how it looks.
   */
  setOrgBranding(orgId: string, branding: Org['branding']): Promise<Org>

  /** The org's own entitlement, for the platform console to show and change (N-27b). */
  getOrgEntitlement(orgId: string): Promise<Entitlement | null>

  /**
   * Set or clear an org's storage quota (N-27b).
   *
   * `null` removes the override so `DEFAULT_LIMITS` applies again, which is a different thing from
   * setting it to twenty and needs to stay expressible: a studio moved back to the default should
   * follow the default if it ever changes, not be frozen at today's value.
   */
  setOrgStorageQuota(orgId: string, storageGb: number | null): Promise<Entitlement | null>

  /**
   * Grant a catalogue its storage tier at creation (D-60, N-80).
   *
   * Unlike `setOrgStorageQuota` this is not a toggle a console revisits — it is written once, when
   * the wizard's tier pill is chosen, and there is no existing row to find first: a catalogue this
   * young cannot already have one. `resolveLimits` reads it ahead of the org's own override without
   * any change on its side, because that ordering (catalogue beats org) already existed for exactly
   * this reason — a couple's own grant must not be capped by a studio no longer in the picture.
   */
  setCatalogueEntitlement(catalogueId: string, planId: string, storageGb: number): Promise<Entitlement>

  /** A catalogue's own entitlement, for the platform console to show and change (N-79). */
  getCatalogueEntitlement(catalogueId: string): Promise<Entitlement | null>

  /**
   * Set or clear a catalogue's storage quota by hand (N-79) — the platform's answer to an "Ask
   * for more space" request, mirroring `setOrgStorageQuota` exactly, one level down: find an
   * existing row and update it, or create one; `null` removes the override rather than zeroing
   * it, so "back to normal" keeps following whatever the catalogue's tier or the org's own grant
   * resolves to next, rather than freezing at today's number. Never sets `planId` — a hand-set
   * override is not a tier, the same way an org's own override never was.
   */
  setCatalogueStorageQuota(catalogueId: string, storageGb: number | null): Promise<Entitlement | null>

  // ── Transfers (doc 15 §2) ───────────────────────────────────────────────────
  createTransfer(transfer: Transfer): Promise<Transfer>
  /** Looked up by hash: the plaintext token exists only in the link. */
  getTransferByTokenHash(hash: string): Promise<Transfer | null>
  getLiveTransferForCatalogue(catalogueId: string): Promise<Transfer | null>
  markTransferClaimed(id: string, claimedOrgId: string): Promise<void>
  cancelTransfer(id: string): Promise<void>
  getOperatorByEmail(email: string): Promise<Operator | null>
  getOperator(id: string): Promise<Operator | null>

  // ── Credentials (D-33) ───────────────────────────────────────────────────────
  /**
   * The local driver's password, and the flag both drivers share. `passwordHash` is omitted under
   * Supabase Auth, where the credential lives elsewhere and this column stays empty.
   */
  setOperatorPassword(
    id: string,
    patch: { passwordHash?: string; mustChangePassword: boolean },
  ): Promise<Operator>
  createCredentialLink(link: CredentialLink): Promise<CredentialLink>
  /** Looked up by hash: the plaintext token exists only in the link. */
  getCredentialLinkByHash(hash: string): Promise<CredentialLink | null>
  markCredentialLinkUsed(id: string): Promise<void>

  // ── Catalogues ──────────────────────────────────────────────────────────────
  listCatalogues(filter: CatalogueFilter): Promise<Catalogue[]>
  /**
   * Counts for every catalogue in the org, keyed by catalogue id. Org-scoped like everything
   * else here: it cannot be asked about a catalogue the caller does not own.
   */
  catalogueCounts(filter: CatalogueFilter): Promise<Record<string, CatalogueCounts>>
  /**
   * Bytes this catalogue occupies — films plus photographs, every rendition.
   *
   * Unscoped by org on purpose: it is called from the upload path, which has already proven
   * ownership through `requireOwnedCatalogue`, and from the console, which did the same. Adding a
   * second scope here would be ceremony, not safety.
   */
  catalogueStorageBytes(catalogueId: string): Promise<number>
  getCatalogue(id: string, orgId: string): Promise<Catalogue | null>
  /** Unscoped lookup, for paths that already hold a trusted id (webhooks, ISR revalidation). */
  getCatalogueById(id: string): Promise<Catalogue | null>

  // ── Couple accounts and the support window (D-37, doc 16 §3) ────────────────
  /**
   * Everything a couple's account can see: what it owns, and what is linked to it before the
   * handover. A disjunction, and the only one in the product — contained here and in
   * `lib/my/session.ts`, never in a route.
   */
  listCataloguesForCouple(coupleOrgId: string): Promise<Catalogue[]>
  getCatalogueForCouple(id: string, coupleOrgId: string): Promise<Catalogue | null>
  /** What a studio originated but no longer owns — the Delivered view (N-74). */
  listOriginatedCatalogues(orgId: string): Promise<Catalogue[]>
  /**
   * A handed-over catalogue the originating studio may still edit, because the couple opened a
   * window and it has not closed. The second authorisation path, read only by `session.ts`.
   */
  getCatalogueForSupport(id: string, originOrgId: string, now: Date): Promise<Catalogue | null>
  /** Guest path: resolve by subdomain label with no org scope. */
  getCatalogueBySlug(slug: string): Promise<Catalogue | null>
  /** The catalogue served at the root of `host` — `servedAt === https://<host>`. */
  getCatalogueByCustomDomain(host: string): Promise<Catalogue | null>
  slugAvailable(slug: string): Promise<boolean>
  createCatalogue(catalogue: Catalogue): Promise<Catalogue>
  updateCatalogue(
    id: string,
    orgId: string,
    patch: Partial<Omit<Catalogue, 'id' | 'orgId'>>,
  ): Promise<Catalogue>

  // ── Titles ──────────────────────────────────────────────────────────────────
  listTitles(catalogueId: string, options?: { publishedOnly?: boolean }): Promise<Title[]>
  getTitle(id: string): Promise<Title | null>
  getTitleBySlug(catalogueId: string, slug: string): Promise<Title | null>
  getTitleByProviderId(providerId: string): Promise<Title | null>
  createTitle(title: CreateTitleInput): Promise<Title>
  updateTitle(id: string, patch: Partial<Omit<Title, 'id' | 'catalogueId'>>): Promise<Title>
  /** Captions only, today — the rest of a photograph is decided by the upload (N-30). */
  updatePhoto(id: string, patch: Pick<Photo, 'caption'>): Promise<Photo>

  /** Queue a message. Never sends — `/api/cron/notify` drains (N-50). */
  /**
   * Queue a message. Returns `null` when `dedupeKey` is already present (N-21) — the row is not a
   * second copy, it is the same milestone arriving again, and the caller wants to know it was
   * already handled rather than to see an error.
   */
  enqueueNotification(notification: Notification): Promise<Notification | null>
  /** Oldest queued first, so a backlog drains in the order it was created. */
  listQueuedNotifications(limit: number): Promise<Notification[]>
  markNotification(
    id: string,
    patch: Pick<Notification, 'status' | 'provider' | 'providerId' | 'error'> & { attempts: number },
  ): Promise<void>

  /**
   * Toggle one guest's like and report the new total (N-31).
   *
   * Returns the count so the caller never has to ask twice — a separate read would race another
   * guest's tap and show a number that was true a moment ago.
   */
  toggleLike(
    catalogueId: string,
    guestKey: string,
    subject: LikeSubject,
    subjectId: string,
  ): Promise<{ liked: boolean; count: number }>

  /** Every count for a catalogue, plus which of them this guest owns. */
  listLikes(
    catalogueId: string,
    guestKey: string | null,
  ): Promise<{ counts: LikeCounts; mine: string[] }>
  deleteTitle(id: string): Promise<void>
  reorderTitles(catalogueId: string, order: { id: string; sortOrder: number }[]): Promise<void>

  // ── Albums & photos ─────────────────────────────────────────────────────────
  listAlbums(catalogueId: string): Promise<Album[]>
  listPhotos(albumId: string): Promise<Photo[]>
  /**
   * `liveOnly` is the guest's view (N-57): photographs a catalogue Publish has carried live. The
   * console passes nothing and sees everything, which is what makes "will go live when you
   * publish" showable rather than invisible.
   */
  listPhotosForCatalogue(catalogueId: string, options?: { liveOnly?: boolean }): Promise<Photo[]>
  getAlbum(id: string): Promise<Album | null>
  /** Removes the catalogue and everything the database cascades from it. */
  deleteCatalogue(id: string, orgId: string): Promise<void>
  /**
   * Move a catalogue to another org — the one operation `updateCatalogue` deliberately cannot
   * express, because a patch that could change `org_id` would make every write a potential
   * ownership change. Scoped by the current owner, so it can only ever move what it names.
   */
  transferCatalogue(id: string, fromOrgId: string, toOrgId: string): Promise<Catalogue>
  createAlbum(album: Album): Promise<Album>
  createPhoto(photo: Photo): Promise<Photo>
  getPhoto(id: string): Promise<Photo | null>
  deletePhoto(id: string): Promise<void>

  // ── Guests ──────────────────────────────────────────────────────────────────
  createProfile(profile: Profile): Promise<Profile>
  getProfile(id: string): Promise<Profile | null>
  upsertProgress(progress: PlaybackProgress): Promise<void>
  getProgress(profileId: string, titleId: string): Promise<PlaybackProgress | null>
  listProgress(profileId: string): Promise<PlaybackProgress[]>
  upsertModuleState(state: ModuleState): Promise<void>
  getModuleState(profileId: string, moduleId: string): Promise<ModuleState | null>

  // ── Ops ─────────────────────────────────────────────────────────────────────
  recordPlayEvent(event: {
    catalogueId: string
    titleId: string
    profileId: string | null
    seconds: number
  }): Promise<void>

  /** Titles stuck in `processing` past `olderThanMinutes` — the reconciliation job's input. */
  listStalledTitles(olderThanMinutes: number): Promise<Title[]>

  /**
   * Every catalogue, unscoped. Operations jobs only — the usage rollup has to walk all of them.
   * No request path may call this; org scoping is the isolation boundary (doc 10 §5).
   */
  listAllCatalogues(): Promise<Catalogue[]>

  /** Per-catalogue monthly usage (doc 05 §2 cost guardrails). `month` is the first of a month. */
  upsertUsage(usage: {
    catalogueId: string
    month: string
    storedGb: number
    /** Derived from `watchSeconds`; see `Usage` in `lib/video/provider.ts`. */
    deliveredGb: number
    /** Measured. Kept so a corrected bitrate can recompute rather than rewrite (N-25). */
    watchSeconds: number
  }): Promise<void>

  listUsage(catalogueId: string): Promise<
    { catalogueId: string; month: string; storedGb: number; deliveredGb: number; watchSeconds: number }[]
  >
}

/** Convenience: draft modules if the customizer has unpublished edits, otherwise live. */
export function effectiveModules(catalogue: Catalogue, preferDraft: boolean): ModuleInstance[] {
  const source = preferDraft && catalogue.draftModules ? catalogue.draftModules : catalogue.modules
  return [...source].sort((a, b) => a.order - b.order)
}
