#!/usr/bin/env tsx
/**
 * Generate a new operator password and the SQL that installs it.
 *
 * The dev default (`mehfilbox-dev`) is committed to this repo and the admin console is publicly
 * reachable, so anyone who reads the source can sign in and reach every catalogue. This exists
 * because rotating it by hand means getting scrypt's exact encoding right, and a wrong hash
 * locks the only operator out of a live system.
 *
 *   pnpm rotate:password [email]
 *
 * The password is written to `.env.operator.local` — gitignored, and *not* printed, so it does
 * not end up in a terminal transcript or a screen share. The hash is printed, because a hash is
 * safe to show and has to be pasted into the SQL editor.
 */
import { writeFileSync } from 'node:fs'
import { randomBytes } from 'node:crypto'
import { hashSecret } from '../lib/crypto'

const email = process.argv[2] ?? 'operator@mehfilbox.test'

/**
 * Four words from a wordless alphabet: long enough that scrypt's cost is irrelevant, and
 * typeable if it ever has to be read off a screen. Ambiguous characters are excluded because
 * this will be dictated over a phone at some point.
 */
const ALPHABET = 'abcdefghjkmnpqrstuvwxyz23456789'
const groups = Array.from({ length: 4 }, () =>
  Array.from(randomBytes(5))
    .map((byte) => ALPHABET[byte % ALPHABET.length])
    .join(''),
)
const password = groups.join('-')
const hash = hashSecret(password)

writeFileSync(
  '.env.operator.local',
  `# Generated ${new Date().toISOString()}. Gitignored. Move this into your password manager\n` +
    `# and delete the file — it exists only so the password never reaches a terminal.\n` +
    `OPERATOR_EMAIL=${email}\nOPERATOR_PASSWORD=${password}\n`,
  'utf8',
)

console.log(`
  Password written to .env.operator.local (gitignored, not printed here).

  Run this in the Supabase SQL editor:

    update operators
       set password_hash = '${hash}'
     where email = '${email}';

  Then sign in with the new password, and delete .env.operator.local.

  Note: the app verifies this hash itself (lib/admin/session.ts), so the Supabase Auth password
  on that account is a separate thing and is not used for the console.
`)
