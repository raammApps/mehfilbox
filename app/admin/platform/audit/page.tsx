import { notFound } from 'next/navigation'
import { PlatformNav } from '@/components/admin/PlatformNav'
import { getPlatformAdmin } from '@/lib/admin/platform'
import { getRepository } from '@/lib/db'

export const dynamic = 'force-dynamic'

/** Every platform write, newest first (doc 16 §8). The record doc 15 §1 asked each write to leave. */
export default async function PlatformAuditPage() {
  const admin = await getPlatformAdmin()
  if (!admin) notFound()

  const entries = await getRepository().listPlatformAudit({ limit: 200 })

  return (
    <div className="mx-auto min-h-svh w-full max-w-[1100px] p-6">
      <header className="mb-4">
        <h1 className="text-[24px] font-bold tracking-[-0.01em]">Audit</h1>
        <p className="mt-0.5 text-[14px] text-[var(--color-l-text-mid)]">
          What was changed from this console, by whom, and why. The last two hundred.
        </p>
      </header>
      <PlatformNav />

      {entries.length === 0 ? (
        <p className="text-[13px] text-[var(--color-l-text-mid)]">Nothing yet.</p>
      ) : (
        <div className="overflow-x-auto rounded-[var(--radius-card)] border border-[var(--color-l-line)]">
          <table className="w-full border-collapse bg-white text-[13px]">
            <thead>
              <tr className="border-b border-[var(--color-l-line)] text-start">
                <th scope="col" className="px-3 py-2 text-start type-label text-[var(--color-l-text-mid)]">When</th>
                <th scope="col" className="px-3 py-2 text-start type-label text-[var(--color-l-text-mid)]">Who</th>
                <th scope="col" className="px-3 py-2 text-start type-label text-[var(--color-l-text-mid)]">Action</th>
                <th scope="col" className="px-3 py-2 text-start type-label text-[var(--color-l-text-mid)]">Org</th>
                <th scope="col" className="px-3 py-2 text-start type-label text-[var(--color-l-text-mid)]">Detail</th>
              </tr>
            </thead>
            <tbody>
              {entries.map((entry) => {
                const { reason, ...rest } = entry.detail
                return (
                  <tr key={entry.id} className="border-b border-[var(--color-l-line)] align-top last:border-0">
                    <td className="whitespace-nowrap px-3 py-2 text-[var(--color-l-text-mid)]">
                      {new Date(entry.createdAt).toLocaleString('en-IN')}
                    </td>
                    <td className="px-3 py-2">{entry.actorEmail}</td>
                    <td className="px-3 py-2 font-medium">{entry.action}</td>
                    <td className="px-3 py-2">
                      <code className="text-[12px]">{entry.orgSlug ?? '—'}</code>
                    </td>
                    <td className="px-3 py-2">
                      {typeof reason === 'string' ? <p>{reason}</p> : null}
                      {Object.keys(rest).length > 0 ? (
                        <code className="block text-[11px] text-[var(--color-l-text-mid)]">{JSON.stringify(rest)}</code>
                      ) : null}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
