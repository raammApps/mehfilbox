import { expect, test } from '@playwright/test'

/**
 * The trial (D-38, doc 16 §7): the first published wedding is free, the second needs a credit.
 *
 * Walked from a fresh registration, because that is where the one credit comes from: the first
 * publish spends it, the second is refused with a panel that says why and offers the way to add
 * one, and the console says how many are left. What a studio meets on its second sale.
 *
 * Credits are typed (N-119, D-61): the trial credit is a Deliver credit, so a wedding started on
 * Keep is refused *by name* while it is held, the plan is changed on the overview, and the same
 * publish then goes through. That is the journey a studio with the wrong basket actually takes.
 */
test.describe('credits and the trial', () => {
  // Registration is limited to three per address an hour (D-34), and both projects share one
  // server: this spec and the locale spec together spend exactly that on desktop.
  test.skip(({ isMobile }) => Boolean(isMobile), 'registration is a desktop flow')

  test('the first wedding publishes on us, the second asks for a credit, and a plan can be changed before either', async ({ page }) => {
    const stamp = Date.now().toString(36)
    const email = `trial-${stamp}@example.test`

    const registered = await page.request.post('/api/partners', {
      data: {
        businessName: `Trial Studio ${stamp}`,
        contactName: 'A Person',
        email,
        password: 'a-long-enough-password',
        locale: 'en',
        // The harness runs the fake captcha driver, which challenges every registration (D-34).
        captchaToken: 'ok',
      },
    })
    expect(registered.ok(), await registered.text()).toBe(true)

    await page.goto('/admin/login')
    await page.getByLabel('Email').fill(email)
    await page.getByLabel('Password').fill('a-long-enough-password')
    await page.getByRole('button', { name: 'Sign in' }).click()
    await expect(page.getByRole('heading', { name: 'Catalogues' })).toBeVisible()
    await expect(page.getByTestId('credit-balance')).toHaveText('1 Deliver credit to publish with.')

    const make = async (slug: string, planId?: string) => {
      const response = await page.request.post('/api/admin/catalogues', {
        data: {
          coupleName: { en: 'First & Second' },
          appName: { en: 'First & Second Originals' },
          weddingDate: '2026-12-01',
          slug,
          template: 'films-only',
          ...(planId ? { planId } : {}),
        },
      })
      expect(response.ok(), await response.text()).toBe(true)
      return ((await response.json()) as { catalogue: { id: string } }).catalogue
    }

    // The wizard says which basket a wedding will spend from, and that Keep's is empty, before the
    // studio has typed a name — not at Publish, when the wedding is built and the wait is the cost.
    await page.goto('/admin/new')
    const plan = page.getByRole('group', { name: 'Plan' })
    await expect(plan).toContainText('Deliver · 1 credit')
    await expect(plan).toContainText('Keep · 0 credits')
    await plan.getByText('Keep · 0 credits').click()
    await expect(page.getByText('You have no Keep credits.')).toBeVisible()

    // A wedding started on Keep, in a studio that holds only the Deliver credit: refused by name,
    // pointing at the basket it does hold, and nothing is spent by asking.
    const keep = await make(`trial-keep-${stamp}`, 'keep')
    const refused = await page.request.post(`/api/admin/catalogues/${keep.id}/publish`)
    expect(refused.status()).toBe(402)
    const refusal = ((await refused.json()) as { error: { message: string } }).error.message
    expect(refusal).toContain('Keep plan')
    expect(refusal).toContain('1 Deliver credit')
    await page.goto('/admin')
    await expect(page.getByTestId('credit-balance')).toHaveText('1 Deliver credit to publish with.')

    // Change its plan on the overview, and the same publish goes through — on the Deliver credit.
    await page.goto(`/admin/c/${keep.id}`)
    const control = page.getByTestId('catalogue-plan')
    await control.getByRole('combobox', { name: 'Plan' }).selectOption('deliver')
    await control.getByRole('button', { name: 'Change plan' }).click()
    await expect(control.getByRole('button', { name: 'Change plan' })).toBeDisabled()
    await expect(control.getByRole('combobox', { name: 'Plan' })).toHaveValue('deliver')
    const onDeliver = await page.request.post(`/api/admin/catalogues/${keep.id}/publish`)
    expect(onDeliver.ok(), await onDeliver.text()).toBe(true)

    // Published, the plan is a statement and not a control: a credit of it has been spent.
    await page.goto(`/admin/c/${keep.id}`)
    await expect(page.getByTestId('catalogue-plan')).toContainText('Fixed — publishing this wedding spent a Deliver credit')
    await expect(page.getByTestId('catalogue-plan').getByRole('combobox')).toHaveCount(0)
    const locked = await page.request.patch(`/api/admin/catalogues/${keep.id}`, { data: { planId: 'cinema' } })
    expect(locked.status()).toBe(400)

    // Publishing it again spends nothing: the credit was for the first publish, not for each one.
    const again = await page.request.post(`/api/admin/catalogues/${keep.id}/publish`)
    expect(again.ok()).toBe(true)

    // The studio is now out of every kind, so the next wedding — on the default plan — is refused.
    const second = await make(`trial-second-${stamp}`)
    await page.goto(`/admin/c/${second.id}/customizer`)
    await expect(page.getByTestId('preview-viewport')).toBeVisible()
    await page.getByRole('button', { name: /^Publish/ }).click()

    const panel = page.getByTestId('credit-required')
    await expect(panel).toBeVisible()
    await expect(panel).toContainText('needs a Deliver credit')
    await panel.getByRole('button', { name: 'Ask for a credit' }).click()
    await expect(panel).toContainText(/Asked|Already asked/)

    // Nothing was published, and the console says the studio is out.
    await expect(page.getByText('Not published yet — nobody can open this page.')).toBeVisible()
    await page.goto('/admin')
    await expect(page.getByTestId('credit-balance')).toHaveText('0 credits to publish with.')
  })
})
