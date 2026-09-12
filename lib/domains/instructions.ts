/**
 * The DNS records a domain needs, generated from what was typed (doc 16 §1).
 *
 * Pure and client-safe: the console renders these with copy buttons, and the same function is
 * what the unit tests hold to the spec. A subdomain gets a CNAME; a root domain gets an A record
 * and a `www` CNAME, with the warning that a root domain usually carries the family's email; both
 * get the TXT that proves ownership. Nameserver delegation is offered as the alternative for the
 * studio that would rather hand the whole domain over.
 */

export type DnsRecord = {
  type: 'TXT' | 'CNAME' | 'A'
  /** The relative name a registrar's form asks for — `@`, `www`, `_mehfilbox.films`. */
  name: string
  /** The fully qualified name, for the registrars that want it spelled out. */
  fqdn: string
  value: string
  note?: string
}

export type DomainTargets = {
  cnameTarget: string
  aRecord: string
  nameservers: string[]
}

export type DomainInstructions = {
  host: string
  kind: 'subdomain' | 'root'
  /** The bare registrable domain — `kalyanam.in` for `films.kalyanam.in`. */
  zone: string
  records: DnsRecord[]
  nameservers: string[]
  warnings: string[]
  registrars: { name: string; hint: string }[]
}

/** Public suffixes with two labels, so `kalyanam.co.in` counts as a root domain. */
const TWO_LABEL_SUFFIXES = new Set([
  'co.in', 'net.in', 'org.in', 'firm.in', 'gen.in', 'ind.in', 'ac.in', 'edu.in',
  'co.uk', 'org.uk', 'me.uk', 'com.au', 'net.au', 'org.au', 'co.nz', 'com.sg', 'co.za',
  'com.br', 'co.jp', 'com.mx', 'com.pk', 'com.bd', 'com.np', 'com.lk',
])

/** `kalyanam.in` from `films.kalyanam.in`; the host itself when it is already the zone. */
export function zoneOf(host: string): string {
  const labels = host.toLowerCase().split('.')
  const last2 = labels.slice(-2).join('.')
  const keep = TWO_LABEL_SUFFIXES.has(last2) ? 3 : 2
  return labels.slice(-keep).join('.')
}

export function isRootDomain(host: string): boolean {
  return zoneOf(host) === host.toLowerCase()
}

const REGISTRARS: { name: string; hint: string }[] = [
  { name: 'Hostinger', hint: 'hPanel → Domains → your domain → DNS / Name Servers → Manage DNS records. Add each record; the name is the relative form.' },
  { name: 'GoDaddy', hint: 'My Products → Domains → DNS. Add record; use @ for the root and the relative name otherwise.' },
  { name: 'Namecheap', hint: 'Domain List → Manage → Advanced DNS → Add new record. The host field is the relative name.' },
  { name: 'Cloudflare', hint: 'DNS → Records. Set the CNAME and A records to DNS only (grey cloud), or the certificate cannot be issued.' },
]

export function instructionsFor(host: string, verificationToken: string, targets: DomainTargets): DomainInstructions {
  const lower = host.toLowerCase()
  const zone = zoneOf(lower)
  const root = isRootDomain(lower)
  const label = root ? '' : lower.slice(0, -(zone.length + 1))
  const warnings: string[] = []
  const records: DnsRecord[] = []

  records.push({
    type: 'TXT',
    name: root ? '_mehfilbox' : `_mehfilbox.${label}`,
    fqdn: `_mehfilbox.${lower}`,
    value: verificationToken,
    note: 'Proves the domain is yours. Keep it; it is checked again if the domain is ever re-added.',
  })

  if (root) {
    records.push({
      type: 'A',
      name: '@',
      fqdn: lower,
      value: targets.aRecord,
      note: 'The root cannot carry a CNAME, so it points at our address directly.',
    })
    records.push({
      type: 'CNAME',
      name: 'www',
      fqdn: `www.${lower}`,
      value: targets.cnameTarget,
      note: 'So www. reaches the same page.',
    })
    warnings.push(
      'A root domain usually carries the family’s email. Add these records; do not change or remove the MX records, or the email stops.',
      'If the registrar already has an A record or a CNAME on @, replace it with the A record above — there can be only one.',
    )
  } else {
    records.push({
      type: 'CNAME',
      name: label,
      fqdn: lower,
      value: targets.cnameTarget,
      note: 'Points this name at us. Remove any existing A or CNAME record on the same name first.',
    })
  }

  return {
    host: lower,
    kind: root ? 'root' : 'subdomain',
    zone,
    records,
    nameservers: targets.nameservers,
    warnings,
    registrars: REGISTRARS,
  }
}
