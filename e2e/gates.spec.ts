import AxeBuilder from '@axe-core/playwright'
import { expect, test } from '@playwright/test'
import { OG_MAX_BYTES, OG_SIZE } from '../lib/budgets'
import { openAsReturningGuest, signIn, DEMO_CATALOGUE } from './helpers'

/**
 * Budget and accessibility gates.
 *
 * Both are named as pass/fail criteria in the specs and neither had teeth until now: doc 10 §1
 * test 11 (the OG image is ≤300KB) and doc 10 §4 (zero axe violations on every page state).
 */

test.describe('doc 10 §1 test 11 — the WhatsApp preview stays inside its budget', () => {
  test(`the OG image is at most ${OG_MAX_BYTES / 1024}KB and the right dimensions`, async ({
    page,
  }) => {
    const response = await page.request.get(`/api/og?catalogue=${DEMO_CATALOGUE}`)
    expect(response.status()).toBe(200)
    expect(response.headers()['content-type']).toContain('image/png')

    const body = await response.body()
    // ~90% of guests arrive from a WhatsApp link; an oversized card is a grey box on a slow
    // connection, which costs more opens than any amount of on-page polish saves.
    expect(
      body.byteLength,
      `OG image is ${(body.byteLength / 1024).toFixed(0)}KB, budget is ${OG_MAX_BYTES / 1024}KB`,
    ).toBeLessThanOrEqual(OG_MAX_BYTES)

    // PNG header carries the dimensions at a fixed offset — no decoder needed.
    expect(body.subarray(1, 4).toString('ascii')).toBe('PNG')
    expect(body.readUInt32BE(16)).toBe(OG_SIZE.width)
    expect(body.readUInt32BE(20)).toBe(OG_SIZE.height)
  })

  test('the browse page points at an OG image and declares no-index', async ({ page }) => {
    await openAsReturningGuest(page)

    const ogImage = page.locator('meta[property="og:image"]')
    await expect(ogImage).toHaveCount(1)
    expect(await ogImage.getAttribute('content')).toContain('/api/og')

    // doc 01 US-5: never findable by anyone without the link.
    const robots = page.locator('meta[name="robots"]')
    expect((await robots.getAttribute('content')) ?? '').toMatch(/noindex/)
  })

  test('an unknown catalogue does not render an OG card for a wedding that is not there', async ({
    page,
  }) => {
    const response = await page.request.get('/api/og?catalogue=not-a-wedding')
    expect(response.status()).toBe(404)
  })
})

/**
 * doc 10 §4 — WCAG 2.1 AA, "zero violations gate".
 *
 * `color-contrast` is included deliberately: the palette is the thing most likely to regress,
 * and `pnpm check:contrast` only covers the tokens, not what they compose into on a page.
 */
const AXE_TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']

async function audit(page: import('@playwright/test').Page) {
  // Next streams metadata, so `<title>` can arrive after the body it describes. Auditing in that
  // window reports a `document-title` violation that is gone a tick later — a failure that moves
  // between runs and says nothing about the page. Waiting for the document to be titled makes
  // the audit deterministic instead of lucky.
  await page.waitForFunction(() => document.title.length > 0, null, { timeout: 10_000 })
  return new AxeBuilder({ page }).withTags(AXE_TAGS).analyze()
}

function describeViolations(results: Awaited<ReturnType<typeof audit>>): string {
  return results.violations
    .map((v) => `${v.id} (${v.impact}): ${v.help}\n    ${v.nodes.map((n) => n.target.join(' ')).join('\n    ')}`)
    .join('\n  ')
}

test.describe('doc 10 §4 — accessibility, zero violations', () => {
  /**
   * The marketing pages are the only ones a search engine or a studio owner reaches cold, and
   * they were built after this gate existed — so they are held to it rather than exempted.
   * `/privacy` in particular was linked from every wedding page's footer while being a 404.
   */
  test('the download page, which a couple reaches when things have gone wrong', async ({ page }) => {
    await page.goto(`/c/${DEMO_CATALOGUE}/download`)
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible()

    const results = await audit(page)
    expect(describeViolations(results)).toBe('')
  })

  for (const [name, path] of [
    ['the landing page', '/'],
    ['the privacy page', '/privacy'],
    ['the terms page', '/terms'],
  ] as const) {
    test(name, async ({ page }) => {
      await page.goto(path)
      await expect(page.getByRole('heading', { level: 1 })).toBeVisible()

      const results = await audit(page)
      expect(describeViolations(results)).toBe('')
    })
  }

  test('the profile gate', async ({ page }) => {
    await page.goto(`/?__catalogue=${DEMO_CATALOGUE}`)
    await expect(page.getByTestId('profile-gate')).toBeVisible()

    const results = await audit(page)
    expect(describeViolations(results)).toBe('')
  })

  test('the browse page', async ({ page }) => {
    await openAsReturningGuest(page)
    await expect(page.getByTestId('poster-row').first()).toBeVisible()

    const results = await audit(page)
    expect(describeViolations(results)).toBe('')
  })

  test('the title modal', async ({ page }) => {
    await openAsReturningGuest(page, DEMO_CATALOGUE, '&title=the-ceremony')
    await expect(page.getByRole('dialog')).toBeVisible()

    const results = await audit(page)
    expect(describeViolations(results)).toBe('')
  })

  /**
   * The lightbox, which gained a share control in N-31 and had never been audited — the gate
   * covered the title modal and stopped there, so the *other* full-screen dialog on the guest
   * surface went unchecked for the life of the suite.
   */
  test('the photo lightbox', async ({ page }) => {
    await openAsReturningGuest(page, DEMO_CATALOGUE)
    await page.getByTestId('photo-grid-module').getByRole('button').first().click()
    await expect(page.getByRole('dialog')).toBeVisible()

    const results = await audit(page)
    expect(describeViolations(results)).toBe('')
  })

  test('the browse page in Hindi', async ({ page }) => {
    await openAsReturningGuest(page)
    await page.getByRole('button', { name: 'हिं' }).click()
    await expect(page.locator('html')).toHaveAttribute('lang', 'hi')

    const results = await audit(page)
    expect(describeViolations(results)).toBe('')
  })

  test('the player', async ({ page }) => {
    await openAsReturningGuest(page)
    await page.goto('/watch/the-ceremony')
    await expect(page.getByTestId('player')).toBeVisible()

    const results = await audit(page)
    expect(describeViolations(results)).toBe('')
  })

  test('the renewal screen and the passcode gate are reachable states too', async ({ page }) => {
    await page.goto(`/?__catalogue=${DEMO_CATALOGUE}`)
    await page.goto('/renew')
    const results = await audit(page)
    expect(describeViolations(results)).toBe('')
  })

  test('the admin catalogue list', async ({ page }) => {
    test.skip(Boolean(test.info().project.use.isMobile), 'the admin is a desktop tool')
    await signIn(page)

    const results = await audit(page)
    expect(describeViolations(results)).toBe('')
  })

  /**
   * N-32. The wizard is where a partner's first half hour goes and it had never been audited —
   * the gate covered the list either side of it but not the four steps in between.
   *
   * Both steps, because they are different forms: step 1 is text inputs, step 2 is the template
   * choice, and only step 2 is reachable once step 1 validates.
   */
  test('the create wizard, both steps', async ({ page }) => {
    test.skip(Boolean(test.info().project.use.isMobile), 'the admin is a desktop tool')
    await signIn(page)
    await page.getByRole('link', { name: 'New catalogue' }).first().click()
    await expect(page.getByRole('heading', { name: 'New catalogue' })).toBeVisible()

    expect(describeViolations(await audit(page))).toBe('')

    await page.getByLabel('Couple').fill('Axe & Gate')
    await page.getByLabel('Wedding date').fill('2026-12-01')
    await page.getByLabel('Web address').fill(`e2e-axe-${Date.now().toString(36)}`)
    await expect(page.getByText('Available')).toBeVisible()
    await page.getByRole('button', { name: 'Continue' }).click()
    await expect(page.getByRole('button', { name: 'Create and start uploading' })).toBeVisible()

    expect(describeViolations(await audit(page))).toBe('')

    /**
     * Named explicitly, because I recorded the opposite in N-32 and was wrong.
     *
     * The browser tool's tree printed `radio "on"` three times, which I read as three unlabelled
     * controls. "on" is a radio's default *value* when no `value` attribute is set — the tool was
     * showing value, not accessible name. The inputs sit inside their `<label>`, so the name
     * comes from the label's own text, and both axe and this assertion agree.
     */
    await expect(page.getByRole('radio', { name: /The Keepsake/ })).toHaveCount(1)
    await expect(page.getByRole('radio', { name: /Films Only/ })).toHaveCount(1)
    await expect(page.getByRole('radio', { name: /Anniversary/ })).toHaveCount(1)
  })

  test('the customizer', async ({ page }) => {
    test.skip(Boolean(test.info().project.use.isMobile), 'the admin is a desktop tool')
    await signIn(page)
    await page.getByRole('link', { name: 'Aanya & Vikram' }).click()
    // Let the catalogue page arrive before clicking the next link. Firing the second click while
    // the first client navigation is still hydrating gets it swallowed, and the audit then runs
    // against the overview page — which passes or fails depending on machine load rather than on
    // accessibility. operator.spec.ts's openCustomizer settles here for the same reason.
    await expect(page.getByRole('heading', { name: 'Aanya & Vikram' })).toBeVisible()
    await page.getByRole('link', { name: 'Customizer' }).click()
    await page.waitForURL(/\/customizer$/)
    // Wait for *any* module, not a poster row. This audits the shared demo catalogue, and
    // operator.spec.ts is concurrently entitled to reorder and hide that catalogue's sections —
    // so "a poster row is visible" is a readiness gate that another test can legitimately
    // falsify. `[data-module-id]` comes from ModuleRenderer, the one tree both the guest page
    // and the preview mount, and it survives any reordering.
    await expect(
      page.getByTestId('preview-viewport').locator('[data-module-id]').first(),
    ).toBeVisible({ timeout: 15_000 })

    const results = await audit(page)
    expect(describeViolations(results)).toBe('')
  })
})
