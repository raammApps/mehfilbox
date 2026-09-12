'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'
import type { DomainInstructions } from '@/lib/domains/instructions'
import type { Domain } from '@/lib/schema'

/**
 * Their own address (doc 16 §1): add a domain, get the records to create, check them, and see it
 * go live. The same panel serves a wedding (a couple's domain, at its root) and a studio (every
 * wedding under `/<wedding>`); the difference is who the domain belongs to, not how it is set up.
 *
 * Everything shown is generated from what was typed — a subdomain gets a CNAME, a root domain an
 * A record and a `www` CNAME with the warning about the family's email — with copy buttons and a
 * per-registrar hint, because the person doing this is usually at a registrar they did not choose.
 */
type Entry = { domain: Domain; instructions: DomainInstructions }

type CheckResult = { verified: boolean; problem: string | null }

export function DomainPanel({
  scope,
  catalogueId,
  initial,
}: {
  scope: 'catalogue' | 'studio'
  catalogueId: string | null
  initial: Entry | null
}) {
  const router = useRouter()
  const [entry, setEntry] = useState<Entry | null>(initial)
  const [host, setHost] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [check, setCheck] = useState<CheckResult | null>(null)
  const [showNameservers, setShowNameservers] = useState(false)

  async function call(url: string, init: RequestInit): Promise<Record<string, unknown>> {
    setBusy(true)
    setError(null)
    try {
      const response = await fetch(url, init)
      const body = (await response.json().catch(() => null)) as Record<string, unknown> | null
      if (!response.ok) {
        const problem = body?.error as { message?: string } | undefined
        throw new Error(problem?.message ?? `Request failed (${response.status})`)
      }
      return body ?? {}
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Something went wrong')
      throw cause
    } finally {
      setBusy(false)
    }
  }

  const add = async (event: React.FormEvent) => {
    event.preventDefault()
    try {
      const body = await call('/api/admin/domains', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ host: host.trim(), catalogueId }),
      })
      setEntry({ domain: body.domain as Domain, instructions: body.instructions as DomainInstructions })
      setHost('')
      setCheck(null)
    } catch {
      /* shown */
    }
  }

  const runCheck = async () => {
    if (!entry) return
    try {
      const body = await call(`/api/admin/domains/${entry.domain.id}/check`, { method: 'POST' })
      setEntry({ domain: body.domain as Domain, instructions: body.instructions as DomainInstructions })
      setCheck(body.check as CheckResult)
      router.refresh()
    } catch {
      /* shown */
    }
  }

  const remove = async () => {
    if (!entry) return
    if (!window.confirm(`Remove ${entry.domain.host}? Guests go back to the mehfilbox address.`)) return
    try {
      await call(`/api/admin/domains/${entry.domain.id}`, { method: 'DELETE' })
      setEntry(null)
      setCheck(null)
      router.refresh()
    } catch {
      /* shown */
    }
  }

  return (
    <section
      aria-label="Their own address"
      data-testid="domain-panel"
      className="mb-6 rounded-[var(--radius-card)] border border-[var(--color-l-line)] bg-white p-4"
    >
      <h2 className="mb-1 text-[15px] font-semibold">
        {scope === 'catalogue' ? 'Their own address' : 'Your own domain'}
      </h2>

      {!entry ? (
        <>
          <p className="mb-3 text-[13px] text-[var(--color-l-text-mid)]">
            {scope === 'catalogue'
              ? 'A domain the couple owns, serving this wedding at its root — aanyaandvikram.in. Type it and you get the records to add at their registrar.'
              : 'Serve every wedding you make from your own domain — films.kalyanam.in/<wedding>. Type it and you get the records to add at your registrar.'}
          </p>
          <form onSubmit={(event) => void add(event)} className="flex flex-wrap gap-2">
            <label className="sr-only" htmlFor={`domain-host-${scope}`}>
              Domain
            </label>
            <input
              id={`domain-host-${scope}`}
              type="text"
              inputMode="url"
              autoCapitalize="none"
              spellCheck={false}
              value={host}
              onChange={(event) => setHost(event.target.value)}
              placeholder={scope === 'catalogue' ? 'aanyaandvikram.in' : 'films.yourstudio.in'}
              className="h-11 min-w-[240px] flex-1 rounded-[var(--radius-input)] border border-[var(--color-l-line)] px-3 text-[14px]"
            />
            <button
              type="submit"
              disabled={busy || host.trim().length < 3}
              className="h-11 rounded-[var(--radius-pill)] bg-[var(--color-l-text-hi)] px-5 text-[14px] font-semibold text-white disabled:opacity-60"
            >
              {busy ? 'Adding…' : 'Add this domain'}
            </button>
          </form>
        </>
      ) : (
        <>
          <p className="mb-3 flex flex-wrap items-center gap-2 text-[14px]">
            <code className="text-[15px] font-semibold">{entry.domain.host}</code>
            <StatusPill status={entry.domain.status} />
            {entry.domain.lastCheckedAt ? (
              <span className="text-[12px] text-[var(--color-l-text-mid)]">
                checked {new Date(entry.domain.lastCheckedAt).toLocaleString('en-IN')}
              </span>
            ) : null}
          </p>

          {entry.domain.status === 'active' ? (
            <p className="mb-3 text-[13px]" data-testid="domain-live">
              Live. Guests open{' '}
              <a href={`https://${entry.domain.host}`} target="_blank" rel="noreferrer" className="font-semibold underline underline-offset-4">
                https://{entry.domain.host}
              </a>
              {scope === 'studio' ? '/<wedding>' : ''}; the mehfilbox address sends them there too, so
              links already shared keep working.
            </p>
          ) : entry.domain.status === 'verified' ? (
            <p className="mb-3 text-[13px]">
              DNS is right. The domain is being attached on our side — you will get an email, and
              the address changes over the moment it is.
            </p>
          ) : null}

          {check && !check.verified && check.problem ? (
            <p role="status" className="mb-3 rounded-[var(--radius-input)] border border-[color-mix(in_srgb,var(--color-warn)_45%,white)] bg-[color-mix(in_srgb,var(--color-warn)_10%,white)] px-3 py-2 text-[13px]">
              {check.problem}
            </p>
          ) : entry.domain.error && entry.domain.status !== 'active' ? (
            <p className="mb-3 text-[13px] text-[var(--color-l-text-mid)]">Last seen: {entry.domain.error}</p>
          ) : null}

          {entry.domain.status !== 'active' ? (
            <div className="mb-3">
              <p className="mb-2 text-[13px] font-semibold">
                Add these records at the registrar for {entry.instructions.zone}
              </p>
              <div className="overflow-x-auto rounded-[var(--radius-input)] border border-[var(--color-l-line)]">
                <table className="w-full border-collapse text-[13px]">
                  <thead>
                    <tr className="border-b border-[var(--color-l-line)] text-start">
                      <th scope="col" className="px-2 py-1.5 text-start type-label text-[var(--color-l-text-mid)]">Type</th>
                      <th scope="col" className="px-2 py-1.5 text-start type-label text-[var(--color-l-text-mid)]">Name</th>
                      <th scope="col" className="px-2 py-1.5 text-start type-label text-[var(--color-l-text-mid)]">Value</th>
                      <th scope="col" className="px-2 py-1.5"><span className="sr-only">Copy</span></th>
                    </tr>
                  </thead>
                  <tbody>
                    {entry.instructions.records.map((record) => (
                      <tr key={`${record.type}-${record.fqdn}`} className="border-b border-[var(--color-l-line)] align-top last:border-0">
                        <td className="px-2 py-1.5 font-mono">{record.type}</td>
                        <td className="px-2 py-1.5">
                          <code>{record.name}</code>
                          <span className="block text-[11px] text-[var(--color-l-text-mid)]">{record.fqdn}</span>
                        </td>
                        <td className="px-2 py-1.5">
                          <code className="break-all">{record.value}</code>
                          {record.note ? <span className="block text-[11px] text-[var(--color-l-text-mid)]">{record.note}</span> : null}
                        </td>
                        <td className="px-2 py-1.5">
                          <CopyButton value={record.value} />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {entry.instructions.warnings.map((warning) => (
                <p key={warning} className="mt-2 text-[12px] text-[#a15c00]">
                  {warning}
                </p>
              ))}

              <button
                type="button"
                onClick={() => setShowNameservers((v) => !v)}
                className="mt-3 text-[12px] underline underline-offset-4"
                aria-expanded={showNameservers}
              >
                Rather hand the whole domain over?
              </button>
              {showNameservers ? (
                <div className="mt-1 text-[12px] text-[var(--color-l-text-mid)]">
                  Set the domain&rsquo;s nameservers at the registrar to{' '}
                  {entry.instructions.nameservers.map((ns, index) => (
                    <span key={ns}>
                      {index > 0 ? ' and ' : ''}
                      <code>{ns}</code>
                    </span>
                  ))}
                  . Every record is then managed on our side, email included — tell us the MX
                  records first, or the email stops.
                </div>
              ) : null}

              <details className="mt-3 text-[12px]">
                <summary className="cursor-pointer underline underline-offset-4">Where to add records, by registrar</summary>
                <ul className="mt-1 flex flex-col gap-1 text-[var(--color-l-text-mid)]">
                  {entry.instructions.registrars.map((registrar) => (
                    <li key={registrar.name}>
                      <span className="font-semibold text-[var(--color-l-text-hi)]">{registrar.name}:</span> {registrar.hint}
                    </li>
                  ))}
                </ul>
              </details>
            </div>
          ) : null}

          <div className="flex flex-wrap gap-2">
            {entry.domain.status !== 'active' ? (
              <button
                type="button"
                onClick={() => void runCheck()}
                disabled={busy}
                className="h-10 rounded-[var(--radius-pill)] bg-[var(--color-l-text-hi)] px-5 text-[14px] font-semibold text-white disabled:opacity-60"
              >
                {busy ? 'Checking…' : 'Check DNS'}
              </button>
            ) : null}
            <button
              type="button"
              onClick={() => void remove()}
              disabled={busy}
              className="h-10 rounded-[var(--radius-pill)] border border-[var(--color-l-line)] px-5 text-[14px] font-semibold disabled:opacity-60"
            >
              Remove
            </button>
          </div>
        </>
      )}

      {error ? (
        <p role="alert" className="mt-3 text-[13px] text-[var(--color-error)]">
          {error}
        </p>
      ) : null}
    </section>
  )
}

function StatusPill({ status }: { status: Domain['status'] }) {
  const label: Record<Domain['status'], string> = {
    pending: 'Waiting for DNS',
    verified: 'DNS verified',
    active: 'Live',
    failed: 'Needs attention',
  }
  const tone: Record<Domain['status'], string> = {
    pending: 'bg-[var(--color-l-surface-2)] text-[var(--color-l-text-mid)]',
    verified: 'bg-[color-mix(in_srgb,var(--color-warn)_18%,white)] text-[#7a5200]',
    active: 'bg-[color-mix(in_srgb,var(--color-ok)_18%,white)] text-[#1f5d2c]',
    failed: 'bg-[color-mix(in_srgb,var(--color-error)_14%,white)] text-[var(--color-error)]',
  }
  return (
    <span data-testid="domain-status" data-status={status} className={`rounded-[var(--radius-pill)] px-2 py-0.5 text-[11px] font-semibold ${tone[status]}`}>
      {label[status]}
    </span>
  )
}

function CopyButton({ value }: { value: string }) {
  const [done, setDone] = useState(false)
  return (
    <button
      type="button"
      onClick={() => {
        navigator.clipboard
          ?.writeText(value)
          .then(() => {
            setDone(true)
            setTimeout(() => setDone(false), 1500)
          })
          .catch(() => {})
      }}
      className="h-7 rounded-[var(--radius-pill)] border border-[var(--color-l-line)] px-2 text-[11px] font-semibold"
      aria-label={`Copy ${value}`}
    >
      {done ? 'Copied' : 'Copy'}
    </button>
  )
}
