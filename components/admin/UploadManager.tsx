'use client'

import { Pause, Play, Upload, X } from 'lucide-react'
import { useCallback, useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import type { Upload as TusUpload } from 'tus-js-client'
import { ACCEPTED_VIDEO_EXTENSIONS, isAcceptedVideo, MAX_UPLOAD_BYTES } from '@/lib/video/provider'

/**
 * Resumable upload (doc 05 §3, doc 08 `<UploadManager>`).
 *
 * The requirement the schedule actually slips on. Non-negotiable behaviours:
 *  - bytes go direct to the provider, never through our server
 *  - killing the network at 80% resumes from ~80%, not from 0%
 *  - closing the tab and reopening resumes the upload
 *  - the `titles` row exists from the first byte, so a refresh shows the file
 *
 * tus-js-client owns the chunking and the offset store (its `urlStorage` writes to
 * localStorage); this component owns the ticket, the queue and the operator's view of it.
 */

type Item = {
  key: string
  file: File
  titleId?: string
  progress: number
  bytesUploaded: number
  state: 'queued' | 'uploading' | 'paused' | 'interrupted' | 'done' | 'error'
  message?: string
  startedAt: number
  abort?: () => void
  resume?: () => void
}

const PARALLELISM = 2
const RESUME_KEY = 'mehfilbox.uploads.'

/**
 * Backoff for a transient wobble. Deliberately short: a long tail here does nothing for the
 * case that actually happens — a laptop that sleeps for an hour — which is handled by resuming
 * on the `online` event instead of by waiting.
 */
const RETRY_DELAYS = [0, 2000, 6000, 15_000, 30_000]

export function UploadManager({
  catalogueId,
  onChanged,
}: {
  catalogueId: string
  onChanged?: () => void
}) {
  const router = useRouter()
  const [items, setItems] = useState<Item[]>([])
  const [dragging, setDragging] = useState(false)
  const running = useRef(0)

  /** Live tus handles, so an interrupted upload can be picked up again rather than restarted. */
  const uploads = useRef(new Map<string, TusUpload>())

  const patch = useCallback((key: string, changes: Partial<Item>) => {
    setItems((current) =>
      current.map((item) => (item.key === key ? { ...item, ...changes } : item)),
    )
  }, [])

  /**
   * Pick an interrupted upload back up from the provider's last acked offset.
   *
   * `findPreviousUploads` reads the fingerprint tus stored locally and `resumeFromPreviousUpload`
   * makes it HEAD the provider for the true offset — so this continues from what the server
   * actually has, not from what the browser believed before it lost connectivity.
   */
  const resume = useCallback(
    async (key: string) => {
      const upload = uploads.current.get(key)
      if (!upload) return

      patch(key, { state: 'uploading', message: undefined })
      running.current += 1

      try {
        const previous = await upload.findPreviousUploads()
        if (previous[0]) upload.resumeFromPreviousUpload(previous[0])
        upload.start()
      } catch (error) {
        patch(key, { state: 'interrupted', message: (error as Error).message })
        running.current -= 1
      }
    },
    [patch],
  )

  const start = useCallback(
    async (item: Item) => {
      running.current += 1
      patch(item.key, { state: 'uploading' })

      try {
        const ticketResponse = await fetch('/api/admin/uploads', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            catalogueId,
            filename: item.file.name,
            sizeBytes: item.file.size,
            mimeType: item.file.type,
            kind: 'video',
          }),
        })

        if (!ticketResponse.ok) {
          const body = (await ticketResponse.json().catch(() => null)) as {
            error?: { message?: string }
          } | null
          throw new Error(body?.error?.message ?? 'The upload could not be started')
        }

        const ticket = (await ticketResponse.json()) as {
          titleId: string
          tusEndpoint: string
          headers: Record<string, string>
          chunkSizeBytes: number
        }

        patch(item.key, { titleId: ticket.titleId })
        // The row exists now, so the operator can start titling while bytes move.
        router.refresh()
        onChanged?.()

        const { Upload: TusUpload } = await import('tus-js-client')

        const upload = new TusUpload(item.file, {
          endpoint: ticket.tusEndpoint,
          headers: ticket.headers,
          chunkSize: ticket.chunkSizeBytes,
          // Exponential backoff; the last entry is a two-minute wait, which covers a laptop
          // that slept through a wifi change.
          retryDelays: RETRY_DELAYS,
          /**
           * Be explicit about what is worth retrying. The default policy gives up on a bare
           * network failure, which is precisely the case this whole mechanism exists for — a
           * dropped connection produces no response at all, and that has to count as retryable
           * or a wifi blip ends a six-gigabyte upload.
           */
          onShouldRetry: (_error, retryAttempt, options) => {
            const status = (
              _error as { originalResponse?: { getStatus(): number } }
            ).originalResponse?.getStatus()
            // No response: the network went away. Always worth another go.
            if (status === undefined) return retryAttempt < (options.retryDelays?.length ?? 0)
            // 4xx is our mistake and will not fix itself; 409/423 are tus offset conflicts,
            // which resolve on a retry.
            if (status >= 400 && status < 500 && status !== 409 && status !== 423) return false
            return retryAttempt < (options.retryDelays?.length ?? 0)
          },
          metadata: { filename: item.file.name, filetype: item.file.type },
          storeFingerprintForResuming: true,
          removeFingerprintOnSuccess: true,
          onProgress: (uploaded, total) => {
            patch(item.key, { progress: total > 0 ? uploaded / total : 0, bytesUploaded: uploaded })
          },
          onSuccess: () => {
            patch(item.key, { state: 'done', progress: 1 })
            window.localStorage.removeItem(RESUME_KEY + item.key)
            running.current -= 1
            router.refresh()
            onChanged?.()
          },
          onError: (error) => {
            // Not terminal. `interrupted` is the honest word: the bytes already at the provider
            // are still there, and either the `online` handler or the operator picks it up.
            patch(item.key, { state: 'interrupted', message: shortReason(error) })
            running.current -= 1
          },
        })

        uploads.current.set(item.key, upload)

        // Resume from the last acked offset rather than from zero.
        const previous = await upload.findPreviousUploads()
        if (previous[0]) upload.resumeFromPreviousUpload(previous[0])

        upload.start()
        patch(item.key, {
          abort: () => void upload.abort(),
          resume: () => void resume(item.key),
        })
      } catch (error) {
        patch(item.key, { state: 'error', message: (error as Error).message })
        running.current -= 1
      }
    },
    [catalogueId, patch, router, onChanged, resume],
  )

  /**
   * The case doc 05 §3 is actually about: the laptop slept, or the venue wifi came back. No
   * backoff schedule is long enough for that, so the network coming back is the signal.
   */
  useEffect(() => {
    const onOnline = () => {
      for (const item of items) {
        if (item.state === 'interrupted') void resume(item.key)
      }
    }
    window.addEventListener('online', onOnline)
    return () => window.removeEventListener('online', onOnline)
  }, [items, resume])

  // Queue pump: parallelism 2, so a 6GB file does not starve the four short ones behind it.
  useEffect(() => {
    if (running.current >= PARALLELISM) return
    const next = items.find((item) => item.state === 'queued')
    if (next) void start(next)
  }, [items, start])

  // Navigating anywhere in the admin must not cancel an upload (doc 08). A beforeunload
  // warning is the honest thing we can do about a full page close.
  useEffect(() => {
    const active = items.some((item) => item.state === 'uploading')
    if (!active) return
    const onBeforeUnload = (event: BeforeUnloadEvent) => event.preventDefault()
    window.addEventListener('beforeunload', onBeforeUnload)
    return () => window.removeEventListener('beforeunload', onBeforeUnload)
  }, [items])

  const add = (files: FileList | File[]) => {
    const accepted: Item[] = []
    const rejected: Item[] = []

    for (const file of Array.from(files)) {
      const base: Item = {
        key: `${file.name}:${file.size}:${file.lastModified}`,
        file,
        progress: 0,
        bytesUploaded: 0,
        state: 'queued',
        startedAt: Date.now(),
      }

      // Reject unsupported containers and oversize files *before* a byte moves (doc 05 §3.5).
      if (!isAcceptedVideo(file.name, file.type)) {
        rejected.push({ ...base, state: 'error', message: 'Not a supported video file' })
      } else if (file.size > MAX_UPLOAD_BYTES) {
        rejected.push({ ...base, state: 'error', message: 'Larger than the per-file limit' })
      } else {
        accepted.push(base)
      }
    }

    setItems((current) => {
      const known = new Set(current.map((item) => item.key))
      return [...current, ...[...accepted, ...rejected].filter((item) => !known.has(item.key))]
    })
  }

  return (
    <section className="mb-6">
      <div
        onDragOver={(event) => {
          event.preventDefault()
          setDragging(true)
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(event) => {
          event.preventDefault()
          setDragging(false)
          add(event.dataTransfer.files)
        }}
        className={`rounded-[var(--radius-card)] border-2 border-dashed p-6 text-center ${
          dragging
            ? 'border-accent bg-[color-mix(in_srgb,var(--color-accent)_6%,white)]'
            : 'border-[var(--color-l-line)]'
        }`}
      >
        <Upload size={22} aria-hidden className="mx-auto mb-2 text-[var(--color-l-text-mid)]" />
        <p className="mb-1 text-[15px] font-medium">Drop films here</p>
        <p className="mb-3 text-[13px] text-[var(--color-l-text-mid)]">
          {ACCEPTED_VIDEO_EXTENSIONS.join(', ')} · uploads keep going while you work elsewhere
        </p>

        <label className="inline-flex h-11 cursor-pointer items-center rounded-[var(--radius-pill)] border border-[var(--color-l-line)] bg-white px-5 text-[14px] font-semibold">
          Choose files
          <input
            type="file"
            multiple
            accept="video/*"
            className="sr-only"
            onChange={(event) => event.target.files && add(event.target.files)}
          />
        </label>
      </div>

      {items.length > 0 ? (
        <ul className="mt-3 space-y-2">
          {items.map((item) => (
            <li
              key={item.key}
              className="rounded-[var(--radius-card)] border border-[var(--color-l-line)] bg-white p-3"
            >
              <div className="mb-2 flex items-center gap-3">
                <span className="min-w-0 flex-1 truncate text-[14px]">{item.file.name}</span>
                <span className="text-[13px] tabular-nums text-[var(--color-l-text-mid)]">
                  {item.state === 'done'
                    ? 'Uploaded'
                    : item.state === 'error'
                      ? 'Failed'
                      : item.state === 'interrupted'
                        ? `Waiting for the network · ${Math.round(item.progress * 100)}%`
                        : `${Math.round(item.progress * 100)}%`}
                </span>

                {item.state === 'uploading' ? (
                  <button
                    type="button"
                    onClick={() => {
                      item.abort?.()
                      patch(item.key, { state: 'paused' })
                    }}
                    aria-label={`Pause ${item.file.name}`}
                    className="flex h-9 w-9 items-center justify-center rounded"
                  >
                    <Pause size={16} aria-hidden />
                  </button>
                ) : null}

                {item.state === 'paused' ||
                item.state === 'error' ||
                item.state === 'interrupted' ? (
                  <button
                    type="button"
                    onClick={() => item.resume?.()}
                    aria-label={`Resume ${item.file.name}`}
                    className="flex h-9 w-9 items-center justify-center rounded"
                  >
                    <Play size={16} aria-hidden />
                  </button>
                ) : null}

                <button
                  type="button"
                  onClick={() => {
                    if (item.state === 'uploading' && !window.confirm(`Cancel ${item.file.name}?`))
                      return
                    item.abort?.()
                    setItems((current) => current.filter((i) => i.key !== item.key))
                  }}
                  aria-label={`Cancel ${item.file.name}`}
                  className="flex h-9 w-9 items-center justify-center rounded text-[var(--color-l-text-mid)]"
                >
                  <X size={16} aria-hidden />
                </button>
              </div>

              <div
                role="progressbar"
                aria-valuenow={Math.round(item.progress * 100)}
                aria-valuemin={0}
                aria-valuemax={100}
                aria-label={`Upload progress for ${item.file.name}`}
                className="h-1.5 overflow-hidden rounded bg-[var(--color-l-surface-2)]"
              >
                <div
                  className="h-full bg-accent transition-[width] duration-300"
                  style={{ width: `${item.progress * 100}%` }}
                />
              </div>

              <p className="mt-1 text-[12px] text-[var(--color-l-text-mid)]">
                {item.message ?? estimate(item)}
              </p>
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  )
}

/**
 * tus reports failures as `tus: failed to upload chunk at offset 5242880, caused by
 * [object ProgressEvent], origin: …`. True, and useless to the person watching the bar.
 */
function shortReason(error: Error): string {
  if (/ProgressEvent|NetworkError|Failed to fetch|ERR_INTERNET/i.test(error.message)) {
    return 'The connection dropped. This will pick up where it left off when you are back online.'
  }
  return error.message.split(',')[0] ?? error.message
}

/** A realistic time estimate, from observed throughput rather than a guess (doc 05 §3.4). */
function estimate(item: Item): string {
  if (item.state !== 'uploading' || item.bytesUploaded === 0) return ''
  const elapsedS = (Date.now() - item.startedAt) / 1000
  const bytesPerS = item.bytesUploaded / Math.max(1, elapsedS)
  const remainingS = Math.round((item.file.size - item.bytesUploaded) / Math.max(1, bytesPerS))
  if (remainingS < 60) return `about ${remainingS}s left`
  if (remainingS < 3600) return `about ${Math.round(remainingS / 60)} min left`
  return `about ${(remainingS / 3600).toFixed(1)} hours left`
}
