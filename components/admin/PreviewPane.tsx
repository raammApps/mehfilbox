'use client'

import { Monitor, Smartphone } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { ThemeStyle } from '@/components/chrome/ThemeStyle'
import { CatalogueShell } from '@/components/streaming/CatalogueShell'
import type { Album, Catalogue, ModuleInstance, Photo, Title } from '@/lib/schema'
import type { ThemeDefinition } from '@/themes/contract'
import { themeFrom } from '@/themes/registry'

const DEBOUNCE_MS = 300

/**
 * Selection id for the parts of the preview that are not a section: the top nav, the footer,
 * "Presented by". They are branding, and branding is editable, so they must be reachable by
 * pointing at them like everything else.
 */
export const BRANDING_SELECTION = '__branding__'

type Props = {
  catalogue: Catalogue
  titles: Title[]
  albums: Album[]
  photos: Photo[]
  modules: ModuleInstance[]
  /** Instance id of the section being edited, outlined here so the two panels agree. */
  /** Live branding from the picker, so the preview shows the accent and typeface being chosen. */
  branding?: Catalogue['branding']
  /** Every theme, so a platform-authored one previews as it will publish (D-35). */
  themes?: readonly ThemeDefinition[]
  selectedId?: string | null
  /** Clicking a section selects it. Omit to keep the preview read-only. */
  onSelect?: (instanceId: string) => void
  /**
   * Commit a heading typed directly into the preview (N-13 §1).
   *
   * Headings are what operators change most and they are already on screen, so making them
   * editable where they are read removes the whole "find the field, type, look back" loop.
   * Omit to keep headings read-only.
   */
  onEditHeading?: (instanceId: string, text: string) => void
  /**
   * Reorder by dragging a section in the preview (N-13 §2).
   *
   * **Additive.** The list beside it remains the keyboard path and the accessible one — doc 14
   * §5.1 requires that, and a pointer-only reorder would be an a11y failure however good it
   * feels. This exists because "move that below this" is a spatial thought, and the list makes
   * you translate it into positions first.
   */
  onReorder?: (fromId: string, toId: string) => void
}

/**
 * An instance id inside an attribute selector.
 *
 * `CSS.escape` is a browser API, and `SelectionStyles` runs on the server too: since the
 * customizer opens with a section already selected (N-55), every server render of the page
 * threw `CSS is not defined`, logged an error, and left the client to render the tree again.
 * Nothing was visibly wrong, which is why it lasted. Escaped by hand when the API is absent.
 */
function escapeAttr(value: string): string {
  return typeof CSS !== 'undefined' && typeof CSS.escape === 'function'
    ? CSS.escape(value)
    : value.replace(/["\\]/g, '\\$&')
}

/**
 * The heading of a section, located by shape rather than by a marker each module opts into.
 *
 * Every module renders its `ctx.heading` as the first `h1`/`h2` inside its own wrapper. Asking
 * modules to tag it would put an admin concern in a guest component's markup, which is the thing
 * the selection outline already refuses to do — so this reads the DOM the renderer produces,
 * exactly as `SelectionStyles` does.
 *
 * A module with no heading returns nothing and simply is not editable in place; the inspector
 * still has the field.
 */
function headingNodeOf(root: HTMLElement, instanceId: string): HTMLElement | null {
  const section = root.querySelector(`[data-module-id="${escapeAttr(instanceId)}"]`)
  return (section?.querySelector('h1, h2') as HTMLElement | null) ?? null
}

/**
 * Renders **the real guest component tree** against draft modules — not a mock (doc 14 §5.4).
 *
 * A second implementation drifts, and the operator publishes something they never saw. The
 * guest tree is mounted inside a dark, width-constrained frame with `preview` set, which makes
 * navigation, history and the profile gate inert.
 *
 * Mobile is the default, because that is where guests are.
 */
export function PreviewPane({
  catalogue,
  titles,
  albums,
  photos,
  modules,
  branding,
  themes,
  selectedId = null,
  onSelect,
  onEditHeading,
  onReorder,
}: Props) {
  const [device, setDevice] = useState<'mobile' | 'desktop'>('mobile')
  const theme = themeFrom(branding ?? catalogue.branding, themes)
  const [debounced, setDebounced] = useState(modules)
  const viewport = useRef<HTMLDivElement>(null)

  /**
   * The last id this pane selected itself, so it can tell "the operator clicked here" from
   * "the operator clicked in the list". Only the second one should move the preview — scrolling
   * to something the operator just pointed at would yank the page under their cursor.
   */
  const selectedHere = useRef<string | null>(null)

  useEffect(() => {
    const timer = window.setTimeout(() => setDebounced(modules), DEBOUNCE_MS)
    return () => window.clearTimeout(timer)
  }, [modules])

  /**
   * N-13 §3 — bring the selected section into view when the selection came from the list.
   *
   * Clicking a section in the list used to update the inspector while the preview stayed exactly
   * where it was, so an operator edited a heading they could not see and had to hunt for the
   * result. Runs after the debounce so the node it looks for is the one for the current modules.
   */
  useEffect(() => {
    if (!selectedId || selectedId === BRANDING_SELECTION) return
    if (selectedId === selectedHere.current) {
      selectedHere.current = null
      return
    }

    const root = viewport.current
    if (!root) return

    const section = root.querySelector(`[data-module-id="${escapeAttr(selectedId)}"]`)
    section?.scrollIntoView({ behavior: 'smooth', block: 'center' })
  }, [selectedId, debounced])

  /**
   * N-13 §1 — make the selected section's heading editable where it is rendered.
   *
   * Applied imperatively rather than by rendering `contentEditable` from React, because the node
   * belongs to a guest component and threading an editing prop through the module contract is
   * the thing this design refuses to do.
   *
   * **Commit on blur, never on keystroke.** Committing per character would push a new `modules`
   * array, re-render the guest tree, replace this very node and drop the caret mid-word. Typing
   * therefore touches only the DOM; React learns about it once, at the end.
   */
  useEffect(() => {
    if (!onEditHeading || !selectedId || selectedId === BRANDING_SELECTION) return
    const root = viewport.current
    if (!root) return

    const node = headingNodeOf(root, selectedId)
    if (!node) return

    const original = node.textContent ?? ''
    node.contentEditable = 'plaintext-only'
    node.spellcheck = false
    node.dataset.editingHeading = 'true'

    const commit = () => {
      const next = (node.textContent ?? '').replace(/\s+/g, ' ').trim()
      if (next !== original.trim()) onEditHeading(selectedId, next)
    }

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Enter') {
        // A heading is one line. Enter means "done", not "paragraph break".
        event.preventDefault()
        node.blur()
      }
      if (event.key === 'Escape') {
        node.textContent = original
        node.blur()
      }
      // Guest components listen for keys of their own; none of them should see typing.
      event.stopPropagation()
    }

    node.addEventListener('blur', commit)
    node.addEventListener('keydown', onKeyDown)

    return () => {
      node.removeEventListener('blur', commit)
      node.removeEventListener('keydown', onKeyDown)
      node.removeAttribute('contenteditable')
      delete node.dataset.editingHeading
    }
  }, [onEditHeading, selectedId, debounced])

  /**
   * N-13 §2 — drag a section in the preview to move it.
   *
   * Delegated to the viewport rather than attached per section, for the same reason selection is:
   * the guest markup stays untouched. Native HTML5 drag, because it gives the drop cursor and the
   * autoscroll for free inside a 780px-tall scroller, which a pointer-event implementation would
   * have to rebuild.
   *
   * The fiddly part is that guest sections are full of natively draggable things. An `<img>` or a
   * link starts its own drag with itself as the target, so `dragstart` always resolves up to the
   * enclosing section and images are made undraggable inside the preview — a change to the
   * *preview's* copy of the tree only, never to what a guest is served.
   */
  useEffect(() => {
    if (!onReorder) return
    const root = viewport.current
    if (!root) return

    const sections = Array.from(root.querySelectorAll<HTMLElement>('[data-module-id]'))
    for (const section of sections) {
      section.draggable = true
      for (const image of section.querySelectorAll<HTMLElement>('img, a')) {
        image.draggable = false
      }
    }

    let draggingId: string | null = null

    const sectionFrom = (event: Event): HTMLElement | null =>
      (event.target as HTMLElement).closest?.('[data-module-id]') ?? null

    const onDragStart = (event: DragEvent) => {
      // Never start a drag from the text being edited — that would make selecting a word
      // impossible, which is the one gesture in-place editing depends on.
      if ((event.target as HTMLElement).closest?.('[data-editing-heading="true"]')) {
        event.preventDefault()
        return
      }

      const section = sectionFrom(event)
      draggingId = section?.getAttribute('data-module-id') ?? null
      if (!draggingId || !section) return

      event.dataTransfer?.setData('text/plain', draggingId)
      if (event.dataTransfer) event.dataTransfer.effectAllowed = 'move'
      section.dataset.dragging = 'true'
    }

    const onDragOver = (event: DragEvent) => {
      if (!draggingId) return
      // Without this the drop never fires: the default action for a dragover is "reject".
      event.preventDefault()
      if (event.dataTransfer) event.dataTransfer.dropEffect = 'move'

      const over = sectionFrom(event)
      for (const section of sections) delete section.dataset.dropTarget
      const id = over?.getAttribute('data-module-id')
      if (over && id && id !== draggingId) over.dataset.dropTarget = 'true'
    }

    const onDrop = (event: DragEvent) => {
      event.preventDefault()
      const over = sectionFrom(event)
      const toId = over?.getAttribute('data-module-id')
      if (draggingId && toId && toId !== draggingId) onReorder(draggingId, toId)
      cleanupMarks()
    }

    const cleanupMarks = () => {
      draggingId = null
      for (const section of sections) {
        delete section.dataset.dragging
        delete section.dataset.dropTarget
      }
    }

    root.addEventListener('dragstart', onDragStart)
    root.addEventListener('dragover', onDragOver)
    root.addEventListener('drop', onDrop)
    root.addEventListener('dragend', cleanupMarks)

    return () => {
      root.removeEventListener('dragstart', onDragStart)
      root.removeEventListener('dragover', onDragOver)
      root.removeEventListener('drop', onDrop)
      root.removeEventListener('dragend', cleanupMarks)
      for (const section of sections) section.draggable = false
      cleanupMarks()
    }
  }, [onReorder, debounced])

  const published = titles.filter((title) => title.published && title.status === 'ready')

  /**
   * One delegated listener rather than an overlay per section.
   *
   * An overlay would sit on top of the guest tree and change how it lays out; delegation leaves
   * the rendered markup untouched, which is the whole point of previewing the real components
   * (doc 14 §5.4). `ModuleRenderer` already tags each instance with `data-module-id`, so the
   * nearest one up from the click target is the section that was pointed at.
   *
   * Capture phase, because guest components have their own handlers — a poster card would open
   * its modal, and the operator would get a dialog instead of an editor. In the customizer,
   * pointing at a section means "edit this"; the guest surface is where it means "watch this".
   */
  const selectFromClick = (event: React.MouseEvent<HTMLDivElement>) => {
    if (!onSelect) return

    // Swallow *every* click, not only those landing on a section. The guest tree contains real
    // links — the wordmark, the footer — and they are outside `ModuleRenderer`, so a handler
    // that only looked for `[data-module-id]` let them through: clicking the couple's name in
    // the preview navigated the whole admin page to `/` and dropped the operator on the login
    // screen, losing their place in the customizer.
    // …except a click on the heading currently being edited. Swallowing that one would stop the
    // operator placing a caret in the very text the click made editable.
    const target = event.target as HTMLElement
    if (target.closest?.('[data-editing-heading="true"]')) return

    event.preventDefault()
    event.stopPropagation()

    const section = target.closest?.('[data-module-id]')
    const id = section?.getAttribute('data-module-id')

    // Chrome — nav, footer, "Presented by" — is branding rather than a section, so pointing at
    // it opens the branding fields. Everything visible in the preview leads somewhere.
    const next = id ?? BRANDING_SELECTION
    selectedHere.current = next
    onSelect(next)
  }

  return (
    <div>
      <div role="group" aria-label="Preview size" className="mb-3 flex items-center gap-1">
        <DeviceButton
          active={device === 'mobile'}
          onClick={() => setDevice('mobile')}
          label="Mobile preview"
        >
          <Smartphone size={16} aria-hidden /> Mobile
        </DeviceButton>
        <DeviceButton
          active={device === 'desktop'}
          onClick={() => setDevice('desktop')}
          label="Desktop preview"
        >
          <Monitor size={16} aria-hidden /> Desktop
        </DeviceButton>
      </div>

      <div
        className="mx-auto overflow-hidden rounded-[var(--radius-modal)] border border-[var(--color-l-line)]"
        style={{
          // The frame is the theme's page, not black: an ivory theme in a black frame previews wrong.
          background: theme.tokens.surface0,
          colorScheme: theme.tokens.colorScheme,
          width: device === 'mobile' ? 390 : '100%',
          maxWidth: '100%',
          height: device === 'mobile' ? 780 : 700,
        }}
      >
        {/*
          Branding never reached the preview before: `<ThemeStyle>` is rendered by guest pages,
          and this pane mounts the shell beneath that level. An operator picked an accent and
          the preview kept showing the default — the one place it most needed not to.
        */}
        <ThemeStyle branding={branding ?? catalogue.branding} theme={theme} scope="[data-preview-theme]" />

        <div
          ref={viewport}
          data-preview-theme
          className={`h-full overflow-y-auto ${onSelect ? '[&_[data-module-id]]:cursor-pointer' : ''}`}
          data-testid="preview-viewport"
          onClickCapture={selectFromClick}
        >
          {onSelect ? <SelectionStyles selectedId={selectedId} /> : null}
          {published.length === 0 ? (
            <p className="gutter-x py-16 text-center text-[14px] text-text-lo">
              Nothing is published yet. Publish a film on the Films tab to see it here.
            </p>
          ) : (
            <CatalogueShell
              bundle={{ catalogue, titles: published, albums, photos }}
              modules={debounced}
              locale="en"
              initialTitleSlug={null}
              initialProgress={[]}
              shareBaseUrl=""
              preview
              palette={theme.tokens.posterPalette}
            />
          )}
        </div>
      </div>
    </div>
  )
}

function DeviceButton({
  active,
  onClick,
  label,
  children,
}: {
  active: boolean
  onClick: () => void
  label: string
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      aria-label={label}
      className={`inline-flex h-9 items-center gap-1.5 rounded-[var(--radius-pill)] border px-3 text-[13px] ${
        active
          ? 'border-transparent bg-[var(--color-l-text-hi)] text-white'
          : 'border-[var(--color-l-line)]'
      }`}
    >
      {children}
    </button>
  )
}

/**
 * The selection outline, as scoped CSS rather than props threaded through the guest tree.
 *
 * Every alternative involved teaching guest components about editing: a wrapper element changes
 * layout, a className prop puts an admin concern in a module's signature. Attribute selectors
 * against the tags `ModuleRenderer` already emits leave the previewed markup byte-identical to
 * what a guest gets, which is the property that makes this a preview at all.
 *
 * `inset` rather than a border so nothing shifts by a pixel when a section becomes selected.
 */
function SelectionStyles({ selectedId }: { selectedId: string | null }) {
  const selected = selectedId
    ? `[data-module-id="${escapeAttr(selectedId)}"] { outline: 2px solid var(--color-accent); outline-offset: -2px; }`
    : ''

  return (
    <style>{`
      [data-module-id] { outline: 0 solid transparent; transition: outline-color 120ms ease; }
      /* The chrome is clickable too, so it says so. */
      header, footer { cursor: pointer; }
      @media (hover: hover) and (pointer: fine) {
        [data-module-id]:hover { outline: 2px dashed color-mix(in srgb, var(--color-accent) 60%, transparent); outline-offset: -2px; }
      }

      /*
        An editable heading has to *look* editable, or the feature is only discoverable by
        accident. A text caret and a faint writable surface, appearing only once the section is
        selected — subtle enough that it never reads as part of the guest design.
      */
      [data-editing-heading="true"] {
        cursor: text;
        outline: 1px dashed color-mix(in srgb, var(--color-accent) 55%, transparent);
        outline-offset: 4px;
        border-radius: 2px;
      }
      [data-editing-heading="true"]:focus {
        outline: 2px solid var(--color-accent);
        background: color-mix(in srgb, var(--color-accent) 8%, transparent);
      }
      /* Drag feedback (N-13 §2), scoped the same way the selection outline is. */
      [data-dragging="true"] { opacity: 0.4; }
      [data-drop-target="true"] {
        outline: 2px solid var(--color-accent);
        outline-offset: -2px;
        background: color-mix(in srgb, var(--color-accent) 10%, transparent);
      }
      ${selected}
    `}</style>
  )
}
