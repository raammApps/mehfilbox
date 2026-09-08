'use client'

import Link from 'next/link'
import { useMemo, useState } from 'react'
import { catalogueAttention, weddingProximity, type Attention } from '@/lib/admin/catalogue-health'
import type { CatalogueCounts } from '@/lib/db/repository'
import type { CatalogueStatus, SubStatus } from '@/lib/schema'
import { StatusPill } from './AdminChrome'
import { PublicLink } from './PublicLink'
import { IconFilm, IconImage, IconPlus, IconSearch } from './icons'

/**
 * The catalogue list.
 *
 * It was a flat grid of identical cards with no search, no filter and no sense of state — which
 * is fine for the demo org's one wedding and breaks in a partner's first month. Doc 15 sells
 * this to studios running dozens at a time; this is the screen that has to hold that.
 *
 * Filtering is client-side and deliberately so: the whole list is already on the page, the caps
 * mean it is small, and a round trip per keystroke would make the fastest part of the console
 * the slowest.
 */

export type CatalogueRow = {
  id: string
  name: string
  slug: string
  url: string
  status: CatalogueStatus
  subStatus: SubStatus
  weddingDate: string
  weddingDateLabel: string
  /** When it stops serving — drives the renewal warning (N-21b). */
  includedUntil: string | null
  counts: CatalogueCounts
}

type Filter = 'all' | 'live' | 'draft' | 'attention'
type Sort = 'wedding' | 'name' | 'attention'

const FILTERS: { id: Filter; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'live', label: 'Live' },
  { id: 'draft', label: 'Drafts' },
  { id: 'attention', label: 'Needs attention' },
]

export function CatalogueBoard({ rows }: { rows: CatalogueRow[] }) {
  const [query, setQuery] = useState('')
  const [filter, setFilter] = useState<Filter>('all')
  const [sort, setSort] = useState<Sort>('wedding')

  const decorated = useMemo(
    () => rows.map((row) => ({ row, attention: catalogueAttention(row) })),
    [rows],
  )

  const summary = useMemo(() => {
    const live = decorated.filter((d) => d.row.status === 'published').length
    const attention = decorated.filter((d) => d.attention.tone === 'warn').length
    return { total: decorated.length, live, drafts: decorated.length - live, attention }
  }, [decorated])

  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase()
    const matched = decorated.filter(({ row, attention }) => {
      if (needle && !`${row.name} ${row.slug}`.toLowerCase().includes(needle)) return false
      if (filter === 'live') return row.status === 'published'
      if (filter === 'draft') return row.status !== 'published'
      if (filter === 'attention') return attention.tone === 'warn'
      return true
    })

    const order: Record<Attention['tone'], number> = { warn: 0, act: 1, ok: 2 }
    return [...matched].sort((a, b) => {
      if (sort === 'name') return a.row.name.localeCompare(b.row.name)
      if (sort === 'attention') return order[a.attention.tone] - order[b.attention.tone]
      // Nearest wedding first among those still to come, then the most recent past one.
      return b.row.weddingDate.localeCompare(a.row.weddingDate)
    })
  }, [decorated, query, filter, sort])

  if (rows.length === 0) return <EmptyConsole />

  return (
    <>
      {/*
        A definition list, not a row of divs: these are label/value pairs, and "Live" is also the
        name of a filter button two lines below. Without the grouping, "Live" on this screen is
        ambiguous to a screen reader in exactly the way it was ambiguous to the test that first
        went looking for it.
      */}
      <dl aria-label="At a glance" className="mb-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Summary label="Catalogues" value={summary.total} />
        <Summary label="Live" value={summary.live} />
        <Summary label="Drafts" value={summary.drafts} />
        <Summary
          label="Need attention"
          value={summary.attention}
          tone={summary.attention > 0 ? 'warn' : undefined}
        />
      </dl>

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <div className="relative min-w-[200px] flex-1">
          <span
            aria-hidden
            className="pointer-events-none absolute inset-y-0 start-3 flex items-center text-[var(--color-l-text-mid)]"
          >
            <IconSearch />
          </span>
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search by couple or address"
            aria-label="Search catalogues"
            className="h-10 w-full rounded-[var(--radius-pill)] border border-[var(--color-l-line)] bg-white ps-9 pe-3 text-[14px]"
          />
        </div>

        <div role="group" aria-label="Filter" className="flex flex-wrap gap-1">
          {FILTERS.map((option) => (
            <button
              key={option.id}
              type="button"
              onClick={() => setFilter(option.id)}
              aria-pressed={filter === option.id}
              className={`h-10 rounded-[var(--radius-pill)] border px-3.5 text-[13px] font-medium transition-colors ${
                filter === option.id
                  ? 'border-[var(--color-l-text-hi)] bg-[var(--color-l-text-hi)] text-white'
                  : 'border-[var(--color-l-line)] bg-white text-[var(--color-l-text-mid)] hover:text-[var(--color-l-text-hi)]'
              }`}
            >
              {option.label}
            </button>
          ))}
        </div>

        {/*
          `htmlFor`, not a wrapping label. A `<select>` nested inside its own `<label>` takes the
          label's whole text content as its accessible name — which here included every option,
          so the control announced itself as "Sort Wedding date Couple What needs doing".
        */}
        <div className="flex items-center gap-2">
          <label htmlFor="catalogue-sort" className="text-[13px] text-[var(--color-l-text-mid)]">
            Sort
          </label>
          <select
            id="catalogue-sort"
            value={sort}
            onChange={(event) => setSort(event.target.value as Sort)}
            className="h-10 rounded-[var(--radius-input)] border border-[var(--color-l-line)] bg-white px-2 text-[13px] text-[var(--color-l-text-hi)]"
          >
            <option value="wedding">Wedding date</option>
            <option value="name">Couple</option>
            <option value="attention">What needs doing</option>
          </select>
        </div>
      </div>

      {visible.length === 0 ? (
        <p className="rounded-[var(--radius-card)] border border-dashed border-[var(--color-l-line)] px-4 py-10 text-center text-[14px] text-[var(--color-l-text-mid)]">
          Nothing matches. Try a different search, or{' '}
          <button
            type="button"
            onClick={() => {
              setQuery('')
              setFilter('all')
            }}
            className="font-semibold text-[var(--color-l-text-hi)] underline underline-offset-4"
          >
            clear the filters
          </button>
          .
        </p>
      ) : (
        <ul aria-label="Catalogues" className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {visible.map(({ row, attention }) => (
            <CatalogueCard key={row.id} row={row} attention={attention} />
          ))}
        </ul>
      )}
    </>
  )
}

function CatalogueCard({ row, attention }: { row: CatalogueRow; attention: Attention }) {
  const proximity = weddingProximity(row.weddingDate)

  return (
    <li className="flex flex-col rounded-[var(--radius-card)] border border-[var(--color-l-line)] bg-white p-4 transition-shadow hover:shadow-[0_1px_3px_rgba(0,0,0,0.08),0_8px_24px_-12px_rgba(0,0,0,0.18)]">
      <div className="mb-1.5 flex items-start justify-between gap-2">
        <Link
          href={`/admin/c/${row.id}`}
          className="text-[17px] font-semibold leading-tight underline-offset-4 hover:underline"
        >
          {row.name}
        </Link>
        <StatusPill status={row.status} />
      </div>

      <p className="text-[13px] text-[var(--color-l-text-mid)]">
        {row.weddingDateLabel}
        {/* No extra dimming: this text is already the muted colour, and opacity on top of it
            drops below 4.5:1 — which the axe gate caught rather than a reviewer. */}
        {proximity ? <span> · {proximity}</span> : null}
      </p>

      <p className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-[13px] text-[var(--color-l-text-mid)]">
        <span className="inline-flex items-center gap-1.5">
          <span aria-hidden className="opacity-70">
            <IconFilm />
          </span>
          {row.counts.titles} film{row.counts.titles === 1 ? '' : 's'}
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span aria-hidden className="opacity-70">
            <IconImage />
          </span>
          {row.counts.photos} photo{row.counts.photos === 1 ? '' : 's'}
        </span>
      </p>

      <p className="mt-2.5">
        <AttentionChip attention={attention} />
      </p>

      <div className="mt-3">
        <PublicLink url={row.url} status={row.status} compact />
      </div>

      <div className="mt-4 flex gap-2 border-t border-[var(--color-l-line)] pt-3">
        <CardLink href={`/admin/c/${row.id}/titles`}>Films</CardLink>
        <CardLink href={`/admin/c/${row.id}/photos`}>Photographs</CardLink>
        <CardLink href={`/admin/c/${row.id}/customizer`}>Customizer</CardLink>
      </div>
    </li>
  )
}

function CardLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      className="rounded-[var(--radius-pill)] border border-[var(--color-l-line)] px-3 py-1.5 text-[13px] text-[var(--color-l-text-mid)] transition-colors hover:border-[var(--color-l-text-mid)] hover:text-[var(--color-l-text-hi)]"
    >
      {children}
    </Link>
  )
}

export function AttentionChip({ attention }: { attention: Attention }) {
  const tone =
    attention.tone === 'warn'
      ? 'bg-[color-mix(in_srgb,var(--color-error)_10%,white)] text-[#8a1420]'
      : attention.tone === 'act'
        ? 'bg-[var(--color-l-surface-2)] text-[var(--color-l-text-mid)]'
        : 'bg-[color-mix(in_srgb,var(--color-ok)_14%,white)] text-[#1c5f2a]'

  return (
    <span className={`inline-block rounded-[var(--radius-pill)] px-2.5 py-1 text-[12px] ${tone}`}>
      {attention.label}
    </span>
  )
}

function Summary({
  label,
  value,
  tone,
}: {
  label: string
  value: number
  tone?: 'warn'
}) {
  return (
    <div
      className={`rounded-[var(--radius-card)] border bg-white px-4 py-3 ${
        tone === 'warn' && value > 0
          ? 'border-[color-mix(in_srgb,var(--color-error)_35%,white)]'
          : 'border-[var(--color-l-line)]'
      }`}
    >
      <dt className="type-label text-[var(--color-l-text-mid)]">{label}</dt>
      <dd className="mt-0.5 text-[26px] font-bold leading-none tracking-[-0.02em]">{value}</dd>
    </div>
  )
}

/**
 * The first screen a new partner sees. It said "No catalogues yet" and left them to work out
 * what the product was for.
 */
function EmptyConsole() {
  return (
    <div className="rounded-[var(--radius-card)] border border-dashed border-[var(--color-l-line)] bg-white px-6 py-12 text-center">
      <h2 className="text-[18px] font-semibold">No weddings here yet</h2>
      <p className="mx-auto mt-2 max-w-[42ch] text-[14px] text-[var(--color-l-text-mid)]">
        A catalogue is one couple&rsquo;s films and photographs at their own address. Setting one
        up takes about half an hour, and most of that is the upload running in the background
        while you do something else.
      </p>
      <Link
        href="/admin/new"
        className="mt-5 inline-flex h-11 items-center gap-2 rounded-[var(--radius-pill)] bg-accent px-5 font-semibold text-accent-ink"
      >
        <span aria-hidden>
          <IconPlus />
        </span>
        Create the first one
      </Link>
    </div>
  )
}
