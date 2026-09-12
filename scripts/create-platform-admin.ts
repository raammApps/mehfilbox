#!/usr/bin/env tsx
/**
 * Create the platform owner: the Supabase Auth account, and the `platform_admins` row.
 *
 *   pnpm platform:admin you@example.com
 *
 * **Both halves, or neither works.** The row alone authorises nobody, because there is no
 * credential to sign in with; the account alone reaches nothing, because every platform page
 * answers `notFound()` until the row exists (doc 15 §1). Doing this by hand means two dashboards
 * and a uuid copied between them, and getting it half right looks exactly like the console being
 * broken.
 *
 * The password is written to `.env.platform.local` — gitignored, and deliberately *not* printed,
 * following `scripts/rotate-operator-password.ts`: a credential that reaches a terminal reaches
 * a scrollback, a screen share and a transcript.
 *
 * Idempotent. An existing account is reused and its password left alone; an existing row is left
 * alone. Run it twice and the second run tells you what already existed.
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { randomBytes } from 'node:crypto'

for (const file of ['.env.vercel.local', '.env.local']) {
  if (!existsSync(file)) continue
  for (const line of readFileSync(file, 'utf8').split('\n')) {
    const match = /^\s*([A-Z0-9_]+)\s*=\s*(.*)$/.exec(line)
    if (!match) continue
    const value = match[2]!.trim().replace(/^["']|["']$/g, '')
    if (value && !value.includes('[SENSITIVE]')) process.env[match[1]!] ??= value
  }
}

const url = process.env.NEXT_PUBLIC_SUPABASE_URL
const secret = process.env.SUPABASE_SECRET_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY
const email = process.argv[2]?.trim().toLowerCase()
const name = process.argv[3] ?? 'Platform Owner'

if (!url || !secret) {
  console.error('NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SECRET_KEY must be set.')
  process.exit(1)
}
if (!email || !email.includes('@')) {
  console.error('Usage: pnpm platform:admin <email> [name]')
  process.exit(1)
}

const headers = { apikey: secret, authorization: `Bearer ${secret}`, 'content-type': 'application/json' }

/**
 * Four groups from an alphabet with no ambiguous characters — this gets dictated over a phone
 * eventually, and `l` against `1` is how that goes wrong.
 */
function generatePassword(): string {
  const alphabet = 'abcdefghjkmnpqrstuvwxyz23456789'
  return Array.from({ length: 4 }, () =>
    Array.from(randomBytes(5))
      .map((byte) => alphabet[byte % alphabet.length])
      .join(''),
  ).join('-')
}

async function main(): Promise<void> {
  // ── The account ─────────────────────────────────────────────────────────────
  const lookup = await fetch(
    `${url}/auth/v1/admin/users?per_page=200`,
    { headers },
  )
  if (!lookup.ok) throw new Error(`listing auth users failed: ${lookup.status} ${await lookup.text()}`)
  const { users } = (await lookup.json()) as { users: { id: string; email?: string }[] }
  const existing = users.find((user) => user.email?.toLowerCase() === email)

  let userId: string
  let password: string | null = null

  if (existing) {
    userId = existing.id
    console.log(`  Auth account already exists (${email}); its password was left alone.`)
  } else {
    password = generatePassword()
    const created = await fetch(`${url}/auth/v1/admin/users`, {
      method: 'POST',
      headers,
      // Confirmed on creation: nobody is going to click a link sent to the platform's own inbox
      // before they can reach the console that sends mail in the first place.
      body: JSON.stringify({ email, password, email_confirm: true }),
    })
    if (!created.ok) throw new Error(`creating the auth account failed: ${created.status} ${await created.text()}`)
    userId = ((await created.json()) as { id: string }).id
    console.log(`  Auth account created (${email}).`)
  }

  // ── The row ─────────────────────────────────────────────────────────────────
  const already = await fetch(
    `${url}/rest/v1/platform_admins?select=id,email&id=eq.${userId}`,
    { headers },
  )
  if (!already.ok) throw new Error(`reading platform_admins failed: ${already.status} ${await already.text()}`)
  const rows = (await already.json()) as unknown[]

  if (rows.length > 0) {
    console.log('  platform_admins row already exists; nothing to write.')
  } else {
    const inserted = await fetch(`${url}/rest/v1/platform_admins`, {
      method: 'POST',
      headers: { ...headers, prefer: 'return=minimal' },
      body: JSON.stringify({ id: userId, email, name }),
    })
    if (!inserted.ok) {
      throw new Error(`inserting the platform_admins row failed: ${inserted.status} ${await inserted.text()}`)
    }
    console.log('  platform_admins row created.')
  }

  if (password) {
    writeFileSync(
      '.env.platform.local',
      `# Generated ${new Date().toISOString()}. Gitignored. Move this into your password manager\n` +
        `# and delete the file — it exists only so the password never reaches a terminal.\n` +
        `PLATFORM_ADMIN_EMAIL=${email}\nPLATFORM_ADMIN_PASSWORD=${password}\n`,
      'utf8',
    )
    console.log('  Password written to .env.platform.local (gitignored, not printed here).')
  }

  console.log(`
  Sign in at /login with that address. You will land on /admin/platform, which stays
  invisible — a 404, not a refusal — to everybody else.

  The id, if you ever need it in SQL: ${userId}
`)}

main().catch((error: Error) => {
  console.error(`\n  ${error.message}\n`)
  process.exit(1)
})
