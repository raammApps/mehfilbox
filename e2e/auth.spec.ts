import { expect, test } from '@playwright/test'

/**
 * Two doors, one credential store (D-33), and the challenge after repeated failures (D-34).
 *
 * The harness runs the `fake` captcha driver — a checkbox that yields a fixed token — so the
 * widget's appearance after the third failure is exercised without Cloudflare.
 */
test.describe('signing in', () => {
  test('the console sign-in moved to the public site, behind the studio door', async ({ page }) => {
    await page.goto('/admin/login?email=someone%40example.test')
    await expect(page).toHaveURL(/\/login\?door=studio/)
    await expect(page.getByRole('heading', { name: 'Studio sign in' })).toBeVisible()
    // The prefilled address a handover passes along rides through the redirect.
    await expect(page.getByLabel('Email')).toHaveValue('someone@example.test')
  })

  test('the couple door says where the sign-in came from, and offers no sign-up', async ({ page }) => {
    await page.goto('/login?door=studio')
    await page.getByRole('link', { name: 'Couple' }).click()
    await expect(page).toHaveURL(/door=couple/)
    await expect(page.getByRole('heading', { name: 'Couple sign in' })).toBeVisible()
    await expect(page.getByText(/your studio created this sign-in/i)).toBeVisible()
    await expect(page.getByRole('link', { name: /create a studio account/i })).toHaveCount(0)
  })

  test('forgot-password answers the same sentence for any address', async ({ page }) => {
    await page.goto('/login/forgot')
    await page.getByLabel('Email').fill('nobody-at-all@example.test')
    await page.getByRole('button', { name: 'Email me a link' }).click()
    await expect(page.getByRole('status')).toContainText('If that address has an account')
  })

  /**
   * Ends with a real sign-in on purpose: success clears the device bucket, which every other
   * spec shares. A run that stopped after the failures would leave the next sign-in challenged.
   */
  test('three wrong passwords bring up the challenge, and the fourth needs it', async ({ page }) => {
    await page.goto('/login?door=studio')
    for (let i = 0; i < 3; i += 1) {
      await page.getByLabel('Email').fill('operator@mehfilbox.test')
      await page.getByLabel('Password').fill(`wrong-${i}`)
      await page.getByRole('button', { name: 'Sign in' }).click()
      // Filtered: Next's route announcer is a second, empty `role="alert"` on every page.
      await expect(page.getByRole('alert').filter({ hasText: 'did not work' })).toBeVisible()
    }

    // The widget is there now, and the button waits for it.
    const challenge = page.getByTestId('challenge-fake')
    await expect(challenge).toBeVisible()
    await page.getByLabel('Password').fill('e2e-operator-password')
    await expect(page.getByRole('button', { name: 'Sign in' })).toBeDisabled()

    await challenge.check()
    await page.getByRole('button', { name: 'Sign in' }).click()
    await expect(page.getByRole('heading', { name: 'Catalogues' })).toBeVisible()
  })

  test('a spent or unknown credential link explains itself without a form', async ({ page }) => {
    await page.goto('/set-password/not-a-real-token-0000000000')
    await expect(page.getByRole('heading', { name: 'This link is no longer valid' })).toBeVisible()
    await expect(page.getByLabel('New password')).toHaveCount(0)
  })
})
