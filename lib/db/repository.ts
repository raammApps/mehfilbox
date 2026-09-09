import type { Entitlement } from '@/lib/entitlements'
import type {
  Album,
  Catalogue,
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

  // ── Transfers (doc 15 §2) ───────────────────────────────────────────────────
  createTransfer(transfer: Transfer): Promise<Transfer>
  /** Looked up by hash: the plaintext token exists only in the link. */
  getTransferByTokenHash(hash: string): Promise<Transfer | null>
  getLiveTransferForCatalogue(catalogueId: string): Promise<Transfer | null>
  markTransferClaimed(id: string, claimedOrgId: string): Promise<void>
  cancelTransfer(id: string): Promise<void>
  getOperatorByEmail(email: string): Promise<Operator | null>
  getOperator(id: string): Promise<Operator | null>

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
  /** Guest path: resolve by subdomain label with no org scope. */
  getCatalogueBySlug(slug: string): Promise<Catalogue | null>
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
