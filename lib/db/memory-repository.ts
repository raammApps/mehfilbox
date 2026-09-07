import { randomUUID } from 'node:crypto'
import { ApiError } from '@/lib/http/errors'
import type {
  Album,
  LikeCounts,
  LikeSubject,
  Notification,
  Transfer,
  Catalogue,
  ModuleState,
  Operator,
  Org,
  PlatformAdmin,
  OrgStatus,
  PlatformAudit,
  PlaybackProgress,
  PlayEvent,
  Photo,
  Profile,
  Title,
} from '@/lib/schema'
import type { Entitlement } from '@/lib/entitlements'
import type {
  CatalogueCounts,
  CatalogueFilter,
  CreateTitleInput,
  Repository,
} from './repository'

export type Snapshot = {
  platformAdmins: PlatformAdmin[]
  entitlements: Entitlement[]
  transfers: Transfer[]
  orgs: Org[]
  operators: Operator[]
  catalogues: Catalogue[]
  titles: Title[]
  albums: Album[]
  photos: Photo[]
  profiles: Profile[]
  progress: PlaybackProgress[]
  moduleStates: ModuleState[]
  likes: { catalogueId: string; guestKey: string; subject: LikeSubject; subjectId: string }[]
  notifications: Notification[]
  platformAudit: PlatformAudit[]
  playEvents: PlayEvent[]
  usage: { catalogueId: string; month: string; storedGb: number; deliveredGb: number }[]
}

export function emptySnapshot(): Snapshot {
  return {
    platformAdmins: [],
    entitlements: [],
    transfers: [],
    orgs: [],
    operators: [],
    catalogues: [],
    titles: [],
    albums: [],
    photos: [],
    profiles: [],
    progress: [],
    moduleStates: [],
    likes: [],
    notifications: [],
    platformAudit: [],
    playEvents: [],
    usage: [],
  }
}

/**
 * In-process implementation of `Repository`.
 *
 * Backs the test suites, CI, and `DATA_DRIVER=memory|file`. `persist()` is the hook the file
 * driver overrides; in memory it is a no-op.
 */
export class MemoryRepository implements Repository {
  protected data: Snapshot

  constructor(snapshot: Snapshot = emptySnapshot()) {
    this.data = snapshot
  }

  /** Structured-clone on the way out so callers cannot mutate the store by accident. */
  private clone<T>(value: T): T {
    return structuredClone(value)
  }

  /** Called after every mutation. Overridden by `FileRepository`. */
  protected persist(): void {}

  private touched(): void {
    this.persist()
  }

  snapshot(): Snapshot {
    return this.clone(this.data)
  }

  // ── Orgs & operators ────────────────────────────────────────────────────────
  async getOrg(id: string): Promise<Org | null> {
    return this.clone(this.data.orgs.find((o) => o.id === id) ?? null)
  }

  async getOrgBySlug(slug: string): Promise<Org | null> {
    return this.clone(this.data.orgs.find((o) => o.slug === slug) ?? null)
  }

  async createOrg(org: Org): Promise<Org> {
    if (this.data.orgs.some((o) => o.slug === org.slug)) {
      throw new ApiError('VALIDATION_FAILED', 'That address is taken', {
        fields: { slug: 'Another business is already using this address' },
      })
    }
    this.data.orgs.push(this.clone(org))
    this.touched()
    return this.clone(org)
  }

  async listOrgs(kind?: Org['kind']): Promise<Org[]> {
    return this.clone(
      this.data.orgs
        .filter((o) => !kind || o.kind === kind)
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
    )
  }

  async createOperator(operator: Operator): Promise<Operator> {
    if (this.data.operators.some((o) => o.email.toLowerCase() === operator.email.toLowerCase())) {
      throw new ApiError('VALIDATION_FAILED', 'That email is already registered', {
        fields: { email: 'This address already has an account' },
      })
    }
    this.data.operators.push(this.clone(operator))
    this.touched()
    return this.clone(operator)
  }

  async listOperators(orgId: string): Promise<Operator[]> {
    return this.clone(
      this.data.operators
        .filter((o) => o.orgId === orgId)
        .sort((a, b) => a.email.localeCompare(b.email)),
    )
  }

  async setOrgStatus(orgId: string, status: OrgStatus): Promise<Org> {
    const org = this.data.orgs.find((o) => o.id === orgId)
    if (!org) throw new ApiError('NOT_FOUND', 'Org not found')
    org.status = status
    this.touched()
    return this.clone(org)
  }

  async getOperatorWithOrgStatus(
    id: string,
  ): Promise<{ operator: Operator; orgStatus: OrgStatus } | null> {
    const operator = this.data.operators.find((o) => o.id === id)
    if (!operator) return null
    const org = this.data.orgs.find((o) => o.id === operator.orgId)
    // An operator whose org has vanished is not a session. Defaulting to 'active' here would
    // hand the widest possible access to the least explicable state.
    if (!org) return null
    /**
     * `?? 'active'` because the file driver spreads stored JSON over `emptySnapshot()` without
     * parsing it through the schema, so a store written before 0010 has no `status` at all — the
     * local demo store, written in August, is exactly that. Zod's default only applies on parse,
     * which never happens on this path.
     *
     * Defaulting a *present* org to active is safe; defaulting a *missing* one would not be, which
     * is why the line above returns null instead.
     */
    return { operator: this.clone(operator), orgStatus: org.status ?? 'active' }
  }

  async countNotificationsSince(template: string, sinceIso: string): Promise<number> {
    return this.data.notifications.filter((n) => n.template === template && n.createdAt >= sinceIso)
      .length
  }

  async recordPlatformAudit(entry: PlatformAudit): Promise<PlatformAudit> {
    this.data.platformAudit.push(this.clone(entry))
    this.touched()
    return this.clone(entry)
  }

  async listPlatformAudit(options?: { orgId?: string; limit?: number }): Promise<PlatformAudit[]> {
    return this.clone(
      this.data.platformAudit
        .filter((e) => !options?.orgId || e.orgId === options.orgId)
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
        .slice(0, options?.limit ?? 50),
    )
  }

  // ── Platform admin ──────────────────────────────────────────────────────────
  async getPlatformAdmin(id: string): Promise<PlatformAdmin | null> {
    return this.clone(this.data.platformAdmins.find((a) => a.id === id) ?? null)
  }

  async catalogueCountsByOrg(): Promise<Record<string, number>> {
    const counts: Record<string, number> = {}
    for (const org of this.data.orgs) counts[org.id] = 0
    for (const catalogue of this.data.catalogues) {
      counts[catalogue.orgId] = (counts[catalogue.orgId] ?? 0) + 1
    }
    return counts
  }

  // ── Entitlements ────────────────────────────────────────────────────────────
  async getEntitlements(
    catalogueId: string,
    orgId: string,
  ): Promise<{ catalogue: Entitlement | null; org: Entitlement | null }> {
    return {
      catalogue: this.clone(
        this.data.entitlements.find((e) => e.catalogueId === catalogueId) ?? null,
      ),
      org: this.clone(this.data.entitlements.find((e) => e.orgId === orgId) ?? null),
    }
  }

  // ── Transfers ───────────────────────────────────────────────────────────────
  async createTransfer(transfer: Transfer): Promise<Transfer> {
    // Mirrors the partial unique index: one live handover per catalogue, so a wedding can never
    // have two outstanding links to two different households.
    if (this.data.transfers.some((t) => t.catalogueId === transfer.catalogueId && !t.claimedAt)) {
      throw new ApiError('VALIDATION_FAILED', 'A handover is already in progress for this catalogue')
    }
    this.data.transfers.push(this.clone(transfer))
    this.touched()
    return this.clone(transfer)
  }

  async getTransferByTokenHash(hash: string): Promise<Transfer | null> {
    return this.clone(this.data.transfers.find((t) => t.tokenHash === hash) ?? null)
  }

  async getLiveTransferForCatalogue(catalogueId: string): Promise<Transfer | null> {
    return this.clone(
      this.data.transfers.find((t) => t.catalogueId === catalogueId && !t.claimedAt) ?? null,
    )
  }

  async markTransferClaimed(id: string, claimedOrgId: string): Promise<void> {
    const transfer = this.data.transfers.find((t) => t.id === id)
    if (transfer) {
      transfer.claimedAt = new Date().toISOString()
      transfer.claimedOrgId = claimedOrgId
    }
    this.touched()
  }

  async cancelTransfer(id: string): Promise<void> {
    this.data.transfers = this.data.transfers.filter((t) => t.id !== id)
    this.touched()
  }

  async deleteOrg(id: string): Promise<void> {
    this.data.orgs = this.data.orgs.filter((o) => o.id !== id)
    this.touched()
  }

  async getOperatorByEmail(email: string): Promise<Operator | null> {
    const needle = email.trim().toLowerCase()
    return this.clone(this.data.operators.find((o) => o.email.toLowerCase() === needle) ?? null)
  }

  async getOperator(id: string): Promise<Operator | null> {
    return this.clone(this.data.operators.find((o) => o.id === id) ?? null)
  }

  // ── Catalogues ──────────────────────────────────────────────────────────────
  async listCatalogues({ orgId }: CatalogueFilter): Promise<Catalogue[]> {
    return this.clone(
      this.data.catalogues
        .filter((c) => c.orgId === orgId)
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
    )
  }

  async catalogueCounts({ orgId }: CatalogueFilter): Promise<Record<string, CatalogueCounts>> {
    const mine = new Set(this.data.catalogues.filter((c) => c.orgId === orgId).map((c) => c.id))

    const counts: Record<string, CatalogueCounts> = {}
    for (const id of mine) counts[id] = { titles: 0, ready: 0, published: 0, failed: 0, photos: 0 }

    for (const title of this.data.titles) {
      const row = counts[title.catalogueId]
      if (!row) continue
      row.titles += 1
      if (title.status === 'ready') row.ready += 1
      if (title.status === 'failed') row.failed += 1
      if (title.published) row.published += 1
    }

    // Photos hang off albums, so the catalogue is one hop away.
    const albumCatalogue = new Map(this.data.albums.map((a) => [a.id, a.catalogueId]))
    for (const photo of this.data.photos) {
      const row = counts[albumCatalogue.get(photo.albumId) ?? '']
      if (row) row.photos += 1
    }

    return counts
  }

  async catalogueStorageBytes(catalogueId: string): Promise<number> {
    const films = this.data.titles
      .filter((t) => t.catalogueId === catalogueId)
      .reduce((total, t) => total + (t.sizeBytes ?? 0), 0)

    const albumIds = new Set(
      this.data.albums.filter((a) => a.catalogueId === catalogueId).map((a) => a.id),
    )
    const photos = this.data.photos
      .filter((p) => albumIds.has(p.albumId))
      .reduce((total, p) => total + (p.sizeBytes ?? 0), 0)

    return films + photos
  }

  async getCatalogue(id: string, orgId: string): Promise<Catalogue | null> {
    return this.clone(
      this.data.catalogues.find((c) => c.id === id && c.orgId === orgId) ?? null,
    )
  }

  async getCatalogueById(id: string): Promise<Catalogue | null> {
    return this.clone(this.data.catalogues.find((c) => c.id === id) ?? null)
  }

  async getCatalogueBySlug(slug: string): Promise<Catalogue | null> {
    return this.clone(this.data.catalogues.find((c) => c.slug === slug) ?? null)
  }

  async getCatalogueByCustomDomain(host: string): Promise<Catalogue | null> {
    return this.clone(this.data.catalogues.find((c) => c.customDomain === host) ?? null)
  }

  async slugAvailable(slug: string): Promise<boolean> {
    return !this.data.catalogues.some((c) => c.slug === slug)
  }

  async createCatalogue(catalogue: Catalogue): Promise<Catalogue> {
    if (!(await this.slugAvailable(catalogue.slug))) {
      throw new ApiError('VALIDATION_FAILED', 'That address is taken', {
        fields: { slug: 'That address is already in use' },
      })
    }
    this.data.catalogues.push(this.clone(catalogue))
    this.touched()
    return this.clone(catalogue)
  }

  async updateCatalogue(
    id: string,
    orgId: string,
    patch: Partial<Omit<Catalogue, 'id' | 'orgId'>>,
  ): Promise<Catalogue> {
    const index = this.data.catalogues.findIndex((c) => c.id === id && c.orgId === orgId)
    if (index === -1) throw new ApiError('NOT_FOUND', 'Catalogue not found')
    const next = { ...this.data.catalogues[index]!, ...this.clone(patch) }
    this.data.catalogues[index] = next
    this.touched()
    return this.clone(next)
  }

  async transferCatalogue(id: string, fromOrgId: string, toOrgId: string): Promise<Catalogue> {
    const index = this.data.catalogues.findIndex((c) => c.id === id && c.orgId === fromOrgId)
    if (index === -1) throw new ApiError('NOT_FOUND', 'Catalogue not found')
    const next = { ...this.data.catalogues[index]!, orgId: toOrgId }
    this.data.catalogues[index] = next
    this.touched()
    return this.clone(next)
  }

  async deleteCatalogue(id: string, orgId: string): Promise<void> {
    const owned = this.data.catalogues.find((c) => c.id === id && c.orgId === orgId)
    if (!owned) throw new ApiError('NOT_FOUND', 'Catalogue not found')

    const titleIds = new Set(this.data.titles.filter((t) => t.catalogueId === id).map((t) => t.id))
    const albumIds = new Set(this.data.albums.filter((a) => a.catalogueId === id).map((a) => a.id))
    const profileIds = new Set(this.data.profiles.filter((p) => p.catalogueId === id).map((p) => p.id))

    // Mirrors the `on delete cascade` chain in Postgres, so both drivers leave the same shape.
    this.data.catalogues = this.data.catalogues.filter((c) => c.id !== id)
    this.data.titles = this.data.titles.filter((t) => !titleIds.has(t.id))
    this.data.photos = this.data.photos.filter((p) => !albumIds.has(p.albumId))
    this.data.albums = this.data.albums.filter((a) => !albumIds.has(a.id))
    this.data.profiles = this.data.profiles.filter((p) => !profileIds.has(p.id))
    this.data.progress = this.data.progress.filter((p) => !profileIds.has(p.profileId))
    this.data.moduleStates = this.data.moduleStates.filter((m) => !profileIds.has(m.profileId))
    this.data.playEvents = this.data.playEvents.filter((e) => e.catalogueId !== id)
    this.data.usage = this.data.usage.filter((u) => u.catalogueId !== id)
    this.touched()
  }

  // ── Titles ──────────────────────────────────────────────────────────────────
  async listTitles(catalogueId: string, options?: { publishedOnly?: boolean }): Promise<Title[]> {
    return this.clone(
      this.data.titles
        .filter((t) => t.catalogueId === catalogueId)
        .filter((t) => !options?.publishedOnly || (t.published && t.status === 'ready'))
        .sort((a, b) => a.sortOrder - b.sortOrder || a.createdAt.localeCompare(b.createdAt)),
    )
  }

  async getTitle(id: string): Promise<Title | null> {
    return this.clone(this.data.titles.find((t) => t.id === id) ?? null)
  }

  async getTitleBySlug(catalogueId: string, slug: string): Promise<Title | null> {
    return this.clone(
      this.data.titles.find((t) => t.catalogueId === catalogueId && t.slug === slug) ?? null,
    )
  }

  async getTitleByProviderId(providerId: string): Promise<Title | null> {
    return this.clone(this.data.titles.find((t) => t.providerId === providerId) ?? null)
  }

  async createTitle(input: CreateTitleInput): Promise<Title> {
    const title: Title = {
      createdAt: new Date().toISOString(),
      publishedAt: null,
      viewCount: 0,
      watchSeconds: 0,
      ...input,
    }
    this.data.titles.push(this.clone(title))
    this.touched()
    return this.clone(title)
  }

  async updateTitle(id: string, patch: Partial<Omit<Title, 'id' | 'catalogueId'>>): Promise<Title> {
    const index = this.data.titles.findIndex((t) => t.id === id)
    if (index === -1) throw new ApiError('NOT_FOUND', 'Title not found')
    const next = { ...this.data.titles[index]!, ...this.clone(patch) }
    this.data.titles[index] = next
    this.touched()
    return this.clone(next)
  }

  /** `${subject}:${id}` so films and photographs share one map without colliding. */
  private static likeKey(subject: LikeSubject, subjectId: string): string {
    return `${subject}:${subjectId}`
  }

  async toggleLike(
    catalogueId: string,
    guestKey: string,
    subject: LikeSubject,
    subjectId: string,
  ): Promise<{ liked: boolean; count: number }> {
    const mine = (row: Snapshot['likes'][number]) =>
      row.catalogueId === catalogueId &&
      row.guestKey === guestKey &&
      row.subject === subject &&
      row.subjectId === subjectId

    const existing = this.data.likes.findIndex(mine)
    if (existing === -1) this.data.likes.push({ catalogueId, guestKey, subject, subjectId })
    else this.data.likes.splice(existing, 1)
    this.touched()

    const count = this.data.likes.filter(
      (row) =>
        row.catalogueId === catalogueId && row.subject === subject && row.subjectId === subjectId,
    ).length
    return { liked: existing === -1, count }
  }

  async listLikes(
    catalogueId: string,
    guestKey: string | null,
  ): Promise<{ counts: LikeCounts; mine: string[] }> {
    const counts: LikeCounts = {}
    const mine: string[] = []
    for (const row of this.data.likes) {
      if (row.catalogueId !== catalogueId) continue
      const key = MemoryRepository.likeKey(row.subject, row.subjectId)
      counts[key] = (counts[key] ?? 0) + 1
      if (guestKey && row.guestKey === guestKey) mine.push(key)
    }
    return { counts, mine }
  }

  async enqueueNotification(notification: Notification): Promise<Notification> {
    this.data.notifications.push(this.clone(notification))
    this.touched()
    return this.clone(notification)
  }

  async listQueuedNotifications(limit: number): Promise<Notification[]> {
    return this.clone(
      this.data.notifications
        .filter((n) => n.status === 'queued')
        .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
        .slice(0, limit),
    )
  }

  async markNotification(
    id: string,
    patch: Pick<Notification, 'status' | 'provider' | 'providerId' | 'error'> & { attempts: number },
  ): Promise<void> {
    const index = this.data.notifications.findIndex((n) => n.id === id)
    if (index === -1) return
    this.data.notifications[index] = {
      ...this.data.notifications[index]!,
      ...patch,
      sentAt: patch.status === 'sent' ? new Date().toISOString() : null,
    }
    this.touched()
  }

  async updatePhoto(id: string, patch: Pick<Photo, 'caption'>): Promise<Photo> {
    const index = this.data.photos.findIndex((p) => p.id === id)
    if (index === -1) throw new ApiError('NOT_FOUND', 'Photograph not found')
    const next = { ...this.data.photos[index]!, ...this.clone(patch) }
    this.data.photos[index] = next
    this.touched()
    return this.clone(next)
  }

  async deleteTitle(id: string): Promise<void> {
    this.data.titles = this.data.titles.filter((t) => t.id !== id)
    this.data.progress = this.data.progress.filter((p) => p.titleId !== id)
    this.touched()
  }

  async reorderTitles(catalogueId: string, order: { id: string; sortOrder: number }[]): Promise<void> {
    for (const { id, sortOrder } of order) {
      const title = this.data.titles.find((t) => t.id === id && t.catalogueId === catalogueId)
      if (title) title.sortOrder = sortOrder
    }
    this.touched()
  }

  // ── Albums & photos ─────────────────────────────────────────────────────────
  async listAlbums(catalogueId: string): Promise<Album[]> {
    return this.clone(this.data.albums.filter((a) => a.catalogueId === catalogueId))
  }

  async listPhotos(albumId: string): Promise<Photo[]> {
    return this.clone(
      this.data.photos.filter((p) => p.albumId === albumId).sort((a, b) => a.sortOrder - b.sortOrder),
    )
  }

  async listPhotosForCatalogue(catalogueId: string): Promise<Photo[]> {
    const albumIds = new Set(
      this.data.albums.filter((a) => a.catalogueId === catalogueId).map((a) => a.id),
    )
    return this.clone(
      this.data.photos
        .filter((p) => albumIds.has(p.albumId))
        .sort((a, b) => a.sortOrder - b.sortOrder),
    )
  }

  async getAlbum(id: string): Promise<Album | null> {
    return this.clone(this.data.albums.find((a) => a.id === id) ?? null)
  }

  async createAlbum(album: Album): Promise<Album> {
    this.data.albums.push(this.clone(album))
    this.touched()
    return this.clone(album)
  }

  async createPhoto(photo: Photo): Promise<Photo> {
    this.data.photos.push(this.clone(photo))
    this.touched()
    return this.clone(photo)
  }

  // ── Guests ──────────────────────────────────────────────────────────────────
  async getPhoto(id: string): Promise<Photo | null> {
    return this.clone(this.data.photos.find((p) => p.id === id) ?? null)
  }

  async deletePhoto(id: string): Promise<void> {
    this.data.photos = this.data.photos.filter((p) => p.id !== id)
  }

  async createProfile(profile: Profile): Promise<Profile> {
    this.data.profiles.push(this.clone(profile))
    this.touched()
    return this.clone(profile)
  }

  async getProfile(id: string): Promise<Profile | null> {
    return this.clone(this.data.profiles.find((p) => p.id === id) ?? null)
  }

  async upsertProgress(progress: PlaybackProgress): Promise<void> {
    const index = this.data.progress.findIndex(
      (p) => p.profileId === progress.profileId && p.titleId === progress.titleId,
    )
    if (index === -1) this.data.progress.push(this.clone(progress))
    else this.data.progress[index] = this.clone(progress)
    this.touched()
  }

  async getProgress(profileId: string, titleId: string): Promise<PlaybackProgress | null> {
    return this.clone(
      this.data.progress.find((p) => p.profileId === profileId && p.titleId === titleId) ?? null,
    )
  }

  async listProgress(profileId: string): Promise<PlaybackProgress[]> {
    return this.clone(this.data.progress.filter((p) => p.profileId === profileId))
  }

  async upsertModuleState(state: ModuleState): Promise<void> {
    const index = this.data.moduleStates.findIndex(
      (s) => s.profileId === state.profileId && s.moduleId === state.moduleId,
    )
    if (index === -1) this.data.moduleStates.push(this.clone(state))
    else this.data.moduleStates[index] = this.clone(state)
    this.touched()
  }

  async getModuleState(profileId: string, moduleId: string): Promise<ModuleState | null> {
    return this.clone(
      this.data.moduleStates.find((s) => s.profileId === profileId && s.moduleId === moduleId) ??
        null,
    )
  }

  // ── Ops ─────────────────────────────────────────────────────────────────────
  async recordPlayEvent(event: {
    catalogueId: string
    titleId: string
    profileId: string | null
    seconds: number
  }): Promise<void> {
    this.data.playEvents.push({ id: randomUUID(), at: new Date().toISOString(), ...event })

    const title = this.data.titles.find((t) => t.id === event.titleId)
    if (title) title.watchSeconds += event.seconds
    this.touched()
  }

  async listAllCatalogues(): Promise<Catalogue[]> {
    return this.clone(this.data.catalogues)
  }

  async upsertUsage(usage: {
    catalogueId: string
    month: string
    storedGb: number
    deliveredGb: number
  }): Promise<void> {
    this.data.usage ??= []
    const index = this.data.usage.findIndex(
      (u) => u.catalogueId === usage.catalogueId && u.month === usage.month,
    )
    if (index === -1) this.data.usage.push(this.clone(usage))
    else this.data.usage[index] = this.clone(usage)
    this.touched()
  }

  async listUsage(catalogueId: string) {
    return this.clone((this.data.usage ?? []).filter((u) => u.catalogueId === catalogueId))
  }

  async listStalledTitles(olderThanMinutes: number): Promise<Title[]> {
    const cutoff = Date.now() - olderThanMinutes * 60_000
    return this.clone(
      this.data.titles.filter(
        // `uploading` counts too — see the note in SupabaseRepository.listStalledTitles.
        (t) =>
          (t.status === 'processing' || t.status === 'uploading') &&
          Date.parse(t.createdAt) < cutoff,
      ),
    )
  }
}
