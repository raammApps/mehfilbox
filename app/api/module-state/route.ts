import { NextResponse } from 'next/server'
import { z } from 'zod'
import { getRepository } from '@/lib/db'
import { noStore, readJson, route } from '@/lib/http/handler'
import { clientIp, enforce } from '@/lib/http/rate-limit'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * Per-profile state for interactive modules — checklist ticks, quiz answers (doc 14 §6).
 * Phase 0 ships no interactive module, but the endpoint exists so the first one is additive.
 */
const bodySchema = z.object({
  profileId: z.string().uuid(),
  moduleId: z.string().min(1).max(64),
  state: z.record(z.unknown()),
})

export async function POST(request: Request) {
  return route('module-state', async () => {
    const body = await readJson(request, bodySchema)
    await enforce(`module-state:${clientIp(request)}`, 120, 60)

    const profile = await getRepository().getProfile(body.profileId)
    if (!profile) return new NextResponse(null, { status: 204 })

    await getRepository().upsertModuleState({
      profileId: profile.id,
      moduleId: body.moduleId,
      state: body.state,
      updatedAt: new Date().toISOString(),
    })

    return new NextResponse(null, { status: 204 })
  })
}

export async function GET(request: Request) {
  return route('module-state:get', async () => {
    const url = new URL(request.url)
    const profileId = url.searchParams.get('profileId')
    const moduleId = url.searchParams.get('moduleId')
    if (!profileId || !moduleId) return noStore({ state: null })
    const record = await getRepository().getModuleState(profileId, moduleId)
    return noStore({ state: record?.state ?? null })
  })
}
