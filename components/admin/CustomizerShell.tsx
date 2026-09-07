'use client'

import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core'
import { restrictToVerticalAxis } from '@dnd-kit/modifiers'
import {
  SortableContext,
  arrayMove,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { Eye, EyeOff, GripVertical, Plus, Settings2, Trash2, Undo2 } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { Album, Catalogue, ModuleInstance, Photo, Title } from '@/lib/schema'
import { getModule, listModules, instantiate } from '@/modules/registry'
import type { GuestContext } from '@/modules/contract'
import { SectionInspector } from './SectionInspector'
import { resolveLocalised } from '@/lib/i18n'
import { BRANDING_SELECTION, PreviewPane } from './PreviewPane'
import { ThemePicker } from './ThemePicker'
import { SaveState, type SaveStatus } from './SaveState'

const AUTOSAVE_DEBOUNCE_MS = 800
const UNDO_DEPTH = 20

type Props = {
  catalogue: Catalogue
  titles: Title[]
  albums: Album[]
  photos: Photo[]
  initialModules: ModuleInstance[]
  /** The address a guest would open. Built on the server, where ROOT_DOMAIN and TENANCY_MODE live. */
  publicUrl: string
  /** Films and photographs waiting for the next Publish (N-57). */
  pendingContent: { titles: number; photos: number }
}

/**
 * The customizer (doc 14 §5, doc 08 `<CustomizerShell>`).
 *
 * Where the operator spends their thirty minutes, and the thing a competitor cannot copy in a
 * weekend. Drag **and** keyboard reorder, visibility without deleting config, autosave to
 * `draft_modules`, an explicit Publish, and an undo stack of twenty.
 */
export function CustomizerShell({
  catalogue,
  titles,
  albums,
  photos,
  initialModules,
  publicUrl,
  pendingContent,
}: Props) {
  const [modules, setModules] = useState<ModuleInstance[]>(initialModules)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [saveState, setSaveState] = useState<SaveStatus>('idle')
  const router = useRouter()
  const [publishing, setPublishing] = useState(false)
  // The preview shows the draft; the guest page shows `catalogue.branding` until Publish (N-56).
  const [branding, setBranding] = useState(catalogue.draftBranding ?? catalogue.branding)
  const [dirty, setDirty] = useState(false)
  /**
   * Whether guests are seeing something older than this preview (N-55).
   *
   * `draft_modules` is exactly that fact and it was already in the row: autosave writes it, and
   * publish clears it. Nothing displayed it, so the operator's only signal was "Saved as draft" —
   * which answers "did my typing survive", not "can the couple see it", and those are different
   * questions with the same reassuring answer.
   */
  const pendingCount = pendingContent.titles + pendingContent.photos
  const [unpublished, setUnpublished] = useState(
    (catalogue.draftModules ?? null) !== null ||
      (catalogue.draftBranding ?? null) !== null ||
      pendingCount > 0,
  )
  const [published, setPublished] = useState(catalogue.status === 'published')
  const [publishError, setPublishError] = useState<string | null>(null)
  const undoStack = useRef<ModuleInstance[][]>([])

  /** Every mutation goes through here so undo and autosave cannot be bypassed. */
  const commit = useCallback((next: ModuleInstance[]) => {
    setModules((current) => {
      undoStack.current = [...undoStack.current, current].slice(-UNDO_DEPTH)
      return next.map((instance, index) => ({ ...instance, order: index }))
    })
    setDirty(true)
    setUnpublished(true)
  }, [])

  const undo = useCallback(() => {
    const previous = undoStack.current.pop()
    if (!previous) return
    setModules(previous)
    setDirty(true)
  }, [])

  // Autosave to draft_modules, debounced. Publish is separate and explicit (doc 14 §5.6).
  useEffect(() => {
    if (!dirty) return
    setSaveState('saving')

    const timer = window.setTimeout(async () => {
      try {
        const response = await fetch(`/api/admin/catalogues/${catalogue.id}/modules`, {
          method: 'PUT',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ modules }),
        })
        setSaveState(response.ok ? 'saved' : 'error')
      } catch {
        setSaveState('error')
      }
      setDirty(false)
    }, AUTOSAVE_DEBOUNCE_MS)

    return () => window.clearTimeout(timer)
  }, [modules, dirty, catalogue.id])

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    // Keyboard reorder is not optional: mouse-only is an a11y failure and a trackpad
    // annoyance (doc 14 §5.1).
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  )

  const onDragEnd = (event: DragEndEvent) => {
    const { active, over } = event
    if (!over || active.id === over.id) return
    const from = modules.findIndex((m) => m.id === active.id)
    const to = modules.findIndex((m) => m.id === over.id)
    if (from === -1 || to === -1) return
    commit(arrayMove(modules, from, to))
  }

  /**
   * A heading typed straight into the preview (N-13 §1).
   *
   * Goes through `commit` like every other mutation, so it is undoable and autosaved on the same
   * path as a change made in the inspector — there is no second way to edit a module.
   *
   * Only `en` is touched. The preview renders English, so that is the string the operator was
   * looking at when they typed; the Hindi field stays where it is and stays the inspector's job.
   */
  const editHeading = useCallback(
    (instanceId: string, text: string) => {
      setModules((current) => {
        const target = current.find((instance) => instance.id === instanceId)
        if (!target || resolveLocalised(target.title, 'en') === text) return current

        undoStack.current = [...undoStack.current, current].slice(-UNDO_DEPTH)
        return current.map((instance) =>
          instance.id === instanceId
            ? { ...instance, title: { ...instance.title, en: text } }
            : instance,
        )
      })
      setDirty(true)
    },
    [],
  )

  /**
   * A drop in the preview (N-13 §2), expressed the same way the list's drag already is.
   *
   * Both paths land on `arrayMove` through `commit`, so a reorder from the preview is undoable
   * and autosaved identically — the preview is a second way to say the same thing, not a second
   * implementation of it.
   */
  const reorderByIds = useCallback(
    (fromId: string, toId: string) => {
      const from = modules.findIndex((m) => m.id === fromId)
      const to = modules.findIndex((m) => m.id === toId)
      if (from === -1 || to === -1 || from === to) return
      commit(arrayMove(modules, from, to))
    },
    [modules, commit],
  )

  const moveBy = (id: string, delta: -1 | 1) => {
    const from = modules.findIndex((m) => m.id === id)
    const to = from + delta
    if (from === -1 || to < 0 || to >= modules.length) return
    commit(arrayMove(modules, from, to))
  }

  const publish = async () => {
    setPublishing(true)
    setPublishError(null)
    try {
      // Flush any in-flight autosave first, so Publish can never ship a stale draft.
      const saved = await fetch(`/api/admin/catalogues/${catalogue.id}/modules`, {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ modules }),
      })

      /**
       * Branding needs the same flush, and did not have it (N-56).
       *
       * The theme panel autosaves on a 700ms debounce. Publishing inside that window promoted a
       * draft that did not yet contain the operator's change, and the debounced write then landed
       * *after* the promotion — recreating the draft, so the console flipped straight back to
       * "guests are still seeing the last published version" and the change never shipped. It
       * looked like Publish had done nothing.
       *
       * `branding` here is the value the preview is rendering, kept current by `onBrandingPreview`
       * on every keystroke, so this ships exactly what the operator is looking at.
       */
      const brandingSaved = await fetch(`/api/admin/catalogues/${catalogue.id}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ draftBranding: branding }),
      })
      /**
       * Both responses are checked, and neither was before (N-55).
       *
       * This button fired two requests and read neither, then set 'saved' and refreshed — so a
       * refused publish and a successful one were indistinguishable, and the operator walked away
       * believing the couple could see a page the couple could not. It is the same defect N-30
       * fixed on the film list, surviving on the one control where it costs most. A suspended
       * studio (N-27) now makes it reachable rather than hypothetical: that publish returns 403.
       */
      if (!saved.ok || !brandingSaved.ok) {
        setSaveState('error')
        setPublishError('Your changes could not be saved, so nothing was published.')
        return
      }

      const response = await fetch(`/api/admin/catalogues/${catalogue.id}/publish`, {
        method: 'POST',
      })
      if (!response.ok) {
        const body = (await response.json().catch(() => null)) as {
          error?: { message?: string }
        } | null
        setPublishError(body?.error?.message ?? 'Publishing failed. Nothing has changed for guests.')
        return
      }

      setSaveState('saved')
      setDirty(false)
      setUnpublished(false)
      setPublished(true)

      /**
       * Publishing flips the catalogue draft → live, and the list renders that as a badge and two
       * counters. Without this the operator publishes, walks back to the list, and is told the
       * wedding is still a draft — so they publish again, and start looking for the fault in the
       * wrong place. Same cache as the wizard's (N-32); the customizer just reaches it later.
       */
      router.refresh()
    } finally {
      setPublishing(false)
    }
  }

  /**
   * Stable by necessity, not by style.
   *
   * `ThemePicker`'s autosave effect lists this in its dependencies, so an inline arrow gets a new
   * identity on every render and the effect re-fires on every render — re-PATCHing the draft and
   * re-marking the page unpublished immediately after each publish. The symptom was a publish
   * that appeared to do nothing, and it only showed up once enough other tests were running to
   * change the render timing.
   */
  const onBrandingPreview = useCallback((next: Catalogue['branding']) => {
    setBranding(next)
    // A colour change is an unpublished change like any other, and the Publish control has to
    // offer itself again — otherwise branding saves to a draft nothing can ship.
    setUnpublished(true)
  }, [])

  const editing = modules.find((m) => m.id === editingId) ?? null

  const advisories = useMemo(
    () => collectAdvisories(modules, { catalogue, titles, albums, photos, profileId: null }),
    [modules, catalogue, titles, albums, photos],
  )

  return (
    <div className="grid gap-5 lg:grid-cols-[minmax(280px,340px)_1fr] xl:grid-cols-[minmax(280px,320px)_1fr_minmax(300px,380px)]">
      <section aria-label="Sections">
        <div className="mb-3 flex items-center justify-between gap-2">
          <h2 className="text-[13px] font-bold uppercase tracking-[0.09em] text-[var(--color-l-text-mid)]">
            Sections
          </h2>
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={undo}
              disabled={undoStack.current.length === 0}
              className="inline-flex h-9 items-center gap-1 rounded-[var(--radius-pill)] px-3 text-[13px] disabled:opacity-40"
            >
              <Undo2 size={15} aria-hidden /> Undo
            </button>
            <AddSectionMenu
              onAdd={(type) => {
                const instance = instantiate(type, modules.length, catalogue, titles, albums)
                if (instance) commit([...modules, instance])
              }}
              existingTypes={modules.map((m) => m.type)}
            />
          </div>
        </div>

        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          modifiers={[restrictToVerticalAxis]}
          onDragEnd={onDragEnd}
        >
          <SortableContext items={modules.map((m) => m.id)} strategy={verticalListSortingStrategy}>
            <ul className="space-y-2">
              {modules.map((instance, index) => (
                <SectionRow
                  key={instance.id}
                  instance={instance}
                  index={index}
                  total={modules.length}
                  onToggle={() =>
                    commit(
                      modules.map((m) =>
                        m.id === instance.id ? { ...m, enabled: !m.enabled } : m,
                      ),
                    )
                  }
                  selected={instance.id === editingId}
                  onEdit={() => setEditingId(instance.id)}
                  onRemove={() => commit(modules.filter((m) => m.id !== instance.id))}
                  onMove={(delta) => moveBy(instance.id, delta)}
                />
              ))}
            </ul>
          </SortableContext>
        </DndContext>

        {advisories.length > 0 ? <Advisories notes={advisories} /> : null}

        <button
          type="button"
          onClick={() => setEditingId(BRANDING_SELECTION)}
          aria-current={editingId === BRANDING_SELECTION ? 'true' : undefined}
          className={`mt-2 w-full rounded-[var(--radius-card)] border bg-white px-3 py-2 text-start text-[14px] ${
            editingId === BRANDING_SELECTION
              ? 'border-accent ring-1 ring-accent'
              : 'border-[var(--color-l-line)]'
          }`}
        >
          <span className="block font-medium">Branding</span>
          <span className="block text-[12px] text-[var(--color-l-text-mid)]">
            Colour, logo, typeface and “Presented by”
          </span>
        </button>
      </section>

      <section aria-label="Preview" className="min-w-0">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <div className="min-w-0">
            <SaveState status={saveState} savedLabel="Saved as draft" />
            {/*
              "Saved as draft" answers "did my typing survive". This answers the question the
              operator actually has, which is whether the couple can see it. They had the same
              reassuring answer before, and only one of them was being asked.
            */}
            <p className="text-[13px] text-[var(--color-l-text-mid)]">
              {!published
                ? 'Not published yet — nobody can open this page.'
                : unpublished
                  ? 'Guests are still seeing the last published version.'
                  : 'Guests are seeing exactly this.'}
            </p>
            {/* The preview renders the draft. This opens what a guest actually gets, which is the
                only way to check the sentence above rather than trust it. */}
            {/*
              Naming the content specifically, because "unpublished changes" does not tell an
              operator that the four films they ticked this morning are still invisible. A film
              waiting with no explanation is the support question this whole change risks
              creating, so the console answers it before it is asked.
            */}
            {pendingCount > 0 ? (
              <p className="text-[13px] text-[var(--color-l-text-mid)]">
                {[
                  pendingContent.titles > 0
                    ? `${pendingContent.titles} film${pendingContent.titles === 1 ? '' : 's'}`
                    : null,
                  pendingContent.photos > 0
                    ? `${pendingContent.photos} photograph${pendingContent.photos === 1 ? '' : 's'}`
                    : null,
                ]
                  .filter(Boolean)
                  .join(' and ')}{' '}
                will go live when you publish.
              </p>
            ) : null}
            {published ? (
              <a
                href={publicUrl}
                target="_blank"
                rel="noreferrer"
                className="text-[13px] underline underline-offset-4"
              >
                Open the live page
              </a>
            ) : null}
          </div>

          <button
            type="button"
            onClick={() => void publish()}
            disabled={publishing || (published && !unpublished)}
            className="inline-flex h-11 items-center rounded-[var(--radius-pill)] bg-accent px-5 font-semibold text-accent-ink disabled:opacity-60"
          >
            {publishing
              ? 'Publishing…'
              : !published
                ? 'Publish'
                : unpublished
                  ? 'Publish changes'
                  : 'Published'}
          </button>
        </div>

        {publishError ? (
          <p
            role="alert"
            data-testid="publish-error"
            className="mb-3 rounded-[var(--radius-card)] border border-[var(--color-error)] px-3 py-2 text-[13px] text-[var(--color-error)]"
          >
            {publishError}
          </p>
        ) : null}

        <PreviewPane
          branding={branding}
          selectedId={editingId}
          onSelect={setEditingId}
          onEditHeading={editHeading}
          onReorder={reorderByIds}
          catalogue={catalogue}
          titles={titles}
          albums={albums}
          photos={photos}
          modules={modules}
        />
      </section>

      <div className="min-w-0">
        <h2 className="mb-3 text-[13px] font-bold uppercase tracking-[0.09em] text-[var(--color-l-text-mid)]">
          Editing
        </h2>
        {editingId === BRANDING_SELECTION ? (
          <ThemePicker catalogue={catalogue} onPreview={onBrandingPreview} />
        ) : (
        <SectionInspector
          instance={editing ?? null}
          catalogue={catalogue}
          titles={titles}
          albums={albums}
          photos={photos}
          onChange={(next) => commit(modules.map((m) => (m.id === next.id ? next : m)))}
        />
        )}
      </div>
    </div>
  )
}

function SectionRow({
  instance,
  index,
  total,
  selected,
  onToggle,
  onEdit,
  onRemove,
  onMove,
}: {
  instance: ModuleInstance
  index: number
  total: number
  /** Being edited in the inspector, so the list and the preview agree on what is selected. */
  selected: boolean
  onToggle: () => void
  onEdit: () => void
  onRemove: () => void
  onMove: (delta: -1 | 1) => void
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: instance.id,
  })
  const definition = getModule(instance.type)
  const label = instance.title.en || definition?.meta.label || instance.type

  return (
    <li
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      aria-current={selected ? 'true' : undefined}
      className={`flex items-center gap-1 rounded-[var(--radius-card)] border bg-white px-2 py-2 ${
        selected
          ? 'border-accent ring-1 ring-accent'
          : 'border-[var(--color-l-line)]'
      } ${isDragging ? 'opacity-70 shadow-lg' : ''} ${instance.enabled ? '' : 'opacity-55'}`}
    >
      <button
        type="button"
        {...attributes}
        {...listeners}
        aria-label={`Reorder ${label}`}
        className="flex h-9 w-8 cursor-grab items-center justify-center text-[var(--color-l-text-mid)]"
      >
        <GripVertical size={16} aria-hidden />
      </button>

      <span className="min-w-0 flex-1">
        <span className="block truncate text-[14px] font-medium">{label}</span>
        <span className="block text-[12px] text-[var(--color-l-text-mid)]">
          {definition?.meta.label ?? 'Unknown section'}
        </span>
      </span>

      {/* Arrow buttons duplicate drag for keyboard and trackpad users. */}
      <button
        type="button"
        onClick={() => onMove(-1)}
        disabled={index === 0}
        aria-label={`Move ${label} up`}
        className="h-9 w-8 rounded text-[13px] disabled:opacity-30"
      >
        ↑
      </button>
      <button
        type="button"
        onClick={() => onMove(1)}
        disabled={index === total - 1}
        aria-label={`Move ${label} down`}
        className="h-9 w-8 rounded text-[13px] disabled:opacity-30"
      >
        ↓
      </button>

      <button
        type="button"
        onClick={onToggle}
        aria-pressed={instance.enabled}
        aria-label={instance.enabled ? `Hide ${label} from guests` : `Show ${label} to guests`}
        className="flex h-9 w-9 items-center justify-center rounded"
      >
        {instance.enabled ? <Eye size={17} aria-hidden /> : <EyeOff size={17} aria-hidden />}
      </button>

      <button
        type="button"
        onClick={onEdit}
        aria-label={`Edit ${label}`}
        className="flex h-9 w-9 items-center justify-center rounded"
      >
        <Settings2 size={17} aria-hidden />
      </button>

      <button
        type="button"
        onClick={onRemove}
        aria-label={`Remove ${label}`}
        className="flex h-9 w-9 items-center justify-center rounded text-[var(--color-l-text-mid)] hover:text-[var(--color-error)]"
      >
        <Trash2 size={16} aria-hidden />
      </button>
    </li>
  )
}

function AddSectionMenu({
  onAdd,
  existingTypes,
}: {
  onAdd: (type: string) => void
  existingTypes: string[]
}) {
  const [open, setOpen] = useState(false)
  const available = listModules({ phase: 0 }).filter(
    (definition) => !definition.meta.singleton || !existingTypes.includes(definition.meta.type),
  )

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="inline-flex h-9 items-center gap-1 rounded-[var(--radius-pill)] border border-[var(--color-l-line)] px-3 text-[13px]"
      >
        <Plus size={15} aria-hidden /> Add
      </button>

      {open ? (
        <ul className="absolute end-0 z-20 mt-1 w-[300px] rounded-[var(--radius-card)] border border-[var(--color-l-line)] bg-white p-1 shadow-xl">
          {available.map((definition) => (
            <li key={definition.meta.type}>
              <button
                type="button"
                onClick={() => {
                  onAdd(definition.meta.type)
                  setOpen(false)
                }}
                className="block w-full rounded px-3 py-2 text-start hover:bg-[var(--color-l-surface-2)]"
              >
                <span className="block text-[14px] font-medium">{definition.meta.label}</span>
                <span className="block text-[12px] text-[var(--color-l-text-mid)]">
                  {definition.meta.description}
                </span>
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  )
}

/** Suggestions with a dismiss — never blockers (doc 14 §5.9). */
function Advisories({ notes }: { notes: string[] }) {
  const [dismissed, setDismissed] = useState(false)
  if (dismissed) return null

  return (
    <aside className="mt-4 rounded-[var(--radius-card)] border border-[color-mix(in_srgb,var(--color-warn)_40%,white)] bg-[color-mix(in_srgb,var(--color-warn)_10%,white)] p-3">
      <div className="mb-1 flex items-start justify-between gap-2">
        <p className="text-[13px] font-semibold">A few suggestions</p>
        <button
          type="button"
          onClick={() => setDismissed(true)}
          className="text-[12px] underline underline-offset-2"
        >
          Dismiss
        </button>
      </div>
      <ul className="list-disc space-y-1 ps-4 text-[13px] text-[var(--color-l-text-mid)]">
        {notes.map((note) => (
          <li key={note}>{note}</li>
        ))}
      </ul>
    </aside>
  )
}

function collectAdvisories(
  modules: ModuleInstance[],
  ctx: Omit<GuestContext, 't' | 'locale' | 'heading' | 'instanceId' | 'consumedTitleIds'>,
): string[] {
  const notes: string[] = []

  for (const instance of modules) {
    if (!instance.enabled) continue
    const definition = getModule(instance.type)
    if (!definition?.advise) continue
    const parsed = definition.schema.safeParse(instance.config)
    if (!parsed.success) continue
    notes.push(...definition.advise(parsed.data, ctx))
  }

  // Catalogue-level nudges the individual modules cannot see. Driven off `meta.content`
  // rather than off type names, so adding a module does not mean editing this file.
  const enabled = modules
    .filter((m) => m.enabled)
    .map((m) => getModule(m.type))
    .filter((definition): definition is NonNullable<typeof definition> => definition !== null)

  if (enabled.length > 0 && enabled.every((definition) => definition.meta.content === 'video')) {
    notes.push('Every section here is video. A message or a gallery is what makes it a keepsake.')
  }
  const withoutPoster = ctx.titles.filter((title) => title.published && !title.posterUrl).length
  if (withoutPoster > 0) {
    notes.push(
      `${withoutPoster} published film${withoutPoster > 1 ? 's have' : ' has'} no poster art — generated artwork will stand in.`,
    )
  }

  if (ctx.titles.length > 12) {
    notes.push(
      `${ctx.titles.length} films is a lot to browse. Under twelve is where this stops feeling like a folder.`,
    )
  }

  // Several rows can raise the same nudge; an operator reading the same sentence twice
  // discounts all of them.
  return [...new Set(notes)]
}
