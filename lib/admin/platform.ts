import 'server-only'
import { randomUUID } from 'node:crypto'
import { getRepository } from '@/lib/db'
import { ApiError } from '@/lib/http/errors'
import { platformAuditSchema } from '@/lib/schema'
import { getAuthProvider } from './auth'
import type { PlatformAdmin } from '@/lib/schema'

/**
 * Whoever runs the platform (doc 15 §1) — the counterpart of `lib/admin/session.ts`.
 *
 * Deliberately a **separate file with a separate function**, not a flag on `OperatorSession`.
 * A boolean on the session would mean every org-scoped query could, in principle, be asked to
 * skip its scope, and the only thing standing between a tenant's data and everyone else's would
 * be that no route forgot to check it. Doc 15 §1 chose the other trade: a platform admin has no
 * org at all, no scoped query changes, and platform-wide views get written one at a time.
 *
 * The practical consequence, and it is the point: **there is no way to widen an operator into an
 * admin.** `getOperatorSession` reads the `operators` row; this reads `platform_admins`. Nothing
 * converts between them, in either direction.
 *
 * The pages call `getPlatformAdmin` and answer `notFound()`. A 404 rather than a refusal is
 * deliberate: an operator poking at `/admin/platform` should not learn the surface exists.
 * `requirePlatformAdmin` is the API counterpart, added with the first platform write (N-27), and
 * it answers `NOT_FOUND` for the same reason.
 */

export async function getPlatformAdmin(): Promise<PlatformAdmin | null> {
  // Identity from the authenticated user, exactly as the operator path does — and then a second
  // lookup that decides what they may see. Authentication is swappable; this is not.
  const user = await getAuthProvider().currentUser()
  if (!user) return null
  return getRepository().getPlatformAdmin(user.id)
}

/**
 * The guard every platform write route calls. Answers NOT_FOUND rather than FORBIDDEN, so probing
 * the endpoint teaches nothing that probing the page does not.
 */
export async function requirePlatformAdmin(): Promise<PlatformAdmin> {
  const admin = await getPlatformAdmin()
  if (!admin) throw new ApiError('NOT_FOUND', 'Not found')
  return admin
}

/**
 * Record a platform-admin action (N-27).
 *
 * Called by the write, not around it, and **after** the write succeeds — an audit trail that also
 * lists attempts that failed is a different artefact, and conflating them means neither question
 * can be answered cleanly. What matters here is "what changed, and who changed it".
 *
 * The org's slug is copied in rather than joined later, so the row still reads after the org is
 * deleted — which is when someone is most likely to be reading it.
 */
export async function recordPlatformAction(input: {
  admin: PlatformAdmin
  action: string
  org?: { id: string; slug: string } | null
  detail?: Record<string, unknown>
}): Promise<void> {
  await getRepository().recordPlatformAudit(
    platformAuditSchema.parse({
      id: randomUUID(),
      actorId: input.admin.id,
      actorEmail: input.admin.email,
      action: input.action,
      orgId: input.org?.id ?? null,
      orgSlug: input.org?.slug ?? null,
      detail: input.detail ?? {},
      createdAt: new Date().toISOString(),
    }),
  )
}
