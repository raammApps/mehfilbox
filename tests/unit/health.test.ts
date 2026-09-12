import { beforeEach, describe, expect, it } from 'vitest'
import { GET as synthetic } from '@/app/api/cron/synthetic/route'
import { setRepository } from '@/lib/db'
import { MemoryRepository, emptySnapshot } from '@/lib/db/memory-repository'
import {
  probeCdn,
  probeJobs,
  probeMailer,
  probePipeline,
  probeQueue,
  probeStream,
  probeSynthetic,
  summarise,
} from '@/lib/health/probes'
import { env } from '@/lib/env'
import { runJob } from '@/lib/jobs/run'
import { jobRunSchema, notificationSchema, titleSchema } from '@/lib/schema'

/**
 * Platform health (D-40): rows that answer "would a guest notice", read from what the jobs and
 * the queue leave behind. The network probes are exercised only as far as "not configured" —
 * the suite reaches no service, which is the point of the drivers being fake here.
 */

const AT = '2026-01-01T00:00:00.000Z'
const now = () => new Date().toISOString()
const minutesAgo = (m: number) => new Date(Date.now() - m * 60_000).toISOString()

let repo: MemoryRepository

beforeEach(() => {
  repo = new MemoryRepository(emptySnapshot())
  setRepository(repo)
})

describe('a job leaves a record', () => {
  it('records what it returned, and marks ok false when the work says so', async () => {
    const result = await runJob('usage', async () => ({ examined: 3, alerted: 0 }))
    expect(result).toEqual({ examined: 3, alerted: 0 })
    const [run] = await repo.latestJobRuns()
    expect(run).toMatchObject({ job: 'usage', ok: true, detail: { examined: 3, alerted: 0 } })
    expect(Date.parse(run!.finishedAt)).toBeGreaterThanOrEqual(Date.parse(run!.startedAt))

    await runJob('synthetic', async () => ({ ok: false, steps: [{ step: 'resolve', ok: false }] }))
    expect((await repo.latestJobRuns()).find((r) => r.job === 'synthetic')?.ok).toBe(false)
  })

  it('records a failure and still throws it', async () => {
    await expect(runJob('reconcile', async () => { throw new Error('provider unreachable') })).rejects.toThrow(/unreachable/)
    const [run] = await repo.latestJobRuns()
    expect(run).toMatchObject({ job: 'reconcile', ok: false, detail: { error: 'provider unreachable' } })
  })

  it('keeps the newest run per job', async () => {
    await runJob('notify', async () => ({ first: true }))
    await runJob('notify', async () => ({ second: true }))
    const runs = await repo.latestJobRuns()
    expect(runs).toHaveLength(1)
    expect(runs[0]!.detail).toEqual({ second: true })
  })

  it('is what the synthetic cron writes, steps and all', async () => {
    const response = await synthetic(new Request('http://mehfilbox.test/api/cron/synthetic'))
    // No demo catalogue in this store, so the walk fails at the first step — and says so.
    expect(response.status).toBe(503)
    const run = (await repo.latestJobRuns()).find((r) => r.job === 'synthetic')
    expect(run?.ok).toBe(false)
    expect((run?.detail.steps as { step: string }[])[0]?.step).toBe('resolve')

    const row = await probeSynthetic(true)
    expect(row.state).toBe('down')
    expect(row.detail).toMatch(/at "resolve"/)
  })
})

describe('the rows', () => {
  it('report the queue: waiting is fine, failed today is not, and a stale drain is a question', async () => {
    expect((await probeQueue(true)).state).toBe('ok')

    const note = (over: Record<string, unknown>) =>
      notificationSchema.parse({
        id: crypto.randomUUID(),
        template: 'delivery',
        channel: 'email',
        address: 'a@b.test',
        subject: 's',
        bodyText: 't',
        createdAt: now(),
        ...over,
      })
    await repo.enqueueNotification(note({ createdAt: minutesAgo(5) }))
    expect((await probeQueue(true)).state).toBe('ok')

    await repo.enqueueNotification(note({ createdAt: minutesAgo(90) }))
    const stale = await probeQueue(true)
    expect(stale.state).toBe('warn')
    expect(stale.detail).toMatch(/is the drain running/)

    await repo.enqueueNotification(note({ status: 'failed', createdAt: minutesAgo(10) }))
    expect((await probeQueue(true)).detail).toMatch(/1 failed/)
  })

  it('report films stuck past the stall window', async () => {
    expect((await probePipeline(true)).state).toBe('ok')
    await repo.createTitle(
      titleSchema.parse({
        id: crypto.randomUUID(),
        catalogueId: crypto.randomUUID(),
        slug: 'stuck',
        name: { en: 'Stuck' },
        category: 'highlights',
        credits: [],
        provider: 'fake',
        providerId: 'p1',
        status: 'processing',
        published: false,
        sortOrder: 0,
        createdAt: AT,
      }),
    )
    const row = await probePipeline(true)
    expect(row.state).toBe('warn')
    expect(row.detail).toMatch(/1 film past/)
  })

  it('report the jobs: never run, overdue, failed, fine', async () => {
    const never = await probeJobs(true)
    expect(never.state).toBe('warn')
    expect(never.detail).toMatch(/Notification drain: never run/)

    const run = (job: string, over: Partial<{ ok: boolean; finishedAt: string }>) =>
      repo.recordJobRun(
        jobRunSchema.parse({
          id: crypto.randomUUID(),
          job,
          startedAt: over.finishedAt ?? now(),
          finishedAt: over.finishedAt ?? now(),
          ok: over.ok ?? true,
          detail: {},
        }),
      )
    // Every job has run, but the drain last ran an hour ago against a fifteen-minute cadence.
    for (const job of ['synthetic', 'reconcile', 'usage', 'lifecycle', 'warnings']) await run(job, {})
    await run('notify', { finishedAt: minutesAgo(60) })
    const overdue = await probeJobs(true)
    expect(overdue.state).toBe('warn')
    expect(overdue.detail).toMatch(/Notification drain: last ran .* overdue/)

    // A fresh drain is the newest run, so the row settles.
    await run('notify', {})
    expect((await probeJobs(true)).state).toBe('ok')

    await run('reconcile', { ok: false })
    expect((await probeJobs(true)).state).toBe('down')
  })

  it('say so when a service is not configured, without reaching for it', async () => {
    // The suite's drivers are fake; a developer's .env.local may still name a CDN, so each row is
    // held to the configuration it actually runs under.
    if (env.VIDEO_DRIVER !== 'bunny') expect((await probeStream(true)).state).toBe('unconfigured')
    if (env.NOTIFY_DRIVER !== 'resend') expect((await probeMailer(true)).state).toBe('unconfigured')
    if (!env.BUNNY_PHOTO_CDN_HOSTNAME) expect((await probeCdn(true)).state).toBe('unconfigured')
  })

  it('summarise to the worst state, counting only what is configured', () => {
    const row = (state: 'ok' | 'warn' | 'down' | 'unconfigured') => ({
      id: state,
      label: state,
      state,
      detail: '',
      ms: 1,
      checkedAt: now(),
    })
    expect(summarise([row('ok'), row('unconfigured')])).toEqual({ state: 'ok', ok: 1, total: 1 })
    expect(summarise([row('ok'), row('warn')]).state).toBe('warn')
    expect(summarise([row('warn'), row('down')]).state).toBe('down')
  })
})
