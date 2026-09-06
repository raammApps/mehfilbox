#!/usr/bin/env tsx
/**
 * Move photographs off the `mehfil-photos` storage zone onto a zone named for the product.
 *
 * The Stream library and the Supabase project both carry machine-generated identifiers
 * (`vz-98fb153e-d39.b-cdn.net`, `ijkwhtfggjihjpykxhnh.supabase.co`) and so need nothing beyond a
 * relabel in their dashboards. The photo zone is the one resource whose old name is **visible to
 * guests**, in the host of every photograph URL, and Bunny cannot rename a storage zone in place.
 *
 *   pnpm repoint:photos           # report only
 *   pnpm repoint:photos --write   # copy the objects and rewrite the rows
 *
 * Needs the destination zone to exist already — creating one is an account-API operation and this
 * repo deliberately holds only the Stream key. Create `mehfilbox-photos` (with its pull zone)
 * in the dashboard first, then put its password in `BUNNY_STORAGE_PASSWORD_NEW`.
 *
 * `photos.url` stores an **absolute** URL — `put()` returns `urlFor(key)` and the route persists
 * it — so the objects moving is only half the job. The pathname is stable across the move, which
 * is what makes the rewrite a host swap rather than a re-derivation, and keeps `photoKeyFromUrl`
 * working on old and new rows alike.
 *
 * Safe to re-run: copies skip objects already present at the destination, and the rewrite only
 * touches rows still on the old host.
 */
import { existsSync, readFileSync } from 'node:fs'

if (existsSync('.env.local')) {
  for (const line of readFileSync('.env.local', 'utf8').split('\n')) {
    const match = /^\s*([A-Z0-9_]+)\s*=\s*(.*)$/.exec(line)
    if (!match) continue
    const [, key, raw] = match
    if (!process.env[key!]) process.env[key!] = raw!.trim().replace(/^["']|["']$/g, '')
  }
}

const WRITE = process.argv.includes('--write')

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_SECRET_KEY
const REGION = process.env.BUNNY_STORAGE_REGION ?? 'SG'

const OLD_ZONE = process.env.BUNNY_STORAGE_ZONE
const OLD_PASS = process.env.BUNNY_STORAGE_PASSWORD
const OLD_HOST = process.env.BUNNY_PHOTO_CDN_HOSTNAME

const NEW_ZONE = process.env.BUNNY_STORAGE_ZONE_NEW ?? 'mehfilbox-photos'
const NEW_PASS = process.env.BUNNY_STORAGE_PASSWORD_NEW
const NEW_HOST = process.env.BUNNY_PHOTO_CDN_HOSTNAME_NEW ?? `${NEW_ZONE}.b-cdn.net`

function originHost(region: string): string {
  // Matches lib/photos/bunny.ts — the main region has no prefix, every other one does.
  const code = region.trim().toUpperCase()
  return code === 'DE' || code === '' ? 'storage.bunnycdn.com' : `${code.toLowerCase()}.storage.bunnycdn.com`
}

const ORIGIN = originHost(REGION)

type Entry = { ObjectName: string; IsDirectory: boolean; Path: string }

async function list(zone: string, pass: string, prefix: string): Promise<Entry[]> {
  const response = await fetch(`https://${ORIGIN}/${zone}/${prefix}`, { headers: { AccessKey: pass } })
  if (!response.ok) throw new Error(`list ${prefix} failed (${response.status})`)
  return (await response.json()) as Entry[]
}

/** Every file key under `prefix`, depth-first. Bunny has no recursive listing. */
async function walk(zone: string, pass: string, prefix = ''): Promise<string[]> {
  const entries = await list(zone, pass, prefix)
  const keys: string[] = []
  for (const entry of entries) {
    const key = `${prefix}${entry.ObjectName}`
    if (entry.IsDirectory) keys.push(...(await walk(zone, pass, `${key}/`)))
    else keys.push(key)
  }
  return keys
}

async function main(): Promise<void> {
  if (!OLD_ZONE || !OLD_PASS || !OLD_HOST) throw new Error('Source zone env is incomplete.')
  if (!SUPABASE_URL || !SUPABASE_KEY) throw new Error('Supabase env is incomplete.')

  console.log(`  from  ${OLD_ZONE}  (${OLD_HOST})`)
  console.log(`  to    ${NEW_ZONE}  (${NEW_HOST})`)
  console.log(WRITE ? '  mode  WRITE\n' : '  mode  report only — pass --write to apply\n')

  const keys = await walk(OLD_ZONE, OLD_PASS)
  console.log(`  ${keys.length} objects in the source zone`)

  // The rows first: a mismatch here is worth knowing before anything is copied.
  const rowsResponse = await fetch(
    `${SUPABASE_URL}/rest/v1/photos?select=id,url&url=like.*${OLD_HOST}*`,
    { headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` } },
  )
  if (!rowsResponse.ok) throw new Error(`photo rows query failed (${rowsResponse.status})`)
  const rows = (await rowsResponse.json()) as { id: string; url: string }[]
  console.log(`  ${rows.length} photo rows still pointing at the old host\n`)

  if (!WRITE) {
    for (const key of keys.slice(0, 10)) console.log(`    would copy  ${key}`)
    if (keys.length > 10) console.log(`    … and ${keys.length - 10} more`)
    return
  }

  if (!NEW_PASS) throw new Error('BUNNY_STORAGE_PASSWORD_NEW is not set — create the zone first.')

  let copied = 0
  let skipped = 0
  for (const key of keys) {
    const head = await fetch(`https://${ORIGIN}/${NEW_ZONE}/${key}`, {
      method: 'HEAD',
      headers: { AccessKey: NEW_PASS },
    })
    if (head.ok) {
      skipped += 1
      continue
    }

    const source = await fetch(`https://${ORIGIN}/${OLD_ZONE}/${key}`, { headers: { AccessKey: OLD_PASS } })
    if (!source.ok) throw new Error(`read ${key} failed (${source.status})`)
    const body = await source.arrayBuffer()

    const put = await fetch(`https://${ORIGIN}/${NEW_ZONE}/${key}`, {
      method: 'PUT',
      headers: {
        AccessKey: NEW_PASS,
        'content-type': source.headers.get('content-type') ?? 'application/octet-stream',
      },
      body,
    })
    if (!put.ok) throw new Error(`write ${key} failed (${put.status})`)
    copied += 1
  }
  console.log(`  copied ${copied}, already present ${skipped}`)

  // Only now the rows — a rewritten URL pointing at an object that was never copied is a broken
  // photograph, and the operator has no way to tell which half failed.
  let rewritten = 0
  for (const row of rows) {
    const next = row.url.replace(OLD_HOST, NEW_HOST)
    if (next === row.url) continue
    const patch = await fetch(`${SUPABASE_URL}/rest/v1/photos?id=eq.${row.id}`, {
      method: 'PATCH',
      headers: {
        apikey: SUPABASE_KEY,
        Authorization: `Bearer ${SUPABASE_KEY}`,
        'content-type': 'application/json',
        Prefer: 'return=minimal',
      },
      body: JSON.stringify({ url: next }),
    })
    if (!patch.ok) throw new Error(`rewrite ${row.id} failed (${patch.status})`)
    rewritten += 1
  }
  console.log(`  rewrote ${rewritten} rows`)

  console.log('\n  Now update the deployment, then verify before deleting the old zone:')
  console.log(`    BUNNY_STORAGE_ZONE=${NEW_ZONE}`)
  console.log(`    BUNNY_PHOTO_CDN_HOSTNAME=${NEW_HOST}`)
  console.log('    BUNNY_STORAGE_PASSWORD=<the new zone password>')
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error)
  process.exit(1)
})
