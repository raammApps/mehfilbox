import { env } from '@/lib/env'
import { BunnyProvider } from './bunny'
import { FakeVideoProvider } from './fake'
import type { VideoProvider } from './provider'

const KEY = Symbol.for('mehfilbox.videoProvider')
type Global = typeof globalThis & { [KEY]?: VideoProvider }

/** The one switch on provider in the codebase (doc 05 §2). */
export function getVideoProvider(): VideoProvider {
  const g = globalThis as Global
  g[KEY] ??= env.VIDEO_DRIVER === 'bunny' ? new BunnyProvider() : new FakeVideoProvider()
  return g[KEY]
}

export function setVideoProvider(provider: VideoProvider): void {
  ;(globalThis as Global)[KEY] = provider
}

/**
 * Turn provider-relative poster file names into stable app URLs.
 *
 * The database must never hold a signed URL — see `app/api/poster/[titleId]/route.ts`. Every
 * path that persists `posterCandidates` or `posterUrl` goes through here.
 */
export function posterRoute(titleId: string, file: string): string {
  return `/api/poster/${titleId}?file=${encodeURIComponent(file)}`
}

export * from './provider'
