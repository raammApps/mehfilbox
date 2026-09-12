import { expect, test } from '@playwright/test'

/**
 * The trial (D-38, doc 16 §7): the first published wedding is free, the second needs a credit.
 *
 * Walked from a fresh registration, because that is where the one credit comes from: the first
 * publish spends it, the second is refused with a panel that says why and offers the way to add
 * one, and the console says how many are left. What a studio meets on its second sale.
 */
test.describe('credits and the trial', () => {
  // Registration is limited to three per address an hour (D-34), and both projects share one
  // server: this spec and the locale spec together spend exactly that on desktop.
  test.skip(({ isMobile }) => Boolean(isMobile), 'registration is a desktop flow')

  test('the first wedding publishes on us, the second asks for a credit', async ({ page }) => {
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
    await expect(page.getByTestId('credit-balance')).toHaveText('1 credit to publish with.')

    const make = async (slug: string) => {
      const response = await page.request.post('/api/admin/catalogues', {
        data: {
          coupleName: { en: 'First & Second' },
          appName: { en: 'First & Second Originals' },
          weddingDate: '2026-12-01',
          slug,
          template: 'films-only',
        },
      })
      expect(response.ok(), await response.text()).toBe(true)
      return ((await response.json()) as { catalogue: { id: string } }).catalogue
    }

    const first = await make(`trial-first-${stamp}`)
    const published = await page.request.post(`/api/admin/catalogues/${first.id}/publish`)
    expect(published.ok(), await published.text()).toBe(true)

    // Publishing again spends nothing: the credit was for the first publish, not for each one.
    const again = await page.request.post(`/api/admin/catalogues/${first.id}/publish`)
    expect(again.ok()).toBe(true)

    const second = await make(`trial-second-${stamp}`)
    await page.goto(`/admin/c/${second.id}/customizer`)
    await expect(page.getByTestId('preview-viewport')).toBeVisible()
    await page.getByRole('button', { name: /^Publish/ }).click()

    const panel = page.getByTestId('credit-required')
    await expect(panel).toBeVisible()
    await expect(panel).toContainText('needs a credit')
    await panel.getByRole('button', { name: 'Ask for a credit' }).click()
    await expect(panel).toContainText(/Asked|Already asked/)

    // Nothing was published, and the console says the studio is out.
    await expect(page.getByText('Not published yet — nobody can open this page.')).toBeVisible()
    await page.goto('/admin')
    await expect(page.getByTestId('credit-balance')).toHaveText('0 credits to publish with.')
  })
})
