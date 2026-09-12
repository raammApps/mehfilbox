import { randomUUID } from 'node:crypto'
import { z } from 'zod'
import { requireOperator, requireOwnedCatalogue } from '@/lib/admin/session'
import { getRepository } from '@/lib/db'
import { instructionsOf, isOurHost, newVerificationToken } from '@/lib/domains'
import { ApiError } from '@/lib/http/errors'
import { noStore, readJson, route } from '@/lib/http/handler'
import { log } from '@/lib/log'
import { domainSchema, hostSchema } from '@/lib/schema'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * `GET|POST /api/admin/domains` — a studio's own domains, and a couple's for one wedding (doc 16 §1).
 *
 * Adding one stores nothing but the intent and a token, and answers with the records to create —
 * generated from what was typed. Nothing is served until DNS proves the domain is theirs and
 * points here, and the host has it attached. One domain per wedding, one per studio.
 */
const bodySchema = z.object({
  host: hostSchema,
  catalogueId: z.string().uuid().nullable().default(null),
})

export async function GET() {
  return route('admin/domains:list', async () => {
    const { orgId } = await requireOperator()
    const domains = await getRepository().listDomains(orgId)
    return noStore({ domains: domains.map((domain) => ({ domain, instructions: instructionsOf(domain) })) })
  })
}

export async function POST(request: Request) {
  return route('admin/domains:create', async () => {
    const { orgId } = await requireOperator()
    const body = await readJson(request, bodySchema)
    const repository = getRepository()

    if (isOurHost(body.host)) {
      throw new ApiError('VALIDATION_FAILED', 'That is our address. A custom domain is one you own.', {
        fields: { host: 'Use a domain you own' },
      })
    }
    if (body.catalogueId) await requireOwnedCatalogue(body.catalogueId)

    if (await repository.getDomainByHost(body.host)) {
      throw new ApiError('VALIDATION_FAILED', 'That domain is already in use', { fields: { host: 'Already in use' } })
    }
    const mine = await repository.listDomains(orgId)
    const taken = body.catalogueId
      ? mine.find((domain) => domain.catalogueId === body.catalogueId)
      : mine.find((domain) => domain.catalogueId === null)
    if (taken) {
      throw new ApiError(
        'VALIDATION_FAILED',
        `${body.catalogueId ? 'This wedding' : 'This studio'} already has a domain (${taken.host}). Remove it first.`,
        { fields: { host: 'One domain at a time' } },
      )
    }

    const domain = await repository.saveDomain(
      domainSchema.parse({
        id: randomUUID(),
        orgId,
        catalogueId: body.catalogueId,
        host: body.host,
        verificationToken: newVerificationToken(),
        createdAt: new Date().toISOString(),
      }),
    )
    log.info('domain added', { orgId, host: domain.host, catalogueId: domain.catalogueId })
    return noStore({ domain, instructions: instructionsOf(domain) }, 201)
  })
}
