import 'server-only'
import { env } from '@/lib/env'
import { log } from '@/lib/log'

/**
 * Attaching a verified domain at the host (doc 16 §1) — the step that issues the certificate.
 *
 * A seam like the video and photo providers: `fake` for the suite, `vercel` when the account is
 * configured, and *no* provider when it is not — in which case a domain waits at `verified` and
 * the platform console lists it under *awaiting attachment*, which is honest, rather than a
 * status that says "active" about a domain nobody attached.
 */
export interface DomainProvider {
  readonly name: string
  attach(host: string): Promise<{ attached: boolean; detail: string }>
  detach(host: string): Promise<void>
}

export class FakeDomainProvider implements DomainProvider {
  readonly name = 'fake'
  readonly attached = new Set<string>()

  async attach(host: string) {
    this.attached.add(host)
    return { attached: true, detail: 'fake driver: attached at once' }
  }

  async detach(host: string) {
    this.attached.delete(host)
  }
}

/** Vercel's project-domains API. A domain already on the project is a success, not a conflict. */
export class VercelDomainProvider implements DomainProvider {
  readonly name = 'vercel'

  private url(path: string): string {
    const team = env.VERCEL_TEAM_ID ? `?teamId=${encodeURIComponent(env.VERCEL_TEAM_ID)}` : ''
    return `https://api.vercel.com${path}${team}`
  }

  async attach(host: string) {
    const response = await fetch(this.url(`/v10/projects/${env.VERCEL_PROJECT_ID}/domains`), {
      method: 'POST',
      headers: { Authorization: `Bearer ${env.VERCEL_API_TOKEN}`, 'content-type': 'application/json' },
      body: JSON.stringify({ name: host }),
      signal: AbortSignal.timeout(8000),
    })
    if (response.ok) return { attached: true, detail: 'added to the project; the certificate follows within minutes' }
    const body = (await response.json().catch(() => null)) as { error?: { code?: string; message?: string } } | null
    if (body?.error?.code === 'domain_already_in_use' || response.status === 409) {
      return { attached: true, detail: 'already on the project' }
    }
    log.error('domains: vercel refused', { host, status: response.status, code: body?.error?.code })
    return { attached: false, detail: body?.error?.message ?? `the host answered ${response.status}` }
  }

  async detach(host: string) {
    await fetch(this.url(`/v9/projects/${env.VERCEL_PROJECT_ID}/domains/${encodeURIComponent(host)}`), {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${env.VERCEL_API_TOKEN}` },
      signal: AbortSignal.timeout(8000),
    }).catch((error: unknown) => log.warn('domains: vercel detach failed', { host, reason: String(error) }))
  }
}

let provider: DomainProvider | null | undefined

export function getDomainProvider(): DomainProvider | null {
  if (provider !== undefined) return provider
  provider =
    env.DOMAIN_DRIVER === 'vercel'
      ? new VercelDomainProvider()
      : env.DOMAIN_DRIVER === 'fake'
        ? new FakeDomainProvider()
        : null
  return provider
}

/** Test seam. */
export function setDomainProvider(next: DomainProvider | null | undefined): void {
  provider = next
}
