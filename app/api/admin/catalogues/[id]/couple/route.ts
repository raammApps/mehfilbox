import { randomBytes, randomUUID } from 'node:crypto'
import { z } from 'zod'
import { getAuthProvider } from '@/lib/admin/auth'
import { getSessionOrg, requireOwnedCatalogue } from '@/lib/admin/session'
import { sendCredentialLink, temporaryPassword } from '@/lib/auth/credential-links'
import { hashSecret } from '@/lib/crypto'
import { getRepository } from '@/lib/db'
import { suggestOrgSlug } from '@/lib/format'
import { ApiError } from '@/lib/http/errors'
import { noStore, readJson, route } from '@/lib/http/handler'
import { log } from '@/lib/log'
import { orgSchema } from '@/lib/schema'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const bodySchema = z.object({
  email: z.string().email(),
  name: z.string().trim().min(2).max(80),
  /**
   * How the first password reaches the couple (D-33). `link` emails a set-password link; `temporary`
   * hands the studio a password to read out across the table, shown once, and flagged so it lives
   * exactly one sign-in.
   */
  delivery: z.enum(['link', 'temporary']).default('link'),
})

/**
 * `POST /api/admin/catalogues/:id/couple` — the studio issues the couple's sign-in (D-33, D-37).
 *
 * Three outcomes, one route: the address is new and an account is made for it; the address
 * already has a couple account and the catalogue is linked to it (the second wedding, the
 * anniversary from another studio — one account, never two); or the address belongs to a studio
 * operator, which is refused with a plain sentence rather than quietly attached.
 *
 * The couple's org is `kind = couple`, exactly as a handover would have created it. Nothing about
 * isolation changes: a couple's account is an org, and the link is a column the couple's own
 * session reads.
 */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  return route('admin/catalogue:couple', async () => {
    const { id } = await params
    const { session, catalogue } = await requireOwnedCatalogue(id)
    const body = await readJson(request, bodySchema)
    const email = body.email.trim().toLowerCase()

    const repository = getRepository()
    const studio = await getSessionOrg(session)
    if (studio?.kind !== 'partner') {
      throw new ApiError('FORBIDDEN', 'Only a studio can issue a couple’s sign-in')
    }

    const existing = await repository.getOperatorByEmail(email)
    if (existing) {
      const org = await repository.getOrg(existing.orgId)
      if (org?.kind !== 'couple') {
        throw new ApiError('VALIDATION_FAILED', 'That address belongs to a studio account', {
          fields: { email: 'Use the couple’s own address' },
        })
      }
      await repository.updateCatalogue(catalogue.id, session.orgId, { coupleOrgId: org.id })
      log.info('couple linked', { catalogueId: catalogue.id, coupleOrgId: org.id })
      return noStore({ linked: true, existing: true, email })
    }

    const auth = getAuthProvider()
    // A link means the couple chooses their own password; the account still needs one to exist,
    // so it gets 32 random bytes nobody ever sees.
    const password = body.delivery === 'temporary' ? temporaryPassword() : randomBytes(32).toString('base64url')

    const user = await auth.createUser(email, password)
    if (!user) {
      // Registered with the authenticator but with no operator row — a stranded credential from
      // an earlier failure, or an address in use elsewhere. One outcome either way.
      throw new ApiError('VALIDATION_FAILED', 'That address cannot be used', {
        fields: { email: 'Try a different address' },
      })
    }

    const org = orgSchema.parse({
      id: randomUUID(),
      name: body.name,
      slug: await suggestOrgSlug(body.name, (candidate) => repository.getOrgBySlug(candidate)),
      kind: 'couple',
      // The couple reads in the language the wedding was set up in.
      locale: catalogue.locale,
      createdAt: new Date().toISOString(),
    })
    await repository.createOrg(org)

    let operator
    try {
      operator = await repository.createOperator({
        id: user.id,
        orgId: org.id,
        email,
        name: body.name,
        role: 'admin',
        passwordHash: auth.name === 'local' ? hashSecret(password) : '',
        mustChangePassword: body.delivery === 'temporary',
        createdAt: new Date().toISOString(),
      })
    } catch (error) {
      // Same compensation as registration: an org with no operator is unreachable everywhere.
      await repository.deleteOrg(org.id).catch(() => {})
      throw error
    }

    await repository.updateCatalogue(catalogue.id, session.orgId, { coupleOrgId: org.id })

    if (body.delivery === 'link') {
      await sendCredentialLink(operator, 'set-password').catch((error: unknown) => {
        // The account exists and is linked; a mailer being down is a resend, not a rollback.
        log.error('couple: could not queue the credential link', { reason: String(error) })
      })
    }

    log.info('couple account created', {
      catalogueId: catalogue.id,
      coupleOrgId: org.id,
      delivery: body.delivery,
    })

    return noStore(
      {
        linked: true,
        existing: false,
        email,
        // Shown once. It is not stored anywhere in plain text, so there is no "show it again".
        ...(body.delivery === 'temporary' ? { temporaryPassword: password } : {}),
      },
      201,
    )
  })
}
