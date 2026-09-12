import { NextResponse } from 'next/server'
import { getAuthProvider } from '@/lib/admin/auth'
import { getRepository } from '@/lib/db'
import { env } from '@/lib/env'
import { route } from '@/lib/http/handler'
import { log } from '@/lib/log'
import { requireCouple } from '@/lib/my/session'
import { enqueue } from '@/lib/notify/send'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * `POST /api/my/close` — a couple closing their account (D-37).
 *
 * A recorded request, not a deletion. The org is suspended so nobody can sign in to it, the
 * catalogues are untouched and keep archiving on their own schedule, and we are told — because
 * "nothing is ever deleted" is the promise, and a closure somebody later regrets has to be one
 * message away from being undone.
 */
export async function POST() {
  return route('my/close', async () => {
    const { session, org } = await requireCouple()
    const repository = getRepository()

    await repository.setOrgStatus(org.id, 'suspended')

    await enqueue({
      template: 'ops-alert',
      channel: 'email',
      address: env.SUPPORT_EMAIL,
      locale: 'en',
      orgId: org.id,
      params: {
        kind: 'a couple closed their account',
        detail: `${session.operator.email} (${org.name}, ${org.slug}) closed their account. The org is suspended; nothing was deleted.`,
        version: env.VERCEL_GIT_COMMIT_SHA ?? 'dev',
        at: new Date().toISOString(),
      },
    }).catch((error: unknown) => {
      log.error('close: could not queue the notice', { reason: String(error) })
    })

    log.warn('couple account closed', { orgId: org.id, operatorId: session.operator.id })

    const response = NextResponse.json({ closed: true }, { headers: { 'cache-control': 'no-store' } })
    await getAuthProvider().signOut(response)
    return response
  })
}
