import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ExtendTermControl } from '@/components/admin/CatalogueTermControls'

/**
 * N-120 — the platform's term control on a wedding whose term has not started. It used to receive a
 * date string always; `null` is now a real state, and reading `.slice` on it was a crash waiting for
 * the first draft an admin opened.
 */

const refresh = vi.fn()
vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh, push: vi.fn(), replace: vi.fn() }),
}))

const fetchMock = vi.fn()

beforeEach(() => {
  refresh.mockReset()
  fetchMock.mockReset()
  fetchMock.mockResolvedValue({ ok: true, status: 200, json: async () => ({}) })
  vi.stubGlobal('fetch', fetchMock)
})

afterEach(() => vi.unstubAllGlobals())

describe('a wedding with a term', () => {
  it('shows the date it serves until, and the date field starts there', () => {
    render(<ExtendTermControl catalogueId="c-1" includedUntil="2027-02-14T00:00:00.000Z" />)

    expect(screen.getByRole('form', { name: 'Term' })).toHaveTextContent('Currently 2027-02-14')
    expect(screen.getByLabelText('New date')).toHaveValue('2027-02-14')
  })
})

describe('a wedding whose term has not started', () => {
  it('says so, instead of a date — and says Publish will not move one set in advance', () => {
    render(<ExtendTermControl catalogueId="c-1" includedUntil={null} />)

    const form = screen.getByRole('form', { name: 'Term' })
    expect(form).toHaveTextContent('Not started')
    expect(form).toHaveTextContent('begins when this wedding is first published')
    expect(form).toHaveTextContent('Publish will not move it')
    expect(form).not.toHaveTextContent('Currently')
  })

  it('starts with an empty date field, so nothing can be saved by accident', () => {
    render(<ExtendTermControl catalogueId="c-1" includedUntil={null} />)

    expect(screen.getByLabelText('New date')).toHaveValue('')
  })

  it('counts "+ 1 year" from today rather than from nothing', async () => {
    const user = userEvent.setup()
    render(<ExtendTermControl catalogueId="c-1" includedUntil={null} />)

    await user.click(screen.getByRole('button', { name: /1 year/ }))

    const oneYearOn = new Date()
    oneYearOn.setUTCFullYear(oneYearOn.getUTCFullYear() + 1)
    const chosen = (screen.getByLabelText('New date') as HTMLInputElement).value
    expect(chosen).toBe(oneYearOn.toISOString().slice(0, 10))
  })

  it('sends the date and the reason, as before', async () => {
    const user = userEvent.setup()
    render(<ExtendTermControl catalogueId="c-1" includedUntil={null} />)

    await user.type(screen.getByLabelText('New date'), '2029-01-01')
    await user.type(screen.getByLabelText(/Why|Reason/i), 'Agreed in advance')
    await user.click(screen.getByRole('button', { name: /^(Set|Save|Extend)/ }))

    await waitFor(() => expect(fetchMock).toHaveBeenCalled())
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(url).toBe('/api/admin/platform/catalogues/c-1/term')
    expect(JSON.parse(String(init.body))).toEqual({ includedUntil: '2029-01-01', reason: 'Agreed in advance' })
  })
})
