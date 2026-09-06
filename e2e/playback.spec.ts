import { expect, test, type Page } from '@playwright/test'

/**
 * doc 10 §2 E2E-1 — a guest watches, leaves, and comes back to where they stopped.
 *
 * This is US-1 and US-2, the two user stories the whole product is arranged around. It needs
 * real playback to mean anything, which is why the `fake` driver serves a real clip
 * (`scripts/make-sample-video.mjs`) rather than a dead URL.
 *
 * Continue Watching is P1 (VE-7, demoted in doc 01 §5.1), so what is asserted here is the P0
 * half: the position persists and the player resumes at it.
 */
const CATALOGUE = 'aanya-vikram'
const TITLE = 'the-ceremony'

/** Doc 01 US-2: resume must land within five seconds of the actual stop position. */
const RESUME_TOLERANCE_S = 5

async function pickProfile(page: Page): Promise<string> {
  await page.goto(`/?__catalogue=${CATALOGUE}`)
  await page.getByRole('button', { name: /Friends/ }).click()
  await expect(page.getByTestId('profile-gate')).toHaveCount(0)

  const profileId = await page.evaluate(
    (slug) => window.localStorage.getItem(`mehfilbox.profile.${slug}`),
    CATALOGUE,
  )
  expect(profileId, 'the gate must create a profile server-side and store its id').toBeTruthy()
  expect(profileId).not.toBe('skipped')
  return profileId!
}

/** Wait for the element to actually be playing, not merely present. */
async function waitForPlayback(page: Page): Promise<void> {
  await expect(page.getByTestId('player')).toBeVisible()
  await page.waitForFunction(
    () => {
      const video = document.querySelector('video')
      return !!video && video.readyState >= 2 && Number.isFinite(video.duration) && video.duration > 0
    },
    undefined,
    { timeout: 15_000 },
  )
}

async function currentTime(page: Page): Promise<number> {
  return page.evaluate(() => document.querySelector('video')?.currentTime ?? 0)
}

test.describe('E2E-1: a guest watches and resumes', () => {
  test('playback starts, the position persists, and it resumes where they stopped', async ({
    page,
  }) => {
    const profileId = await pickProfile(page)

    // Open the title and press Play from the modal — the real path, not a direct URL.
    await page.getByTestId('poster-card').first().click()
    const dialog = page.getByRole('dialog')
    await expect(dialog).toBeVisible()
    await dialog.getByRole('button', { name: 'Play' }).click()

    await expect(page).toHaveURL(new RegExp(`/watch/`))
    await waitForPlayback(page)

    // Seek partway in, then let it play so the heartbeat records real watched seconds.
    const stopAt = 6
    await page.evaluate((seconds) => {
      const video = document.querySelector('video')
      if (video) {
        video.currentTime = seconds
        void video.play()
      }
    }, stopAt)

    await expect
      .poll(() => currentTime(page), { timeout: 10_000 })
      .toBeGreaterThan(stopAt)

    // Leaving the page flushes the heartbeat via sendBeacon / pagehide.
    await page.goto(`/?__catalogue=${CATALOGUE}`)

    // The position reached the server.
    const stored = await page.evaluate(async (id) => {
      const response = await fetch(`/api/progress?profileId=${id}`)
      return (await response.json()) as {
        progress: { titleId: string; positionS: number; completed: boolean }[]
      }
    }, profileId)

    expect(stored.progress.length, 'the heartbeat must have persisted a position').toBeGreaterThan(0)
    const saved = stored.progress[0]!
    expect(saved.positionS).toBeGreaterThanOrEqual(stopAt - 1)
    expect(saved.completed).toBe(false)

    // Coming back resumes there, and says so.
    await page.goto(`/watch/${TITLE}`)
    await waitForPlayback(page)

    await expect
      .poll(() => currentTime(page), { timeout: 10_000 })
      .toBeGreaterThan(saved.positionS - RESUME_TOLERANCE_S)

    await expect(page.getByText(/Resuming from/)).toBeVisible()
    await expect(page.getByRole('button', { name: 'Start over' })).toBeVisible()
  })

  test('"Start over" abandons the resume position rather than arguing with the guest', async ({
    page,
  }) => {
    await pickProfile(page)

    // Build a resume position through the API rather than by watching in real time: the
    // affordance is only on screen for six seconds by design (doc 08 `<Player>`), so a test
    // that first waits for playback is racing the spec.
    await page.goto(`/watch/${TITLE}`)
    await waitForPlayback(page)
    await page.evaluate(() => {
      const video = document.querySelector('video')
      if (video) {
        video.currentTime = 8
        void video.play()
      }
    })
    await expect.poll(() => currentTime(page), { timeout: 10_000 }).toBeGreaterThan(8)
    await page.goto(`/?__catalogue=${CATALOGUE}`)

    // Now the notice is the first thing to assert on, before waiting for readyState.
    await page.goto(`/watch/${TITLE}`)
    const startOver = page.getByRole('button', { name: 'Start over' })
    await expect(startOver).toBeVisible({ timeout: 10_000 })

    await startOver.click()
    await expect(startOver).toBeHidden()
    await expect.poll(() => currentTime(page), { timeout: 10_000 }).toBeLessThan(3)
  })

  test('a `?t=` deep link starts at that moment — the share mechanic in doc 02 §6', async ({
    page,
  }) => {
    await pickProfile(page)
    await page.goto(`/watch/${TITLE}?t=7`)
    await waitForPlayback(page)

    await expect.poll(() => currentTime(page), { timeout: 10_000 }).toBeGreaterThan(6)
  })

  test('the player is keyboard-operable, with every control labelled', async ({ page }) => {
    await pickProfile(page)
    await page.goto(`/watch/${TITLE}`)
    await waitForPlayback(page)

    // doc 02 §4: space play/pause, ←/→ seek 10s, m mute.
    const before = await currentTime(page)
    await page.keyboard.press('ArrowRight')
    await expect.poll(() => currentTime(page), { timeout: 5000 }).toBeGreaterThan(before + 5)

    await page.keyboard.press('m')
    expect(await page.evaluate(() => document.querySelector('video')?.muted)).toBe(true)

    for (const label of ['Play or pause', 'Back 10 seconds', 'Forward 10 seconds', 'Fullscreen']) {
      await expect(page.getByRole('button', { name: label })).toBeVisible()
    }
  })
})
