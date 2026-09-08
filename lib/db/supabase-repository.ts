import 'server-only'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { env } from '@/lib/env'
import { ApiError } from '@/lib/http/errors'
import { log } from '@/lib/log'
import type {
  Album,
  LikeCounts,
  LikeSubject,
  Notification,
  Transfer,
  Catalogue,
  ModuleState,
  Operator,
  OrgStatus,
  PlatformAudit,
  Org,
  PlatformAdmin,
  PlaybackProgress,
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

/* eslint-disable @typescript-eslint/no-explicit-any -- Supabase rows are untyped JSON at this
   boundary; every row is narrowed by an explicit mapper immediately below. */
type Row = Record<string, any>

/**
 * Postgres implementation of `Repository` (doc 06).
 *
 * Runs with the service-role key, which is why it is `server-only`: the key must never be
 * reachable from a browser bundle (doc 10 §5). RLS still exists and is still the enforcement
 * boundary for anything the anon key touches — this class carries the *second* layer, scoping
 * every operator query by `org_id` taken from the session rather than from the request.
 */

/**
 * `Title` field → column. **Exported so a test can hold it to the schema.**
 *
 * `size_bytes` was missing here for the entire life of migration 0007. Writes dropped it
 * silently, reads returned it, and `catalogueStorageBytes` summed a column nothing ever wrote —
 * so every catalogue in production reported **0 GB** and the storage cap never once refused an
 * upload. A partner on a 20 GB plan could have uploaded two hundred.
 *
 * Nothing caught it, and could not have: the memory driver stores whole objects, so it is
 * structurally incapable of losing a column, and every unit test runs against the memory driver.
 * `tests/unit/supabase-mapping.test.ts` compares this map against the schema, which is the only
 * shape of test that would have.
 */
export const TITLE_COLUMNS: Record<string, string> = {
  id: 'id',
  catalogueId: 'catalogue_id',
  slug: 'slug',
  name: 'name',
  synopsis: 'synopsis',
  category: 'category',
  credits: 'credits',
  provider: 'provider',
  providerId: 'provider_id',
  durationS: 'duration_s',
  posterUrl: 'poster_url',
  posterCandidates: 'poster_candidates',
  posterSource: 'poster_source',
  thumbnailsUrl: 'thumbnails_url',
  trailerUrl: 'trailer_url',
  captions: 'captions',
  status: 'status',
  errorMessage: 'error_message',
  published: 'published',
  liveAt: 'live_at',
  sizeBytes: 'size_bytes',
  sortOrder: 'sort_order',
  publishedAt: 'published_at',
  createdAt: 'created_at',
  viewCount: 'view_count',
  watchSeconds: 'watch_seconds',
}

/** `Photo` field → column. `createPhoto` hand-listed its columns and omitted `size_bytes` too. */
export const PHOTO_COLUMNS: Record<string, string> = {
  id: 'id',
  albumId: 'album_id',
  url: 'url',
  lqip: 'lqip',
  caption: 'caption',
  width: 'width',
  height: 'height',
  sizeBytes: 'size_bytes',
  sortOrder: 'sort_order',
  liveAt: 'live_at',
}

/** `Notification` field → column, held to the schema by `tests/unit/supabase-mapping.test.ts`. */
export const NOTIFICATION_COLUMNS: Record<string, string> = {
  id: 'id',
  template: 'template',
  channel: 'channel',
  address: 'address',
  locale: 'locale',
  subject: 'subject',
  bodyText: 'body_text',
  bodyHtml: 'body_html',
  orgId: 'org_id',
  catalogueId: 'catalogue_id',
  status: 'status',
  provider: 'provider',
  providerId: 'provider_id',
  error: 'error',
  attempts: 'attempts',
  dedupeKey: 'dedupe_key',
  createdAt: 'created_at',
  sentAt: 'sent_at',
}

export class SupabaseRepository implements Repository {
  private readonly db: SupabaseClient

  constructor(client?: SupabaseClient) {
    this.db =
      client ??
      createClient(env.NEXT_PUBLIC_SUPABASE_URL!, env.SUPABASE_SERVICE_ROLE_KEY!, {
        auth: { persistSession: false, autoRefreshToken: false },
      })
  }

  private static unwrap<T>(result: { data: T | null; error: { message: string } | null }): T {
    if (result.error) throw new ApiError('INTERNAL', result.error.message)
    if (result.data === null) throw new ApiError('NOT_FOUND', 'Row not found')
    return result.data
  }

  // ── Mappers ─────────────────────────────────────────────────────────────────
  private static toOrg(r: Row): Org {
    return {
      id: r.id,
      name: r.name,
      slug: r.slug,
      kind: r.kind ?? 'partner',
      // Defaulted rather than required: 0010 adds the column, and a row read by an older
      // deployment mid-rollout has no `status` to report.
      status: r.status ?? 'active',
      locale: r.locale ?? 'en',
      branding: r.branding ?? {},
      createdAt: r.created_at,
    }
  }

  private static toPlatformAudit(r: Row): PlatformAudit {
    return {
      id: r.id,
      actorId: r.actor_id,
      actorEmail: r.actor_email,
      action: r.action,
      orgId: r.org_id ?? null,
      orgSlug: r.org_slug ?? null,
      detail: r.detail ?? {},
      createdAt: r.created_at,
    }
  }

  private static toOperator(r: Row): Operator {
    return {
      id: r.id,
      orgId: r.org_id,
      email: r.email,
      name: r.name,
      role: r.role,
      passwordHash: r.password_hash ?? '',
      createdAt: r.created_at,
    }
  }

  private static toCatalogue(r: Row): Catalogue {
    return {
      id: r.id,
      orgId: r.org_id,
      slug: r.slug,
      customDomain: r.custom_domain,
      originOrgId: r.origin_org_id ?? null,
      coupleName: r.couple_name,
      appName: r.app_name,
      weddingDate: r.wedding_date,
      city: r.city ?? undefined,
      synopsis: r.synopsis ?? undefined,
      occasion: r.occasion,
      branding: r.branding ?? {},
      featuredTitleId: r.featured_title_id,
      modules: r.modules ?? [],
      draftModules: r.draft_modules,
      // Defaulted: 0011 adds the column, and a row read mid-rollout has no value for it.
      draftBranding: r.draft_branding ?? null,
      // Defaulted: 0013 adds the column, and a row read mid-rollout has no value for it.
      locale: r.locale ?? 'en',
      template: r.template,
      status: r.status,
      privacy: r.privacy,
      passcodeHash: r.passcode_hash,
      includedUntil: r.included_until,
      subStatus: r.sub_status,
      subPlan: r.sub_plan,
      subUntil: r.sub_until,
      createdAt: r.created_at,
      publishedAt: r.published_at,
    }
  }

  private static fromCatalogue(c: Partial<Catalogue>): Row {
    const row: Row = {}
    const map: Record<string, string> = {
      id: 'id',
      orgId: 'org_id',
      slug: 'slug',
      customDomain: 'custom_domain',
      originOrgId: 'origin_org_id',
      coupleName: 'couple_name',
      appName: 'app_name',
      weddingDate: 'wedding_date',
      city: 'city',
      synopsis: 'synopsis',
      occasion: 'occasion',
      branding: 'branding',
      featuredTitleId: 'featured_title_id',
      modules: 'modules',
      draftModules: 'draft_modules',
      draftBranding: 'draft_branding',
      locale: 'locale',
      template: 'template',
      status: 'status',
      privacy: 'privacy',
      passcodeHash: 'passcode_hash',
      includedUntil: 'included_until',
      subStatus: 'sub_status',
      subPlan: 'sub_plan',
      subUntil: 'sub_until',
      createdAt: 'created_at',
      publishedAt: 'published_at',
    }
    for (const [key, column] of Object.entries(map)) {
      const value = (c as Row)[key]
      if (value !== undefined) row[column] = value
    }
    return row
  }

  private static toTitle(r: Row): Title {
    return {
      id: r.id,
      sizeBytes: r.size_bytes ?? null,
      // Defaulted: 0012 adds the column, and a row read mid-rollout has no value for it.
      liveAt: r.live_at ?? null,
      catalogueId: r.catalogue_id,
      slug: r.slug,
      name: r.name,
      synopsis: r.synopsis ?? undefined,
      category: r.category,
      credits: r.credits ?? [],
      provider: r.provider,
      providerId: r.provider_id,
      durationS: r.duration_s,
      posterUrl: r.poster_url,
      posterCandidates: r.poster_candidates ?? [],
      posterSource: r.poster_source,
      thumbnailsUrl: r.thumbnails_url,
      trailerUrl: r.trailer_url,
      captions: r.captions ?? [],
      status: r.status,
      errorMessage: r.error_message,
      published: r.published,
      sortOrder: r.sort_order,
      publishedAt: r.published_at,
      createdAt: r.created_at,
      viewCount: r.view_count ?? 0,
      watchSeconds: r.watch_seconds ?? 0,
    }
  }

  private static fromTitle(t: Partial<Title>): Row {
    return SupabaseRepository.project(t as Row, TITLE_COLUMNS)
  }

  /** Built from `PHOTO_COLUMNS` rather than hand-listed, so a new field cannot be forgotten. */
  private static fromPhoto(p: Partial<Photo>): Row {
    return SupabaseRepository.project(p as Row, PHOTO_COLUMNS)
  }

  /** Field → column, skipping anything the caller did not set. */
  private static project(source: Row, columns: Record<string, string>): Row {
    const row: Row = {}
    for (const [key, column] of Object.entries(columns)) {
      const value = source[key]
      if (value !== undefined) row[column] = value
    }
    return row
  }

  private static toPhoto(r: Row): Photo {
    return {
      id: r.id,
      sizeBytes: r.size_bytes ?? null,
      liveAt: r.live_at ?? null,
      albumId: r.album_id,
      url: r.url,
      lqip: r.lqip,
      caption: r.caption ?? undefined,
      width: r.width,
      height: r.height,
      sortOrder: r.sort_order,
    }
  }

  // ── Orgs & operators ────────────────────────────────────────────────────────
  async getOrg(id: string): Promise<Org | null> {
    const { data } = await this.db.from('orgs').select('*').eq('id', id).maybeSingle()
    return data ? SupabaseRepository.toOrg(data) : null
  }

  async getOrgBySlug(slug: string): Promise<Org | null> {
    const { data } = await this.db.from('orgs').select('*').eq('slug', slug).maybeSingle()
    return data ? SupabaseRepository.toOrg(data) : null
  }

  async createOrg(org: Org): Promise<Org> {
    const { data, error } = await this.db
      .from('orgs')
      .insert({ id: org.id, name: org.name, slug: org.slug, kind: org.kind, branding: org.branding })
      .select()
      .single()
    // The unique index on slug is what settles two businesses registering the same name at
    // once; checking first and inserting second would just narrow the window.
    if (error?.code === '23505') {
      throw new ApiError('VALIDATION_FAILED', 'That address is taken', {
        fields: { slug: 'Another business is already using this address' },
      })
    }
    if (error) throw new ApiError('INTERNAL', error.message)
    return SupabaseRepository.toOrg(data)
  }

  async listOrgs(kind?: Org['kind']): Promise<Org[]> {
    let query = this.db.from('orgs').select('*').order('created_at', { ascending: false })
    if (kind) query = query.eq('kind', kind)
    const { data, error } = await query
    if (error) throw new ApiError('INTERNAL', error.message)
    return (data ?? []).map(SupabaseRepository.toOrg)
  }

  async createOperator(operator: Operator): Promise<Operator> {
    const { data, error } = await this.db
      .from('operators')
      .insert({
        id: operator.id,
        org_id: operator.orgId,
        email: operator.email,
        name: operator.name,
        role: operator.role,
        // Null under Supabase Auth: the credential lives there, and this column exists only for
        // the self-hosted path.
        password_hash: operator.passwordHash || null,
      })
      .select()
      .single()
    if (error?.code === '23505') {
      throw new ApiError('VALIDATION_FAILED', 'That email is already registered', {
        fields: { email: 'This address already has an account' },
      })
    }
    if (error) throw new ApiError('INTERNAL', error.message)
    return SupabaseRepository.toOperator(data)
  }

  // ── Transfers ───────────────────────────────────────────────────────────────
  private static toTransfer(r: Row): Transfer {
    return {
      id: r.id,
      catalogueId: r.catalogue_id,
      fromOrgId: r.from_org_id,
      toEmail: r.to_email,
      tokenHash: r.token_hash,
      expiresAt: r.expires_at,
      claimedAt: r.claimed_at,
      claimedOrgId: r.claimed_org_id,
      createdAt: r.created_at,
    }
  }

  async createTransfer(transfer: Transfer): Promise<Transfer> {
    const { data, error } = await this.db
      .from('transfers')
      .insert({
        id: transfer.id,
        catalogue_id: transfer.catalogueId,
        from_org_id: transfer.fromOrgId,
        to_email: transfer.toEmail,
        token_hash: transfer.tokenHash,
        expires_at: transfer.expiresAt,
      })
      .select()
      .single()
    // The partial unique index is what enforces one live handover per catalogue.
    if (error?.code === '23505') {
      throw new ApiError('VALIDATION_FAILED', 'A handover is already in progress for this catalogue')
    }
    if (error) throw new ApiError('INTERNAL', error.message)
    return SupabaseRepository.toTransfer(data)
  }

  async getTransferByTokenHash(hash: string): Promise<Transfer | null> {
    const { data } = await this.db.from('transfers').select('*').eq('token_hash', hash).maybeSingle()
    return data ? SupabaseRepository.toTransfer(data) : null
  }

  async getLiveTransferForCatalogue(catalogueId: string): Promise<Transfer | null> {
    const { data } = await this.db
      .from('transfers')
      .select('*')
      .eq('catalogue_id', catalogueId)
      .is('claimed_at', null)
      .maybeSingle()
    return data ? SupabaseRepository.toTransfer(data) : null
  }

  async markTransferClaimed(id: string, claimedOrgId: string): Promise<void> {
    const { error } = await this.db
      .from('transfers')
      .update({ claimed_at: new Date().toISOString(), claimed_org_id: claimedOrgId })
      .eq('id', id)
    if (error) throw new ApiError('INTERNAL', error.message)
  }

  async cancelTransfer(id: string): Promise<void> {
    const { error } = await this.db.from('transfers').delete().eq('id', id)
    if (error) throw new ApiError('INTERNAL', error.message)
  }

  async deleteOrg(id: string): Promise<void> {
    const { error } = await this.db.from('orgs').delete().eq('id', id)
    if (error) throw new ApiError('INTERNAL', error.message)
  }

  async getOperatorByEmail(email: string): Promise<Operator | null> {
    const { data } = await this.db
      .from('operators')
      .select('*')
      .ilike('email', email.trim())
      .maybeSingle()
    return data ? SupabaseRepository.toOperator(data) : null
  }

  async getOperator(id: string): Promise<Operator | null> {
    const { data } = await this.db.from('operators').select('*').eq('id', id).maybeSingle()
    return data ? SupabaseRepository.toOperator(data) : null
  }

  async listOperators(orgId: string): Promise<Operator[]> {
    const { data, error } = await this.db
      .from('operators')
      .select('*')
      .eq('org_id', orgId)
      .order('email')
    if (error) throw new ApiError('INTERNAL', error.message)
    return (data ?? []).map(SupabaseRepository.toOperator)
  }

  async setOrgStatus(orgId: string, status: OrgStatus): Promise<Org> {
    const data = SupabaseRepository.unwrap<Row>(
      await this.db.from('orgs').update({ status }).eq('id', orgId).select('*').maybeSingle(),
    )
    return SupabaseRepository.toOrg(data)
  }

  async getOperatorWithOrgStatus(
    id: string,
  ): Promise<{ operator: Operator; orgStatus: OrgStatus } | null> {
    // One round trip, not two. PostgREST embeds the parent row through the foreign key, which is
    // what makes checking suspension on every authenticated request affordable.
    const { data } = await this.db
      .from('operators')
      .select('*, orgs!inner(status)')
      .eq('id', id)
      .maybeSingle()
    if (!data) return null
    const org = data.orgs as { status?: string } | null
    return {
      operator: SupabaseRepository.toOperator(data),
      orgStatus: org?.status === 'suspended' ? 'suspended' : 'active',
    }
  }

  async publishCatalogueContent(
    catalogueId: string,
  ): Promise<{ published: number; withdrawn: number }> {
    const at = new Date().toISOString()

    // Films the operator has ticked, that have finished encoding, and are not live yet.
    const { data: promoted, error: promoteError } = await this.db
      .from('titles')
      .update({ live_at: at })
      .eq('catalogue_id', catalogueId)
      .eq('published', true)
      .eq('status', 'ready')
      .is('live_at', null)
      .select('id')
    if (promoteError) throw new ApiError('INTERNAL', promoteError.message)

    /**
     * And the reverse: a film the operator has un-ticked, or one that has stopped being `ready`,
     * loses its place at the next Publish. Withdrawal waits too — a takedown that arrives with
     * everything else is the rule; anything urgent unpublishes the catalogue.
     */
    const { data: withdrawnTitles, error: withdrawError } = await this.db
      .from('titles')
      .update({ live_at: null })
      .eq('catalogue_id', catalogueId)
      .not('live_at', 'is', null)
      .or('published.eq.false,status.neq.ready')
      .select('id')
    if (withdrawError) throw new ApiError('INTERNAL', withdrawError.message)

    const albumIds = await this.albumIdsFor(catalogueId)
    let photos: { id: string }[] = []
    if (albumIds.length > 0) {
      const { data, error } = await this.db
        .from('photos')
        .update({ live_at: at })
        .in('album_id', albumIds)
        .is('live_at', null)
        .select('id')
      if (error) throw new ApiError('INTERNAL', error.message)
      photos = data ?? []
    }

    return {
      published: (promoted?.length ?? 0) + photos.length,
      withdrawn: withdrawnTitles?.length ?? 0,
    }
  }

  async countPendingContent(catalogueId: string): Promise<{ titles: number; photos: number }> {
    // Two shapes of pending film: ready-and-ticked but not live, and live but no longer either.
    const [waiting, leaving] = await Promise.all([
      this.db
        .from('titles')
        .select('id', { count: 'exact', head: true })
        .eq('catalogue_id', catalogueId)
        .eq('published', true)
        .eq('status', 'ready')
        .is('live_at', null),
      this.db
        .from('titles')
        .select('id', { count: 'exact', head: true })
        .eq('catalogue_id', catalogueId)
        .not('live_at', 'is', null)
        .or('published.eq.false,status.neq.ready'),
    ])

    const albumIds = await this.albumIdsFor(catalogueId)
    let photos = 0
    if (albumIds.length > 0) {
      const { count } = await this.db
        .from('photos')
        .select('id', { count: 'exact', head: true })
        .in('album_id', albumIds)
        .is('live_at', null)
      photos = count ?? 0
    }

    return { titles: (waiting.count ?? 0) + (leaving.count ?? 0), photos }
  }

  private async albumIdsFor(catalogueId: string): Promise<string[]> {
    const { data, error } = await this.db
      .from('albums')
      .select('id')
      .eq('catalogue_id', catalogueId)
    if (error) throw new ApiError('INTERNAL', error.message)
    return (data ?? []).map((a) => a.id as string)
  }

  async countNotificationsSince(template: string, sinceIso: string): Promise<number> {
    // `head: true` asks Postgres for the count and none of the rows.
    const { count, error } = await this.db
      .from('notifications')
      .select('id', { count: 'exact', head: true })
      .eq('template', template)
      .gte('created_at', sinceIso)
    if (error) throw new ApiError('INTERNAL', error.message)
    return count ?? 0
  }

  // ── Platform audit (N-27) ───────────────────────────────────────────────────
  async recordPlatformAudit(entry: PlatformAudit): Promise<PlatformAudit> {
    const data = SupabaseRepository.unwrap<Row>(
      await this.db
        .from('platform_audit')
        .insert({
          id: entry.id,
          actor_id: entry.actorId,
          actor_email: entry.actorEmail,
          action: entry.action,
          org_id: entry.orgId,
          org_slug: entry.orgSlug,
          detail: entry.detail,
          created_at: entry.createdAt,
        })
        .select('*')
        .single(),
    )
    return SupabaseRepository.toPlatformAudit(data)
  }

  async listPlatformAudit(options?: { orgId?: string; limit?: number }): Promise<PlatformAudit[]> {
    let query = this.db
      .from('platform_audit')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(options?.limit ?? 50)
    if (options?.orgId) query = query.eq('org_id', options.orgId)
    const { data, error } = await query
    if (error) throw new ApiError('INTERNAL', error.message)
    return (data ?? []).map(SupabaseRepository.toPlatformAudit)
  }

  // ── Catalogues ──────────────────────────────────────────────────────────────
  async listCatalogues({ orgId }: CatalogueFilter): Promise<Catalogue[]> {
    const { data, error } = await this.db
      .from('catalogues')
      .select('*')
      .eq('org_id', orgId)
      .order('created_at', { ascending: false })
    if (error) throw new ApiError('INTERNAL', error.message)
    return (data ?? []).map(SupabaseRepository.toCatalogue)
  }

  /**
   * Four queries regardless of how many weddings the org has, rather than two per wedding.
   *
   * Only the columns being counted are selected — the point is to avoid dragging every title
   * and photo row across the wire to arrive at five integers.
   */
  async catalogueCounts({ orgId }: CatalogueFilter): Promise<Record<string, CatalogueCounts>> {
    const { data: catalogues, error } = await this.db
      .from('catalogues')
      .select('id')
      .eq('org_id', orgId)
    if (error) throw new ApiError('INTERNAL', error.message)

    const ids = (catalogues ?? []).map((row: Row) => row.id as string)
    const counts: Record<string, CatalogueCounts> = {}
    for (const id of ids) counts[id] = { titles: 0, ready: 0, published: 0, failed: 0, photos: 0 }
    if (ids.length === 0) return counts

    const { data: titles } = await this.db
      .from('titles')
      .select('catalogue_id, status, published')
      .in('catalogue_id', ids)

    for (const row of (titles ?? []) as Row[]) {
      const entry = counts[row.catalogue_id as string]
      if (!entry) continue
      entry.titles += 1
      if (row.status === 'ready') entry.ready += 1
      if (row.status === 'failed') entry.failed += 1
      if (row.published) entry.published += 1
    }

    // Photos belong to albums, albums to catalogues. Resolved with two flat queries rather than
    // an embedded filter, so the shape of the result does not depend on join syntax.
    const { data: albums } = await this.db
      .from('albums')
      .select('id, catalogue_id')
      .in('catalogue_id', ids)

    const albumCatalogue = new Map(
      ((albums ?? []) as Row[]).map((row) => [row.id as string, row.catalogue_id as string]),
    )

    if (albumCatalogue.size > 0) {
      const { data: photos } = await this.db
        .from('photos')
        .select('album_id')
        .in('album_id', [...albumCatalogue.keys()])

      for (const row of (photos ?? []) as Row[]) {
        const entry = counts[albumCatalogue.get(row.album_id as string) ?? '']
        if (entry) entry.photos += 1
      }
    }

    return counts
  }

  // ── Platform admin ──────────────────────────────────────────────────────────
  async getPlatformAdmin(id: string): Promise<PlatformAdmin | null> {
    const { data } = await this.db.from('platform_admins').select('*').eq('id', id).maybeSingle()
    if (!data) return null
    return { id: data.id, email: data.email, name: data.name, createdAt: data.created_at }
  }

  async catalogueCountsByOrg(): Promise<Record<string, number>> {
    const [{ data: orgs }, { data: catalogues }] = await Promise.all([
      this.db.from('orgs').select('id'),
      this.db.from('catalogues').select('org_id'),
    ])

    const counts: Record<string, number> = {}
    for (const row of (orgs ?? []) as Row[]) counts[row.id as string] = 0
    for (const row of (catalogues ?? []) as Row[]) {
      const id = row.org_id as string
      counts[id] = (counts[id] ?? 0) + 1
    }
    return counts
  }

  /**
   * Both grants in one round trip, and **failing toward the low cap**.
   *
   * A lookup error resolves to no entitlement, which `resolveLimits` turns into the defaults —
   * the most restrictive answer. That is deliberate: this table does not exist until migration
   * 0006 is applied, and the alternative failure mode is a deploy where every quota check throws
   * and nobody can upload. Erring toward "you have the free tier" is recoverable; erring toward
   * "unlimited" is a bill.
   */
  async getEntitlements(
    catalogueId: string,
    orgId: string,
  ): Promise<{ catalogue: Entitlement | null; org: Entitlement | null }> {
    const { data, error } = await this.db
      .from('entitlements')
      .select('*')
      .or(`catalogue_id.eq.${catalogueId},org_id.eq.${orgId}`)

    if (error) {
      log.warn('entitlements: falling back to defaults', { message: error.message })
      return { catalogue: null, org: null }
    }

    const rows = (data ?? []) as Row[]
    return {
      catalogue: SupabaseRepository.toEntitlement(rows.find((r) => r.catalogue_id === catalogueId)),
      org: SupabaseRepository.toEntitlement(rows.find((r) => r.org_id === orgId)),
    }
  }

  private static toEntitlement(row: Row | undefined): Entitlement | null {
    if (!row) return null
    return {
      id: row.id,
      orgId: row.org_id ?? null,
      catalogueId: row.catalogue_id ?? null,
      planId: row.plan_id ?? null,
      maxTitles: row.max_titles ?? null,
      maxPhotos: row.max_photos ?? null,
      storageGb: row.storage_gb ?? null,
      validUntil: row.valid_until ?? null,
      createdAt: row.created_at,
    }
  }

  async catalogueStorageBytes(catalogueId: string): Promise<number> {
    const [{ data: titles }, { data: albums }] = await Promise.all([
      this.db.from('titles').select('size_bytes').eq('catalogue_id', catalogueId),
      this.db.from('albums').select('id').eq('catalogue_id', catalogueId),
    ])

    let total = ((titles ?? []) as Row[]).reduce((sum, r) => sum + Number(r.size_bytes ?? 0), 0)

    const albumIds = ((albums ?? []) as Row[]).map((r) => r.id as string)
    if (albumIds.length > 0) {
      const { data: photos } = await this.db
        .from('photos')
        .select('size_bytes')
        .in('album_id', albumIds)
      total += ((photos ?? []) as Row[]).reduce((sum, r) => sum + Number(r.size_bytes ?? 0), 0)
    }

    return total
  }

  async getCatalogue(id: string, orgId: string): Promise<Catalogue | null> {
    const { data } = await this.db
      .from('catalogues')
      .select('*')
      .eq('id', id)
      .eq('org_id', orgId)
      .maybeSingle()
    return data ? SupabaseRepository.toCatalogue(data) : null
  }

  async getCatalogueById(id: string): Promise<Catalogue | null> {
    const { data } = await this.db.from('catalogues').select('*').eq('id', id).maybeSingle()
    return data ? SupabaseRepository.toCatalogue(data) : null
  }

  async getCatalogueBySlug(slug: string): Promise<Catalogue | null> {
    const { data } = await this.db.from('catalogues').select('*').eq('slug', slug).maybeSingle()
    return data ? SupabaseRepository.toCatalogue(data) : null
  }

  async getCatalogueByCustomDomain(host: string): Promise<Catalogue | null> {
    const { data } = await this.db
      .from('catalogues')
      .select('*')
      .eq('custom_domain', host)
      .maybeSingle()
    return data ? SupabaseRepository.toCatalogue(data) : null
  }

  async slugAvailable(slug: string): Promise<boolean> {
    const { count } = await this.db
      .from('catalogues')
      .select('id', { count: 'exact', head: true })
      .eq('slug', slug)
    return (count ?? 0) === 0
  }

  async createCatalogue(catalogue: Catalogue): Promise<Catalogue> {
    const result = await this.db
      .from('catalogues')
      .insert(SupabaseRepository.fromCatalogue(catalogue))
      .select()
      .single()
    if (result.error?.code === '23505') {
      throw new ApiError('VALIDATION_FAILED', 'That address is taken', {
        fields: { slug: 'That address is already in use' },
      })
    }
    return SupabaseRepository.toCatalogue(SupabaseRepository.unwrap(result))
  }

  async updateCatalogue(
    id: string,
    orgId: string,
    patch: Partial<Omit<Catalogue, 'id' | 'orgId'>>,
  ): Promise<Catalogue> {
    const result = await this.db
      .from('catalogues')
      .update(SupabaseRepository.fromCatalogue(patch))
      .eq('id', id)
      .eq('org_id', orgId)
      .select()
      .single()
    return SupabaseRepository.toCatalogue(SupabaseRepository.unwrap(result))
  }

  // ── Titles ──────────────────────────────────────────────────────────────────
  async listTitles(catalogueId: string, options?: { publishedOnly?: boolean }): Promise<Title[]> {
    let query = this.db.from('titles').select('*').eq('catalogue_id', catalogueId)
    if (options?.publishedOnly) query = query.eq('published', true).eq('status', 'ready')
    const { data, error } = await query.order('sort_order', { ascending: true })
    if (error) throw new ApiError('INTERNAL', error.message)
    return (data ?? []).map(SupabaseRepository.toTitle)
  }

  async getTitle(id: string): Promise<Title | null> {
    const { data } = await this.db.from('titles').select('*').eq('id', id).maybeSingle()
    return data ? SupabaseRepository.toTitle(data) : null
  }

  async getTitleBySlug(catalogueId: string, slug: string): Promise<Title | null> {
    const { data } = await this.db
      .from('titles')
      .select('*')
      .eq('catalogue_id', catalogueId)
      .eq('slug', slug)
      .maybeSingle()
    return data ? SupabaseRepository.toTitle(data) : null
  }

  async getTitleByProviderId(providerId: string): Promise<Title | null> {
    const { data } = await this.db
      .from('titles')
      .select('*')
      .eq('provider_id', providerId)
      .maybeSingle()
    return data ? SupabaseRepository.toTitle(data) : null
  }

  async createTitle(input: CreateTitleInput): Promise<Title> {
    const result = await this.db
      .from('titles')
      .insert(SupabaseRepository.fromTitle(input as Partial<Title>))
      .select()
      .single()
    return SupabaseRepository.toTitle(SupabaseRepository.unwrap(result))
  }

  async updateTitle(id: string, patch: Partial<Omit<Title, 'id' | 'catalogueId'>>): Promise<Title> {
    const result = await this.db
      .from('titles')
      .update(SupabaseRepository.fromTitle(patch))
      .eq('id', id)
      .select()
      .single()
    return SupabaseRepository.toTitle(SupabaseRepository.unwrap(result))
  }

  async toggleLike(
    catalogueId: string,
    guestKey: string,
    subject: LikeSubject,
    subjectId: string,
  ): Promise<{ liked: boolean; count: number }> {
    const match = this.db
      .from('likes')
      .select('guest_key', { count: 'exact', head: true })
      .eq('catalogue_id', catalogueId)
      .eq('guest_key', guestKey)
      .eq('subject_type', subject)
      .eq('subject_id', subjectId)

    const { count: alreadyLiked } = await match
    const liked = (alreadyLiked ?? 0) === 0

    if (liked) {
      // Upsert rather than insert: a double-tap on a flaky connection sends the same row twice,
      // and a primary-key violation is not something a guest should ever be shown.
      const { error } = await this.db.from('likes').upsert(
        {
          catalogue_id: catalogueId,
          guest_key: guestKey,
          subject_type: subject,
          subject_id: subjectId,
        },
        { onConflict: 'catalogue_id,guest_key,subject_type,subject_id' },
      )
      if (error) throw new ApiError('INTERNAL', error.message)
    } else {
      const { error } = await this.db
        .from('likes')
        .delete()
        .eq('catalogue_id', catalogueId)
        .eq('guest_key', guestKey)
        .eq('subject_type', subject)
        .eq('subject_id', subjectId)
      if (error) throw new ApiError('INTERNAL', error.message)
    }

    const { count } = await this.db
      .from('likes')
      .select('guest_key', { count: 'exact', head: true })
      .eq('catalogue_id', catalogueId)
      .eq('subject_type', subject)
      .eq('subject_id', subjectId)

    return { liked, count: count ?? 0 }
  }

  async listLikes(
    catalogueId: string,
    guestKey: string | null,
  ): Promise<{ counts: LikeCounts; mine: string[] }> {
    const { data } = await this.db
      .from('likes')
      .select('guest_key, subject_type, subject_id')
      .eq('catalogue_id', catalogueId)

    const counts: LikeCounts = {}
    const mine: string[] = []
    for (const row of data ?? []) {
      const key = `${row.subject_type}:${row.subject_id}`
      counts[key] = (counts[key] ?? 0) + 1
      if (guestKey && row.guest_key === guestKey) mine.push(key)
    }
    return { counts, mine }
  }

  private static toNotification(r: Row): Notification {
    return {
      id: r.id,
      template: r.template,
      channel: r.channel,
      address: r.address,
      locale: r.locale ?? 'en',
      subject: r.subject,
      bodyText: r.body_text,
      bodyHtml: r.body_html ?? null,
      orgId: r.org_id ?? null,
      catalogueId: r.catalogue_id ?? null,
      status: r.status,
      provider: r.provider ?? null,
      providerId: r.provider_id ?? null,
      error: r.error ?? null,
      attempts: r.attempts ?? 0,
      dedupeKey: r.dedupe_key ?? null,
      createdAt: r.created_at,
      sentAt: r.sent_at ?? null,
    }
  }

  async enqueueNotification(notification: Notification): Promise<Notification | null> {
    const result = await this.db
      .from('notifications')
      .insert(SupabaseRepository.project(notification as Row, NOTIFICATION_COLUMNS))
      .select()
      .single()
    /**
     * 23505 is the unique index on `dedupe_key` (0014) doing its job, not a failure. Two cron runs
     * overlapping is the case this exists for, and the loser should be told "already handled"
     * rather than made to throw — which is why the constraint is in the database and not a
     * read-then-write here that both of them would pass.
     */
    if (result.error?.code === '23505') return null
    return SupabaseRepository.toNotification(SupabaseRepository.unwrap(result))
  }

  async listQueuedNotifications(limit: number): Promise<Notification[]> {
    const { data } = await this.db
      .from('notifications')
      .select('*')
      .eq('status', 'queued')
      .order('created_at', { ascending: true })
      .limit(limit)
    return ((data ?? []) as Row[]).map(SupabaseRepository.toNotification)
  }

  async markNotification(
    id: string,
    patch: Pick<Notification, 'status' | 'provider' | 'providerId' | 'error'> & { attempts: number },
  ): Promise<void> {
    const { error } = await this.db
      .from('notifications')
      .update({
        status: patch.status,
        provider: patch.provider,
        provider_id: patch.providerId,
        error: patch.error,
        attempts: patch.attempts,
        sent_at: patch.status === 'sent' ? new Date().toISOString() : null,
      })
      .eq('id', id)
    if (error) throw new ApiError('INTERNAL', error.message)
  }

  async updatePhoto(id: string, patch: Pick<Photo, 'caption'>): Promise<Photo> {
    const result = await this.db
      .from('photos')
      .update({ caption: patch.caption ?? null })
      .eq('id', id)
      .select()
      .single()
    return SupabaseRepository.toPhoto(SupabaseRepository.unwrap(result))
  }

  async deleteTitle(id: string): Promise<void> {
    const { error } = await this.db.from('titles').delete().eq('id', id)
    if (error) throw new ApiError('INTERNAL', error.message)
  }

  async reorderTitles(
    catalogueId: string,
    order: { id: string; sortOrder: number }[],
  ): Promise<void> {
    // One statement, one transaction — a half-applied reorder is visible to guests.
    const { error } = await this.db.rpc('reorder_titles', {
      p_catalogue_id: catalogueId,
      p_order: order.map((o) => ({ id: o.id, sort_order: o.sortOrder })),
    })
    if (error) throw new ApiError('INTERNAL', error.message)
  }

  // ── Albums & photos ─────────────────────────────────────────────────────────
  async listAlbums(catalogueId: string): Promise<Album[]> {
    const { data } = await this.db.from('albums').select('*').eq('catalogue_id', catalogueId)
    return (data ?? []).map((r: Row) => ({
      id: r.id,
      catalogueId: r.catalogue_id,
      name: r.name,
      createdAt: r.created_at,
    }))
  }

  async listPhotos(albumId: string): Promise<Photo[]> {
    const { data } = await this.db
      .from('photos')
      .select('*')
      .eq('album_id', albumId)
      .order('sort_order')
    return (data ?? []).map(SupabaseRepository.toPhoto)
  }

  async listPhotosForCatalogue(catalogueId: string): Promise<Photo[]> {
    const { data } = await this.db
      .from('photos')
      .select('*, albums!inner(catalogue_id)')
      .eq('albums.catalogue_id', catalogueId)
      .order('sort_order')
    return (data ?? []).map(SupabaseRepository.toPhoto)
  }

  async transferCatalogue(id: string, fromOrgId: string, toOrgId: string): Promise<Catalogue> {
    // `eq('org_id', fromOrgId)` is the safety: this can only move the catalogue the caller
    // already owned, however it was reached.
    const { data, error } = await this.db
      .from('catalogues')
      .update({ org_id: toOrgId })
      .eq('id', id)
      .eq('org_id', fromOrgId)
      .select()
      .single()
    if (error) throw new ApiError('NOT_FOUND', 'Catalogue not found')
    return SupabaseRepository.toCatalogue(data)
  }

  async deleteCatalogue(id: string, orgId: string): Promise<void> {
    // Scoped by org in the statement itself: a delete that trusts a caller to have checked is
    // one refactor away from removing another operator's wedding.
    const { error } = await this.db.from('catalogues').delete().eq('id', id).eq('org_id', orgId)
    if (error) throw new ApiError('INTERNAL', error.message)
  }

  async getAlbum(id: string): Promise<Album | null> {
    const { data } = await this.db.from('albums').select('*').eq('id', id).maybeSingle()
    return data ? { id: data.id, catalogueId: data.catalogue_id, name: data.name, createdAt: data.created_at } : null
  }

  async createAlbum(album: Album): Promise<Album> {
    const result = await this.db
      .from('albums')
      .insert({ id: album.id, catalogue_id: album.catalogueId, name: album.name })
      .select()
      .single()
    const r = SupabaseRepository.unwrap(result)
    return { id: r.id, catalogueId: r.catalogue_id, name: r.name, createdAt: r.created_at }
  }

  async createPhoto(photo: Photo): Promise<Photo> {
    const result = await this.db
      .from('photos')
      .insert(SupabaseRepository.fromPhoto(photo))
      .select()
      .single()
    return SupabaseRepository.toPhoto(SupabaseRepository.unwrap(result))
  }

  // ── Guests ──────────────────────────────────────────────────────────────────

  async getPhoto(id: string): Promise<Photo | null> {
    const { data } = await this.db.from('photos').select('*').eq('id', id).maybeSingle()
    return data ? SupabaseRepository.toPhoto(data) : null
  }

  async deletePhoto(id: string): Promise<void> {
    await this.db.from('photos').delete().eq('id', id)
  }
  async createProfile(profile: Profile): Promise<Profile> {
    const result = await this.db
      .from('profiles')
      .insert({
        id: profile.id,
        catalogue_id: profile.catalogueId,
        label: profile.label,
        avatar_seed: profile.avatarSeed,
      })
      .select()
      .single()
    const r = SupabaseRepository.unwrap(result)
    return {
      id: r.id,
      catalogueId: r.catalogue_id,
      label: r.label,
      avatarSeed: r.avatar_seed,
      createdAt: r.created_at,
    }
  }

  async getProfile(id: string): Promise<Profile | null> {
    const { data } = await this.db.from('profiles').select('*').eq('id', id).maybeSingle()
    if (!data) return null
    return {
      id: data.id,
      catalogueId: data.catalogue_id,
      label: data.label,
      avatarSeed: data.avatar_seed,
      createdAt: data.created_at,
    }
  }

  async upsertProgress(progress: PlaybackProgress): Promise<void> {
    const { error } = await this.db.from('playback_progress').upsert(
      {
        profile_id: progress.profileId,
        title_id: progress.titleId,
        position_s: progress.positionS,
        duration_s: progress.durationS,
        completed: progress.completed,
        updated_at: progress.updatedAt,
      },
      { onConflict: 'profile_id,title_id' },
    )
    if (error) throw new ApiError('INTERNAL', error.message)
  }

  async getProgress(profileId: string, titleId: string): Promise<PlaybackProgress | null> {
    const { data } = await this.db
      .from('playback_progress')
      .select('*')
      .eq('profile_id', profileId)
      .eq('title_id', titleId)
      .maybeSingle()
    if (!data) return null
    return {
      profileId: data.profile_id,
      titleId: data.title_id,
      positionS: data.position_s,
      durationS: data.duration_s,
      completed: data.completed,
      updatedAt: data.updated_at,
    }
  }

  async listProgress(profileId: string): Promise<PlaybackProgress[]> {
    const { data } = await this.db
      .from('playback_progress')
      .select('*')
      .eq('profile_id', profileId)
    return (data ?? []).map((r: Row) => ({
      profileId: r.profile_id,
      titleId: r.title_id,
      positionS: r.position_s,
      durationS: r.duration_s,
      completed: r.completed,
      updatedAt: r.updated_at,
    }))
  }

  async upsertModuleState(state: ModuleState): Promise<void> {
    const { error } = await this.db.from('module_state').upsert(
      {
        profile_id: state.profileId,
        module_id: state.moduleId,
        state: state.state,
        updated_at: state.updatedAt,
      },
      { onConflict: 'profile_id,module_id' },
    )
    if (error) throw new ApiError('INTERNAL', error.message)
  }

  async getModuleState(profileId: string, moduleId: string): Promise<ModuleState | null> {
    const { data } = await this.db
      .from('module_state')
      .select('*')
      .eq('profile_id', profileId)
      .eq('module_id', moduleId)
      .maybeSingle()
    if (!data) return null
    return {
      profileId: data.profile_id,
      moduleId: data.module_id,
      state: data.state,
      updatedAt: data.updated_at,
    }
  }

  // ── Ops ─────────────────────────────────────────────────────────────────────
  async recordPlayEvent(event: {
    catalogueId: string
    titleId: string
    profileId: string | null
    seconds: number
  }): Promise<void> {
    const { error } = await this.db.rpc('record_play_event', {
      p_catalogue_id: event.catalogueId,
      p_title_id: event.titleId,
      p_profile_id: event.profileId,
      p_seconds: event.seconds,
    })
    if (error) throw new ApiError('INTERNAL', error.message)
  }

  async listAllCatalogues(): Promise<Catalogue[]> {
    const { data, error } = await this.db.from('catalogues').select('*')
    if (error) throw new ApiError('INTERNAL', error.message)
    return (data ?? []).map(SupabaseRepository.toCatalogue)
  }

  async upsertUsage(usage: {
    catalogueId: string
    month: string
    storedGb: number
    deliveredGb: number
  }): Promise<void> {
    const { error } = await this.db.from('usage_rollup').upsert(
      {
        catalogue_id: usage.catalogueId,
        month: usage.month,
        stored_gb: usage.storedGb,
        delivered_gb: usage.deliveredGb,
      },
      { onConflict: 'catalogue_id,month' },
    )
    if (error) throw new ApiError('INTERNAL', error.message)
  }

  async listUsage(catalogueId: string) {
    const { data } = await this.db
      .from('usage_rollup')
      .select('*')
      .eq('catalogue_id', catalogueId)
      .order('month', { ascending: false })
    return (data ?? []).map((r: Row) => ({
      catalogueId: r.catalogue_id,
      month: r.month,
      storedGb: Number(r.stored_gb),
      deliveredGb: Number(r.delivered_gb),
    }))
  }

  async listStalledTitles(olderThanMinutes: number): Promise<Title[]> {
    const cutoff = new Date(Date.now() - olderThanMinutes * 60_000).toISOString()
    const { data } = await this.db
      .from('titles')
      .select('*')
      // `uploading` belongs here as much as `processing` does. A title is created `uploading`
      // and it is the webhook that moves it on, so a lost webhook strands it in `uploading` —
      // the exact failure this job exists to catch, and the one it used to be blind to.
      .in('status', ['uploading', 'processing'])
      .lt('created_at', cutoff)
    return (data ?? []).map(SupabaseRepository.toTitle)
  }
}
