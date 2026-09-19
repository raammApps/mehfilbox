import { randomUUID } from 'node:crypto'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

/**
 * The production drivers, against the real services.
 *
 * Everything else in the suite runs on `fake` + `memory`, which is what makes it fast and
 * hermetic — and also means the Bunny and Supabase code paths are otherwise never executed.
 * Doc 09's sequencing rationale is blunt about that being the risk worth retiring first.
 *
 * These skip cleanly when credentials are absent, so CI stays green and offline development is
 * unaffected. They run the moment `.env.local` has real keys:
 *
 *   pnpm test tests/integration
 *
 * Everything created here is torn down in `afterAll`. Nothing touches a catalogue that is not
 * prefixed `itest-`.
 */

const hasBunny = Boolean(
  process.env.BUNNY_API_KEY && process.env.BUNNY_LIBRARY_ID && process.env.BUNNY_CDN_HOSTNAME,
)
const hasSupabase = Boolean(
  process.env.NEXT_PUBLIC_SUPABASE_URL &&
  (process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY),
)

describe.skipIf(!hasBunny)('Bunny Stream, for real', () => {
  const created: string[] = []

  afterAll(async () => {
    if (created.length === 0) return
    const { BunnyProvider } = await import('@/lib/video/bunny')
    const provider = new BunnyProvider()
    for (const id of created) await provider.deleteAsset(id).catch(() => {})
  })

  it('creates an upload and hands back a usable TUS ticket', async () => {
    const { BunnyProvider } = await import('@/lib/video/bunny')
    const provider = new BunnyProvider()

    const ticket = await provider.createUpload({
      title: `itest-${randomUUID().slice(0, 8)}`,
      sizeBytes: 1024 * 1024,
    })
    created.push(ticket.providerId)

    expect(ticket.providerId).toMatch(/^[0-9a-f-]{36}$/i)
    expect(ticket.tusEndpoint).toContain('tusupload')
    // These four are exactly what Bunny validates on the TUS creation request; a missing one
    // fails at 0% with an opaque error, which is the worst possible time to find out.
    expect(ticket.headers.AuthorizationSignature).toMatch(/^[0-9a-f]{64}$/)
    expect(Number(ticket.headers.AuthorizationExpire)).toBeGreaterThan(Date.now() / 1000)
    expect(ticket.headers.VideoId).toBe(ticket.providerId)
    expect(ticket.headers.LibraryId).toBeTruthy()
  })

  it('reports status for an asset that has not been uploaded to yet', async () => {
    const { BunnyProvider } = await import('@/lib/video/bunny')
    const provider = new BunnyProvider()

    const ticket = await provider.createUpload({ title: `itest-status`, sizeBytes: 1024 })
    created.push(ticket.providerId)

    const status = await provider.getStatus(ticket.providerId)
    expect(['uploading', 'processing', 'ready', 'failed']).toContain(status.state)
  })

  it('signs a playback URL against the real CDN hostname', async () => {
    const { BunnyProvider } = await import('@/lib/video/bunny')
    const provider = new BunnyProvider()

    const ticket = await provider.getPlaybackToken({
      providerId: randomUUID(),
      scope: { catalogueId: randomUUID(), titleId: randomUUID() },
      ttlS: 3600,
    })

    const url = new URL(ticket.playbackUrl)
    expect(url.hostname).toBe(process.env.BUNNY_CDN_HOSTNAME)
    expect(url.pathname).toMatch(/\/playlist\.m3u8$/)
    expect(url.searchParams.get('token')).toBeTruthy()
    expect(Number(url.searchParams.get('expires'))).toBeGreaterThan(Date.now() / 1000)
  })

  it('reports an unknown asset as an error rather than inventing a status', async () => {
    const { BunnyProvider } = await import('@/lib/video/bunny')
    const provider = new BunnyProvider()
    await expect(provider.getStatus(randomUUID())).rejects.toThrow()
  })
})

/**
 * Every call here is a network round trip to a remote database, so the default 5s budget is not
 * a meaningful assertion about anything — it just makes the suite flaky. 30s per test.
 */
const REMOTE_TIMEOUT = 30_000

describe.skipIf(!hasSupabase)('Supabase Postgres, for real', () => {
  const createdCatalogues: string[] = []
  let orgId: string

  /**
   * Resolved once, up front, rather than as a side effect of the first test. It used to be
   * assigned inside "has the schema applied", so a timeout there cascaded into three unrelated
   * failures with a misleading message — the tests were coupled through mutable state.
   */
  beforeAll(async () => {
    const { createClient } = await import('@supabase/supabase-js')
    const db = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      (process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY)!,
      { auth: { persistSession: false } },
    )
    const { data, error } = await db.from('orgs').select('id').limit(1)
    if (error) throw new Error(`cannot reach Supabase: ${error.message}`)
    if (!data?.length) throw new Error('no org exists — run `pnpm bootstrap:sql`')
    orgId = data[0]!.id
  }, REMOTE_TIMEOUT)

  afterAll(async () => {
    if (createdCatalogues.length === 0) return
    const { createClient } = await import('@supabase/supabase-js')
    const db = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      (process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY)!,
      { auth: { persistSession: false } },
    )
    // Titles, albums and photos cascade from the catalogue.
    for (const id of createdCatalogues) await db.from('catalogues').delete().eq('id', id)
  }, REMOTE_TIMEOUT)

  it(
    'has the schema applied',
    async () => {
      const { createClient } = await import('@supabase/supabase-js')
      const db = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        (process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY)!,
        { auth: { persistSession: false } },
      )

      const tables = ['orgs', 'operators', 'catalogues', 'titles', 'albums', 'photos', 'profiles']
      // In parallel: six sequential round trips to a remote database is latency, not coverage.
      const results = await Promise.all(
        tables.map(async (table) => ({
          table,
          error: (await db.from(table).select('*', { head: true, count: 'exact' })).error,
        })),
      )

      const missing = results.filter((r) => r.error).map((r) => r.table)
      expect(missing, 'run `pnpm bootstrap:sql` and apply it in the SQL editor').toEqual([])
      expect(orgId).toBeTruthy()
    },
    REMOTE_TIMEOUT,
  )

  it(
    'round-trips a catalogue through the repository, scoped to its org',
    async () => {
      const { SupabaseRepository } = await import('@/lib/db/supabase-repository')
      const repository = new SupabaseRepository()

      const id = randomUUID()
      const slug = `itest-${Date.now().toString(36)}`

      const created = await repository.createCatalogue({
        id,
        orgId,
        slug,
        originOrgId: null,
        tenantSlug: 'integration-studio',
    customDomain: null,
        coupleName: { en: 'Integration & Test' },
        appName: { en: 'Integration Originals' },
        weddingDate: '2026-12-01',
        occasion: 'wedding',
        branding: {},
        featuredTitleId: null,
        modules: [],
        draftModules: null,
        draftBranding: null,
        locale: 'en',
        template: 'films-only',
        status: 'draft',
        privacy: 'unlisted',
        passcodeHash: null,
        coupleOrgId: null,
        supportAccessUntil: null,
        passcodeVersion: 1,
        timezone: 'Asia/Kolkata',
        premiereAt: null,
        servedAt: null,
        presetId: null,
        includedUntil: new Date(Date.now() + 90 * 864e5).toISOString(),
        subStatus: 'included',
        subPlan: null,
        planId: 'deliver',
        subUntil: null,
        createdAt: new Date().toISOString(),
        publishedAt: null,
      })
      createdCatalogues.push(id)

      // The jsonb round-trip is the part most likely to be wrong: localised strings and the
      // module array both go through it.
      expect(created.coupleName).toEqual({ en: 'Integration & Test' })
      expect(created.modules).toEqual([])

      const fetched = await repository.getCatalogue(id, orgId)
      expect(fetched?.slug).toBe(slug)

      // Another org must not see it. This is the isolation claim, tested rather than asserted.
      expect(await repository.getCatalogue(id, randomUUID())).toBeNull()
    },
    REMOTE_TIMEOUT,
  )

  it(
    'spends a credit of the wedding’s own plan, in the database, and refuses a plan it does not know (N-119)',
    async () => {
      const { createClient } = await import('@supabase/supabase-js')
      const { SupabaseRepository } = await import('@/lib/db/supabase-repository')
      const { makeCredits } = await import('@/lib/admin/credits')
      const { catalogueSchema, orgSchema } = await import('@/lib/schema')
      const repository = new SupabaseRepository()
      const db = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        (process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY)!,
        { auth: { persistSession: false } },
      )

      // A studio of its own: credits are an org's balance, and this must not touch a real one.
      const suffix = Date.now().toString(36)
      const org = orgSchema.parse({
        id: randomUUID(),
        name: `Integration typed credits ${suffix}`,
        slug: `itest-credits-${suffix}`,
        createdAt: new Date().toISOString(),
      })
      const catalogueId = randomUUID()

      try {
        await repository.createOrg(org)
        await repository.createCatalogue(
          catalogueSchema.parse({
            id: catalogueId,
            orgId: org.id,
            tenantSlug: org.slug,
            slug: `itest-${suffix}`,
            coupleName: { en: 'Typed & Credits' },
            appName: { en: 'Typed Originals' },
            weddingDate: '2026-12-01',
            includedUntil: new Date(Date.now() + 90 * 864e5).toISOString(),
            createdAt: new Date().toISOString(),
            planId: 'keep',
          }),
        )
        createdCatalogues.push(catalogueId)
        expect((await repository.getCatalogue(catalogueId, org.id))?.planId).toBe('keep')

        await repository.grantCredits([
          ...makeCredits({ orgId: org.id, count: 1, planId: 'deliver', grantedBy: 'itest' }),
          ...makeCredits({ orgId: org.id, count: 1, planId: 'keep', grantedBy: 'itest' }),
        ])
        const now = new Date().toISOString()

        // The Deliver credit is not for a Keep wedding, however it is asked for.
        const spent = await repository.consumeCredit(org.id, catalogueId, 'keep', now)
        expect(spent?.planId).toBe('keep')
        expect(await repository.consumeCredit(org.id, catalogueId, 'keep', now)).toBeNull()
        expect(await repository.consumeCredit(org.id, catalogueId, 'cinema', now)).toBeNull()

        const balance = await repository.creditBalance(org.id, now)
        expect(balance.byPlan.deliver).toEqual({ available: 1, consumed: 0, expired: 0 })
        expect(balance.byPlan.keep).toEqual({ available: 0, consumed: 1, expired: 0 })
        expect(balance.byPlan.cinema).toEqual({ available: 0, consumed: 0, expired: 0 })

        // The check constraints are the backstop under the route's validation: a storage tier
        // (`light`) is a different ladder, and must not be writable as a credit plan by mistake.
        const badCredit = await db
          .from('credits')
          .insert({ id: randomUUID(), org_id: org.id, plan_id: 'light', expires_at: now })
        expect(badCredit.error?.code, 'credits.plan_id must refuse an unknown plan').toBe('23514')
        const badCatalogue = await db.from('catalogues').update({ plan_id: 'light' }).eq('id', catalogueId)
        expect(badCatalogue.error?.code, 'catalogues.plan_id must refuse an unknown plan').toBe('23514')
      } finally {
        await db.from('credits').delete().eq('org_id', org.id)
        await db.from('catalogues').delete().eq('id', catalogueId)
        await db.from('orgs').delete().eq('id', org.id)
      }
    },
    REMOTE_TIMEOUT,
  )

  it(
    'holds a wedding with no term, and reads each plan’s term, in the database (N-120)',
    async () => {
      const { createClient } = await import('@supabase/supabase-js')
      const { SupabaseRepository } = await import('@/lib/db/supabase-repository')
      const { catalogueSchema } = await import('@/lib/schema')
      const repository = new SupabaseRepository()
      const db = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        (process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY)!,
        { auth: { persistSession: false } },
      )

      // A wedding that has never been published has no term: the column has to accept null (it was
      // `not null` until 0031), and a read must give null back rather than a date or an empty string.
      const id = randomUUID()
      await repository.createCatalogue(
        catalogueSchema.parse({
          id,
          orgId,
          tenantSlug: 'integration-studio',
          slug: `itest-term-${Date.now().toString(36)}`,
          coupleName: { en: 'No & Term' },
          appName: { en: 'No Term Originals' },
          weddingDate: '2026-12-01',
          includedUntil: null,
          createdAt: new Date().toISOString(),
        }),
      )
      createdCatalogues.push(id)
      expect((await repository.getCatalogue(id, orgId))?.includedUntil).toBeNull()

      // What the first Publish writes.
      const end = '2027-01-01T00:00:00.000Z'
      await repository.updateCatalogue(id, orgId, { includedUntil: end })
      const read = (await repository.getCatalogue(id, orgId))?.includedUntil
      expect(new Date(read ?? 'invalid').getTime()).toBe(new Date(end).getTime())

      // The lengths D-61 states, as the migration seeded them.
      expect(await repository.getPlan('deliver')).toMatchObject({ termDays: 90, termMonths: null })
      expect(await repository.getPlan('keep')).toMatchObject({ termMonths: 12, termDays: null })
      expect(await repository.getPlan('cinema')).toMatchObject({ termMonths: 12, termDays: null })
      // …and nothing a wedding is not first published on has one.
      expect(await repository.getPlan('light')).toMatchObject({ termMonths: null, termDays: null })

      // The constraint is the backstop under `addTerm`'s "both set means no term": Postgres refuses a
      // term in both units, and one that is not positive. `light` has no term, so nothing is changed.
      const both = await db.from('plans').update({ term_months: 1, term_days: 1 }).eq('id', 'light')
      expect(both.error?.code, 'a plan must not carry a term in both units').toBe('23514')
      const zero = await db.from('plans').update({ term_days: 0 }).eq('id', 'light')
      expect(zero.error?.code, 'a term must be positive').toBe('23514')
      expect(await repository.getPlan('light')).toMatchObject({ termMonths: null, termDays: null })
    },
    REMOTE_TIMEOUT,
  )

  it(
    'redeems a coupon atomically, in the database — one winner for the last use, and nothing for the loser (N-121)',
    async () => {
      const { createClient } = await import('@supabase/supabase-js')
      const { SupabaseRepository } = await import('@/lib/db/supabase-repository')
      const { makeCredits } = await import('@/lib/admin/credits')
      const { couponSchema, orgSchema } = await import('@/lib/schema')
      const repository = new SupabaseRepository()
      const db = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        (process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY)!,
        { auth: { persistSession: false } },
      )
      const anonKey =
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
      const anon = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, anonKey!, { auth: { persistSession: false } })

      // Studios of their own, so no real org's balance is touched; everything is removed in `finally`.
      const suffix = Date.now().toString(36)
      const tag = suffix.toUpperCase()
      const orgs = ['a', 'b', 'c'].map((letter) =>
        orgSchema.parse({
          id: randomUUID(),
          name: `Integration coupons ${letter} ${suffix}`,
          slug: `itest-coupons-${letter}-${suffix}`,
          createdAt: new Date().toISOString(),
        }),
      )
      const now = new Date()
      const couponIds: string[] = []
      const make = async (over: Record<string, unknown>) => {
        const coupon = couponSchema.parse({
          id: randomUUID(),
          kind: 'reward',
          value: 1,
          rewardPlanId: 'keep',
          campaign: 'Integration',
          doors: ['studio'],
          createdBy: 'itest',
          createdAt: now.toISOString(),
          ...over,
        })
        couponIds.push(coupon.id)
        return repository.createCoupon(coupon)
      }
      const attempt = (couponId: string, orgId: string) =>
        repository.redeemCoupon({
          redemption: {
            id: randomUUID(),
            couponId,
            payerOrgId: orgId,
            paymentId: null,
            amountOffPaise: 0,
            creditsGranted: 1,
            createdAt: now.toISOString(),
          },
          credits: makeCredits({ orgId, count: 1, planId: 'keep', grantedBy: `coupon:ITEST-${tag}`, now }),
          nowIso: now.toISOString(),
        })
      const credited = async (orgId: string) => (await repository.listCredits(orgId)).length

      try {
        for (const org of orgs) await repository.createOrg(org)

        // The row lock: three studios race for the last use of a code, in parallel over the network.
        // Without `for update` in the function, each would count zero and all three would win.
        const scarce = await make({ code: `ITEST-LAST-${tag}`, maxRedemptions: 1, maxPerPayer: null })
        const race = await Promise.all(orgs.map((org) => attempt(scarce.id, org.id)))
        expect(race.filter(Boolean), 'exactly one of three simultaneous redemptions may win').toHaveLength(1)
        const grants = await Promise.all(orgs.map((org) => credited(org.id)))
        expect(grants.reduce((total, n) => total + n, 0), 'and only the winner is credited').toBe(1)
        expect((await repository.listCouponRedemptions()).filter((row) => row.couponId === scarce.id)).toHaveLength(1)

        // The same payer sending the same request twice at once, against a limit of one each.
        const eachOne = await make({ code: `ITEST-EACH-${tag}`, maxRedemptions: null, maxPerPayer: 1 })
        const double = await Promise.all([attempt(eachOne.id, orgs[0]!.id), attempt(eachOne.id, orgs[0]!.id)])
        expect(double.filter(Boolean), 'a double click is one redemption').toHaveLength(1)

        // Disabled, and outside its window: refused by the database, not only by the application.
        const off = await make({ code: `ITEST-OFF-${tag}`, active: false })
        const early = await make({ code: `ITEST-EARLY-${tag}`, validFrom: new Date(now.getTime() + 86_400_000).toISOString() })
        const late = await make({ code: `ITEST-LATE-${tag}`, validUntil: new Date(now.getTime() - 86_400_000).toISOString() })
        expect(await attempt(off.id, orgs[1]!.id)).toBeNull()
        expect(await attempt(early.id, orgs[1]!.id)).toBeNull()
        expect(await attempt(late.id, orgs[1]!.id)).toBeNull()

        // A refused redemption stores nothing: not the row, and not the credits that came with it.
        const before = await credited(orgs[1]!.id)
        expect(await attempt(off.id, orgs[1]!.id)).toBeNull()
        expect(await credited(orgs[1]!.id)).toBe(before)

        // A code somebody has is refused with the sentence, however it was cased when typed.
        await expect(make({ code: `ITEST-LAST-${tag}` })).rejects.toMatchObject({ code: 'VALIDATION_FAILED' })
        expect((await repository.getCouponByCode(`ITEST-LAST-${tag}`))?.maxRedemptions).toBe(1)
        expect(await repository.getCouponByCode('NO-SUCH-CODE-EXISTS')).toBeNull()

        // The check constraints are the backstop under `couponSchema`.
        const row = { id: randomUUID(), campaign: 'x', created_by: 'itest', kind: 'reward', value: 1, reward_plan_id: 'keep', doors: ['studio'] }
        const refused = async (over: Record<string, unknown>) =>
          (await db.from('coupons').insert({ ...row, id: randomUUID(), code: `ITEST-BAD-${tag}`, ...over })).error?.code
        expect(await refused({ doors: ['couple'] }), 'a reward for couples').toBe('23514')
        expect(await refused({ kind: 'percent', reward_plan_id: null, value: 101, doors: ['studio', 'couple'] }), 'over 100%').toBe('23514')
        expect(await refused({ value: 51 }), 'a reward over the ceiling').toBe('23514')
        expect(await refused({ code: 'lowercase-code' }), 'a code that is not upper-case').toBe('23514')
        expect(await refused({ reward_plan_id: 'light' }), 'a basket that is a storage tier').toBe('23514')

        // The public key reaches none of it: not the tables, and not the function that moves credits.
        const read = await anon.from('coupons').select('*').limit(1)
        expect(read.data ?? [], 'anon must read no coupons').toHaveLength(0)
        const call = await anon.rpc('redeem_coupon', {
          p_id: randomUUID(), p_coupon: scarce.id, p_payer: orgs[2]!.id, p_payment: null, p_amount_off: 0, p_credits: [], p_now: now.toISOString(),
        })
        expect(call.error, 'anon must not be able to run redeem_coupon').not.toBeNull()
      } finally {
        // A coupon is never deleted in the product; these are this test's own rows, and the only way out.
        await db.from('coupon_redemptions').delete().in('coupon_id', couponIds)
        await db.from('coupons').delete().in('id', couponIds)
        for (const org of orgs) {
          await db.from('credits').delete().eq('org_id', org.id)
          await db.from('orgs').delete().eq('id', org.id)
        }
      }
    },
    REMOTE_TIMEOUT,
  )

  it(
    'grants a catalogue its storage tier, and resolveLimits prefers it (D-60, N-80)',
    async () => {
      const { SupabaseRepository } = await import('@/lib/db/supabase-repository')
      const { resolveLimits } = await import('@/lib/entitlements')
      const repository = new SupabaseRepository()

      const catalogueId = createdCatalogues[0]
      expect(catalogueId, 'the catalogue test must run first').toBeTruthy()

      // If this throws "violates foreign key constraint", migration 0028 has not been applied —
      // `plans` has no `light` row for `entitlements.plan_id` to point at.
      const entitlement = await repository.setCatalogueEntitlement(catalogueId!, 'light', 5)
      expect(entitlement).toMatchObject({ catalogueId, planId: 'light', storageGb: 5 })

      const grants = await repository.getEntitlements(catalogueId!, orgId)
      expect(grants.catalogue).toMatchObject({ planId: 'light', storageGb: 5 })
      expect(resolveLimits(grants.catalogue, grants.org).storageGb).toBe(5)
    },
    REMOTE_TIMEOUT,
  )

  it(
    'reads and edits the price list through the real driver, and puts every edit back (N-118)',
    async () => {
      const { SupabaseRepository } = await import('@/lib/db/supabase-repository')
      const repository = new SupabaseRepository()

      // If this throws `column "unit" does not exist`, migration 0029 has not been applied.
      const list = await repository.listPlans()
      const ids = list.map((plan) => plan.id)
      for (const id of ['studio', 'deliver', 'keep', 'cinema', 'extra-4k', 'light']) {
        expect(ids, `${id} should be seeded`).toContain(id)
      }
      expect(list.map((plan) => plan.position), 'console order').toEqual(
        [...list.map((plan) => plan.position)].sort((a, b) => a - b),
      )
      // Editable values are not asserted — an admin may have changed them. Their *shape* is.
      const studio = list.find((plan) => plan.id === 'studio')!
      expect(studio.kind).toBe('partner')
      expect(typeof studio.grants).toBe('object')

      // Price: set, take off sale, and the unknown id that must not become a product. `extra-4k`
      // because nothing quotes it yet, so a moment of a different price is seen by no one.
      const original = await repository.getPlan('extra-4k')
      try {
        expect((await repository.setPlanPrice('extra-4k', 123_400))?.pricePaise).toBe(123_400)
        expect((await repository.getPlan('extra-4k'))?.pricePaise).toBe(123_400)
        expect((await repository.setPlanPrice('extra-4k', null))?.pricePaise).toBeNull()
        expect(await repository.setPlanPrice('itest-not-a-product', 1)).toBeNull()
        expect(await repository.getPlan('itest-not-a-product')).toBeNull()
      } finally {
        await repository.setPlanPrice('extra-4k', original?.pricePaise ?? null)
      }
      expect((await repository.getPlan('extra-4k'))?.pricePaise).toBe(original?.pricePaise ?? null)

      // The retail range and the typed bundle (jsonb) — the two columns memory cannot prove.
      const keep = await repository.getPlan('keep')
      const studioBefore = await repository.getPlan('studio')
      try {
        const retail = await repository.setPlanRetail('keep', { minPaise: 111_100, maxPaise: 222_200 })
        expect([retail?.retailMinPaise, retail?.retailMaxPaise]).toEqual([111_100, 222_200])

        const granted = await repository.setPlanGrants('studio', { keep: 4 })
        expect(granted?.grants).toEqual({ keep: 4 })
      } finally {
        await repository.setPlanRetail(
          'keep',
          keep?.retailMinPaise != null && keep.retailMaxPaise != null
            ? { minPaise: keep.retailMinPaise, maxPaise: keep.retailMaxPaise }
            : null,
        )
        await repository.setPlanGrants('studio', studioBefore?.grants ?? {})
      }
      expect((await repository.getPlan('studio'))?.grants).toEqual(studioBefore?.grants ?? {})
    },
    REMOTE_TIMEOUT,
  )

  it(
    'keeps the price list unreadable and unwritable to the anon key printed into every page (N-118)',
    async () => {
      const anonKey =
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
      const { createClient } = await import('@supabase/supabase-js')
      const { SupabaseRepository } = await import('@/lib/db/supabase-repository')
      const anon = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, anonKey!, {
        auth: { persistSession: false },
      })
      const repository = new SupabaseRepository()
      const before = (await repository.getPlan('deliver'))?.pricePaise

      // Prices are public on the marketing page, so *reading* is not the danger — but nothing
      // reaches this table except through a route holding the service-role key, so anon gets nothing.
      const { data } = await anon.from('plans').select('*').limit(1)
      expect(data ?? [], 'anon must read no rows from plans').toHaveLength(0)

      // The real property: a repricing attempt with the public key changes nothing.
      await anon.from('plans').update({ price_paise: 1 }).eq('id', 'deliver')
      expect((await repository.getPlan('deliver'))?.pricePaise).toBe(before)
    },
    REMOTE_TIMEOUT,
  )

  it('round-trips a title, including the arrays and the nullable columns', async () => {
    const { SupabaseRepository } = await import('@/lib/db/supabase-repository')
    const repository = new SupabaseRepository()

    const catalogueId = createdCatalogues[0]
    expect(catalogueId, 'the catalogue test must run first').toBeTruthy()

    const input = {
      id: randomUUID(),
      catalogueId: catalogueId!,
      slug: 'itest-film',
      previousSlug: null,
      slugChangedAt: null,
      sizeBytes: 1024,
      name: { en: 'Integration Film', hi: 'परीक्षण' },
      category: 'highlights' as const,
      credits: [{ role: 'Cinematography', name: 'Nobody' }],
      provider: 'bunny',
      providerId: null,
      durationS: null,
      posterUrl: null,
      posterCandidates: [],
      posterSource: 'generated' as const,
      thumbnailsUrl: null,
      trailerUrl: null,
      captions: [],
      status: 'uploading' as const,
      errorMessage: null,
      published: false,
      liveAt: null,
      sortOrder: 0,
    }

    const title = await repository.createTitle(input)

    /**
     * **Every field that was sent, not a chosen few.**
     *
     * This test used to assert `name.hi`, `credits` and `durationS` — and passed `sizeBytes:
     * 1024` without ever checking it came back. The Supabase driver's column map had no entry for
     * `size_bytes`, so the value was dropped on write, every catalogue in production reported 0 GB
     * and the storage cap never refused an upload. A round-trip test that picks its assertions by
     * hand drifts from the schema exactly the way the column map did.
     *
     * Comparing the whole input means a column added to `titleSchema` has to survive Postgres, or
     * this fails — which is the only way this class of bug gets caught at the row level rather
     * than at the map.
     */
    for (const [field, sent] of Object.entries(input)) {
      expect(title[field as keyof typeof title], `${field} did not survive the round trip`).toEqual(
        sent,
      )
    }

    const updated = await repository.updateTitle(title.id, { status: 'ready', durationS: 244 })
    expect(updated.status).toBe('ready')
    expect(updated.durationS).toBe(244)

    // publishedOnly must filter on both flags, which is what keeps a processing title off a
    // guest's page.
    expect(await repository.listTitles(catalogueId!, { publishedOnly: true })).toHaveLength(0)
  })

  /**
   * doc 10 §1 test 12 and §5's pre-launch checklist — the single most important assertion in
   * this file.
   *
   * It needs a positive control. "anon sees nothing" also happens when the request errored, the
   * key was wrong, or the table name was misspelled, and a security test that passes because
   * the query broke is worse than no test at all. So: prove anon *can* read a published
   * catalogue, then prove it cannot read the draft.
   */
  it(
    'enforces RLS: the anon key can read nothing at all',
    async () => {
      const anonKey =
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
        process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
      expect(anonKey, 'the publishable key is required to test RLS').toBeTruthy()

      const { createClient } = await import('@supabase/supabase-js')
      const anon = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, anonKey!, {
        auth: { persistSession: false },
      })

      /**
       * This test used to assert that anon could read a *published* catalogue and not a draft
       * one — encoding the leak as intended behaviour, which is why it passed while the key
       * printed into every page could list every wedding on the platform.
       *
       * A guest's browser never speaks to Postgres: every guest path goes through a Next route
       * holding the service-role key. So the correct assertion is not "the right rows" but
       * "no rows, ever" — and enumeration, not any single row, was the leak (doc 15 §0).
       */
      for (const table of ['catalogues', 'titles', 'photos', 'albums', 'playback_progress']) {
        const { data, error } = await anon.from(table).select('*').limit(1)
        expect(
          error ?? { code: 'none' },
          `anon must be refused on ${table}`,
        ).not.toEqual({ code: 'none' })
        expect(data ?? [], `anon must read no rows from ${table}`).toHaveLength(0)
      }
    },
    REMOTE_TIMEOUT,
  )

  it('enforces RLS: anon cannot write, only read', async () => {
    const anonKey =
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
    const { createClient } = await import('@supabase/supabase-js')
    const anon = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, anonKey!, {
      auth: { persistSession: false },
    })

    // There is no anon insert policy on catalogues, so this must be refused outright.
    const { error } = await anon
      .from('catalogues')
      .insert({ slug: `itest-evil-${Date.now()}`, org_id: orgId })
    expect(error, 'anon must not be able to create a catalogue').not.toBeNull()
  })
})

describe('driver integration coverage', () => {
  it('reports which drivers were exercised', () => {
    // Not an assertion so much as a visible record: a run where both skipped should not look
    // the same as a run where both passed.
    // eslint-disable-next-line no-console
    console.log(
      `  integration: bunny=${hasBunny ? 'RUN' : 'skipped (no credentials)'} · supabase=${
        hasSupabase ? 'RUN' : 'skipped (no credentials)'
      }`,
    )
    expect(true).toBe(true)
  })
})
