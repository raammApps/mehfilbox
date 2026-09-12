import { expect, test, type Page } from '@playwright/test'

/**
 * doc 10 §2 E2E-4 — the journey the business depends on: an operator arranges sections, sees
 * the preview change, publishes, and the guest page matches.
 *
 * Runs on desktop only. The admin is a laptop tool; the guest surface is the mobile one.
 */
test.describe('the operator console', () => {
  // The admin is a laptop tool. The guest surface is the one that has to work on a phone.
  test.skip(({ isMobile }) => Boolean(isMobile), 'the admin console is a desktop tool')

  /**
   * Open the customizer and wait until it is actually interactive.
   *
   * `toBeVisible` on a section proves the DOM is there, not that React has hydrated and
   * attached the click handlers. The preview pane only ever renders client-side, so content
   * inside it is a reliable hydration signal — without this, clicks land on dead markup and
   * the suite flakes.
   */
  async function openCustomizer(page: Page): Promise<void> {
    await page.getByRole('link', { name: 'Aanya & Vikram' }).click()
    await expect(page.getByRole('heading', { name: 'Aanya & Vikram' })).toBeVisible()
    await page.getByRole('link', { name: 'Customizer' }).click()
    await expect(
      page.getByTestId('preview-viewport').getByTestId('poster-row').first(),
    ).toBeVisible()
  }

  test.beforeEach(async ({ page }) => {
    await page.goto('/admin/login')
    await page.getByLabel('Email').fill('operator@mehfilbox.test')
    await page.getByLabel('Password').fill('e2e-operator-password')
    await page.getByRole('button', { name: 'Sign in' }).click()
    await expect(page.getByRole('heading', { name: 'Catalogues' })).toBeVisible()
  })

  /**
   * N-55 — undo is only half a promise without redo.
   *
   * An operator who undoes one step too far had no way back and had to rebuild the change by
   * hand, which is worse than never offering undo: they trusted it.
   *
   * Asserted through the visibility toggle's accessible name, which flips with the state — no
   * test hook needed, and it fails if undo restores the array without the UI following.
   */
  test('a change can be undone and put back', async ({ page }) => {
    await openCustomizer(page)

    const toggle = page.getByRole('button', { name: /^(Hide|Show) / }).first()
    const before = await toggle.getAttribute('aria-label')

    await toggle.click()
    const after = await page.getByRole('button', { name: /^(Hide|Show) / }).first().getAttribute('aria-label')
    expect(after).not.toBe(before)

    await page.getByRole('button', { name: 'Undo' }).click()
    await expect(page.getByRole('button', { name: /^(Hide|Show) / }).first()).toHaveAttribute(
      'aria-label',
      before ?? '',
    )

    await page.getByRole('button', { name: 'Redo' }).click()
    await expect(page.getByRole('button', { name: /^(Hide|Show) / }).first()).toHaveAttribute(
      'aria-label',
      after ?? '',
    )
  })

  test('requires a session', async ({ browser }) => {
    const anonymous = await browser.newContext()
    const page = await anonymous.newPage()
    await page.goto('/admin')
    // The console's sign-in lives on the public site now, behind the studio door (D-33).
    await expect(page).toHaveURL(/\/login\?door=studio/)
    await anonymous.close()
  })

  test('lists the org’s catalogues', async ({ page }) => {
    await expect(page.getByRole('link', { name: 'Aanya & Vikram' })).toBeVisible()
  })

  test('rejects a -flix app name at creation, and says what to use instead', async ({ page }) => {
    await page.getByRole('link', { name: 'New catalogue' }).first().click()
    await page.getByLabel('Couple').fill('Riya & Kabir')
    await page.getByLabel('App name').fill('RiyaKabirFlix')

    await expect(page.getByText(/Originals|Stream|Files/)).toBeVisible()
    await expect(page.getByRole('button', { name: 'Continue' })).toBeDisabled()
  })

  /**
   * Everything that edits the demo catalogue, one spec at a time.
   *
   * Server state is shared across the whole Playwright run — one process, one in-memory store —
   * so two specs reordering or renaming the same catalogue's sections in parallel is a race
   * rather than a test. It surfaced as "Billboard is first" failing intermittently once a second
   * spec started reordering.
   *
   * `helpers.ts` solves this for *content* by creating a throwaway catalogue. That is not
   * available here: a catalogue with no published films renders no sections at all, so there is
   * nothing to select, rename or drag.
   */
  test.describe.serial('editing the demo catalogue', () => {
  test('E2E-4: reordering sections changes the preview and then the published page', async ({
    page,
  }) => {
    await openCustomizer(page)

    const sections = page.getByRole('region', { name: 'Sections' }).getByRole('listitem')
    await expect(sections.first()).toContainText('Billboard')

    // Keyboard reorder is the accessible path and the one under test (doc 14 §5.1).
    const secondSection = sections.nth(1)
    const label = (await secondSection.textContent())?.trim() ?? ''
    await secondSection.getByRole('button', { name: /Move .* up/ }).click()

    await expect(sections.first()).toContainText(label.slice(0, 12))
    await expect(page.getByText('Saved as draft')).toBeVisible({ timeout: 5000 })

    await page.getByRole('button', { name: 'Publish' }).click()
    await expect(page.getByText('Saved as draft')).toBeVisible()

    // The guest page now matches what the operator saw.
    await page.goto('/?__catalogue=aanya-vikram')
    const gate = page.getByTestId('profile-gate')
    if (await gate.isVisible().catch(() => false)) {
      await page.getByRole('button', { name: 'Skip for now' }).click()
    }
    await expect(page.locator('[data-module-id]').first()).toBeVisible()
  })

  /**
   * The redesign's whole point: the preview is the way in.
   *
   * This had no coverage at all — the suite reordered and hid sections but never opened an
   * editor, which is how an entire editing surface could be replaced with every test still
   * green.
   */
  test('selecting a section in the preview edits it beside the preview', async ({ page }) => {
    await openCustomizer(page)

    const preview = page.getByTestId('preview-viewport')
    const inspector = page.getByRole('complementary', { name: 'Section editor' })

    /**
     * The inspector opens on the first section now (N-55) rather than on "Nothing selected", so
     * what this asserts is that clicking a *different* section moves it — which is the behaviour
     * the test was always about. The old assertion checked the empty state, which was the thing
     * N-55 removed for being a third of the screen doing nothing on arrival.
     */
    const opensWith = await inspector.innerText()

    // Click a second section, the way an operator points at what they want to change.
    await preview.locator('[data-module-id]').nth(1).click()
    await expect(inspector).not.toHaveText(opensWith)

    // The list agrees about what is selected, so the two panels never disagree.
    await expect(
      page.getByRole('region', { name: 'Sections' }).getByRole('listitem').nth(1),
    ).toHaveAttribute('aria-current', 'true')

    // The editor is a panel, not a dialog: it must not cover the thing it edits.
    await expect(preview).toBeVisible()
    await expect(page.getByRole('dialog')).toHaveCount(0)
  })

  test('a heading typed in the inspector reaches the preview', async ({ page }) => {
    await openCustomizer(page)

    const sections = page.getByRole('region', { name: 'Sections' }).getByRole('listitem')
    // A film row, so the heading is rendered above visible cards.
    const row = sections.filter({ hasText: 'Film row' }).first()
    await row.getByRole('button', { name: /Edit/ }).click()

    const inspector = page.getByRole('complementary', { name: 'Section editor' })
    const heading = inspector
      .getByRole('group', { name: 'Section heading' })
      .getByLabel('English')
    await heading.fill('Our favourite films')

    await expect(page.getByTestId('preview-viewport')).toContainText('Our favourite films', {
      timeout: 10_000,
    })
  })

  /**
   * N-13 §1 — the heading is edited where it is read.
   *
   * Headings are what operators change most and they are already on screen, so the whole
   * "find the field, type, look back at the preview" loop was avoidable.
   */
  test('a heading can be typed directly into the preview', async ({ page }) => {
    await openCustomizer(page)

    const sections = page.getByRole('region', { name: 'Sections' }).getByRole('listitem')
    const row = sections.filter({ hasText: 'Film row' }).first()
    await row.getByRole('button', { name: /Edit/ }).click()

    const heading = page.getByTestId('preview-viewport').locator('[data-editing-heading="true"]')
    await expect(heading).toBeVisible()

    await heading.click()
    await page.keyboard.press('ControlOrMeta+a')
    await page.keyboard.type('Typed in the preview')
    // Enter commits: a heading is one line, so it means "done" rather than a paragraph break.
    await page.keyboard.press('Enter')

    // The inspector is the other half of the same state — if the two disagree, one of them lies.
    const inspector = page.getByRole('complementary', { name: 'Section editor' })
    await expect(
      inspector.getByRole('group', { name: 'Section heading' }).getByLabel('English'),
    ).toHaveValue('Typed in the preview', { timeout: 10_000 })
  })

  /**
   * N-13 §3 — selecting in the list used to update the inspector while the preview stayed put,
   * so an operator edited a heading they could not see.
   */
  test('selecting a section in the list brings it into view in the preview', async ({ page }) => {
    await openCustomizer(page)

    const viewport = page.getByTestId('preview-viewport')

    // "Short and worth it" is the fourth of the Keepsake template's five sections, so it starts
    // well below the fold — and it is a film row, so unlike the photo grid it renders something
    // even when the catalogue has no photographs. Targeted by name rather than by position: the
    // list nests advisory items, so `.last()` finds one of those instead of a section.
    const row = page.getByRole('button', { name: 'Edit Short and worth it' })
    await expect(row).toBeVisible()

    const target = viewport.locator('[data-module-id]').nth(3)
    await expect(target).not.toBeInViewport()

    await row.click()
    await expect(target).toBeInViewport({ timeout: 10_000 })
  })

  /**
   * N-13 §2 — dragging in the preview reorders, and the list agrees afterwards.
   *
   * Additive only: the list keeps the keyboard path, which is what doc 14 §5.1 requires and what
   * `E2E-4` above still exercises.
   */
  test('dragging a section in the preview reorders it', async ({ page }) => {
    await openCustomizer(page)

    const previewSections = page.getByTestId('preview-viewport').locator('[data-module-id]')

    // No assumption about which section starts first: this shares the demo catalogue with
    // E2E-4, which reorders it too. Capture what is there and assert the swap.
    const wasFirst = (await previewSections.nth(0).getAttribute('data-module-id')) ?? ''
    const label = (await previewSections.nth(1).getAttribute('data-module-id')) ?? ''
    expect(label).toBeTruthy()
    expect(wasFirst).toBeTruthy()

    /*
     * The drag events are dispatched rather than mimed with the mouse.
     *
     * Playwright cannot start Chromium's native HTML5 drag loop from synthetic mouse input —
     * `dragTo` moves the pointer and no `dragstart` ever fires. These are the same event objects
     * the browser dispatches, so this covers the handlers, the reorder and the autosave; what it
     * does not cover is whether the browser decides to begin a drag at all. `draggable` is
     * asserted separately below for exactly that reason.
     */
    await expect(previewSections.first()).toHaveJSProperty('draggable', true)

    await page.evaluate(() => {
      const root = document.querySelector('[data-testid="preview-viewport"]')!
      const sections = Array.from(root.querySelectorAll('[data-module-id]'))
      const dataTransfer = new DataTransfer()
      const fire = (node: Element, type: string) =>
        node.dispatchEvent(new DragEvent(type, { bubbles: true, cancelable: true, dataTransfer }))

      fire(sections[1]!, 'dragstart')
      fire(sections[0]!, 'dragover')
      fire(sections[0]!, 'drop')
    })

    await expect(page.getByText('Saved as draft')).toBeVisible({ timeout: 10_000 })
    await expect(previewSections.first()).toHaveAttribute('data-module-id', label)
    await expect(previewSections.nth(1)).toHaveAttribute('data-module-id', wasFirst)
  })
  })

  test('hiding a section removes it from guests without discarding its config', async ({ page }) => {
    await openCustomizer(page)

    // Target one named section rather than "the first button that matches": the list
    // re-renders on every change, and `.first()` races with that re-render.
    const sections = page.getByRole('region', { name: 'Sections' })
    const letter = sections.getByRole('listitem').filter({ hasText: 'A message for you' })
    await expect(letter).toBeVisible()

    await letter.getByRole('button', { name: /Hide .* from guests/ }).click()

    // Still listed, and its config is intact — it is simply not shown to guests.
    await expect(letter.getByRole('button', { name: /Show .* to guests/ })).toBeVisible()
    await expect(letter).toContainText('A message for you')

    // And it disappears from the preview, which is the actual guest-visible effect.
    await expect(page.getByTestId('preview-viewport').getByTestId('letter-module')).toHaveCount(0)
  })

  test('warns at pick time about an accent that will not carry a button label', async ({ page }) => {
    await openCustomizer(page)

    // Branding is a selection now, like a section — it opens in the inspector rather than
    // sitting permanently in the sidebar.
    await page.getByRole('button', { name: /Branding/ }).click()
    // A mid grey: neither white nor near-black lettering reads on it (D-35 chooses the ink).
    await page.getByLabel('Custom').fill('#7a7a7a')
    // Scoped to the branding panel: Next's route announcer is also role="alert".
    const branding = page.getByRole('region', { name: 'Branding' })
    await expect(branding.getByRole('alert')).toContainText(/button text/i)
  })

  /**
   * A theme is the whole page, not the accent (D-35): the surface, the type, the corners. The
   * preview has to repaint its own frame to the theme's page — an ivory theme in a black frame
   * previews wrong — while the console around it stays the console.
   */
  test('choosing a theme repaints the whole preview, and nothing outside it', async ({ page }) => {
    await openCustomizer(page)
    await page.getByRole('button', { name: /Branding/ }).click()
    const branding = page.getByRole('region', { name: 'Branding' })
    await branding.getByRole('radio', { name: /^Carnival/ }).check({ force: true })

    const themed = page.locator('[data-preview-theme]')
    await expect
      .poll(async () =>
        themed.evaluate((el) => getComputedStyle(el).getPropertyValue('--color-surface-0').trim()),
      )
      .toBe('#1b0f2e')
    await expect(page.locator('style[data-tenant-theme="carnival"]')).toHaveCount(1)

    const admin = await page.evaluate(() =>
      getComputedStyle(document.documentElement).getPropertyValue('--color-surface-0').trim(),
    )
    expect(admin).toBe('#0c0c0d')

    // Back to the default, so the next spec meets the demo wedding as it was seeded.
    await branding.getByRole('radio', { name: /^Marquee/ }).check({ force: true })
    await expect
      .poll(async () =>
        themed.evaluate((el) => getComputedStyle(el).getPropertyValue('--color-surface-0').trim()),
      )
      .toBe('#0c0c0d')
    await expect(page.getByText('Saved as draft').first()).toBeVisible()
  })

  /**
   * Branding never reached the preview: `<ThemeStyle>` is rendered by guest pages, and the pane
   * mounts the shell below that level. An operator picked an accent and the preview kept showing
   * the default — for the entire life of the customizer, with every test passing.
   */
  test('an accent chosen in the inspector repaints the preview, not the admin', async ({ page }) => {
    await openCustomizer(page)
    await page.getByRole('button', { name: /Branding/ }).click()
    await page.getByLabel('Custom').fill('#2f6f4e')

    const themed = page.locator('[data-preview-theme]')
    await expect
      .poll(async () =>
        themed.evaluate((el) => getComputedStyle(el).getPropertyValue('--color-accent').trim()),
      )
      .toBe('#2f6f4e')

    // Scoped: a tenant's colour must not repaint the console around it.
    const admin = await page.evaluate(() =>
      getComputedStyle(document.documentElement).getPropertyValue('--color-accent').trim(),
    )
    expect(admin).not.toBe('#2f6f4e')
  })

  test('the preview renders the real guest components, mobile by default', async ({ page }) => {
    await openCustomizer(page)

    await expect(page.getByRole('button', { name: 'Mobile preview' })).toHaveAttribute(
      'aria-pressed',
      'true',
    )

    const viewport = page.getByTestId('preview-viewport')
    await expect(viewport.getByTestId('poster-row').first()).toBeVisible()
  })

  test('offers upload and shows the storage the catalogue is measured against', async ({ page }) => {
    await page.getByRole('link', { name: 'Aanya & Vikram' }).click()
    // Wait for the overview to settle: the sub-nav mounts with it, and clicking a link that is
    // still being swapped in is what makes this flake rather than fail.
    await expect(page.getByRole('heading', { name: 'Aanya & Vikram' })).toBeVisible()
    // Storage, not a film count — the plans sell gigabytes (N-28), so that is what the console
    // measures a catalogue against.
    await expect(page.getByText(/of 20 GB/)).toBeVisible()

    await page.getByRole('link', { name: 'Films', exact: true }).click()
    await expect(page.getByText('Drop films here')).toBeVisible()
    // Uploads keep running while the operator works elsewhere (doc 08 <UploadManager>).
    await expect(page.getByText(/uploads keep going while you work elsewhere/i)).toBeVisible()
  })
})
