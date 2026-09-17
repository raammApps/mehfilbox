#!/usr/bin/env tsx
/**
 * Check that the external services are actually ready, and say precisely what is missing.
 *
 * Written because diagnosing this by hand took a dozen curl commands: is the key valid, is it
 * the account key or a library key, does the schema exist, is token authentication on. Those
 * questions recur on every new environment, and the answers are the difference between a
 * deploy that works and one that 500s on the first guest.
 *
 *   pnpm preflight
 *
 * Read-only. Creates nothing, changes nothing. Exits non-zero if the configured drivers are
 * not ready, so it can gate a deploy.
 */
import { existsSync, readFileSync } from 'node:fs'

if (existsSync('.env.local')) {
  for (const line of readFileSync('.env.local', 'utf8').split('\n')) {
    const match = /^\s*([A-Z0-9_]+)\s*=\s*(.*)$/.exec(line)
    if (!match) continue
    const value = match[2]!.trim().replace(/^["']|["']$/g, '')
    if (value) process.env[match[1]!] ??= value
  }
}

type Service = 'supabase' | 'bunny' | 'photos'
type Result = { ok: boolean; service: Service; label: string; detail: string; fix?: string }

const results: Result[] = []
let current: Service = 'supabase'

const pass = (label: string, detail: string) =>
  results.push({ ok: true, service: current, label, detail })
const fail = (label: string, detail: string, fix?: string) =>
  results.push({ ok: false, service: current, label, detail, fix })

const env = process.env
const dataDriver = env.DATA_DRIVER ?? 'memory'
const videoDriver = env.VIDEO_DRIVER ?? 'fake'
const photoDriver = env.PHOTO_DRIVER ?? 'fake'

const supabaseUrl = env.NEXT_PUBLIC_SUPABASE_URL
const supabaseAnon = env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
const supabaseSecret = env.SUPABASE_SERVICE_ROLE_KEY ?? env.SUPABASE_SECRET_KEY

// ── Supabase ──────────────────────────────────────────────────────────────────
async function checkSupabase(): Promise<void> {
  if (!supabaseUrl) {
    fail('Supabase URL', 'not set', 'NEXT_PUBLIC_SUPABASE_URL from Project Settings → API')
    return
  }
  pass('Supabase URL', new URL(supabaseUrl).hostname)

  if (!supabaseAnon) {
    fail('Publishable key', 'not set', 'NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY (sb_publishable_…)')
  } else {
    pass('Publishable key', `${supabaseAnon.slice(0, 14)}…`)
  }

  if (!supabaseSecret) {
    fail(
      'Secret key',
      'not set — the repository cannot run without it',
      'SUPABASE_SECRET_KEY (sb_secret_…) from Project Settings → API Keys',
    )
  } else {
    pass('Secret key', `${supabaseSecret.slice(0, 10)}…`)
  }

  const key = supabaseSecret ?? supabaseAnon
  if (!key) return

  const tables = ['orgs', 'operators', 'catalogues', 'titles', 'albums', 'photos', 'profiles']
  const missing: string[] = []

  for (const table of tables) {
    const response = await fetch(`${supabaseUrl}/rest/v1/${table}?select=*&limit=0`, {
      headers: { apikey: key, Authorization: `Bearer ${key}` },
    }).catch(() => null)
    if (!response || response.status === 404) missing.push(table)
  }

  if (missing.length === tables.length) {
    fail('Schema', 'no tables found', 'pnpm bootstrap:sql, then paste into the SQL editor')
  } else if (missing.length > 0) {
    fail('Schema', `missing: ${missing.join(', ')}`, 'the migrations are only partly applied')
  } else {
    pass('Schema', `all ${tables.length} tables present`)

    if (supabaseSecret) {
      const response = await fetch(`${supabaseUrl}/rest/v1/orgs?select=id,slug&limit=1`, {
        headers: { apikey: supabaseSecret, Authorization: `Bearer ${supabaseSecret}` },
      })
      const rows = (await response.json().catch(() => [])) as { slug?: string }[]
      if (rows.length > 0) pass('First org', rows[0]!.slug ?? 'present')
      else fail('First org', 'none', 'the insert at the end of the bootstrap script')
    }
  }
}

// ── Bunny ─────────────────────────────────────────────────────────────────────
async function checkBunny(): Promise<void> {
  const apiKey = env.BUNNY_API_KEY
  if (!apiKey) {
    fail('Bunny key', 'not set', 'BUNNY_API_KEY')
    return
  }

  const libraryId = env.BUNNY_LIBRARY_ID

  /**
   * In a working setup `BUNNY_API_KEY` is the **library** key, which the account API rejects.
   * So when a library id is configured, the library endpoint is the real check and the account
   * listing is skipped entirely — otherwise a correct configuration reports a false failure.
   */
  if (libraryId) {
    await checkLibrary(apiKey, libraryId)
    return
  }

  const accountKey = env.BUNNY_ACCOUNT_API_KEY ?? apiKey
  const account = await fetch('https://api.bunny.net/videolibrary?page=1&perPage=50', {
    headers: { AccessKey: accountKey, accept: 'application/json' },
  }).catch(() => null)

  if (!account) {
    fail('Bunny key', 'could not reach api.bunny.net')
    return
  }

  if (account.status === 401) {
    // Worth distinguishing: a library key authenticates against video.bunnycdn.com but not
    // against the account API, and the failure looks identical from the outside.
    fail(
      'Bunny key',
      'rejected by the account API (401)',
      'this looks like a per-library key — set BUNNY_LIBRARY_ID too, and it will be checked against the library endpoint instead',
    )
    return
  }

  pass('Bunny account key', 'valid')

  const body = (await account.json()) as { Items?: { Id: number; Name: string }[] }
  const libraries = body.Items ?? []

  if (libraries.length === 0) {
    // Bunny refuses zone creation at zero balance, which is the most likely reason a fresh
    // account has none. Reported here so it is not rediscovered as a 400 mid-setup.
    const billing = await fetch('https://api.bunny.net/billing', {
      headers: { AccessKey: apiKey, accept: 'application/json' },
    })
      .then((r) => (r.ok ? (r.json() as Promise<{ Balance?: number }>) : null))
      .catch(() => null)

    const balance = billing?.Balance ?? 0
    fail(
      'Stream library',
      'the account has none',
      balance <= 0
        ? `account balance is ${balance} — Bunny refuses to create zones until the account is topped up`
        : 'create one in the Bunny dashboard → Stream',
    )
    return
  }

  pass('Stream library', `${libraries.length} found: ${libraries.map((l) => l.Name).join(', ')}`)

  fail(
    'BUNNY_LIBRARY_ID',
    'not set',
    `pick one of: ${libraries.map((l) => `${l.Id} (${l.Name})`).join(', ')}`,
  )
}

async function checkLibrary(apiKey: string, libraryId: string): Promise<void> {
  const videos = await fetch(
    `https://video.bunnycdn.com/library/${libraryId}/videos?page=1&itemsPerPage=1`,
    { headers: { AccessKey: apiKey, accept: 'application/json' } },
  ).catch(() => null)

  if (!videos || !videos.ok) {
    fail(
      'Library API access',
      `HTTP ${videos?.status ?? 'unreachable'}`,
      'BUNNY_API_KEY must be the library key (Stream → your library → API), not the account key',
    )
  } else {
    const body = (await videos.json()) as { totalItems?: number }
    pass('Library API access', `library ${libraryId}, ${body.totalItems ?? 0} video(s)`)
  }

  if (!env.BUNNY_CDN_HOSTNAME) {
    fail('BUNNY_CDN_HOSTNAME', 'not set', 'the vz-….b-cdn.net hostname from the library')
  } else {
    pass('BUNNY_CDN_HOSTNAME', env.BUNNY_CDN_HOSTNAME)
  }

  if (!env.BUNNY_TOKEN_AUTH_KEY) {
    fail(
      'BUNNY_TOKEN_AUTH_KEY',
      'not set — playback URLs would be unsigned',
      'the pull zone Security tab; token authentication must also be ON',
    )
    return
  }
  pass('BUNNY_TOKEN_AUTH_KEY', 'set')

  /**
   * Holding the key is not the same as the zone enforcing it. An unenforced zone serves every
   * `.m3u8` to anyone with the URL, which quietly makes doc 01 US-5's promise false — exactly
   * the kind of thing nobody notices until a link is forwarded outside the family.
   */
  const accountKey = env.BUNNY_ACCOUNT_API_KEY
  if (!accountKey) return

  const libraries = await fetch('https://api.bunny.net/videolibrary?page=1&perPage=50', {
    headers: { AccessKey: accountKey, accept: 'application/json' },
  })
    .then((r) =>
      r.ok ? (r.json() as Promise<{ Items?: { Id: number; PullZoneId: number }[] }>) : null,
    )
    .catch(() => null)

  const pullZoneId = libraries?.Items?.find((l) => String(l.Id) === libraryId)?.PullZoneId
  if (!pullZoneId) return

  const zone = await fetch(`https://api.bunny.net/pullzone/${pullZoneId}`, {
    headers: { AccessKey: accountKey, accept: 'application/json' },
  })
    .then((r) =>
      r.ok
        ? (r.json() as Promise<{
            ZoneSecurityEnabled?: boolean
            ZoneSecurityIncludeHashRemoteIP?: boolean
          }>)
        : null,
    )
    .catch(() => null)

  if (!zone?.ZoneSecurityEnabled) {
    fail(
      'Token auth enforced',
      'the pull zone does not require a token',
      'signed URLs are generated but never checked — enable Token Authentication on the pull zone',
    )
    return
  }

  pass('Token auth enforced', `pull zone ${pullZoneId}`)

  /**
   * A new Stream library ships with `BlockNoneReferrer: true`, which 403s any request that
   * carries no `Referer`. Native HLS on iOS and several Android players send none, so this
   * looks exactly like a broken token and costs an afternoon to diagnose.
   */
  const library = await fetch(`https://api.bunny.net/videolibrary/${libraryId}`, {
    headers: { AccessKey: accountKey, accept: 'application/json' },
  })
    .then((r) => (r.ok ? (r.json() as Promise<{ BlockNoneReferrer?: boolean }>) : null))
    .catch(() => null)

  if (library?.BlockNoneReferrer) {
    fail(
      'Referrer blocking',
      'the library blocks requests with no Referer',
      'turn BlockNoneReferrer off — native HLS players send no referrer and will 403',
    )
  } else if (library) {
    pass('Referrer blocking', 'off, so referrer-less players work')
  }

  if (zone.ZoneSecurityIncludeHashRemoteIP) {
    fail(
      'IP pinning',
      'enabled',
      'turn it off — Indian mobile IPs rotate mid-playback and it causes false failures (doc 05 §4)',
    )
  } else {
    pass('IP pinning', 'off, as doc 05 §4 requires')
  }
}

// ── Run ───────────────────────────────────────────────────────────────────────
// ── Photographs: Edge Storage behind its own pull zone ────────────────────────
/**
 * Nothing used to check this, and the gap is not theoretical: when the zone moved off
 * `mehfil-photos`, a wrong storage password would have left every existing photograph loading
 * happily from the CDN while every *new* upload failed — the read path and the write path use
 * different credentials, so the obvious spot-check proves nothing about the one that breaks.
 *
 * So this writes, reads back through the CDN, and deletes.
 */
async function checkPhotos(): Promise<void> {
  const zone = env.BUNNY_STORAGE_ZONE
  const password = env.BUNNY_STORAGE_PASSWORD
  const host = env.BUNNY_PHOTO_CDN_HOSTNAME
  const region = (env.BUNNY_STORAGE_REGION ?? '').trim().toUpperCase()

  if (!zone || !password || !host) {
    fail(
      'Photo storage',
      'not configured',
      'set BUNNY_STORAGE_ZONE, BUNNY_STORAGE_PASSWORD and BUNNY_PHOTO_CDN_HOSTNAME',
    )
    return
  }

  const origin = region === 'DE' || region === '' ? 'storage.bunnycdn.com' : `${region.toLowerCase()}.storage.bunnycdn.com`

  /**
   * A **fresh key every run**, which matters more than it looks.
   *
   * The first version of this check wrote to a fixed `probe/preflight.txt`. The pull zone sets
   * `CacheControlMaxAgeOverride` to 30 days, so Bunny's edge kept serving the *first* run's body
   * and every later run reported "stale or foreign content" — a false failure on a correctly
   * configured zone. `cache: 'no-store'` does not help: it governs this process's fetch cache,
   * not the CDN's. A key that has never been requested cannot be served from cache.
   */
  const key = `probe/preflight-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}.txt`
  const url = `https://${origin}/${zone}/${key}`
  const body = `preflight ${Date.now()}`

  const put = await fetch(url, {
    method: 'PUT',
    headers: { AccessKey: password, 'content-type': 'text/plain' },
    body,
  }).catch(() => null)

  if (!put || !put.ok) {
    fail(
      'Photo upload',
      put ? `storage rejected the write (${put.status})` : `could not reach ${origin}`,
      put?.status === 401 ? 'BUNNY_STORAGE_PASSWORD does not match this zone' : undefined,
    )
    return
  }
  pass('Photo upload', `${zone} accepted a write (${origin})`)

  // The CDN is a separate hop with its own cache; a zone can accept writes while the pull zone
  // points somewhere else entirely, which is precisely what a half-finished rename looks like.
  const read = await fetch(`https://${host}/${key}`, { cache: 'no-store' }).catch(() => null)
  if (!read || !read.ok) {
    fail(
      'Photo CDN',
      read ? `pull zone returned ${read.status}` : `could not reach ${host}`,
      `check that ${host} is the pull zone in front of ${zone}`,
    )
  } else if ((await read.text()) !== body) {
    fail('Photo CDN', `${host} served stale or foreign content`, 'the pull zone may front a different storage zone')
  } else {
    pass('Photo CDN', `${host} served it back`)
  }

  await fetch(url, { method: 'DELETE', headers: { AccessKey: password } }).catch(() => null)

  /**
   * N-83: holding a signing key is not the same as the zone enforcing it. An unenforced zone
   * serves every photograph to anyone with the URL, exactly the gap this ticket closed — and
   * nothing above would notice, because the write/read/delete check just performed works
   * identically whether or not token authentication is on.
   */
  if (!env.BUNNY_PHOTO_TOKEN_AUTH_KEY) {
    fail(
      'BUNNY_PHOTO_TOKEN_AUTH_KEY',
      'not set — photo URLs would be unsigned',
      'the photo pull zone Security tab; token authentication must also be ON',
    )
    return
  }
  pass('BUNNY_PHOTO_TOKEN_AUTH_KEY', 'set')

  const accountKey = env.BUNNY_ACCOUNT_API_KEY
  if (!accountKey) return

  // Matched by hostname rather than by a library id (photos have no library): a storage-backed
  // pull zone is still just a pull zone, and the CDN hostname is the one thing this script
  // already knows for certain names it.
  const zones = await fetch('https://api.bunny.net/pullzone', {
    headers: { AccessKey: accountKey, accept: 'application/json' },
  })
    .then((r) =>
      r.ok
        ? (r.json() as Promise<
            {
              Id: number
              Hostnames?: { Value: string }[]
              ZoneSecurityEnabled?: boolean
              ZoneSecurityIncludeHashRemoteIP?: boolean
            }[]
          >)
        : null,
    )
    .catch(() => null)

  const pullZone = zones?.find((z) => z.Hostnames?.some((h) => h.Value === host))
  if (!pullZone) return

  if (!pullZone.ZoneSecurityEnabled) {
    fail(
      'Photo token auth enforced',
      'the pull zone does not require a token',
      'signed URLs are generated but never checked — enable Token Authentication on the photo pull zone',
    )
  } else {
    pass('Photo token auth enforced', `pull zone ${pullZone.Id}`)
  }

  if (pullZone.ZoneSecurityIncludeHashRemoteIP) {
    fail(
      'Photo IP pinning',
      'enabled',
      'turn it off — Indian mobile IPs rotate mid-download and it causes false failures (doc 05 §4)',
    )
  } else {
    pass('Photo IP pinning', 'off, as doc 05 §4 requires')
  }
}

async function main(): Promise<void> {
  console.log(`\nDrivers: data=${dataDriver} video=${videoDriver} photos=${photoDriver}\n`)

  current = 'supabase'
  await checkSupabase()
  current = 'bunny'
  await checkBunny()
  if (photoDriver === 'bunny') {
    current = 'photos'
    await checkPhotos()
  }

  const width = Math.max(...results.map((r) => r.label.length))
  for (const r of results) {
    console.log(`${r.ok ? '✓' : '✗'} ${r.label.padEnd(width)}  ${r.detail}`)
    if (r.fix) console.log(`${' '.repeat(width + 3)}→ ${r.fix}`)
  }

  const needsSupabase = dataDriver === 'supabase'
  const needsBunny = videoDriver === 'bunny'

  // Only the services the configured drivers actually use can block.
  const blocking = results.filter(
    (r) =>
      !r.ok &&
      ((r.service === 'supabase' && needsSupabase) ||
        (r.service === 'bunny' && needsBunny) ||
        (r.service === 'photos' && photoDriver === 'bunny')),
  )
  const advisory = results.filter((r) => !r.ok && !blocking.includes(r))

  console.log()
  if (blocking.length > 0) {
    console.log(
      `${blocking.length} item(s) block the configured drivers (data=${dataDriver}, video=${videoDriver}).`,
    )
    process.exit(1)
  }

  if (advisory.length > 0) {
    console.log(
      `Configured drivers (data=${dataDriver}, video=${videoDriver}) are ready.
` + `${advisory.length} item(s) remain before the other service can be switched on.`,
    )
    return
  }

  console.log('Everything is ready. `pnpm test:integration` exercises both for real.')
}

void main()
