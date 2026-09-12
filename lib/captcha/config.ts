/**
 * What a form needs to know to show a challenge (D-34). Pure types and constants — importable by
 * client components, which is why the server-only half lives in `./verify.ts`.
 */
export type CaptchaDriver = 'none' | 'fake' | 'turnstile'

export type ChallengeConfig = {
  driver: CaptchaDriver
  /** Public by nature; Cloudflare's site key is printed into the page by design. Null unless `turnstile`. */
  siteKey: string | null
}

/**
 * Failures before the widget appears. Three is a person who mistyped twice and a script on its
 * third guess; the first loses a second, the second loses the run.
 */
export const CHALLENGE_AFTER = 3

/** The token the `fake` driver accepts. Never valid anywhere else. */
export const FAKE_CAPTCHA_TOKEN = 'ok'

export const NO_CHALLENGE: ChallengeConfig = { driver: 'none', siteKey: null }
