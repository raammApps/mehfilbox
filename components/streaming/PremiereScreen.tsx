'use client'

import { useEffect, useState } from 'react'

/**
 * The countdown before a premiere (N-72).
 *
 * Ticks in the browser from the instant the server handed it; the words around it are the
 * server's, in the guest's language and the couple's zone. When the clock reaches zero the page
 * offers the wedding rather than reloading under the guest's thumb.
 */
type Strings = {
  eyebrow: string
  heading: string
  body: string
  days: string
  hours: string
  minutes: string
  seconds: string
  now: string
  watch: string
}

function remaining(premiereAt: string, now: number) {
  const ms = Math.max(0, Date.parse(premiereAt) - now)
  const total = Math.floor(ms / 1000)
  return {
    over: ms === 0,
    days: Math.floor(total / 86_400),
    hours: Math.floor((total % 86_400) / 3600),
    minutes: Math.floor((total % 3600) / 60),
    seconds: total % 60,
  }
}

export function PremiereScreen({
  premiereAt,
  coupleName,
  basePath,
  strings,
}: {
  premiereAt: string
  coupleName: string
  basePath: string
  strings: Strings
}) {
  // Rendered once on the server with the real instant, then ticked; `now` is only read in effects
  // so the server and the first client paint agree.
  const [now, setNow] = useState<number | null>(null)
  useEffect(() => {
    setNow(Date.now())
    const timer = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(timer)
  }, [])

  const left = remaining(premiereAt, now ?? Date.parse(premiereAt) - 1)
  const pad = (n: number) => String(n).padStart(2, '0')

  return (
    <main className="gutter-x mx-auto flex min-h-svh max-w-[720px] flex-col justify-center py-16 text-center">
      <p className="type-label mb-4 text-accent-hi">{strings.eyebrow}</p>
      <p className="type-title mb-2 text-text-mid">{coupleName}</p>
      <h1 className="type-display-lg mb-4">{strings.heading}</h1>
      <p className="type-body-lg mb-10 text-text-mid">{strings.body}</p>

      {left.over ? (
        <div>
          <p className="type-title mb-4">{strings.now}</p>
          <a
            href={basePath || '/'}
            className="inline-flex h-12 items-center rounded-[var(--radius-pill)] bg-accent px-6 font-semibold text-accent-ink"
          >
            {strings.watch}
          </a>
        </div>
      ) : (
        <div
          data-testid="countdown"
          className="mx-auto grid max-w-[520px] grid-cols-4 gap-2 sm:gap-3"
          aria-label={`${left.days} ${strings.days}, ${left.hours} ${strings.hours}, ${left.minutes} ${strings.minutes}`}
        >
          {(
            [
              [left.days, strings.days],
              [left.hours, strings.hours],
              [left.minutes, strings.minutes],
              [left.seconds, strings.seconds],
            ] as const
          ).map(([value, label]) => (
            <div key={label} className="edge rounded-[var(--radius-card)] bg-surface-1 px-2 py-4 sm:py-6">
              <p className="font-display text-[clamp(1.75rem,6vw,3rem)] font-extrabold leading-none tabular-nums text-text-hi">
                {pad(value)}
              </p>
              <p className="type-label mt-2 text-text-lo">{label}</p>
            </div>
          ))}
        </div>
      )}
    </main>
  )
}
