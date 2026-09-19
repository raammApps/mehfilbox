import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { CataloguePlan } from '@/components/admin/CataloguePlan'
import { CreditPanel } from '@/components/admin/CreditPanel'
import { OrgCreditsControl } from '@/components/admin/OrgCreditsControl'
import type { CreditBalance } from '@/lib/schema'

/**
 * N-119 — the three places a person meets a typed credit: the plan control on a wedding's overview,
 * the platform's grant form, and the panel that says why Publish was refused. The routes are proven
 * in `tests/unit/typed-credits.test.ts`; what is proven here is the wire format, which states the
 * plan control has (and that it cannot be pressed when pressing it would do nothing), and that the
 * refusal panel points at a way forward only when there is one.
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

afterEach(() => {
  vi.unstubAllGlobals()
})

const lastCall = () => {
  const [url, init] = fetchMock.mock.calls.at(-1) as [string, RequestInit]
  return { url, method: init.method, body: JSON.parse(String(init.body)) as Record<string, unknown> }
}

const PLANS = [
  { id: 'deliver', name: 'Deliver', available: 2 },
  { id: 'keep', name: 'Keep', available: 0 },
  { id: 'cinema', name: 'Cinema', available: 1 },
] as const

describe('the plan on a wedding’s overview', () => {
  const render_ = (props: Partial<Parameters<typeof CataloguePlan>[0]> = {}) =>
    render(
      <CataloguePlan
        catalogueId="c-1"
        planId="keep"
        fixed={false}
        editable
        plans={PLANS.map((plan) => ({ ...plan }))}
        {...props}
      />,
    )

  it('offers each plan with the credits held in it, and cannot be pressed while nothing has changed', async () => {
    render_()

    const select = screen.getByRole('combobox', { name: 'Plan' })
    expect(within_(select)).toEqual(['Deliver · 2 credits', 'Keep · 0 credits', 'Cinema · 1 credit'])
    expect(screen.getByRole('button', { name: 'Change plan' })).toBeDisabled()
  })

  it('sends only the plan, to this wedding, and refreshes the page once it is saved', async () => {
    const user = userEvent.setup()
    render_()

    await user.selectOptions(screen.getByRole('combobox', { name: 'Plan' }), 'deliver')
    await user.click(screen.getByRole('button', { name: 'Change plan' }))

    await waitFor(() => expect(refresh).toHaveBeenCalled())
    expect(lastCall()).toEqual({ url: '/api/admin/catalogues/c-1', method: 'PATCH', body: { planId: 'deliver' } })
  })

  it('says what the server said when it refuses, and does not refresh', async () => {
    const user = userEvent.setup()
    fetchMock.mockResolvedValue({
      ok: false,
      status: 400,
      json: async () => ({ error: { message: 'A published wedding’s plan is fixed' } }),
    })
    render_()

    await user.selectOptions(screen.getByRole('combobox', { name: 'Plan' }), 'cinema')
    await user.click(screen.getByRole('button', { name: 'Change plan' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('A published wedding’s plan is fixed')
    expect(refresh).not.toHaveBeenCalled()
  })

  it('once published, is a statement and not a control — it says why', () => {
    render_({ fixed: true })

    expect(screen.queryByRole('combobox')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Change plan' })).not.toBeInTheDocument()
    expect(screen.getByTestId('catalogue-plan')).toHaveTextContent('Fixed — publishing this wedding spent a Keep credit')
  })

  it('for a studio that is not the owner, names the plan and says whose choice it is', () => {
    render_({ editable: false })

    expect(screen.queryByRole('combobox')).not.toBeInTheDocument()
    expect(screen.getByTestId('catalogue-plan')).toHaveTextContent('Keep.')
    expect(screen.getByTestId('catalogue-plan')).toHaveTextContent('The owner of this wedding chooses its plan')
  })

  it('for a couple, who hold no credits, lists the plans without a count', () => {
    render_({ plans: PLANS.map((plan) => ({ ...plan, available: null })) })

    expect(within_(screen.getByRole('combobox', { name: 'Plan' }))).toEqual(['Deliver', 'Keep', 'Cinema'])
  })
})

/** The visible text of each option in a select. */
function within_(select: HTMLElement): string[] {
  return Array.from(select.querySelectorAll('option')).map((option) => option.textContent ?? '')
}

describe('the platform’s grant form', () => {
  const zero = { available: 0, consumed: 0, expired: 0 }
  const balance: CreditBalance = {
    available: 3,
    consumed: 1,
    expired: 0,
    byPlan: { deliver: { ...zero, available: 2, consumed: 1 }, keep: zero, cinema: { ...zero, available: 1 } },
  }
  const names = { deliver: 'Deliver', keep: 'Keep', cinema: 'Cinema' }
  const form = () =>
    render(<OrgCreditsControl orgId="org-1" orgName="Kalyanam Weddings" balance={balance} planNames={names} />)

  it('shows each basket’s count, empty ones too, so the platform and the studio read the same numbers', () => {
    form()

    const baskets = screen.getByTestId('credit-baskets')
    expect(baskets).toHaveTextContent('Deliver · 2')
    expect(baskets).toHaveTextContent('Keep · 0')
    expect(baskets).toHaveTextContent('Cinema · 1')
  })

  it('names the basket on the button, and sends it with the count and the reason', async () => {
    const user = userEvent.setup()
    form()

    await user.selectOptions(screen.getByRole('combobox', { name: 'Plan' }), 'cinema')
    await user.clear(screen.getByRole('spinbutton'))
    await user.type(screen.getByRole('spinbutton'), '3')
    await user.type(screen.getByPlaceholderText(/Paid by bank transfer/), 'Paid by transfer')
    const button = screen.getByRole('button', { name: 'Grant 3 Cinema credits' })
    await user.click(button)

    await waitFor(() => expect(refresh).toHaveBeenCalled())
    expect(lastCall()).toEqual({
      url: '/api/admin/platform/orgs/org-1/credits',
      method: 'POST',
      body: { count: 3, planId: 'cinema', reason: 'Paid by transfer' },
    })
  })

  it('grants Deliver unless told otherwise, and cannot be sent without a reason', async () => {
    const user = userEvent.setup()
    form()

    // No reason yet: the count is not promised on the button, and it cannot be pressed.
    expect(screen.getByRole('button', { name: 'Grant Deliver credit' })).toBeDisabled()
    await user.type(screen.getByPlaceholderText(/Paid by bank transfer/), 'Goodwill')
    await user.click(screen.getByRole('button', { name: /^Grant 1 Deliver credit$/ }))

    await waitFor(() => expect(fetchMock).toHaveBeenCalled())
    expect(lastCall().body).toEqual({ count: 1, planId: 'deliver', reason: 'Goodwill' })
  })
})

describe('the refusal panel, with the plan the wedding is on', () => {
  const text = () => screen.getByTestId('credit-required').textContent ?? ''
  const title = () => screen.getByTestId('credit-required').querySelector('p')?.textContent ?? ''

  it('names the plan in the title and in the body', () => {
    render(<CreditPanel catalogueId="c" plan={{ planName: 'Cinema', otherAvailable: null }} />)

    expect(title()).toBe('This wedding needs a Cinema credit to publish')
    expect(text()).toContain('This wedding is on the Cinema plan')
    expect(text()).toContain('spends one Cinema credit')
  })

  it('points at the baskets the studio does hold, so the refusal is a way forward', () => {
    render(<CreditPanel catalogueId="c" plan={{ planName: 'Cinema', otherAvailable: '2 Deliver credits' }} />)

    expect(text()).toContain('You do hold 2 Deliver credits')
    expect(text()).toContain('change this wedding’s plan')
  })

  it('offers no way forward it does not have', () => {
    render(<CreditPanel catalogueId="c" plan={{ planName: 'Cinema', otherAvailable: null }} />)

    expect(text()).not.toContain('You do hold')
    expect(text()).not.toContain('change this wedding’s plan')
  })

  it('says the same to a couple, in their words, and does not tell them to change a plan they cannot see', () => {
    render(
      <CreditPanel catalogueId="c" audience="couple" plan={{ planName: 'Keep', otherAvailable: '2 Deliver credits' }} />,
    )

    expect(title()).toBe('This catalogue needs a Keep credit to publish')
    expect(text()).toContain('publishes on a Keep credit')
    expect(text()).not.toContain('You do hold')
  })
})
