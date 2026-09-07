import { expect, test, type Page } from '@playwright/test'
import { createCatalogue, openAsReturningGuest, type CreatedCatalogue } from './helpers'

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

  /**
   * Every test here gets its own catalogue, and that is not tidiness.
   *
   * These tests hide sections and publish, and they change "Presented by" and publish. Run against
   * the shared demo catalogue that is a destructive edit to the fixture every other spec reads:
   * `guest.spec.ts` started failing on content this file had hidden, and the local dev server is
   * reused between runs, so the damage outlived the run that caused it. A spec that publishes must
   * own what it publishes.
   */
  async function openCustomizer(page: Page): Promise<CreatedCatalogue> {
    await page.goto('/admin/login')
    await page.getByLabel('Email').fill('operator@mehfilbox.test')
    await page.getByLabel('Password').fill('e2e-operator-password')
    await page.getByRole('button', { name: 'Sign in' }).click()
    await expect(page.getByRole('heading', { name: 'Catalogues' })).toBeVisible()

    const catalogue = await createCatalogue(page, 'publish-state')
    await page.goto(`/admin/c/${catalogue.id}/customizer`)
    // Content inside the preview is the hydration signal — see operator.spec.ts.
    await expect(page.getByTestId('preview-viewport')).toBeVisible()
    await expect(page.getByRole('button', { name: /^(Hide|Show) / }).first()).toBeVisible()
    return catalogue
  }

  test('publishing says guests are seeing exactly this, and the button settles', async ({
    page,
  }) => {
    const catalogue = await openCustomizer(page)

    const publish = page.getByRole('button', { name: /^Publish/ })
    if (await publish.isEnabled()) await publish.click()

    await expect(page.getByText('Guests are seeing exactly this.')).toBeVisible()
    // Nothing left to publish, so the control says so rather than inviting a pointless second try.
    await expect(page.getByRole('button', { name: 'Published' })).toBeDisabled()
  })

  test('an edit immediately says guests are behind, and offers to publish again', async ({
    page,
  }) => {
    const catalogue = await openCustomizer(page)
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
    const catalogue = await openCustomizer(page)

    await page.route('**/api/admin/catalogues/*/publish', (route) =>
      route.fulfill({
        status: 403,
        contentType: 'application/json',
        body: JSON.stringify({ error: { message: 'This studio account is suspended.' } }),
      }),
    )

    await mutate(page)
    // A catalogue this test just created has never been published, so the control reads "Publish".
    // The anchored alternation matches that and "Publish changes" without ever matching
    // "Publishing…", which would resolve while the click is already in flight.
    await page.getByRole('button', { name: /^Publish( changes)?$/ }).click()

    await expect(page.getByTestId('publish-error')).toContainText('suspended')
    await expect(page.getByText('Guests are seeing exactly this.')).toHaveCount(0)
  })

  test('a refused draft save blocks the publish rather than shipping a stale page', async ({
    page,
  }) => {
    const catalogue = await openCustomizer(page)

    await page.route('**/api/admin/catalogues/*/modules', (route) =>
      route.fulfill({ status: 500, contentType: 'application/json', body: '{}' }),
    )

    await mutate(page)
    await page.getByRole('button', { name: /^Publish( changes)?$/ }).click()

    await expect(page.getByTestId('publish-error')).toContainText('nothing was published')
  })

  /**
   * The requirement, stated plainly: nothing reaches the couple before Publish.
   *
   * Sections were always held back in `draft_modules`. Branding was not — colour, logo, typeface
   * and "Presented by" were written straight onto the live row, so a studio trying a colour
   * repainted the couple's page while they were still choosing. This test is the difference, and
   * it fails against the old behaviour on its first assertion.
   */
  test('branding reaches the couple only when it is published', async ({ page, context }) => {
    const catalogue = await openCustomizer(page)
    const publish = page.getByRole('button', { name: /^Publish/ })
    if (await publish.isEnabled()) await publish.click()
    await expect(page.getByText('Guests are seeing exactly this.')).toBeVisible()

    const guest = await context.newPage()
    await openAsReturningGuest(guest, catalogue.slug)

    const draft = `Draft Studio ${Date.now().toString(36)}`
    // Branding opens into the inspector rather than sitting in the page — see N-55 in NEXT, which
    // notes it is buried below the advisories.
    await page.getByRole('button', { name: /^Branding/ }).click()
    await page.getByLabel('Presented by').fill(draft)
    // The panel autosaves on a debounce; wait for the save rather than for a fixed delay.
    // Two elements say "Saved as draft" once branding saves — the sections' indicator and the
    // branding panel's — so this asserts at least one, not exactly one.
    await expect(page.getByText('Saved as draft').first()).toBeVisible()

    // Saved, and the console says guests are behind — but the couple must still see the old one.
    await expect(page.getByText('Guests are still seeing the last published version.')).toBeVisible()
    /**
     * Asserting the draft's *absence*, not equality with a value captured earlier. That first
     * version compared against a reading taken before the edit, and it failed on a guest page
     * still serving a cached render from an earlier run — the product was right and the test was
     * measuring the cache. Absence is the requirement, and it does not depend on what the
     * catalogue happened to say a moment ago.
     */
    await guest.reload()
    await expect(guest.getByText(draft)).toHaveCount(0)
    await expect(guest.getByText(/^Presented by/)).toBeVisible()

    await page.getByRole('button', { name: 'Publish changes' }).click()
    await expect(page.getByText('Guests are seeing exactly this.')).toBeVisible()

    await guest.reload()
    await expect(guest.getByText(`Presented by ${draft}`)).toBeVisible()
    await guest.close()
  })
})
