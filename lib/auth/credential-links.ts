import 'server-only'
import { createHash, randomBytes, randomUUID } from 'node:crypto'
import { getRepository } from '@/lib/db'
import { env } from '@/lib/env'
import { log } from '@/lib/log'
import { enqueue } from '@/lib/notify/send'
import { credentialLinkSchema, type CredentialLink, type Operator } from '@/lib/schema'
import { rootUrl } from '@/lib/tenant'

/**
 * Credential links (D-33): the one way a password gets set without the person typing an old one.
 *
 * Forgot-password, a studio handing a couple their first sign-in, a platform admin creating a
 * studio's first operator — all three issue the same link. It is ours end to end: a random token,
 * hashed at rest, single use, expiring, redeemed on a page of ours, and only the final "set the
 * password" step touches the authenticator through `AuthProvider.setPassword`. That is what makes
 * it behave identically on the local driver and on Supabase Auth, and what keeps it independent
 * of Supabase's own email templates and their site-URL settings — a class of misconfiguration
 * this product has already paid for once (N-17).
 */

/** A reset is short: it arrives in an inbox the person is looking at. */
export const RESET_TTL_S = 60 * 60
/** A first credential is long: a studio sends it and the couple opens it after the honeymoon. */
export const SET_PASSWORD_TTL_S = 14 * 24 * 60 * 60

export type CredentialPurpose = CredentialLink['purpose']

export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex')
}

/** Mint a link. The plaintext token exists only in the returned URL. */
export async function issueCredentialLink(input: {
  operatorId: string
  purpose: CredentialPurpose
  ttlS?: number
}): Promise<{ url: string; link: CredentialLink }> {
  const token = randomBytes(32).toString('base64url')
  const ttlS = input.ttlS ?? (input.purpose === 'reset' ? RESET_TTL_S : SET_PASSWORD_TTL_S)

  const link = credentialLinkSchema.parse({
    id: randomUUID(),
    operatorId: input.operatorId,
    tokenHash: hashToken(token),
    purpose: input.purpose,
    expiresAt: new Date(Date.now() + ttlS * 1000).toISOString(),
    createdAt: new Date().toISOString(),
  })
  await getRepository().createCredentialLink(link)

  return { url: rootUrl(env.ROOT_DOMAIN, `/set-password/${token}`), link }
}

/**
 * The link a token points at, if it is still good. Missing, expired and spent answer the same
 * `null` — a token that says which tells whoever found it something about an account.
 */
export async function redeemableLink(token: string): Promise<CredentialLink | null> {
  if (!token || token.length < 20 || token.length > 200) return null
  const link = await getRepository().getCredentialLinkByHash(hashToken(token))
  if (!link) return null
  if (link.usedAt) return null
  if (new Date(link.expiresAt).getTime() < Date.now()) return null
  return link
}

/**
 * Issue a link and queue the email that carries it, in the recipient's org's language.
 *
 * Queued, never sent inline: the request that decided to send is usually one a person is waiting
 * on, and a mailer being down must not turn "I forgot my password" into an error page.
 */
export async function sendCredentialLink(
  operator: Operator,
  purpose: CredentialPurpose,
): Promise<{ url: string }> {
  const repository = getRepository()
  const org = await repository.getOrg(operator.orgId)
  const { url, link } = await issueCredentialLink({ operatorId: operator.id, purpose })
  const hours = Math.round((new Date(link.expiresAt).getTime() - Date.now()) / 3_600_000)

  await enqueue({
    template: 'credential',
    channel: 'email',
    address: operator.email,
    locale: org?.locale ?? 'en',
    orgId: operator.orgId,
    params: { name: operator.name, url, hours },
  })

  log.info('credential link queued', { operatorId: operator.id, purpose, hours })
  return { url }
}
