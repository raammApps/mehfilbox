/**
 * A six-digit guest code, generated the same way wherever it is asked for (N-77): the wizard's
 * server-side "leave it blank and we'll make one" step, and now the "generate one for me" button
 * on the studio's settings screen and the couple's own panel.
 *
 * Deliberately isomorphic — no `server-only` tag, no `node:crypto` — so a button in a client
 * component can fill the field without a round trip. `crypto.getRandomValues` is Web Crypto,
 * present in both the browser and the Node runtime this app's server routes run on, so this is
 * the one implementation either side needs; `lib/admin/presets.ts` re-exports it rather than
 * keeping its own `node:crypto` copy.
 *
 * Not a secret in the cryptographic sense — it is a code told to guests over WhatsApp, guarded
 * by the rate limit and lockout in `lib/http/rate-limit.ts` (D-34), not by keyspace — so uniform
 * six digits is the right shape and Web Crypto is a convenience, not a requirement it needs to
 * meet. Six rather than four: the per-catalogue bucket (D-34) allows thirty guesses across every
 * device before it closes, and a four-digit code leaves that a real fraction of the space.
 */
export function generatePasscode(): string {
  const bytes = new Uint32Array(1)
  crypto.getRandomValues(bytes)
  // 100000-999999: six digits, never a leading zero, the same range the prior
  // `randomInt(100000, 1000000)` implementation produced.
  return String(100000 + (bytes[0]! % 900000))
}
