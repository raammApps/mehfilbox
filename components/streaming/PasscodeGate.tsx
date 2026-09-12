'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { Challenge } from '@/components/auth/Challenge'
import { NO_CHALLENGE, type ChallengeConfig } from '@/lib/captcha/config'

type Strings = {
  heading: string
  body: string
  passcode: string
  submit: string
  wrong: string
  lockedOut: string
}

/** Wrong passcode: shake, generic message, 5 attempts then a 15-minute lockout (doc 02 §5). */
export function PasscodeGate({
  catalogueSlug,
  coupleName,
  strings,
  basePath = '',
  challenge = NO_CHALLENGE,
}: {
  catalogueSlug: string
  coupleName: string
  strings: Strings
  /** '' in subdomain mode, '/<studio>/<wedding>' in path mode. See `cataloguePath`. */
  basePath?: string
  /** Shown after the third wrong code, when a captcha driver is configured (D-34). */
  challenge?: ChallengeConfig
}) {
  const router = useRouter()
  const [value, setValue] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [shake, setShake] = useState(false)
  const [busy, setBusy] = useState(false)
  const [needChallenge, setNeedChallenge] = useState(false)
  const [captchaToken, setCaptchaToken] = useState<string | null>(null)

  const submit = async (event: React.FormEvent) => {
    event.preventDefault()
    setBusy(true)
    setError(null)

    const response = await fetch('/api/passcode', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        catalogue: catalogueSlug,
        passcode: value,
        ...(needChallenge && captchaToken ? { captchaToken } : {}),
      }),
    })

    if (response.ok) {
      // The catalogue, not the site root — in path mode those are different places, and '/'
      // drops a guest who just typed the right passcode onto the marketing page.
      router.replace(basePath || '/')
      router.refresh()
      return
    }

    const body = (await response.json().catch(() => null)) as {
      error?: { challenge?: boolean }
    } | null
    if (body?.error?.challenge) setNeedChallenge(true)
    setCaptchaToken(null)
    setError(response.status === 429 ? strings.lockedOut : strings.wrong)
    setShake(true)
    window.setTimeout(() => setShake(false), 400)
    setValue('')
    setBusy(false)
  }

  return (
    <main className="gutter-x flex min-h-svh flex-col items-center justify-center text-center">
      <p className="type-label mb-4 text-accent-hi">{coupleName}</p>
      <h1 className="type-display-lg mb-2">{strings.heading}</h1>
      <p className="type-body mb-8 max-w-[40ch] text-text-mid">{strings.body}</p>

      <form
        onSubmit={submit}
        className="w-full max-w-[320px]"
        style={shake ? { animation: 'mehfilbox-shake 320ms' } : undefined}
      >
        <label htmlFor="passcode" className="sr-only">
          {strings.passcode}
        </label>
        <input
          id="passcode"
          type="text"
          inputMode="text"
          autoComplete="off"
          autoFocus
          value={value}
          onChange={(event) => setValue(event.target.value)}
          className="edge mb-3 h-12 w-full rounded-[var(--radius-input)] bg-surface-2 px-4 text-center text-text-hi"
        />

        {needChallenge ? <Challenge config={challenge} onToken={setCaptchaToken} /> : null}

        {error ? (
          <p role="alert" className="type-body mb-3 text-error">
            {error}
          </p>
        ) : null}

        <button
          type="submit"
          disabled={busy || value.length === 0 || (needChallenge && challenge.driver !== 'none' && !captchaToken)}
          className="h-12 w-full rounded-[var(--radius-pill)] bg-accent font-semibold text-accent-ink disabled:opacity-50"
        >
          {strings.submit}
        </button>
      </form>

      <style>{`@keyframes mehfilbox-shake{0%,100%{transform:translateX(0)}25%{transform:translateX(-8px)}75%{transform:translateX(8px)}}`}</style>
    </main>
  )
}
