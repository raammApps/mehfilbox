'use client'

import { useEffect, useRef } from 'react'
import { FAKE_CAPTCHA_TOKEN, type ChallengeConfig } from '@/lib/captcha/config'

declare global {
  interface Window {
    turnstile?: {
      render: (container: HTMLElement, options: Record<string, unknown>) => string
      remove: (widgetId: string) => void
    }
  }
}

/**
 * The challenge a form shows after repeated failures, or on every registration (D-34).
 *
 * Three drivers, one prop shape. `none` renders nothing — the server never asks for a token
 * either. `fake` is a checkbox the suite can tick, yielding a fixed token the fake verifier
 * accepts. `turnstile` renders Cloudflare's widget, which hands back a single-use token.
 *
 * The widget is a second layer over the rate limits. It is meant to cost a person one second and
 * a script the run — which is why the prototype's arithmetic puzzle is not here: a script solves
 * it faster than a person does.
 */
export function Challenge({
  config,
  onToken,
}: {
  config: ChallengeConfig
  onToken: (token: string | null) => void
}) {
  if (config.driver === 'none') return null
  if (config.driver === 'fake') return <FakeChallenge onToken={onToken} />
  return <TurnstileChallenge siteKey={config.siteKey ?? ''} onToken={onToken} />
}

function FakeChallenge({ onToken }: { onToken: (token: string | null) => void }) {
  return (
    <label className="mb-4 flex cursor-pointer items-center gap-3 rounded-[var(--radius-input)] border border-current/20 px-3 py-2.5 text-[14px]">
      <input
        type="checkbox"
        data-testid="challenge-fake"
        onChange={(event) => onToken(event.target.checked ? FAKE_CAPTCHA_TOKEN : null)}
        className="h-4 w-4 accent-[var(--color-accent)]"
      />
      I am a person, not a script
    </label>
  )
}

const TURNSTILE_SRC = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit'

function TurnstileChallenge({
  siteKey,
  onToken,
}: {
  siteKey: string
  onToken: (token: string | null) => void
}) {
  const container = useRef<HTMLDivElement>(null)
  const latest = useRef(onToken)
  latest.current = onToken

  useEffect(() => {
    let widgetId: string | null = null
    let cancelled = false

    const render = () => {
      if (cancelled || !container.current || !window.turnstile) return
      widgetId = window.turnstile.render(container.current, {
        sitekey: siteKey,
        callback: (token: string) => latest.current(token),
        'expired-callback': () => latest.current(null),
        'error-callback': () => latest.current(null),
      })
    }

    if (window.turnstile) {
      render()
    } else {
      // One script tag per page, however many forms ask for it.
      let script = document.querySelector<HTMLScriptElement>(`script[src="${TURNSTILE_SRC}"]`)
      if (!script) {
        script = document.createElement('script')
        script.src = TURNSTILE_SRC
        script.async = true
        document.head.appendChild(script)
      }
      script.addEventListener('load', render, { once: true })
    }

    return () => {
      cancelled = true
      if (widgetId && window.turnstile) window.turnstile.remove(widgetId)
    }
  }, [siteKey])

  return <div ref={container} data-testid="challenge-turnstile" className="mb-4 min-h-[65px]" />
}
