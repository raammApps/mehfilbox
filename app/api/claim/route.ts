import { createHash, randomUUID } from 'node:crypto'
import { NextResponse } from 'next/server'
import { getAuthProvider } from '@/lib/admin/auth'
import { revalidateCatalogue } from '@/lib/catalogue-cache'
import { hashSecret } from '@/lib/crypto'
import { getRepository } from '@/lib/db'
import { ApiError } from '@/lib/http/errors'
import { readJson, route } from '@/lib/http/handler'
import { clientIp, consume } from '@/lib/http/rate-limit'
import { formatWeddingDate } from '@/lib/format'
import { resolveLocalised } from '@/lib/i18n'
import { log } from '@/lib/log'
import { enqueue } from '@/lib/notify/send'
import { publicUrlOf } from '@/lib/address'
import { suggestOrgSlug } from '@/lib/format'
import { claimSchema, orgSchema } from '@/lib/schema'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * A couple takes ownership of their wedding (doc 15 §2).
 *
 * The couple get their **own org**, and the catalogue moves into it. That is the whole design
 * decision: an "owner" column would mean every query forever asking "is this my org, *or* am I
 * the owner?", in RLS and in session handling, and cross-tenant leaks live in exactly that
 * branch. An org per couple is an odd-looking row and zero new isolation logic.
 *
 * After this the partner has no write access at all — they cannot see the catalogue in their
 * list, and cannot fetch it by id. `catalogues.origin_org_id` still records that they built it,
 * so attribution survives an ownership change that is otherwise total.
 */

/** Slow enough to make guessing a 32-byte token pointless twice over. */
const MAX_PER_IP = 10
const WINDOW_S = 60 * 60

function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex')
}

export async function POST(request: Request) {
  return route('claim', async () => {
    const limit = consume(`claim:${clientIp(request)}`, MAX_PER_IP, WINDOW_S)
    if (!limit.allowed) {
      throw new ApiError('RATE_LIMITED', 'Too many attempts', { retryAfterS: limit.retryAfterS })
    }

    const body = await readJson(request, claimSchema)
    const repository = getRepository()

    const transfer = await repository.getTransferByTokenHash(hashToken(body.token))

    // One message for missing, expired and already-claimed. A link that says which it is tells
    // whoever found it something about a wedding they have no business knowing.
    const dead =
      !transfer ||
      transfer.claimedAt !== null ||
      new Date(transfer.expiresAt).getTime() < Date.now()
    if (dead || !transfer) {
      log.warn('claim: refused', { reason: transfer ? 'spent or expired' : 'unknown token' })
      throw new ApiError('NOT_FOUND', 'This link is no longer valid. Ask for a new one.')
    }

    const catalogue = await repository.getCatalogueById(transfer.catalogueId)
    if (!catalogue) throw new ApiError('NOT_FOUND', 'This link is no longer valid. Ask for a new one.')

    // The credential first: nothing has moved yet, so a failure here leaves the handover intact
    // and the link still usable.
    const user = await getAuthProvider().signUp(transfer.toEmail, body.password)
    if (!user) {
      throw new ApiError(
        'VALIDATION_FAILED',
        'Could not create the account. If you already have one, sign in instead.',
        { fields: { password: 'This address may already be registered' } },
      )
    }

    const org = orgSchema.parse({
      id: randomUUID(),
      name: body.coupleName,
      slug: await suggestOrgSlug(body.coupleName, (candidate: string) => repository.getOrgBySlug(candidate)),
      kind: 'couple',
      createdAt: new Date().toISOString(),
    })
    await repository.createOrg(org)

    try {
      await repository.createOperator({
        id: user.id,
        orgId: org.id,
        email: transfer.toEmail,
        name: body.coupleName,
        role: 'admin',
        mustChangePassword: false,
        passwordHash: getAuthProvider().name === 'local' ? hashSecret(body.password) : '',
        createdAt: new Date().toISOString(),
      })
    } catch (error) {
      // Same compensation as registration: an org with no operator is unreachable by every
      // query here and invisible in every UI.
      await repository.deleteOrg(org.id).catch(() => {})
      throw error
    }

    // Snapshot the partner's credit while they still own the row, so it survives them losing
    // the ability to set it.
    const partner = await repository.getOrg(transfer.fromOrgId)
    if (!catalogue.branding.presentedBy && partner?.name) {
      await repository.updateCatalogue(catalogue.id, transfer.fromOrgId, {
        branding: { ...catalogue.branding, presentedBy: partner.name },
      })
    }

    /**
     * Scoped by the *partner's* org, which is what makes this safe to run from a route a
     * stranger reached: the only catalogue it can move is the one the transfer names, owned by
     * the org that issued it. A tampered token still cannot reach anybody else's wedding.
     */
    await repository.transferCatalogue(catalogue.id, transfer.fromOrgId, org.id)

    await repository.markTransferClaimed(transfer.id, org.id)
    revalidateCatalogue(catalogue.slug)

    log.info('catalogue claimed', {
      catalogueId: catalogue.id,
      fromOrgId: transfer.fromOrgId,
      toOrgId: org.id,
    })

    /**
     * The handover email (N-21).
     *
     * A couple only learns what they have if somebody tells them, and until now that was the
     * studio remembering to. It says the four things `D-29` requires and nothing else: it is
     * yours, here is where, **your studio manages the plan**, and nothing is ever deleted.
     *
     * It introduces the studio rather than us because billing never transfers under studio-only
     * (D-26) — a couple who writes to us about a renewal has been sent to the wrong place by
     * their own delivery email.
     *
     * Queued rather than sent, and failure is swallowed: a mailer being down must not turn a
     * successful claim into an error for someone who has just typed their name into a form.
     */
    try {
      await enqueue({
        template: 'handover',
        channel: 'email',
        address: transfer.toEmail,
        locale: catalogue.locale,
        orgId: org.id,
        catalogueId: catalogue.id,
        params: {
          coupleName: resolveLocalised(catalogue.coupleName, catalogue.locale),
          studioName: partner?.name ?? 'your studio',
          url: publicUrlOf(catalogue),
          date: formatWeddingDate(catalogue.includedUntil, catalogue.locale),
        },
      })
    } catch (error) {
      log.error('claim: handover email could not be queued', {
        catalogueId: catalogue.id,
        reason: (error as Error).message,
      })
    }

    // No session: signing in is deliberate, and under Supabase Auth the address may still need
    // confirming, which this route cannot know.
    return NextResponse.json(
      { catalogue: { slug: catalogue.slug }, email: transfer.toEmail },
      { status: 201, headers: { 'cache-control': 'no-store' } },
    )
  })
}
