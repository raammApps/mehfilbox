import 'server-only'
import { randomBytes } from 'node:crypto'
import { getRepository } from '@/lib/db'
import { env } from '@/lib/env'
import { log } from '@/lib/log'
import type { Catalogue, Domain } from '@/lib/schema'
import { normaliseHost } from '@/lib/tenant'
import { instructionsFor, type DomainInstructions, type DomainTargets } from './instructions'
import { getDomainProvider } from './provider'
import { checkDns, type DnsCheck } from './verify'

/** What the generated instructions point at — configuration, since it changes with the host. */
export function domainTargets(): DomainTargets {
  return {
    cnameTarget: env.DOMAIN_CNAME_TARGET,
    aRecord: env.DOMAIN_A_RECORD,
    nameservers: env.DOMAIN_NAMESERVERS.split(',').map((ns) => ns.trim()).filter(Boolean),
  }
}

export function instructionsOf(domain: Pick<Domain, 'host' | 'verificationToken'>): DomainInstructions {
  return instructionsFor(domain.host, domain.verificationToken, domainTargets())
}

export function newVerificationToken(): string {
  return `mehfilbox-verify-${randomBytes(16).toString('hex')}`
}

/** Our own root, or anything under it, can never be somebody's custom domain. */
export function isOurHost(host: string): boolean {
  const root = normaliseHost(env.ROOT_DOMAIN)
  return host === root || host.endsWith(`.${root}`)
}

/** Where a catalogue is served once this domain is active. */
export function servedAtFor(domain: Pick<Domain, 'host' | 'catalogueId'>, catalogue: Pick<Catalogue, 'slug'>): string {
  return domain.catalogueId ? `https://${domain.host}` : `https://${domain.host}/${catalogue.slug}`
}

/** The catalogues a domain covers: one, or every wedding the studio's segment names. */
export async function cataloguesOf(domain: Domain): Promise<Catalogue[]> {
  const repository = getRepository()
  if (domain.catalogueId) {
    const catalogue = await repository.getCatalogueById(domain.catalogueId)
    return catalogue ? [catalogue] : []
  }
  const org = await repository.getOrg(domain.orgId)
  if (!org) return []
  // Owned and handed over alike: the address is the studio's segment, which a handover keeps.
  const [owned, originated] = await Promise.all([
    repository.listCatalogues({ orgId: org.id }),
    repository.listOriginatedCatalogues(org.id),
  ])
  return [...owned, ...originated].filter((catalogue) => catalogue.tenantSlug === org.slug)
}

async function stamp(domain: Domain, value: (catalogue: Catalogue) => string | null): Promise<number> {
  const repository = getRepository()
  const catalogues = await cataloguesOf(domain)
  for (const catalogue of catalogues) {
    await repository.updateCatalogue(catalogue.id, catalogue.orgId, { servedAt: value(catalogue) })
  }
  return catalogues.length
}

/** Attached: every catalogue it covers is served from it, and every printed URL follows. */
export async function activate(domain: Domain): Promise<Domain> {
  const active = await getRepository().saveDomain({ ...domain, status: 'active', error: null })
  const stamped = await stamp(active, (catalogue) => servedAtFor(active, catalogue))
  log.info('domain active', { host: active.host, catalogues: stamped })
  return active
}

/** Removed or withdrawn: back to the mehfilbox path, for every catalogue that was on it. */
export async function deactivate(domain: Domain): Promise<void> {
  const prefix = `https://${domain.host}`
  await stamp(domain, (catalogue) => (catalogue.servedAt?.startsWith(prefix) ? null : catalogue.servedAt))
  const provider = getDomainProvider()
  if (domain.status === 'active' && provider) await provider.detach(domain.host)
}

/**
 * The suite's DNS: a `.test` host is taken as correctly configured and anything else as not
 * yet, so the console's whole path can be walked without a resolver.
 */
function fakeCheck(domain: Pick<Domain, 'host'>): DnsCheck {
  const verified = domain.host.endsWith('.test')
  return {
    verified,
    ownership: verified,
    pointing: verified,
    seen: { txt: [], cname: [], a: [] },
    problem: verified ? null : `No TXT record at _mehfilbox.${domain.host} yet (fake driver: use a .test host).`,
  }
}

/**
 * "Check DNS": look, record what was seen, and — when both records hold — verify and, if a
 * provider is configured, attach. A domain a person still has to attach waits at `verified`.
 */
export async function checkAndAdvance(domain: Domain): Promise<{ domain: Domain; check: DnsCheck }> {
  const repository = getRepository()
  const check = env.DOMAIN_DRIVER === 'fake' ? fakeCheck(domain) : await checkDns(domain, domainTargets())
  const now = new Date().toISOString()

  if (!check.verified) {
    const domainAfter = await repository.saveDomain({
      ...domain,
      status: domain.status === 'active' ? 'active' : 'pending',
      lastCheckedAt: now,
      error: check.problem,
    })
    return { domain: domainAfter, check }
  }

  const verified = await repository.saveDomain({ ...domain, status: domain.status === 'active' ? 'active' : 'verified', lastCheckedAt: now, error: null })
  if (verified.status === 'active') return { domain: verified, check }

  const provider = getDomainProvider()
  if (!provider) return { domain: verified, check }

  const result = await provider.attach(verified.host)
  if (!result.attached) {
    const failed = await repository.saveDomain({ ...verified, status: 'failed', error: result.detail })
    return { domain: failed, check }
  }
  return { domain: await activate(verified), check }
}
