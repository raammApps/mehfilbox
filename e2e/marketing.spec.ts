import { expect, test } from '@playwright/test'

/**
 * The landing page's two calls to action, checked by following them (N-51).
 *
 * The demo link is the reason this file exists. It was written as a literal `/c/aanya-and-vikram`,
 * which is the slug production has — while the seed fixture dev and CI run against is
 * `aanya-vikram`. A hardcoded slug is correct in exactly one environment and silently 404s in the
 * other, and no amount of rendering assertions would notice. It is an env value now, and this
 * follows it.
 */
test.describe('N-51 — the landing page sells, and its links work', () => {
  test('the hero states the studio price rather than a couple price', async ({ page }) => {
    await page.goto('/')
    await expect(page.getByRole('heading', { level: 1 })).toContainText('Hand over the wedding')
    // Studio-only (D-26): the number a studio sees is the plan, not a per-couple retail price.
    await expect(page.getByText('₹4,999').first()).toBeVisible()
  })

  test('"open a demo wedding" reaches a real catalogue', async ({ page }) => {
    await page.goto('/')
    await page.getByRole('link', { name: 'Open a demo wedding' }).click()

    /**
     * Asserting the profile gate, not the status code. A slug that does not exist renders a
     * "not available" page with **HTTP 200** — the guest surface's only real 404 is drawn rather
     * than returned — so the first version of this test, which checked `status < 400`, passed
     * happily against a deliberately wrong slug. The gate is what a guest actually gets, and it
     * is the only thing that distinguishes a working link from a broken one here.
     */
    await expect(page.getByTestId('profile-gate')).toBeVisible()
  })

  test('"create your studio" reaches registration', async ({ page }) => {
    await page.goto('/')
    await page.getByRole('link', { name: 'Create your studio' }).first().click()
    await expect(page).toHaveURL(/\/admin\/register/)
  })

  test('privacy and terms exist, because every wedding page footer links privacy', async ({
    page,
  }) => {
    for (const path of ['/privacy', '/terms']) {
      const response = await page.request.get(path)
      expect(response.status(), `${path} should exist`).toBe(200)
    }
  })
})
