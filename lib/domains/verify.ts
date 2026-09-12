import 'server-only'
import { promises as dns } from 'node:dns'
import type { Domain } from '@/lib/schema'
import { instructionsFor, type DomainTargets } from './instructions'

/**
 * "Check DNS" (doc 16 §1): resolve the TXT and the CNAME or A from the server and say what was
 * seen, in words. Ownership is the TXT carrying the token; pointing is the CNAME (or A) reaching
 * our target. Both have to hold before a domain moves to `verified`.
 *
 * The resolver is injectable so the suite can hand in records without a network, and so a
 * developer can run the check against a stub.
 */
export type DnsLookup = {
  txt(name: string): Promise<string[]>
  cname(name: string): Promise<string[]>
  a(name: string): Promise<string[]>
}

export type DnsCheck = {
  verified: boolean
  ownership: boolean
  pointing: boolean
  seen: { txt: string[]; cname: string[]; a: string[] }
  /** A sentence for the console when something is missing or wrong. */
  problem: string | null
}

const NOT_FOUND = new Set(['ENOTFOUND', 'ENODATA', 'ESERVFAIL', 'ETIMEOUT', 'EREFUSED'])

/** A missing record is an answer, not an error. Anything else propagates. */
async function soft(work: () => Promise<string[]>): Promise<string[]> {
  try {
    return await work()
  } catch (error) {
    const code = (error as { code?: string }).code
    if (code && NOT_FOUND.has(code)) return []
    throw error
  }
}

export function nodeLookup(timeoutMs = 3000): DnsLookup {
  const resolver = new dns.Resolver({ timeout: timeoutMs, tries: 1 })
  return {
    // TXT answers arrive in chunks; a long token is one record split in two.
    txt: (name) => soft(async () => (await resolver.resolveTxt(name)).map((chunks) => chunks.join(''))),
    cname: (name) => soft(() => resolver.resolveCname(name)),
    a: (name) => soft(() => resolver.resolve4(name)),
  }
}

let lookup: DnsLookup | null = null

/** Test seam, the same shape as `setRepository`. */
export function setDnsLookup(next: DnsLookup | null): void {
  lookup = next
}

const strip = (value: string) => value.trim().toLowerCase().replace(/\.$/, '')

export async function checkDns(
  domain: Pick<Domain, 'host' | 'verificationToken'>,
  targets: DomainTargets,
  resolver: DnsLookup = lookup ?? nodeLookup(),
): Promise<DnsCheck> {
  const instructions = instructionsFor(domain.host, domain.verificationToken, targets)
  const txt = await resolver.txt(`_mehfilbox.${domain.host}`)
  const ownership = txt.some((value) => value.trim() === domain.verificationToken)

  let cname: string[] = []
  let a: string[] = []
  let pointing = false
  if (instructions.kind === 'subdomain') {
    cname = await resolver.cname(domain.host)
    pointing = cname.some((value) => strip(value) === strip(targets.cnameTarget))
  } else {
    a = await resolver.a(domain.host)
    pointing = a.includes(targets.aRecord)
  }

  let problem: string | null = null
  if (!ownership) {
    problem =
      txt.length === 0
        ? `No TXT record at _mehfilbox.${domain.host} yet. DNS changes take from a few minutes to a day to show.`
        : `The TXT record at _mehfilbox.${domain.host} does not carry the token — check for a stray space or an old value.`
  } else if (!pointing) {
    problem =
      instructions.kind === 'subdomain'
        ? cname.length === 0
          ? `Ownership proved; no CNAME on ${domain.host} yet.`
          : `Ownership proved; ${domain.host} points at ${cname.join(', ')} rather than ${targets.cnameTarget}.`
        : a.length === 0
          ? `Ownership proved; no A record on ${domain.host} yet.`
          : `Ownership proved; ${domain.host} points at ${a.join(', ')} rather than ${targets.aRecord}.`
  }

  return { verified: ownership && pointing, ownership, pointing, seen: { txt, cname, a }, problem }
}
