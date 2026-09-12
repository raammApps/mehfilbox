import Link from 'next/link'
import { notFound } from 'next/navigation'
import { PlatformNav } from '@/components/admin/PlatformNav'
import { getPlatformAdmin } from '@/lib/admin/platform'
import { probeAll, summarise, type HealthState } from '@/lib/health/probes'

export const dynamic = 'force-dynamic'

/**
 * Would a guest notice? (D-40, doc 16 §9)
 *
 * Ten rows, each probed live inside a three-second budget and remembered for a minute. Reachable
 * only by a platform admin; `/api/health` stays shallow and public for uptime monitors — and it
 * stayed green through every real fault this product has had, which is why this page exists.
 */
export default async function PlatformHealthPage({
  searchParams,
}: {
  searchParams: Promise<{ fresh?: string }>
}) {
  const admin = await getPlatformAdmin()
  if (!admin) notFound()

  const { fresh } = await searchParams
  const rows = await probeAll({ fresh: fresh === '1' })
  const summary = summarise(rows)

  return (
    <div className="mx-auto min-h-svh w-full max-w-[1100px] p-6">
      <header className="mb-4">
        <h1 className="flex flex-wrap items-center gap-3 text-[24px] font-bold tracking-[-0.01em]">
          Health
          <Dot state={summary.state} large />
        </h1>
        <p className="mt-0.5 text-[14px] text-[var(--color-l-text-mid)]">
          {summary.ok} of {summary.total} configured services answer as they should. Each row is
          checked live and remembered for a minute.{' '}
          <Link href="/admin/platform/health?fresh=1" className="underline underline-offset-4">
            Check again now
          </Link>
        </p>
      </header>
      <PlatformNav />

      <ul className="flex flex-col gap-2" aria-label="Services">
        {rows.map((row) => (
          <li
            key={row.id}
            data-testid={`health-${row.id}`}
            data-state={row.state}
            className="flex flex-wrap items-start gap-3 rounded-[var(--radius-card)] border border-[var(--color-l-line)] bg-white px-4 py-3"
          >
            <Dot state={row.state} />
            <div className="min-w-0 flex-1">
              <p className="text-[15px] font-semibold">{row.label}</p>
              <p className="text-[13px] text-[var(--color-l-text-mid)]">{row.detail}</p>
            </div>
            <p className="text-[12px] tabular-nums text-[var(--color-l-text-mid)]">
              {row.ms} ms · {new Date(row.checkedAt).toLocaleTimeString('en-IN')}
            </p>
          </li>
        ))}
      </ul>
    </div>
  )
}

const COLOURS: Record<HealthState, string> = {
  ok: 'var(--color-ok)',
  warn: 'var(--color-warn)',
  down: 'var(--color-error)',
  unconfigured: 'var(--color-l-line)',
}
const WORDS: Record<HealthState, string> = {
  ok: 'answering',
  warn: 'needs a look',
  down: 'down',
  unconfigured: 'not configured',
}

function Dot({ state, large = false }: { state: HealthState; large?: boolean }) {
  return (
    <span
      role="img"
      aria-label={WORDS[state]}
      title={WORDS[state]}
      className={`inline-block shrink-0 rounded-full ${large ? 'h-4 w-4' : 'mt-1.5 h-3 w-3'}`}
      style={{ background: COLOURS[state] }}
    />
  )
}
