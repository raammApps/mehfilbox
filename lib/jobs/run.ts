import 'server-only'
import { randomUUID } from 'node:crypto'
import { getRepository } from '@/lib/db'
import { log } from '@/lib/log'
import { jobRunSchema } from '@/lib/schema'

/**
 * A scheduled job leaves a record (D-40, doc 16 §9).
 *
 * Every cron runs its work through this, so "did the drain run last night, and did it work" is a
 * row rather than a log search. What the work returns is the row's detail — the counts a job
 * already reports — and an `ok: false` in it marks the run failed without throwing, which is
 * what the synthetic check needs: the job ran fine; the thing it checked did not.
 *
 * Recording never fails the job. A job that cannot write its own record still has to do its
 * work, and the health page will say the job has not run, which is at least true.
 */
export async function runJob<T extends object>(job: string, work: () => Promise<T>): Promise<T> {
  const startedAt = new Date().toISOString()
  try {
    const detail = await work()
    const ok = (detail as { ok?: unknown }).ok !== false
    await record(job, startedAt, ok, detail as Record<string, unknown>)
    return detail
  } catch (error) {
    await record(job, startedAt, false, { error: (error as Error).message })
    throw error
  }
}

async function record(job: string, startedAt: string, ok: boolean, detail: Record<string, unknown>) {
  try {
    await getRepository().recordJobRun(
      jobRunSchema.parse({
        id: randomUUID(),
        job,
        startedAt,
        finishedAt: new Date().toISOString(),
        ok,
        detail,
      }),
    )
  } catch (error) {
    log.error('job run could not be recorded', { job, reason: (error as Error).message })
  }
}

/** The jobs that exist, in the order the health page lists them, with how often each should run. */
export const JOBS: readonly { name: string; label: string; everyMinutes: number }[] = [
  { name: 'notify', label: 'Notification drain', everyMinutes: 15 },
  { name: 'synthetic', label: 'Synthetic guest check', everyMinutes: 60 },
  { name: 'reconcile', label: 'Transcode reconcile', everyMinutes: 24 * 60 },
  { name: 'usage', label: 'Usage rollup', everyMinutes: 24 * 60 },
  { name: 'lifecycle', label: 'Lapse ladder', everyMinutes: 24 * 60 },
  { name: 'warnings', label: 'Expiry warnings', everyMinutes: 24 * 60 },
]
