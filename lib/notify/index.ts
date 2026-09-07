import { env } from '@/lib/env'
import { FakeNotificationProvider } from './fake'
import { ResendNotificationProvider } from './resend'
import type { NotificationProvider } from './provider'

const KEY = Symbol.for('mehfilbox.notificationProvider')
type Global = typeof globalThis & { [KEY]?: NotificationProvider }

/**
 * The one switch on notification provider in the codebase (N-50).
 *
 * `msg91` joins this line when WhatsApp is worth its subscription (D-12) — one `else if`, not a
 * migration, which is the point of building the seam before the second provider exists.
 */
export function getNotificationProvider(): NotificationProvider {
  const g = globalThis as Global
  g[KEY] ??=
    env.NOTIFY_DRIVER === 'resend' ? new ResendNotificationProvider() : new FakeNotificationProvider()
  return g[KEY]
}

export function setNotificationProvider(provider: NotificationProvider): void {
  ;(globalThis as Global)[KEY] = provider
}

export * from './provider'
export * from './templates'
