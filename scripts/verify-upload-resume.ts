#!/usr/bin/env tsx
/**
 * Prove resumable upload against the real Bunny, with a real network drop.
 *
 * Doc 09's sequencing rationale names this as the thing the schedule slips on:
 * "resumable multi-gigabyte upload against a third-party API". Everything around it is tested —
 * the ticket endpoint, the titles row, the UI — but the one behaviour that matters has never
 * run against a live TUS endpoint: kill the network at 60% and get 60%, not 0%.
 *
 * A stubbed provider cannot answer that. The offset lives in Bunny's TUS state and in
 * tus-js-client's fingerprint store, and whether they agree after a drop is exactly the
 * integration in question.
 *
 *   pnpm verify:upload
 *
 * Boots the app on the file driver with VIDEO_DRIVER=bunny, drives a real browser, drops the
 * network mid-transfer, restores it, and asserts the upload continues from where it stopped.
 * Uploads ~25MB and deletes the video afterwards.
 */
import { spawn, type ChildProcess } from 'node:child_process'
import { randomBytes } from 'node:crypto'
import { existsSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs'
import { chromium, type Browser } from '@playwright/test'

for (const line of existsSync('.env.local') ? readFileSync('.env.local', 'utf8').split('\n') : []) {
  const match = /^\s*([A-Z0-9_]+)\s*=\s*(.*)$/.exec(line)
  if (match?.[2]?.trim()) process.env[match[1]!] ??= match[2].trim()
}

const PORT = 3122
const BASE = `http://localhost:${PORT}`
/** Five TUS chunks at 5MB, so there is room to drop the network between them. */
const FILE_MB = 25
const FIXTURE = '.data/upload-resume-fixture.mp4'

const LIBRARY = process.env.BUNNY_LIBRARY_ID
const API_KEY = process.env.BUNNY_API_KEY

if (!LIBRARY || !API_KEY || process.env.VIDEO_DRIVER === 'fake') {
  console.error('Bunny is not configured. Run `pnpm preflight`.')
  process.exit(1)
}

function log(step: string, detail = ''): void {
  console.log(`${step}${detail ? ` ${detail}` : ''}`)
}

async function waitForHealth(timeoutMs: number): Promise<void> {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    try {
      const response = await fetch(`${BASE}/api/health`)
      if (response.ok) return
    } catch {
      /* not up yet */
    }
    await new Promise((r) => setTimeout(r, 500))
  }
  throw new Error('the server never became healthy')
}

async function main(): Promise<void> {
  let server: ChildProcess | undefined
  let browser: Browser | undefined
  let createdTitleId: string | undefined
  let providerId: string | undefined

  try {
    // A real video file is unnecessary: the question is whether the bytes resume, not whether
    // they decode. Bunny will fail the transcode afterwards and we delete it either way.
    log('1. building a', `${FILE_MB}MB fixture…`)
    writeFileSync(FIXTURE, randomBytes(FILE_MB * 1024 * 1024))

    log('2. booting the app on VIDEO_DRIVER=bunny…')
    server = spawn('pnpm', ['start'], {
      env: {
        ...process.env,
        PORT: String(PORT),
        NODE_ENV: 'production',
        DATA_DRIVER: 'file',
        ALLOW_EPHEMERAL_DATA: '1',
        VIDEO_DRIVER: 'bunny',
      },
      stdio: 'ignore',
    })
    await waitForHealth(60_000)
    log('   up')

    browser = await chromium.launch()
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 } })
    const page = await context.newPage()

    // Diagnostics: a stall is only useful if it says why.
    const consoleErrors: string[] = []
    page.on('console', (m) => {
      if (m.type() === 'error') consoleErrors.push(m.text().slice(0, 200))
    })
    page.on('requestfailed', (r) => {
      const url = r.url()
      if (url.includes('bunnycdn') || url.includes('/api/admin/uploads')) {
        consoleErrors.push(`requestfailed ${r.failure()?.errorText ?? '?'} ${url.slice(0, 80)}`)
      }
    })

    log('3. signing in…')
    await page.goto(`${BASE}/admin/login`)
    await page.getByLabel('Email').fill(process.env.DEV_OPERATOR_EMAIL ?? 'operator@mehfilbox.test')
    await page.getByLabel('Password').fill(process.env.DEV_OPERATOR_PASSWORD ?? 'e2e-operator-password')
    await page.getByRole('button', { name: 'Sign in' }).click()
    await page.getByRole('heading', { name: 'Catalogues' }).waitFor()

    // A throwaway catalogue, so the demo one keeps its shape and its 15-title headroom.
    const catalogue = (await page.evaluate(async () => {
      const response = await fetch('/api/admin/catalogues', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          coupleName: { en: 'Upload & Resume' },
          appName: { en: 'Resume Originals' },
          weddingDate: '2026-12-01',
          slug: `upload-resume-${Date.now().toString(36)}`,
          template: 'films-only',
        }),
      })
      return (await response.json()) as { catalogue: { id: string } }
    })) as { catalogue: { id: string } }

    const catalogueId = catalogue.catalogue.id
    await page.goto(`${BASE}/admin/c/${catalogueId}/titles`)
    await page.getByText('Drop films here').waitFor()

    log('4. starting the upload…')
    await page.setInputFiles('input[type="file"]', FIXTURE)

    const progressBar = page.getByRole('progressbar').first()
    await progressBar.waitFor({ timeout: 30_000 })

    const percent = async (): Promise<number> =>
      Number((await progressBar.getAttribute('aria-valuenow')) ?? 0)

    // Let it get properly under way — past at least one acked chunk.
    const dropAt = 20
    const deadline = Date.now() + 120_000
    while ((await percent()) < dropAt && Date.now() < deadline) {
      await page.waitForTimeout(250)
    }
    const before = await percent()
    if (before < dropAt) throw new Error(`upload never reached ${dropAt}% (stuck at ${before}%)`)
    log('   reached', `${before}%`)

    /** What the operator can see: the row's status word and any message under the bar. */
    const uiState = async (): Promise<string> =>
      (
        await page
          .locator('li', { has: page.getByRole('progressbar') })
          .first()
          .innerText()
      )
        .replace(/\s+/g, ' ')
        .slice(0, 120)

    log('5. dropping the network…')
    await context.setOffline(true)
    await page.waitForTimeout(4000)
    const whileOffline = await percent()
    log('   offline at', `${whileOffline}%`)
    log('   ui:', await uiState())

    log('6. restoring the network…')
    await context.setOffline(false)

    // tus-js-client backs off exponentially, so give it room to retry before judging.
    let after = whileOffline
    const resumeDeadline = Date.now() + 120_000
    let lastReport = 0
    while (Date.now() < resumeDeadline) {
      after = await percent()
      if (after >= 100) break
      if (after < whileOffline - 5) {
        throw new Error(`RESTARTED — fell back to ${after}% from ${whileOffline}%`)
      }
      if (Date.now() - lastReport > 15_000) {
        lastReport = Date.now()
        log('   …', `${after}% · ${await uiState()}`)
      }
      await page.waitForTimeout(1000)
    }
    log('   resumed to', `${after}%`)
    log('   ui:', await uiState())

    if (consoleErrors.length > 0) {
      log('   browser errors:')
      for (const e of [...new Set(consoleErrors)].slice(0, 6)) console.log(`     ${e}`)
    }

    // Which title row did this create, and did it reach Bunny?
    const titles = (await page.evaluate(async (id) => {
      const response = await fetch(`/api/admin/catalogues/${id}`)
      return (await response.json()) as { titles: { id: string; providerId: string | null }[] }
    }, catalogueId)) as { titles: { id: string; providerId: string | null }[] }

    createdTitleId = titles.titles[0]?.id
    providerId = titles.titles[0]?.providerId ?? undefined

    console.log()
    if (after >= 100 && after > whileOffline) {
      log('PASS — the upload survived a network drop and resumed from where it stopped.')
      log(`  dropped at ${whileOffline}%, finished at ${after}%, never restarted`)
    } else if (after >= 100) {
      log('PASS (weakly) — the upload completed, but it was already at 100% when the network')
      log('  came back, so resumption was not actually exercised. Try a larger fixture.')
    } else {
      console.error(`FAIL — the upload stalled at ${after}% and never recovered.`)
      console.error('  tus-js-client should retry with backoff and resume from the last acked')
      console.error('  offset. Check retryDelays and the fingerprint store in UploadManager.')
      process.exitCode = 1
    }

    // Clean up the catalogue regardless.
    await page.evaluate(async (id) => {
      await fetch(`/api/admin/catalogues/${id}/publish`, { method: 'DELETE' })
    }, catalogueId)
    if (createdTitleId) {
      await page.evaluate(async (id) => {
        await fetch(`/api/admin/titles/${id}`, { method: 'DELETE' })
      }, createdTitleId)
    }
  } finally {
    await browser?.close().catch(() => {})
    server?.kill('SIGTERM')
    if (existsSync(FIXTURE)) unlinkSync(FIXTURE)

    // Belt and braces: the title delete above also removes the Bunny asset, but if the run
    // failed before that point the video would linger and cost storage.
    if (providerId && LIBRARY && API_KEY) {
      await fetch(`https://video.bunnycdn.com/library/${LIBRARY}/videos/${providerId}`, {
        method: 'DELETE',
        headers: { AccessKey: API_KEY },
      }).catch(() => {})
    }
    console.log('\ncleaned up')
  }
}

void main()
