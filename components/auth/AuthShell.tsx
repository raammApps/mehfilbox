'use client'

import Link from 'next/link'

/**
 * The frame every sign-in surface shares: the public site's dark surface, the wordmark, and a
 * card that is exactly as wide as a phone. One place, so the four forms — sign in, forgot, set a
 * password, change a password — cannot drift into four looks.
 */
export function AuthShell({ children }: { children: React.ReactNode }) {
  return (
    <main className="gutter-x mx-auto flex min-h-svh w-full max-w-[440px] flex-col justify-center py-12">
      <Link href="/" className="type-title mb-8 inline-block no-underline">
        Mehfilbox
      </Link>
      <div className="edge rounded-[var(--radius-modal)] bg-surface-1 p-6 sm:p-8">{children}</div>
    </main>
  )
}

export function Field({
  id,
  label,
  type = 'text',
  value,
  onChange,
  autoComplete,
  required = false,
  hint,
  error,
  readOnly = false,
}: {
  id: string
  label: string
  type?: string
  value: string
  onChange?: (next: string) => void
  autoComplete?: string
  required?: boolean
  hint?: string
  error?: string
  readOnly?: boolean
}) {
  return (
    <div className="mb-4">
      <label htmlFor={id} className="mb-1 block text-[13px] font-semibold text-text-hi">
        {label}
      </label>
      <input
        id={id}
        name={id}
        type={type}
        autoComplete={autoComplete}
        required={required}
        readOnly={readOnly}
        value={value}
        onChange={(event) => onChange?.(event.target.value)}
        aria-invalid={error ? true : undefined}
        aria-describedby={error || hint ? `${id}-hint` : undefined}
        className={`edge h-12 w-full rounded-[var(--radius-input)] bg-surface-2 px-3 text-text-hi ${
          readOnly ? 'text-text-mid' : ''
        } ${error ? 'border-error' : ''}`}
      />
      {error || hint ? (
        <p id={`${id}-hint`} className={`mt-1 text-[12px] ${error ? 'text-error' : 'text-text-lo'}`}>
          {error ?? hint}
        </p>
      ) : null}
    </div>
  )
}

export function PrimaryButton({
  busy = false,
  disabled = false,
  children,
}: {
  busy?: boolean
  disabled?: boolean
  children: React.ReactNode
}) {
  return (
    <button
      type="submit"
      disabled={busy || disabled}
      className="h-12 w-full rounded-[var(--radius-pill)] bg-accent font-semibold text-accent-ink disabled:opacity-60"
    >
      {children}
    </button>
  )
}
