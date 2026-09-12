import { translate, type MessageKey } from '@/lib/i18n'
import type { Locale } from '@/lib/schema'

/**
 * Every message the application can send, in both languages (N-50).
 *
 * **The templates live in `lib/i18n.ts`'s dictionary rather than here**, which is the whole point:
 * `tests/unit/i18n.test.ts` already fails when an English key has no Hindi entry, so a
 * notification template gets that gate for free instead of needing a parallel one. An expiry
 * warning that silently falls back to English is exactly the failure D-12 exists to prevent —
 * Indian families live on WhatsApp, and a warning nobody reads is a warning nobody got.
 *
 * A template is three keys — `notify.<name>.subject`, `.text`, `.html` — so a channel takes what
 * it can carry. WhatsApp and SMS use `text`; email uses `html` with `text` as the fallback part.
 */
export const TEMPLATES = [
  'handover',
  'delivery',
  'expiry',
  'grace',
  'archived',
  /** Addressed to us, not to a couple (N-53). */
  'ops-alert',
  /** A set-password link — forgot password, or a first sign-in a studio issued (D-33). */
  'credential',
] as const
export type TemplateName = (typeof TEMPLATES)[number]

export type Rendered = { subject: string; text: string; html: string }

/**
 * Renders one template in one language.
 *
 * Unknown placeholders are left as `{name}` by `translate` rather than printed as `undefined` —
 * a visible gap in a message is a bug someone reports, and `undefined` in front of a couple is a
 * bug nobody mentions and everybody sees.
 */
export function render(
  template: TemplateName,
  locale: Locale,
  params: Record<string, string | number> = {},
): Rendered {
  return {
    subject: translate(locale, `notify.${template}.subject` as MessageKey, params),
    text: translate(locale, `notify.${template}.text` as MessageKey, params),
    html: translate(locale, `notify.${template}.html` as MessageKey, params),
  }
}

/** Every dictionary key a template needs, for the test that holds the two in step. */
export function templateKeys(): string[] {
  return TEMPLATES.flatMap((t) => [
    `notify.${t}.subject`,
    `notify.${t}.text`,
    `notify.${t}.html`,
  ])
}
