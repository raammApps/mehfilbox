import 'server-only'
import { randomBytes, randomUUID } from 'node:crypto'
import { getAuthProvider } from '@/lib/admin/auth'
import { makeCredits } from '@/lib/admin/credits'
import { sendCredentialLink } from '@/lib/auth/credential-links'
import { hashSecret } from '@/lib/crypto'
import { getRepository } from '@/lib/db'
import { suggestOrgSlug } from '@/lib/format'
import { ApiError } from '@/lib/http/errors'
import { log } from '@/lib/log'
import { orgSchema, type Locale, type Operator, type Org, type PlatformAdmin } from '@/lib/schema'

/**
 * Accounts the platform makes on somebody's behalf (D-39, doc 16 §8).
 *
 * The same three steps registration and the couple's sign-in already take — credential, org,
 * operator, with the org unwound if the operator cannot be written — and the same first password:
 * thirty-two random bytes nobody sees, replaced through the set-password link the new person
 * receives. We never choose a password for anyone, and never hold one.
 */

/** A credential nobody knows, for an account whose real password arrives by link. */
function unknownPassword(): string {
  return randomBytes(32).toString('base64url')
}

async function createOperatorFor(
  org: Org,
  input: { email: string; name: string; role: Operator['role'] },
): Promise<{ operator: Operator; link: string }> {
  const auth = getAuthProvider()
  const repository = getRepository()
  const email = input.email.trim().toLowerCase()

  if (await repository.getOperatorByEmail(email)) {
    throw new ApiError('VALIDATION_FAILED', 'That address already has an account', {
      fields: { email: 'Already in use' },
    })
  }
  const password = unknownPassword()
  const user = await auth.createUser(email, password)
  if (!user) {
    throw new ApiError('VALIDATION_FAILED', 'That address cannot be used', {
      fields: { email: 'Try a different address' },
    })
  }

  const operator = await repository.createOperator({
    id: user.id,
    orgId: org.id,
    email,
    name: input.name.trim(),
    role: input.role,
    passwordHash: auth.name === 'local' ? hashSecret(password) : '',
    mustChangePassword: false,
    createdAt: new Date().toISOString(),
  })

  // The link is returned as well as queued: a console with no mailer configured still has to be
  // able to hand it over, and the plaintext token exists nowhere else.
  const { url } = await sendCredentialLink(operator, 'set-password')
  return { operator, link: url }
}

/** A studio, with its first operator and, when asked, its opening credits. */
export async function createStudio(input: {
  admin: PlatformAdmin
  name: string
  email: string
  contactName: string
  locale: Locale
  credits: number
  reason?: string
}): Promise<{ org: Org; operator: Operator; link: string }> {
  const repository = getRepository()

  const org = orgSchema.parse({
    id: randomUUID(),
    name: input.name.trim(),
    slug: await suggestOrgSlug(input.name, (candidate) => repository.getOrgBySlug(candidate)),
    kind: 'partner',
    locale: input.locale,
    branding: { presentedBy: input.name.trim() },
    createdAt: new Date().toISOString(),
  })
  await repository.createOrg(org)

  let made: { operator: Operator; link: string }
  try {
    made = await createOperatorFor(org, { email: input.email, name: input.contactName, role: 'admin' })
  } catch (error) {
    // An org with no operator is unreachable everywhere; registration unwinds the same way.
    await repository.deleteOrg(org.id).catch(() => {})
    log.error('platform: rolled back the studio', { orgId: org.id, error: String(error) })
    throw error
  }

  if (input.credits > 0) {
    await repository.grantCredits(
      makeCredits({
        orgId: org.id,
        count: input.credits,
        grantedBy: input.admin.email,
        reason: input.reason ?? 'Opening credits',
      }),
    )
  }

  return { org, ...made }
}

/** Another person who can sign in to an existing org. */
export async function addOperator(input: {
  orgId: string
  email: string
  name: string
  role: Operator['role']
}): Promise<{ org: Org; operator: Operator; link: string }> {
  const org = await getRepository().getOrg(input.orgId)
  if (!org) throw new ApiError('NOT_FOUND', 'Org not found')
  const made = await createOperatorFor(org, input)
  return { org, ...made }
}
