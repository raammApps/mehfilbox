import { randomBytes, randomUUID, createHash } from 'node:crypto'
import { z } from 'zod'
import { publicUrlOf } from '@/lib/address'
import { requireOwnedCatalogue } from '@/lib/admin/session'
import { revalidateCatalogue } from '@/lib/catalogue-cache'
import { getRepository } from '@/lib/db'
import { env } from '@/lib/env'
import { formatWeddingDate } from '@/lib/format'
import { ApiError } from '@/lib/http/errors'
import { noStore, readJson, route } from '@/lib/http/handler'
import { resolveLocalised } from '@/lib/i18n'
import { log } from '@/lib/log'
import { enqueue } from '@/lib/notify/send'
import { transferSchema } from '@/lib/schema'
import { rootUrl } from '@/lib/tenant'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * Hand a catalogue to the couple who own it (doc 15 §2).
 *
 * **Returns a link rather than sending an email.** Partner and couple are already talking —
 * usually on WhatsApp, which is where a wedding is actually organised in this market — and a
 * link the partner forwards themselves arrives, whereas an automated email lands in spam or
 * waits on SMTP nobody configured. It also means the partner can see exactly what they are
 * sending before they send it.
 *
 * The token is the credential. Whoever holds the link can claim the wedding, so it is single
 * use, expiring, and stored only as a hash — a leaked database must not confer a claim on every
 * handover in flight.
 */

const DAYS = 14
const bodySchema = z.union([
  z.object({ email: z.string().email() }),
  /** Hand over to the linked couple account now — no link, no wait (D-37). */
  z.object({ direct: z.literal(true) }),
])

/** The token is a bearer credential; only its hash is ever written down. */
function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex')
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  return route('admin/catalogue:transfer', async () => {
    const { id } = await params
    const { session, catalogue } = await requireOwnedCatalogue(id)
    const body = await readJson(request, bodySchema)

    const repository = getRepository()

    if ('direct' in body) return noStore(await handOverNow(catalogue, session.orgId))

    // One live handover per catalogue. Two outstanding links is a way to give a wedding to the
    // wrong household, so superseding is explicit: cancel, then issue again.
    const existing = await repository.getLiveTransferForCatalogue(id)
    if (existing) {
      throw new ApiError(
        'VALIDATION_FAILED',
        'A handover is already waiting to be accepted. Cancel it first to send a new link.',
      )
    }

    const token = randomBytes(32).toString('base64url')
    const transfer = transferSchema.parse({
      id: randomUUID(),
      catalogueId: catalogue.id,
      fromOrgId: session.orgId,
      toEmail: body.email,
      tokenHash: hashToken(token),
      expiresAt: new Date(Date.now() + DAYS * 864e5).toISOString(),
      createdAt: new Date().toISOString(),
    })
    await repository.createTransfer(transfer)

    log.info('transfer issued', { catalogueId: catalogue.id, transferId: transfer.id })

    /**
     * The only time the plaintext token exists outside the link. It is not stored, and this
     * response is the partner's single chance to copy it.
     *
     * Built from the **root** host. This used to strip `/admin` off `adminUrl`, which is a no-op
     * in subdomain mode and left the link pointing at `admin.<root>/claim/…` — a host whose
     * middleware rewrites every path into `/admin/*`, so the couple got a 404. Production runs
     * path mode, where the strip happened to work, which is exactly why it survived.
     */
    return noStore({
      transfer: { id: transfer.id, toEmail: transfer.toEmail, expiresAt: transfer.expiresAt },
      claimUrl: rootUrl(env.ROOT_DOMAIN, `/claim/${token}`),
    })
  })
}

/**
 * The handover when the couple already has an account, which since D-37 is the usual case: the
 * studio issued it when the catalogue was created. Nothing to forward, nothing to accept —
 * ownership moves now, the studio's access closes, and the couple is told by email.
 */
async function handOverNow(
  catalogue: Awaited<ReturnType<typeof requireOwnedCatalogue>>['catalogue'],
  fromOrgId: string,
) {
  const repository = getRepository()
  if (!catalogue.coupleOrgId) {
    throw new ApiError('VALIDATION_FAILED', 'Create the couple’s sign-in first, or send them a link')
  }
  const couple = await repository.getOrg(catalogue.coupleOrgId)
  if (!couple || couple.kind !== 'couple') {
    throw new ApiError('VALIDATION_FAILED', 'The linked account is no longer there')
  }

  // Snapshot the studio's credit while it still owns the row, exactly as the claim route does.
  const studio = await repository.getOrg(fromOrgId)
  if (!catalogue.branding.presentedBy && studio?.name) {
    await repository.updateCatalogue(catalogue.id, fromOrgId, {
      branding: { ...catalogue.branding, presentedBy: studio.name },
    })
  }

  await repository.transferCatalogue(catalogue.id, fromOrgId, couple.id)
  // The window is the couple's to open; a handover starts with it shut.
  await repository.updateCatalogue(catalogue.id, couple.id, { supportAccessUntil: null })
  revalidateCatalogue(catalogue.slug)

  const operators = await repository.listOperators(couple.id)
  for (const operator of operators) {
    await enqueue({
      template: 'handover',
      channel: 'email',
      address: operator.email,
      locale: catalogue.locale,
      orgId: couple.id,
      catalogueId: catalogue.id,
      params: {
        coupleName: resolveLocalised(catalogue.coupleName, catalogue.locale),
        studioName: studio?.name ?? 'your studio',
        url: rootUrl(env.ROOT_DOMAIN, '/my'),
        date: formatWeddingDate(catalogue.includedUntil, catalogue.locale),
      },
    }).catch((error: unknown) => {
      log.error('handover: email could not be queued', { reason: String(error) })
    })
  }

  log.info('catalogue handed over directly', {
    catalogueId: catalogue.id,
    fromOrgId,
    toOrgId: couple.id,
    guestUrl: publicUrlOf(catalogue),
  })
  return { transferred: true, toOrgId: couple.id }
}

/** Cancel a handover the couple has not accepted. */
export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  return route('admin/catalogue:transfer:cancel', async () => {
    const { id } = await params
    await requireOwnedCatalogue(id)

    const repository = getRepository()
    const existing = await repository.getLiveTransferForCatalogue(id)
    if (!existing) throw new ApiError('NOT_FOUND', 'No handover is waiting')

    // Deleting the row invalidates the link: the claim route looks the token up by hash, and
    // there is nothing left to find.
    await repository.cancelTransfer(existing.id)
    log.info('transfer cancelled', { catalogueId: id, transferId: existing.id })
    return noStore({ cancelled: existing.id })
  })
}
