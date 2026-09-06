#!/usr/bin/env tsx
/**
 * Write the demo catalogue into the file-backed store.
 *
 * Deliberately imports nothing server-only: it builds the snapshot and writes JSON, so it runs
 * under plain Node without the app's configuration module. For Supabase, seeding is a
 * deliberate act through `pnpm bootstrap:sql`, not a side effect of running a script.
 */
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { demoSnapshot } from '../lib/db/seed-data'

const driver = process.env.DATA_DRIVER ?? 'file'
if (driver === 'supabase') {
  console.error('DATA_DRIVER=supabase. Run `pnpm bootstrap:sql` and apply it in the SQL editor.')
  process.exit(1)
}

const email = process.env.DEV_OPERATOR_EMAIL ?? 'operator@mehfilbox.test'
const password = process.env.DEV_OPERATOR_PASSWORD ?? 'local-demo-password'

const path = resolve(process.cwd(), join(process.env.DATA_DIR ?? '.data', 'store.json'))
const snapshot = demoSnapshot({ email, password })

mkdirSync(dirname(path), { recursive: true })
writeFileSync(path, JSON.stringify(snapshot, null, 2), 'utf8')

console.log(`Seeded ${path}`)
console.log(
  `  ${snapshot.catalogues.length} catalogue · ${snapshot.titles.length} titles · ${snapshot.photos.length} photos`,
)
console.log(`  operator: ${email} / ${password}`)
console.log(`  guest:    http://localhost:3000/?__catalogue=${snapshot.catalogues[0]?.slug}`)
