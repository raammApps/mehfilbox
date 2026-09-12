import 'server-only'
import { getOperatorSession, getSessionOrg, type OperatorSession } from '@/lib/admin/session'
import { getRepository } from '@/lib/db'
import { ApiError } from '@/lib/http/errors'
import type { Catalogue, Org } from '@/lib/schema'

/**
 * The couple's account (D-37) — the same `operators` row and the same `org_id` scope as a
 * studio's session, with one addition and one restriction.
 *
 * The addition: a couple's account can *see* a catalogue linked to it before the handover
 * (`couple_org_id`), not only the ones it owns. That is a disjunction — "mine, or linked to me" —
 * and it is the only one in the product, which is why it lives here and in the two repository
 * methods that serve it, and never in a route. What a linked catalogue permits is narrower than
 * what an owned one does, and `relation` is how a route tells them apart.
 *
 * The restriction: this is for orgs of kind `couple`. A studio operator reaching `/my` is sent
 * to their console, not shown an empty account.
 */

export type CoupleSession = { session: OperatorSession; org: Org }

export async function getCoupleSession(): Promise<CoupleSession | null> {
  const session = await getOperatorSession()
  if (!session) return null
  const org = await getSessionOrg(session)
  if (!org || org.kind !== 'couple') return null
  return { session, org }
}

export async function requireCouple(): Promise<CoupleSession> {
  const session = await getOperatorSession()
  if (!session) throw new ApiError('UNAUTHORIZED', 'Sign in to continue')
  if (session.orgStatus === 'suspended') {
    throw new ApiError('FORBIDDEN', 'This account is closed.')
  }
  const org = await getSessionOrg(session)
  if (!org || org.kind !== 'couple') throw new ApiError('NOT_FOUND', 'Not found')
  return { session, org }
}

export type CoupleRelation = 'owned' | 'linked'

export type CoupleCatalogue = CoupleSession & { catalogue: Catalogue; relation: CoupleRelation }

export function relationOf(catalogue: Catalogue, coupleOrgId: string): CoupleRelation {
  return catalogue.orgId === coupleOrgId ? 'owned' : 'linked'
}

/** A catalogue the couple owns or is linked to, or 404 — never a hint that it exists. */
export async function requireCoupleCatalogue(catalogueId: string): Promise<CoupleCatalogue> {
  const couple = await requireCouple()
  const catalogue = await getRepository().getCatalogueForCouple(catalogueId, couple.org.id)
  if (!catalogue) throw new ApiError('NOT_FOUND', 'Catalogue not found')
  return { ...couple, catalogue, relation: relationOf(catalogue, couple.org.id) }
}
