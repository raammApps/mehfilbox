'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { formatClock } from '@/lib/format'
import { CATEGORIES, type Category, type Title } from '@/lib/schema'
import { categoryEyebrow } from '@/lib/poster'
import { UploadManager } from './UploadManager'
import { SaveState, type SaveStatus } from './SaveState'

const CATEGORY_OPTIONS = CATEGORIES.map((value) => ({ value, label: categoryEyebrow(value) }))

/**
 * Title list and inline editor (P0-21).
 *
 * Processing and failed titles are visible to the operator and hidden from guests (doc 02 §5).
 * A failure states the provider's actual reason and offers retry — never silently absent.
 */
export function TitleList({
  catalogueId,
  titles,
  // Defaulted rather than required: every caller that knows the catalogue's real cap passes it,
  // and the fallback is the *lowest* number, so a caller that forgets under-promises rather than
  // letting an operator upload past a limit that will refuse them at the server.
}: {
  catalogueId: string
  titles: Title[]
}) {
  const router = useRouter()
  const [busyId, setBusyId] = useState<string | null>(null)
  const [saveState, setSaveState] = useState<SaveStatus>('idle')

  /**
   * Writes on blur, and now says whether it worked (N-30).
   *
   * The response was previously awaited and discarded, so a refused save was indistinguishable
   * from a successful one — the operator renamed a film, saw nothing either way, and could lose
   * the edit without ever being told.
   */
  const update = async (id: string, patch: Record<string, unknown>) => {
    setBusyId(id)
    setSaveState('saving')
    try {
      const response = await fetch(`/api/admin/titles/${id}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(patch),
      })
      setSaveState(response.ok ? 'saved' : 'error')
      // Only re-read the server's copy when it actually changed. Refreshing after a failure
      // would repaint the input with the old value and quietly discard what they typed.
      if (response.ok) router.refresh()
    } catch {
      // An offline blur is the commonest way this fails, and it is not an exception the
      // operator should meet as a blank screen.
      setSaveState('error')
    } finally {
      setBusyId(null)
    }
  }

  const retry = async (id: string) => {
    setBusyId(id)
    await fetch(`/api/admin/titles/${id}/retry`, { method: 'POST' })
    setBusyId(null)
    router.refresh()
  }

  const remove = async (title: Title) => {
    if (!window.confirm(`Remove "${title.name.en}"? This deletes the uploaded file too.`)) return
    setBusyId(title.id)
    await fetch(`/api/admin/titles/${title.id}`, { method: 'DELETE' })
    setBusyId(null)
    router.refresh()
  }

  const move = async (index: number, delta: -1 | 1) => {
    const next = [...titles]
    const target = index + delta
    if (target < 0 || target >= next.length) return
    const [moved] = next.splice(index, 1)
    next.splice(target, 0, moved!)
    await fetch('/api/admin/titles/reorder', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        catalogueId,
        order: next.map((title, i) => ({ id: title.id, sortOrder: i })),
      }),
    })
    router.refresh()
  }


  return (
    <>
      {/*
        No count cap any more — the plans sell gigabytes (`docs/PRICING.md`), so the limit is
        storage and it is enforced where the bytes are: the upload route refuses with the figure,
        which is a better place to learn it than a banner above an empty form.
      */}
      <UploadManager catalogueId={catalogueId} />

      {/* Above the list rather than per row: blur has already moved focus by the time this
          appears, so one region that is always in the same place beats a badge that is not. */}
      <SaveState status={saveState} className="mb-3 min-h-[18px]" />

      {titles.length === 0 ? (
        <p className="text-[15px] text-[var(--color-l-text-mid)]">
          No films yet. Drop the videographer&rsquo;s delivery above — you can title everything
          while it uploads.
        </p>
      ) : (
        <ul className="space-y-3">
          {titles.map((title, index) => (
            <li
              key={title.id}
              className="rounded-[var(--radius-card)] border border-[var(--color-l-line)] bg-white p-4"
            >
              <div className="mb-3 flex flex-wrap items-start justify-between gap-2">
                <StatusBadge title={title} />
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => void move(index, -1)}
                    disabled={index === 0}
                    aria-label={`Move ${title.name.en} up`}
                    className="h-9 w-9 rounded disabled:opacity-30"
                  >
                    ↑
                  </button>
                  <button
                    type="button"
                    onClick={() => void move(index, 1)}
                    disabled={index === titles.length - 1}
                    aria-label={`Move ${title.name.en} down`}
                    className="h-9 w-9 rounded disabled:opacity-30"
                  >
                    ↓
                  </button>
                  <button
                    type="button"
                    onClick={() => void remove(title)}
                    className="h-9 rounded px-3 text-[13px] text-[var(--color-l-text-mid)] hover:text-[var(--color-error)]"
                  >
                    Remove
                  </button>
                </div>
              </div>

              {title.status === 'failed' ? (
                <div className="mb-3 rounded-[var(--radius-input)] bg-[color-mix(in_srgb,var(--color-error)_8%,white)] p-3">
                  <p className="text-[13px]">{title.errorMessage ?? 'The provider rejected this file.'}</p>
                  <button
                    type="button"
                    onClick={() => void retry(title.id)}
                    disabled={busyId === title.id}
                    className="mt-2 h-9 rounded-[var(--radius-pill)] border border-[var(--color-l-line)] bg-white px-4 text-[13px] font-semibold"
                  >
                    Retry
                  </button>
                </div>
              ) : null}

              <div className="grid gap-3 sm:grid-cols-2">
                <label className="block">
                  <span className="mb-1 block text-[13px] font-semibold">Name (English)</span>
                  <input
                    type="text"
                    defaultValue={title.name.en}
                    onBlur={(event) =>
                      event.target.value !== title.name.en &&
                      void update(title.id, { name: { ...title.name, en: event.target.value } })
                    }
                    className="w-full rounded-[var(--radius-input)] border border-[var(--color-l-line)] px-3 py-2 text-[15px]"
                  />
                </label>

                <label className="block">
                  <span className="mb-1 block text-[13px] font-semibold">नाम (हिंदी)</span>
                  <input
                    type="text"
                    defaultValue={title.name.hi ?? ''}
                    onBlur={(event) =>
                      void update(title.id, {
                        name: { ...title.name, hi: event.target.value || undefined },
                      })
                    }
                    className="w-full rounded-[var(--radius-input)] border border-[var(--color-l-line)] px-3 py-2 text-[15px]"
                  />
                </label>

                <label className="block">
                  {/* N-84: the address a guest actually follows — set once from the upload's
                      filename, editable here with the catalogue address's own uniqueness rule
                      (per wedding, not global), and never moved again once it has been. */}
                  <span className="mb-1 block text-[13px] font-semibold">Address</span>
                  <input
                    type="text"
                    defaultValue={title.slug}
                    onBlur={(event) => {
                      const next = event.target.value.trim().toLowerCase()
                      if (next && next !== title.slug) void update(title.id, { slug: next })
                    }}
                    className="w-full rounded-[var(--radius-input)] border border-[var(--color-l-line)] px-3 py-2 text-[15px] font-mono"
                  />
                </label>

                <label className="block sm:col-span-2">
                  <span className="mb-1 block text-[13px] font-semibold">Synopsis</span>
                  <textarea
                    rows={2}
                    defaultValue={title.synopsis?.en ?? ''}
                    onBlur={(event) =>
                      void update(title.id, {
                        synopsis: { ...(title.synopsis ?? { en: '' }), en: event.target.value },
                      })
                    }
                    className="w-full rounded-[var(--radius-input)] border border-[var(--color-l-line)] px-3 py-2 text-[15px]"
                  />
                </label>

                <label className="block">
                  <span className="mb-1 block text-[13px] font-semibold">Category</span>
                  <select
                    defaultValue={title.category}
                    onChange={(event) =>
                      void update(title.id, { category: event.target.value as Category })
                    }
                    className="w-full rounded-[var(--radius-input)] border border-[var(--color-l-line)] px-3 py-2 text-[15px]"
                  >
                    {CATEGORY_OPTIONS.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </label>

                <div className="flex items-end">
                  <label className="inline-flex items-center gap-2 text-[14px]">
                    <input
                      type="checkbox"
                      checked={title.published}
                      disabled={title.status !== 'ready' || busyId === title.id}
                      onChange={(event) => void update(title.id, { published: event.target.checked })}
                      className="h-5 w-5 accent-[var(--color-accent)]"
                    />
                    Visible to guests
                    {title.status !== 'ready' ? (
                      <span className="text-[12px] text-[var(--color-l-text-mid)]">
                        (once processing finishes)
                      </span>
                    ) : null}
                  </label>
                </div>
              </div>

              {title.posterCandidates.length > 0 ? (
                <fieldset className="mt-3">
                  <legend className="mb-2 text-[13px] font-semibold">Poster frame</legend>
                  <div className="flex flex-wrap gap-2">
                    {title.posterCandidates.map((candidate) => (
                      <button
                        key={candidate}
                        type="button"
                        onClick={() =>
                          void update(title.id, { posterUrl: candidate, posterSource: 'custom' })
                        }
                        aria-pressed={title.posterUrl === candidate}
                        className={`overflow-hidden rounded border-2 ${
                          title.posterUrl === candidate
                            ? 'border-accent'
                            : 'border-[var(--color-l-line)]'
                        }`}
                      >
                        {/* eslint-disable-next-line @next/next/no-img-element -- provider frame */}
                        <img src={candidate} alt="" width={120} height={68} className="block" />
                      </button>
                    ))}
                  </div>
                </fieldset>
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </>
  )
}

function StatusBadge({ title }: { title: Title }) {
  const map: Record<Title['status'], { label: string; className: string }> = {
    uploading: { label: 'Uploading', className: 'bg-[var(--color-l-surface-2)]' },
    processing: { label: 'Processing', className: 'bg-[color-mix(in_srgb,var(--color-warn)_18%,white)]' },
    ready: { label: 'Ready', className: 'bg-[color-mix(in_srgb,var(--color-ok)_16%,white)]' },
    failed: { label: 'Failed', className: 'bg-[color-mix(in_srgb,var(--color-error)_14%,white)]' },
  }
  const status = map[title.status]

  return (
    <span className="flex items-center gap-2">
      <span className={`rounded px-2 py-1 text-[11px] font-semibold uppercase tracking-[0.09em] ${status.className}`}>
        {status.label}
      </span>
      {title.durationS ? (
        <span className="text-[13px] text-[var(--color-l-text-mid)]">
          {formatClock(title.durationS)}
        </span>
      ) : null}
    </span>
  )
}
