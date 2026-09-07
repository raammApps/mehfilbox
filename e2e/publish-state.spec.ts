import { expect, test, type Page } from '@playwright/test'

/**
 * N-55 — the customizer says whether guests can actually see the page.
 *
 * Two questions had one reassuring answer. "Saved as draft" means the operator's typing survived;
 * it says nothing about whether the couple can see it, and the operator's real question is always
 * the second one. Worse, Publish fired two requests and read neither response, so a refused
 * publish and a successful one were indistinguishable — the operator walked away believing a
 * couple could open a page the couple could not.
 *
 * Desktop only, like the rest of the console.
 */
test.describe('N-55 — is this live?', () => {
  test.skip(({ isMobile }) => Boolean(isMobile), 'the admin console is a desktop tool')

  /**
   * Make a change that always registers.
   *
   * Two things this must not depend on, both learned by watching it fail.
   *
   * **Not "move up".** Once a section reaches the top the handler returns early without
   * committing, so a file whose tests each moved the same section up eventually found nothing to
   * publish and a disabled button.
   *
   * **Not a section's name.** `operator.spec.ts` renames sections, one server and one store are
   * shared across every spec, and `workers: 1` means order decides what exists — so a locator
   * naming "The films" passed in this file alone and timed out in the suite. Position and role
   * are the only things this spec owns.
   */
  async function mutate(page: Page): Promise<void> {
    await page
      .getByRole('button', { name: /^(Hide|Show) / })
      .first()
      .click()
  }

  async function openCustomizer(page: Page): Promise<void> {
    await page.goto('/admin/login')
    await page.getByLabel('Email').fill('operator@mehfilbox.test')
    await page.getByLabel('Password').fill('e2e-operator-password')
    await page.getByRole('button', { name: 'Sign in' }).click()
    await page.getByRole('link', { name: 'Aanya & Vikram' }).first().click()
    /**
     * Wait for the detail page before reaching for "Customizer". Earlier specs create catalogues,
     * so the list carries one such link per row — seven by the time this file runs in the full
     * suite — and clicking without this assertion is a strict-mode violation rather than a
     * navigation. `operator.spec.ts` has the same line for the same reason.
     */
    await expect(page.getByRole('heading', { name: 'Aanya & Vikram' })).toBeVisible()
    await page.getByRole('link', { name: 'Customizer' }).click()
    // Content inside the preview is the hydration signal — see operator.spec.ts.
    await expect(
      page.getByTestId('preview-viewport').getByTestId('poster-row').first(),
    ).toBeVisible()
  }

  test('publishing says guests are seeing exactly this, and the button settles', async ({
    page,
  }) => {
    await openCustomizer(page)

    const publish = page.getByRole('button', { name: /^Publish/ })
    if (await publish.isEnabled()) await publish.click()

    await expect(page.getByText('Guests are seeing exactly this.')).toBeVisible()
    // Nothing left to publish, so the control says so rather than inviting a pointless second try.
    await expect(page.getByRole('button', { name: 'Published' })).toBeDisabled()
  })

  test('an edit immediately says guests are behind, and offers to publish again', async ({
    page,
  }) => {
    await openCustomizer(page)
    const publish = page.getByRole('button', { name: /^Publish/ })
    if (await publish.isEnabled()) await publish.click()
    await expect(page.getByText('Guests are seeing exactly this.')).toBeVisible()

    await mutate(page)

    await expect(page.getByText('Guests are still seeing the last published version.')).toBeVisible()
    await expect(page.getByRole('button', { name: 'Publish changes' })).toBeEnabled()
  })

  /**
   * The one that matters. Before N-55 this test could not fail: the button ignored both responses,
   * set "saved", and refreshed — so a 403 rendered exactly like success.
   */
  test('a refused publish says so, and does not claim guests can see it', async ({ page }) => {
    await openCustomizer(page)

    await page.route('**/api/admin/catalogues/*/publish', (route) =>
      route.fulfill({
        status: 403,
        contentType: 'application/json',
        body: JSON.stringify({ error: { message: 'This studio account is suspended.' } }),
      }),
    )

    await mutate(page)
    await page.getByRole('button', { name: 'Publish changes' }).click()

    await expect(page.getByTestId('publish-error')).toContainText('suspended')
    await expect(page.getByText('Guests are seeing exactly this.')).toHaveCount(0)
  })

  test('a refused draft save blocks the publish rather than shipping a stale page', async ({
    page,
  }) => {
    await openCustomizer(page)

    await page.route('**/api/admin/catalogues/*/modules', (route) =>
      route.fulfill({ status: 500, contentType: 'application/json', body: '{}' }),
    )

    await mutate(page)
    await page.getByRole('button', { name: 'Publish changes' }).click()

    await expect(page.getByTestId('publish-error')).toContainText('nothing was published')
  })
})
