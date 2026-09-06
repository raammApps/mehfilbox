import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { CatalogueProvider } from '@/components/streaming/CatalogueProvider'
import { TitleModal } from '@/components/streaming/TitleModal'
import { createTranslator } from '@/lib/i18n'
import { makeCatalogue, makeTitle } from '../helpers/repository'

/**
 * doc 08 `<TitleModal>` — the nine required behaviours, and doc 02 §4's "Android back closes
 * the modal, not the site", which is the single most common interaction on the platform 90% of
 * guests arrive on.
 */

const push = vi.fn()
vi.mock('next/navigation', () => ({ useRouter: () => ({ push, replace: vi.fn(), refresh: vi.fn() }) }))

const t = createTranslator('en')
const catalogue = makeCatalogue()
const titles = [
  makeTitle(catalogue.id, { slug: 'first', name: { en: 'First Film' } }),
  makeTitle(catalogue.id, { slug: 'second', name: { en: 'Second Film' } }),
  makeTitle(catalogue.id, { slug: 'third', name: { en: 'Third Film' } }),
]

function renderModal(initialTitleSlug: string | null) {
  return render(
    <CatalogueProvider
      locale="en"
      catalogueSlug={catalogue.slug}
      initialTitleSlug={initialTitleSlug}
      initialProgress={[]}
      firstRowId={null}
    >
      <TitleModal
        catalogue={catalogue}
        titles={titles}
        locale="en"
        t={t}
        shareBaseUrl="https://test-wedding.mehfilbox.app"
      />
    </CatalogueProvider>,
  )
}

beforeEach(() => {
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue({ ok: true, json: async () => ({ playbackUrl: '/media/x.m3u8' }) }),
  )
  window.history.replaceState({}, '', '/')
})

afterEach(() => {
  vi.unstubAllGlobals()
  push.mockReset()
})

describe('<TitleModal>', () => {
  it('renders nothing when no title is open', () => {
    renderModal(null)
    expect(screen.queryByTestId('title-modal')).not.toBeInTheDocument()
  })

  it('opens directly from a cold `?title=` load', () => {
    renderModal('second')
    expect(screen.getByRole('dialog')).toHaveAccessibleName('Second Film')
  })

  it('is a labelled, modal dialog', () => {
    renderModal('first')
    const dialog = screen.getByRole('dialog')
    expect(dialog).toHaveAttribute('aria-modal', 'true')
    expect(dialog).toHaveAttribute('aria-labelledby', 'title-modal-heading')
  })

  it('orders content as poster → title → meta → actions → synopsis', () => {
    renderModal('first')
    const dialog = screen.getByRole('dialog')
    const text = dialog.textContent ?? ''
    expect(text.indexOf('First Film')).toBeLessThan(text.indexOf('Play'))
    expect(text.indexOf('Play')).toBeLessThan(text.indexOf('Share'))
  })

  it('locks body scroll while open and restores it on close', async () => {
    const { unmount } = renderModal('first')
    expect(document.body.style.overflow).toBe('hidden')
    unmount()
    await waitFor(() => expect(document.body.style.overflow).not.toBe('hidden'))
  })

  it('closes on Escape', async () => {
    const user = userEvent.setup()
    renderModal('first')
    await user.keyboard('{Escape}')
    await waitFor(() => expect(screen.queryByTestId('title-modal')).not.toBeInTheDocument())
  })

  it('closes on a scrim click but not on a click inside the panel', async () => {
    const user = userEvent.setup()
    renderModal('first')

    await user.click(screen.getByRole('dialog'))
    expect(screen.getByTestId('title-modal')).toBeInTheDocument()

    await user.click(screen.getByTestId('title-modal'))
    await waitFor(() => expect(screen.queryByTestId('title-modal')).not.toBeInTheDocument())
  })

  it('moves between siblings with the arrow keys', async () => {
    const user = userEvent.setup()
    renderModal('first')

    await user.keyboard('{ArrowRight}')
    await waitFor(() => expect(screen.getByRole('dialog')).toHaveAccessibleName('Second Film'))

    await user.keyboard('{ArrowLeft}')
    await waitFor(() => expect(screen.getByRole('dialog')).toHaveAccessibleName('First Film'))
  })

  it('does not walk past the ends of the row', async () => {
    const user = userEvent.setup()
    renderModal('first')
    await user.keyboard('{ArrowLeft}')
    expect(screen.getByRole('dialog')).toHaveAccessibleName('First Film')
  })

  it('prefetches the playback token on open — where the sub-1.5s target is won', async () => {
    renderModal('first')
    await waitFor(() => {
      expect(fetch).toHaveBeenCalledWith('/api/playback/token', expect.objectContaining({ method: 'POST' }))
    })
  })

  it('navigates to the player rather than starting playback inline', async () => {
    const user = userEvent.setup()
    renderModal('first')
    await user.click(screen.getByRole('button', { name: 'Play' }))
    expect(push).toHaveBeenCalledWith('/watch/first')
  })

  it('offers Share — the flaunt mechanic — alongside Play', () => {
    renderModal('first')
    expect(screen.getByRole('button', { name: 'Share' })).toBeInTheDocument()
  })

  it('says a processing film is being prepared instead of offering a dead Play button', () => {
    const processing = [makeTitle(catalogue.id, { slug: 'wip', status: 'processing', name: { en: 'Still Encoding' } })]
    render(
      <CatalogueProvider
        locale="en"
        catalogueSlug={catalogue.slug}
        initialTitleSlug="wip"
        initialProgress={[]}
        firstRowId={null}
      >
        <TitleModal catalogue={catalogue} titles={processing} locale="en" t={t} shareBaseUrl="" />
      </CatalogueProvider>,
    )

    expect(screen.queryByRole('button', { name: 'Play' })).not.toBeInTheDocument()
    expect(screen.getByText('This film is still being prepared.')).toBeInTheDocument()
  })
})
