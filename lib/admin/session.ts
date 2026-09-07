import 'server-only'
import { getRepository } from '@/lib/db'
import { ApiError } from '@/lib/http/errors'
import { getAuthProvider } from './auth'
import type { Catalogue, Operator, Org, OrgStatus } from '@/lib/schema'

/**
 * Operator identity, and the single place `org_id` enters a query.
 *
 * doc 07: "every query is scoped to `org_id` from the session, never from the request body".
 * Enforcing that here rather than per-route is what makes the rule auditable — a route that
 * does not call one of these functions is visibly unscoped.
 */

export type OperatorSession = { operator: Operator; orgId: string; orgStatus: OrgStatus }

export async function getOperatorSession(): Promise<OperatorSession | null> {
  // *Who* comes from the auth driver; *what they may see* comes from the operators row, always.
  // Authentication is swappable; this authorisation step is not, which is what keeps swapping
  // the authenticator from widening anyone's reach.
  const user = await getAuthProvider().currentUser()
  if (!user) return null

  const context = await getRepository().getOperatorWithOrgStatus(user.id)
  // An authenticated user with no operator row is a real state under Supabase Auth — somebody
  // signed up, or was invited, and has not been granted access to an org. It is not an error,
  // and it must not be treated as a session.
  if (!context) return null

  /**
   * A suspended org still gets a session, and that is deliberate (N-27).
   *
   * Returning null here would bounce them to the login page, where they would sign in
   * successfully and bounce again — a loop that says nothing. They keep an identity, every write
   * is refused by `requireOperator`, and the console tells them why.
   */
  return { operator: context.operator, orgId: context.operator.orgId, orgStatus: context.orgStatus }
}

/**
 * The session's org, for the console's chrome and for the few places that show a partner
 * something a couple has no use for.
 *
 * Separate from `OperatorSession` on purpose. Every API route calls `requireOperator`, and none
 * of them need this — folding it in would buy a query on every write to read a row nobody looks
 * at. It is display only: `orgId` still comes from the operator row, and no query is ever scoped
 * by what this returns.
 */
export async function getSessionOrg(session: OperatorSession): Promise<Org | null> {
  return getRepository().getOrg(session.orgId)
}

export async function requireOperator(): Promise<OperatorSession> {
  const session = await getOperatorSession()
  if (!session) throw new ApiError('UNAUTHORIZED', 'Sign in to continue')
  /**
   * Suspension is enforced here, at the same choke point as org scoping, so a route that forgot
   * about it is a route that was already unscoped. It refuses reads as well as writes: a
   * suspended studio's console is not a read-only mode anyone asked for, and half a console is
   * more confusing than a clear refusal.
   */
  if (session.orgStatus === 'suspended') {
    throw new ApiError('FORBIDDEN', 'This studio account is suspended. Contact support.')
  }
  return session
}

/** Load a catalogue that belongs to the session's org, or 404. Never trusts a body `orgId`. */
export async function requireOwnedCatalogue(catalogueId: string): Promise<{
  session: OperatorSession
  catalogue: Catalogue
}> {
  const session = await requireOperator()
  const catalogue = await getRepository().getCatalogue(catalogueId, session.orgId)
  // 404 rather than 403: another org's catalogue should not be confirmed to exist.
  if (!catalogue) throw new ApiError('NOT_FOUND', 'Catalogue not found')
  return { session, catalogue }
}
