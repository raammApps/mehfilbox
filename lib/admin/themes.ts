import 'server-only'
import { formatRatio, judgeTheme } from '@/lib/contrast'
import { ApiError } from '@/lib/http/errors'
import type { ThemeTokens } from '@/themes/contract'

/**
 * The gate a platform-authored theme has to clear before it is stored (D-35, doc 16 §4).
 *
 * The same pairs `pnpm check:contrast` holds the built-in seven to, applied at save time so a
 * theme that would put grey text on a grey page never reaches a studio's picker. The refusal
 * names each failing pair and its ratio: an admin adjusting a colour needs to know which one.
 */
export function assertThemeReadable(tokens: ThemeTokens): void {
  const verdict = judgeTheme(tokens)
  if (verdict.ok) return
  throw new ApiError(
    'VALIDATION_FAILED',
    `This theme would be hard to read: ${verdict.failures
      .map((pair) => `${pair.name} is ${formatRatio(pair.ratio)} (needs ${pair.min}:1)`)
      .join('; ')}.`,
    { fields: Object.fromEntries(verdict.failures.map((pair) => [`tokens.${pair.name}`, formatRatio(pair.ratio)])) },
  )
}
