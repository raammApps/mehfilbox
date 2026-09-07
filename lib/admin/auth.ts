import 'server-only'
import { env } from '@/lib/env'
import { LocalAuthProvider } from './auth-local'
import { SupabaseAuthProvider } from './auth-supabase'
import type { AuthProvider } from './auth-provider'

const KEY = Symbol.for('mehfilbox.authProvider')
type Global = typeof globalThis & { [KEY]?: AuthProvider }

/** The one switch on authentication in the codebase. */
export function getAuthProvider(): AuthProvider {
  const g = globalThis as Global
  g[KEY] ??= env.AUTH_DRIVER === 'supabase' ? new SupabaseAuthProvider() : new LocalAuthProvider()
  return g[KEY]
}

/** Injection seam for tests, matching `setVideoProvider`. Its ignore tag is gone: N-27's suspension
 *  tests sign in as an operator through this, so the export is used and the suppression was stale. */
export function setAuthProvider(provider: AuthProvider): void {
  ;(globalThis as Global)[KEY] = provider
}

export * from './auth-provider'
