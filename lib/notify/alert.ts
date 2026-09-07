import 'server-only'
import { getRepository } from '@/lib/db'
import { env } from '@/lib/env'
import { log } from '@/lib/log'
import { enqueue } from './send'

/**
 * Tell us when something is wrong, before a partner does (N-53, D-24).
 *
 * Every serious fault this product has had was **silent**. A transcode webhook pointed at a dead
 * URL while uploads kept succeeding. A storage column the driver never wrote, so the cap never
 * refused anything. An SMTP credential that authenticated but could not send. Each was found by a
 * person looking at production, and not one of them would have raised anything.
 *
 * It goes through the notification queue rather than around it, which buys three things for free:
 * the send happens on the cron instead of inside the request that noticed, the `notifications`
 * table becomes the record of what we were told and when, and the alert cannot take down the
 * thing it is reporting on.
 */

/** Alerts are addressed to us, so they are English regardless of anyone's locale. */
const LOCALE = 'en' as const

export type AlertKind =
  /** Reconcile had to settle a transcode the webhook should have. */
  | 'transcode webhook is not arriving'
  /** The synthetic check could not complete a guest's path to a playable film. */
  | 'a guest cannot play a film'

export type AlertResult = { sent: boolean; reason?: 'deduped' | 'no-recipient' }

/**
 * Raise an alert, at most once per `withinHours`.
 *
 * De-duplication is not politeness. A cron that notices a dead webhook every fifteen minutes would
 * send ninety-six identical emails a day, and an alert nobody can bear to read is an alert nobody
 * reads — which is the state this exists to leave. The window is counted against the
 * `notifications` table itself, so it survives a restart and is not a variable in some process's
 * memory.
 */
export async function alertOps(
  kind: AlertKind,
  detail: string,
  { withinHours = 6 }: { withinHours?: number } = {},
): Promise<AlertResult> {
  const to = env.SUPPORT_EMAIL
  if (!to) {
    // Worth a log line rather than silence: an alerting system with nowhere to send is the exact
    // shape of the problem it was built for.
    log.warn('alert: no SUPPORT_EMAIL configured', { kind })
    return { sent: false, reason: 'no-recipient' }
  }

  const since = new Date(Date.now() - withinHours * 60 * 60 * 1000).toISOString()
  const recent = await getRepository().countNotificationsSince('ops-alert', since)
  if (recent > 0) return { sent: false, reason: 'deduped' }

  await enqueue({
    template: 'ops-alert',
    channel: 'email',
    address: to,
    locale: LOCALE,
    params: {
      kind,
      detail,
      // The release marker D-24 asks for: an alert that cannot be tied to a deploy leaves the
      // first question of every investigation unanswered.
      version: env.VERCEL_GIT_COMMIT_SHA ?? 'dev',
      at: new Date().toISOString(),
    },
  })

  log.warn('alert raised', { kind, detail })
  return { sent: true }
}
