import 'server-only'
import { getRepository } from '@/lib/db'
import { env } from '@/lib/env'
import { JOBS } from '@/lib/jobs/run'
import type { JobRun } from '@/lib/schema'

/**
 * Platform health: "would a guest notice", not "did the app boot" (D-40, doc 16 §9).
 *
 * Each row is probed live with a three-second budget and remembered for a minute, and each is
 * reported as a state and a sentence written for the person reading it at nine on a Saturday.
 * `/api/health` stays shallow and public for uptime monitors; this is the page a platform admin
 * opens when a studio writes in.
 */
export type HealthState = 'ok' | 'warn' | 'down' | 'unconfigured'

export type HealthRow = {
  id: string
  label: string
  state: HealthState
  detail: string
  /** How long the probe took, so a slow service shows before it is a dead one. */
  ms: number
  checkedAt: string
}

const BUDGET_MS = 3000
const REMEMBER_MS = 60_000
const remembered = new Map<string, HealthRow>()

type Verdict = { state: HealthState; detail: string }

async function probe(id: string, label: string, fresh: boolean, work: () => Promise<Verdict>): Promise<HealthRow> {
  const seen = remembered.get(id)
  if (!fresh && seen && Date.now() - Date.parse(seen.checkedAt) < REMEMBER_MS) return seen

  const started = Date.now()
  let verdict: Verdict
  try {
    verdict = await Promise.race<Verdict>([
      work(),
      new Promise<Verdict>((_, reject) =>
        setTimeout(() => reject(new Error(`no answer within ${BUDGET_MS / 1000}s`)), BUDGET_MS).unref?.(),
      ),
    ])
  } catch (error) {
    verdict = { state: 'down', detail: (error as Error).message }
  }
  const row: HealthRow = { id, label, ...verdict, ms: Date.now() - started, checkedAt: new Date().toISOString() }
  remembered.set(id, row)
  return row
}

/** A fetch that gives up inside the budget rather than hanging the page on a dead service. */
function fetchWithin(url: string, init: RequestInit = {}): Promise<Response> {
  return fetch(url, { ...init, signal: AbortSignal.timeout(BUDGET_MS), cache: 'no-store' })
}

function ago(iso: string): string {
  const minutes = Math.max(0, Math.round((Date.now() - Date.parse(iso)) / 60_000))
  if (minutes < 60) return `${minutes} min ago`
  const hours = Math.round(minutes / 60)
  if (hours < 48) return `${hours} h ago`
  return `${Math.round(hours / 24)} days ago`
}

// ── the rows ──────────────────────────────────────────────────────────────────

export function probeDatabase(fresh = false): Promise<HealthRow> {
  return probe('database', 'Database', fresh, async () => {
    if (env.DATA_DRIVER !== 'supabase') {
      return { state: 'ok', detail: `${env.DATA_DRIVER} driver — nothing remote to reach` }
    }
    // The newest migration's table, read through the same driver the app uses: a schema that is
    // one migration behind fails here, not in front of a studio.
    await getRepository().creditBalance('00000000-0000-4000-8000-000000000000', new Date().toISOString())
    return { state: 'ok', detail: 'schema answers; the credits table (0021) exists' }
  })
}

export function probeStream(fresh = false): Promise<HealthRow> {
  return probe('stream', 'Bunny Stream', fresh, async () => {
    if (env.VIDEO_DRIVER !== 'bunny' || !env.BUNNY_LIBRARY_ID || !env.BUNNY_API_KEY) {
      return { state: 'unconfigured', detail: 'fake video driver' }
    }
    const response = await fetchWithin(`https://video.bunnycdn.com/library/${env.BUNNY_LIBRARY_ID}`, {
      headers: { AccessKey: env.BUNNY_API_KEY, accept: 'application/json' },
    })
    if (response.status === 401 || response.status === 403) return { state: 'down', detail: 'the API key is rejected' }
    if (!response.ok) return { state: 'down', detail: `the library answered ${response.status}` }
    const library = (await response.json()) as { PlayerTokenAuthenticationEnabled?: boolean; Name?: string }
    if (library.PlayerTokenAuthenticationEnabled === false) {
      return { state: 'warn', detail: `library "${library.Name ?? env.BUNNY_LIBRARY_ID}" answers, but token authentication is off — every film would be public` }
    }
    return { state: 'ok', detail: `library "${library.Name ?? env.BUNNY_LIBRARY_ID}" answers; token authentication is on` }
  })
}

function storageOrigin(): string {
  const code = env.BUNNY_STORAGE_REGION.trim().toLowerCase()
  const host = code === 'de' || code === '' ? 'storage.bunnycdn.com' : `${code}.storage.bunnycdn.com`
  return `https://${host}/${env.BUNNY_STORAGE_ZONE}/`
}

export function probeStorage(fresh = false): Promise<HealthRow> {
  return probe('storage', 'Bunny Storage', fresh, async () => {
    if (env.PHOTO_DRIVER !== 'bunny' || !env.BUNNY_STORAGE_ZONE || !env.BUNNY_STORAGE_PASSWORD) {
      return { state: 'unconfigured', detail: 'fake photo driver' }
    }
    const response = await fetchWithin(storageOrigin(), {
      headers: { AccessKey: env.BUNNY_STORAGE_PASSWORD, accept: 'application/json' },
    })
    if (response.status === 401) return { state: 'down', detail: 'the storage password is rejected' }
    if (!response.ok) return { state: 'down', detail: `the zone answered ${response.status}` }
    return { state: 'ok', detail: `zone "${env.BUNNY_STORAGE_ZONE}" accepts the credential` }
  })
}

export function probeCdn(fresh = false): Promise<HealthRow> {
  return probe('cdn', 'Photo CDN', fresh, async () => {
    if (!env.BUNNY_PHOTO_CDN_HOSTNAME) return { state: 'unconfigured', detail: 'no pull zone configured' }
    // Any HTTP answer is the pull zone serving; what it says about "/" does not matter.
    const response = await fetchWithin(`https://${env.BUNNY_PHOTO_CDN_HOSTNAME}/`, { method: 'HEAD' })
    return { state: 'ok', detail: `${env.BUNNY_PHOTO_CDN_HOSTNAME} answers (${response.status})` }
  })
}

export function probeMailer(fresh = false): Promise<HealthRow> {
  return probe('mailer', 'Resend', fresh, async () => {
    if (env.NOTIFY_DRIVER !== 'resend') return { state: 'unconfigured', detail: 'fake mailer — nothing leaves the queue' }
    if (!env.RESEND_API_KEY) return { state: 'down', detail: 'RESEND_API_KEY is not set' }
    const response = await fetchWithin('https://api.resend.com/domains', {
      headers: { Authorization: `Bearer ${env.RESEND_API_KEY}` },
    })
    if (response.status === 401 || response.status === 403) return { state: 'down', detail: 'the API key is rejected' }
    if (!response.ok) return { state: 'down', detail: `the API answered ${response.status}` }
    return { state: 'ok', detail: 'the API accepts the key' }
  })
}

export function probeQueue(fresh = false): Promise<HealthRow> {
  return probe('queue', 'Notification queue', fresh, async () => {
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()
    const stats = await getRepository().notificationQueueStats(since)
    if (stats.failedSince > 0) {
      return { state: 'warn', detail: `${stats.failedSince} failed in the last 24 h; ${stats.queued} waiting` }
    }
    if (stats.oldestQueuedAt && Date.now() - Date.parse(stats.oldestQueuedAt) > 60 * 60 * 1000) {
      return { state: 'warn', detail: `${stats.queued} waiting, the oldest since ${ago(stats.oldestQueuedAt)} — is the drain running?` }
    }
    return { state: 'ok', detail: stats.queued === 0 ? 'nothing waiting, nothing failed today' : `${stats.queued} waiting for the next drain` }
  })
}

export function probePipeline(fresh = false): Promise<HealthRow> {
  return probe('pipeline', 'Transcode pipeline', fresh, async () => {
    const stuck = await getRepository().listStalledTitles(env.RECONCILE_STALL_MINUTES)
    if (stuck.length > 0) {
      return { state: 'warn', detail: `${stuck.length} film${stuck.length === 1 ? '' : 's'} past the ${env.RECONCILE_STALL_MINUTES}-minute stall window — the webhook, or a very slow upload` }
    }
    return { state: 'ok', detail: 'nothing stuck uploading or processing' }
  })
}

export function probeJobs(fresh = false): Promise<HealthRow> {
  return probe('jobs', 'Scheduled jobs', fresh, async () => {
    const latest = new Map((await getRepository().latestJobRuns()).map((run) => [run.job, run]))
    const parts: string[] = []
    let state: HealthState = 'ok'
    const worse = (next: HealthState) => {
      if (next === 'down' || (next === 'warn' && state === 'ok')) state = next
    }
    for (const job of JOBS) {
      const run = latest.get(job.name)
      if (!run) {
        parts.push(`${job.label}: never run`)
        worse('warn')
        continue
      }
      const late = Date.now() - Date.parse(run.finishedAt) > job.everyMinutes * 60_000 * 1.5
      if (!run.ok) {
        parts.push(`${job.label}: failed ${ago(run.finishedAt)}`)
        worse('down')
      } else if (late) {
        parts.push(`${job.label}: last ran ${ago(run.finishedAt)}, overdue`)
        worse('warn')
      } else {
        parts.push(`${job.label}: ${ago(run.finishedAt)} ✓`)
      }
    }
    return { state, detail: parts.join(' · ') }
  })
}

export function probeSynthetic(fresh = false): Promise<HealthRow> {
  return probe('synthetic', 'Synthetic guest path', fresh, async () => {
    const run = (await getRepository().latestJobRuns()).find((candidate) => candidate.job === 'synthetic')
    if (!run) return { state: 'warn', detail: 'never run — nothing has walked a guest’s path yet' }
    const steps = (run.detail.steps as { step: string; ok: boolean; detail?: string }[] | undefined) ?? []
    const broken = steps.find((step) => !step.ok)
    if (!run.ok || broken) {
      return { state: 'down', detail: `failed ${ago(run.finishedAt)} at "${broken?.step ?? 'unknown'}": ${broken?.detail ?? run.detail.error ?? 'no detail'}` }
    }
    return { state: 'ok', detail: `passed ${ago(run.finishedAt)} — ${steps.length} steps to a playback token` }
  })
}

export function probeDomains(fresh = false): Promise<HealthRow> {
  return probe('domains', 'Custom domains', fresh, async () => {
    const domains = await getRepository().listAllDomains()
    const count = (status: string) => domains.filter((domain) => domain.status === status).length
    const active = count('active')
    const waiting = count('verified')
    const failed = count('failed')
    const pending = count('pending')
    if (failed > 0) return { state: 'warn', detail: `${failed} failed to attach — see Domains` }
    if (waiting > 0 && env.DOMAIN_DRIVER === 'none') {
      return { state: 'warn', detail: `${waiting} verified and awaiting attachment by hand (DOMAIN_DRIVER=none)` }
    }
    if (domains.length === 0) return { state: 'ok', detail: 'none configured' }
    return {
      state: 'ok',
      detail: `${active} live${pending > 0 ? `, ${pending} waiting for DNS` : ''}${waiting > 0 ? `, ${waiting} attaching` : ''}`,
    }
  })
}

/** Every row, in the order doc 16 §9 lists them. */
export async function probeAll(options: { fresh?: boolean } = {}): Promise<HealthRow[]> {
  const fresh = options.fresh ?? false
  return Promise.all([
    probeDatabase(fresh),
    probeStream(fresh),
    probeStorage(fresh),
    probeCdn(fresh),
    probeMailer(fresh),
    probeQueue(fresh),
    probePipeline(fresh),
    probeJobs(fresh),
    probeSynthetic(fresh),
    probeDomains(fresh),
  ])
}

/** The worst state on the board, for the dashboard's one-line summary. */
export function summarise(rows: HealthRow[]): { state: HealthState; ok: number; total: number } {
  const counted = rows.filter((row) => row.state !== 'unconfigured')
  const state: HealthState = rows.some((row) => row.state === 'down')
    ? 'down'
    : rows.some((row) => row.state === 'warn')
      ? 'warn'
      : 'ok'
  return { state, ok: counted.filter((row) => row.state === 'ok').length, total: counted.length }
}

export type { JobRun }
