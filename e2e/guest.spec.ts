import { expect, test, type Page } from '@playwright/test'

/**
 * doc 10 §2 — the critical guest journeys.
 *
 * The demo catalogue is reached through `?__catalogue=` rather than a wildcard subdomain,
 * because CI has no DNS. `resolveTenant` itself is exhaustively unit-tested; this suite is
 * about what a guest does once they are on the page.
 */
const CATALOGUE = 'aanya-vikram'

/**
 * A first-time visitor: the profile gate will appear.
 */
async function openFresh(page: Page, query = ''): Promise<void> {
  await page.goto(`/?__catalogue=${CATALOGUE}${query}`)
}

/**
 * A returning visitor.
 *
 * The gate mounts after hydration, so "navigate, then dismiss it if it happens to be there" is
 * a race — it can appear *after* the check and cover whatever the test is asserting on. Marking
 * the choice as already made before the first paint removes the race and is exactly the state a
 * returning guest is in.
 */
async function openBrowse(page: Page, query = ''): Promise<void> {
  await page.addInitScript((slug) => {
    window.localStorage.setItem(`mehfilbox.profile.${slug}`, 'skipped')
  }, CATALOGUE)
  await page.goto(`/?__catalogue=${CATALOGUE}${query}`)
  await expect(page.getByTestId('profile-gate')).toHaveCount(0)
}

test.describe('the guest catalogue', () => {
  test('opens on the profile gate — the signature moment', async ({ page }) => {
    await openFresh(page)

    const gate = page.getByTestId('profile-gate')
    await expect(gate).toBeVisible()
    await expect(page.getByRole('heading', { name: "Who's joining?" })).toBeVisible()

    // Four fixed labels, never a free-text personal name (doc 06 §5).
    for (const label of ["Bride's side", "Groom's side", 'Friends', 'Family']) {
      await expect(gate.getByText(label, { exact: true })).toBeVisible()
    }

    await expect(page.getByRole('textbox')).toHaveCount(0)
  })

  test('remembers the choice, so the gate is a first-visit moment only', async ({ page }) => {
    await openFresh(page)
    await page.getByRole('button', { name: /Friends/ }).click()
    await expect(page.getByTestId('profile-gate')).toHaveCount(0)

    await openFresh(page)
    await expect(page.getByTestId('profile-gate')).toHaveCount(0)
  })

  test('shows the billboard with exactly two buttons', async ({ page }) => {
    await openBrowse(page)

    await expect(page.getByRole('heading', { name: 'Aanya & Vikram' })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Play' }).first()).toBeVisible()
    await expect(page.getByRole('button', { name: 'More Info' })).toBeVisible()
  })

  test('renders curated rows and the letter, and no row is empty', async ({ page }) => {
    await openBrowse(page)

    const rows = page.getByTestId('poster-row')
    await expect(rows.first()).toBeVisible()

    // Every rendered row has at least one card — never a heading over nothing (doc 02 §2).
    for (const row of await rows.all()) {
      expect(await row.getByTestId('poster-card').count()).toBeGreaterThan(0)
    }

    await expect(page.getByTestId('letter-module')).toBeVisible()
  })

  test('a three-card row is a designed state, not a broken one', async ({ page }) => {
    await openBrowse(page)

    const compact = page.locator('[data-testid="poster-row"][data-compact="true"]')
    await expect(compact.first()).toBeVisible()

    // No arrows in the compact layout.
    await expect(compact.first().getByRole('button', { name: 'Scroll right' })).toHaveCount(0)
  })

  test('E2E-2: a card opens the modal, and back closes it without leaving the site', async ({
    page,
  }) => {
    await openBrowse(page)

    await page.getByTestId('poster-card').first().click()
    await expect(page.getByRole('dialog')).toBeVisible()
    await expect(page).toHaveURL(/[?&]title=/)

    await page.goBack()
    await expect(page.getByRole('dialog')).toBeHidden()
    // Still on the catalogue, not back at the referrer.
    await expect(page.getByTestId('poster-row').first()).toBeVisible()
  })

  test('E2E-2: a cold `?title=` load opens the modal directly', async ({ page }) => {
    await openBrowse(page, '&title=the-ceremony')

    const dialog = page.getByRole('dialog')
    await expect(dialog).toBeVisible()
    await expect(dialog.getByRole('heading', { name: 'The Ceremony' })).toBeVisible()
  })

  test('Play navigates to the player rather than starting inline', async ({ page }) => {
    await openBrowse(page, '&title=the-ceremony')

    await page.getByRole('dialog').getByRole('button', { name: 'Play' }).click()
    await expect(page).toHaveURL(/\/watch\/the-ceremony/)
    await expect(page.getByTestId('player')).toBeVisible()
  })

  test('E2E-3: Hindi switches the chrome and falls back to English where a translation is missing', async ({
    page,
  }) => {
    await openBrowse(page)

    await page.getByRole('button', { name: 'हिं' }).click()
    await expect(page.locator('html')).toHaveAttribute('lang', 'hi')
    await expect(page.getByRole('button', { name: 'चलाएँ' }).first()).toBeVisible()

    // "From Above" deliberately has no Hindi synopsis in the fixture: the guest must see the
    // English sentence, not a key and not a blank.
    await page.goto(`/?__catalogue=${CATALOGUE}&title=from-above`)
    const dialog = page.getByRole('dialog')
    await expect(dialog).toContainText('drone')
  })

  test('the language choice survives a reload', async ({ page }) => {
    await openBrowse(page)
    await page.getByRole('button', { name: 'हिं' }).click()
    await expect(page.locator('html')).toHaveAttribute('lang', 'hi')

    await page.reload()
    await expect(page.locator('html')).toHaveAttribute('lang', 'hi')
  })

  test('is never indexable', async ({ page }) => {
    const response = await page.goto(`/?__catalogue=${CATALOGUE}`)
    expect(response?.headers()['x-robots-tag']).toContain('noindex')
  })
})

test.describe('E2E-6: access control', () => {
  test('an unpublished title is absent from the page and its token is refused', async ({
    page,
    request,
  }) => {
    await openBrowse(page)
    await expect(page.getByText('Still Encoding')).toHaveCount(0)

    const response = await request.post('/api/playback/token', {
      data: { catalogue: CATALOGUE, titleSlug: 'not-a-real-film' },
    })
    expect(response.status()).toBe(404)
  })

  test('an unknown catalogue does not leak whether it exists', async ({ request }) => {
    const response = await request.post('/api/playback/token', {
      data: { catalogue: 'someone-elses-wedding', titleSlug: 'the-ceremony' },
    })
    expect(response.status()).toBe(404)
    expect((await response.json()).error.code).toBe('CATALOGUE_NOT_FOUND')
  })
})

/**
 * N-31 — a photograph you can send someone.
 *
 * Films have had this since VE-6, and it is the distribution model rather than a nicety: the
 * link spreads through WhatsApp because a guest sends it, not because anyone markets it. The
 * photographs surface had no actions at all, so the one thing a guest most wants to send their
 * sister — "look at Dad's face here" — was the one thing they could not.
 *
 * There was also no guest-side coverage of photographs whatsoever before this.
 */
test.describe('sharing a photograph', () => {
  test('a photograph has its own address, and that address reopens it', async ({ page }) => {
    await openBrowse(page)

    await page.getByTestId('photo-grid-module').getByRole('button').first().click()
    const lightbox = page.getByRole('dialog')
    await expect(lightbox).toBeVisible()

    // The address bar follows the guest, so what they copy from it is what they are looking at.
    await expect(page).toHaveURL(/[?&]photo=/)
    const shared = page.url()

    await page.keyboard.press('Escape')
    await expect(lightbox).toHaveCount(0)
    // And leaves cleanly, rather than stranding a query that would reopen on the next visit.
    await expect(page).not.toHaveURL(/[?&]photo=/)

    // What a recipient does: a cold arrival on the forwarded link, no prior visit to this page.
    const recipient = await page.context().newPage()
    await recipient.addInitScript((slug) => {
      window.localStorage.setItem(`mehfilbox.profile.${slug}`, 'skipped')
    }, CATALOGUE)
    await recipient.goto(shared)
    await expect(recipient.getByRole('dialog')).toBeVisible()
    await recipient.close()
  })

  test('the share control is offered on a photograph, as it is on a film', async ({ page }) => {
    await openBrowse(page)

    await page.getByTestId('photo-grid-module').getByRole('button').first().click()
    await expect(page.getByRole('dialog').getByRole('button', { name: /share/i })).toBeVisible()
  })
})

/**
 * N-31 — likes, counted across guests and shown to all of them.
 *
 * What is asserted is the count crossing a boundary: a *second* guest, with their own guest key,
 * sees a total they did not contribute to. A per-device tally would pass a single-browser test
 * and be worthless, so that assertion is the point of this file.
 *
 * **Thresholds, not equalities.** The demo catalogue is one fixture and the mobile and desktop
 * projects run against the same server, so another worker's tap can land between this test's
 * read and its click. The first version asserted `before + 1` and failed roughly one run in
 * three — the count was right, the arithmetic was racing. `toBeGreaterThanOrEqual` says the only
 * thing that is actually true under concurrency, and still fails if likes are not shared.
 */
test.describe('liking a photograph and a film', () => {
  /** The heart shows no number at zero, so absent reads as 0. */
  async function likeCount(button: import('@playwright/test').Locator): Promise<number> {
    const text = (await button.innerText()).replace(/[^0-9]/g, '')
    return text ? Number(text) : 0
  }

  test('a like is counted, survives a reload, and is visible to another guest', async ({
    page,
    browser,
  }) => {
    await openBrowse(page)
    await page.getByTestId('photo-grid-module').getByRole('button').first().click()

    const like = page.getByRole('dialog').getByRole('button', { name: /^Like$/ })
    await expect(like).toBeVisible()
    await like.click()

    // Filled, and the label flips — the pressed state is what a screen reader reads.
    const liked = page.getByRole('dialog').getByRole('button', { name: 'Liked' })
    await expect(liked).toHaveAttribute('aria-pressed', 'true')
    await expect.poll(() => likeCount(liked)).toBeGreaterThanOrEqual(1)

    const shared = page.url()

    await page.reload()
    const afterReload = page.getByRole('dialog').getByRole('button', { name: 'Liked' })
    await expect(afterReload).toHaveAttribute('aria-pressed', 'true')
    await expect.poll(() => likeCount(afterReload)).toBeGreaterThanOrEqual(1)

    /**
     * A second guest, in a context of their own so they carry a different guest key. They must
     * see the count and must *not* see it as theirs — the one assertion that separates "counted
     * and shown" from a number stored on one device.
     */
    const otherContext = await browser.newContext()
    const other = await otherContext.newPage()
    await other.addInitScript((slug) => {
      window.localStorage.setItem(`mehfilbox.profile.${slug}`, 'skipped')
    }, CATALOGUE)
    await other.goto(shared)

    const theirs = other.getByRole('dialog').getByRole('button', { name: /^Like$/ })
    await expect(theirs).toHaveAttribute('aria-pressed', 'false')
    await expect.poll(() => likeCount(theirs)).toBeGreaterThanOrEqual(1)

    // And their tap adds to the same total rather than starting one of their own.
    const seen = await likeCount(theirs)
    await theirs.click()
    const mine = other.getByRole('dialog').getByRole('button', { name: 'Liked' })
    await expect.poll(() => likeCount(mine)).toBeGreaterThan(seen)
    await otherContext.close()
  })

  test('a film can be liked too, from the title modal', async ({ page }) => {
    await openBrowse(page, '&title=the-ceremony')
    const modal = page.getByTestId('title-modal')
    await expect(modal).toBeVisible()

    const like = modal.getByRole('button', { name: /^Like$/ })
    await expect(like).toBeVisible()
    await like.click()

    const liked = modal.getByRole('button', { name: 'Liked' })
    await expect(liked).toHaveAttribute('aria-pressed', 'true')
    await expect.poll(() => likeCount(liked)).toBeGreaterThanOrEqual(1)
  })
})
