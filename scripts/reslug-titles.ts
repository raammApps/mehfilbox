#!/usr/bin/env tsx
/**
 * Re-derive a film's address from its title, for every film that still has its upload filename
 * as its slug (N-84).
 *
 * The slug was set once, at upload, from the videographer's filename
 * (`app/api/admin/uploads/route.ts`), and renaming the title never touched it — so a film an
 * operator renamed *Sangeet* could still answer at `/watch/whatsapp-video-2026-08-12-at-02-07-21`
 * forever. The fix (`resolveSlugChange` in `app/api/admin/titles/[id]/route.ts`) only re-derives
 * a slug on the *first* rename **after** it ships; every title already renamed before today needs
 * this one-off pass instead.
 *
 * Detection: a title whose current `slug` does not match what `slugify(name.en)` would produce
 * today has, by definition, had its name changed since the slug was set — the exact class of row
 * N-84 exists for, whether that rename happened yesterday or a year ago. A title whose slug
 * already matches is left alone, `slug_changed_at` stays null, and it remains eligible for the
 * normal first-rename path going forward.
 *
 *   pnpm reslug:titles           # report only
 *   pnpm reslug:titles --write   # save the new slugs
 *
 * Talks to Supabase directly, like `backfill-sizes` and `preflight`, because the app's data
 * modules are `server-only` and a maintenance script is not a server component. `slugify` and
 * `uniqueSlug` are plain utilities with no such boundary, so they are imported for real rather
 * than re-implemented — one rule for what a free address looks like, not two that drift.
 *
 * Safe to re-run: a title already re-slugged has `slug_changed_at` set, `slugify(name.en)` then
 * matches its (new) slug, and the next pass leaves it alone.
 */
import { existsSync, readFileSync } from 'node:fs'
import { slugify, uniqueSlug } from '../lib/format'

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

type TitleRow = {
  id: string
  catalogue_id: string
  slug: string
  name: { en?: string; hi?: string }
  slug_changed_at: string | null
}

function requireEnv(): void {
  const missing = [
    ['NEXT_PUBLIC_SUPABASE_URL', SUPABASE_URL],
    ['SUPABASE_SERVICE_ROLE_KEY', SUPABASE_KEY],
  ].filter(([, value]) => !value)

  if (missing.length > 0) {
    console.error('Missing configuration:')
    for (const [name] of missing) console.error(`  ${name}`)
    console.error('\nThis reads production data — run it with the deployment’s .env.local.')
    process.exit(1)
  }
}

async function supabase<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    ...init,
    headers: {
      apikey: SUPABASE_KEY!,
      Authorization: `Bearer ${SUPABASE_KEY!}`,
      'content-type': 'application/json',
      ...(init?.headers ?? {}),
    },
  })
  if (!response.ok) throw new Error(`Supabase ${response.status}: ${await response.text()}`)
  return response.status === 204 ? (null as T) : ((await response.json()) as T)
}

async function main(): Promise<void> {
  requireEnv()

  const catalogues = await supabase<{ id: string; slug: string }[]>(
    'catalogues?select=id,slug&order=created_at',
  )
  console.log(`${catalogues.length} catalogue(s)${WRITE ? '' : '  — dry run'}\n`)

  let reslugged = 0
  let untouched = 0

  for (const catalogue of catalogues) {
    const titles = await supabase<TitleRow[]>(
      `titles?catalogue_id=eq.${catalogue.id}&select=id,catalogue_id,slug,name,slug_changed_at&order=sort_order`,
    )

    const mismatched = titles.filter((t) => {
      const expected = slugify(t.name.en ?? '')
      return expected.length > 0 && expected !== t.slug && t.slug_changed_at === null
    })

    if (mismatched.length === 0) {
      console.log(`  ${catalogue.slug}: ${titles.length} film(s) — nothing to do`)
      untouched += titles.length
      continue
    }

    console.log(`  ${catalogue.slug}: ${mismatched.length} of ${titles.length} film(s) mismatched`)

    // Taken slugs for this catalogue, seeded with every title's *current* slug so a re-slug
    // never collides with a sibling — including another title fixed earlier in this same pass.
    const taken = titles.map((t) => t.slug)

    for (const title of mismatched) {
      const next = uniqueSlug(title.name.en ?? '', taken)
      taken.push(next)

      console.log(`      ${title.slug}  →  ${next}`)
      reslugged += 1

      if (WRITE) {
        await supabase(`titles?id=eq.${title.id}`, {
          method: 'PATCH',
          body: JSON.stringify({
            slug: next,
            previous_slug: title.slug,
            slug_changed_at: new Date().toISOString(),
          }),
        })
      }
    }
  }

  console.log()
  console.log(`  reslugged ${reslugged} · already correct ${untouched}`)
  if (!WRITE && reslugged > 0) console.log('\n  Dry run. Re-run with --write to save.')
  if (reslugged > 0) {
    console.log(
      '\n  Each old address keeps resolving for 90 days from slug_changed_at ' +
        '(app/c/[slug]/watch/[titleSlug]/page.tsx) — nothing forwarded today breaks today.',
    )
  }
}

void main().catch((error: unknown) => {
  console.error(error)
  process.exitCode = 1
})
