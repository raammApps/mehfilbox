#!/usr/bin/env tsx
/**
 * N-5 — gate LCP and CLS on the page every guest lands on (doc 05 §1, doc 09 P1-14).
 *
 * First-load JS is already gated by `check:bundle`, and playback start is measured in production
 * telemetry. What nothing watched was **layout**: a hero image that arrives late, or a row that
 * pushes the page down after paint. Both are invisible to a bundle budget and obvious to a guest.
 *
 * ## Why this is not Lighthouse
 *
 * NEXT.md called for Lighthouse CI, and this deliberately is not it. Lighthouse's headline
 * numbers come from a *simulated* throttling model applied to one cold load on whatever CPU the
 * runner happened to give us — a number that moves several hundred milliseconds between
 * identical commits. Gating on it means either a threshold so loose it catches nothing, or a
 * flaky red build that gets muted within a fortnight.
 *
 * Instead this reads the same two metrics from the browser's own `PerformanceObserver` — the
 * identical entry types Lighthouse reads — under explicit CPU and network throttling, and takes
 * the **worst of several runs**. Playwright is already a dependency, so it also adds nothing to
 * install.
 *
 * Playback start stays out of CI entirely: doc 10 §3 M-9 keeps the authoritative number on a
 * real phone on real 4G, and CI hardware cannot honestly produce it.
 *
 *   pnpm build && pnpm check:vitals
 */
import { spawn, type ChildProcess } from 'node:child_process'
import { chromium } from '@playwright/test'
import { BROWSE_LCP_MS, CLS } from '../lib/budgets'

const PORT = 3210
const BASE = `http://localhost:${PORT}`
const CATALOGUE = 'aanya-vikram'
const RUNS = 3

/**
 * Throttling, chosen to be *reproducible* rather than realistic.
 *
 * A mid-range Android on 4G is the real target and doc 10 §3 M-9 owns that measurement on real
 * hardware. This exists to catch a regression, so what matters is that two runs of the same
 * commit agree. 4× CPU and a 4G-ish pipe are enough to expose a layout problem without making
 * the result a property of the runner's mood.
 */
const CPU_SLOWDOWN = 4
const NETWORK = {
  offline: false,
  downloadThroughput: (4 * 1024 * 1024) / 8,
  uploadThroughput: (1 * 1024 * 1024) / 8,
  latency: 80,
}

type Vitals = { lcpMs: number; cls: number }

function startServer(): ChildProcess {
  return spawn('pnpm', ['start'], {
    env: {
      ...process.env,
      PORT: String(PORT),
      NODE_ENV: 'production',
      DATA_DRIVER: 'memory',
      ALLOW_EPHEMERAL_DATA: '1',
      VIDEO_DRIVER: 'fake',
      ROOT_DOMAIN: `mehfilbox.localhost:${PORT}`,
      SESSION_SECRET: 'vitals-session-secret-0123456789abcdefghij',
      DEV_OPERATOR_PASSWORD: 'vitals-operator-password',
    },
    stdio: 'ignore',
  })
}

async function waitForServer(): Promise<void> {
  for (let attempt = 0; attempt < 120; attempt++) {
    try {
      const response = await fetch(`${BASE}/api/health`)
      if (response.ok) return
    } catch {
      // Not up yet.
    }
    await new Promise((resolve) => setTimeout(resolve, 500))
  }
  throw new Error('the built app did not come up on time')
}

async function measure(): Promise<Vitals> {
  const browser = await chromium.launch()
  try {
    const context = await browser.newContext({
      viewport: { width: 390, height: 844 },
      deviceScaleFactor: 2,
      isMobile: true,
      hasTouch: true,
    })

    // The profile gate is a full-screen overlay on a first visit. Measuring it would measure the
    // gate, not the catalogue — and a returning guest is the common case anyway.
    await context.addInitScript((slug) => {
      window.localStorage.setItem(`mehfilbox.profile.${slug}`, 'skipped')
    }, CATALOGUE)

    const page = await context.newPage()

    const cdp = await context.newCDPSession(page)
    await cdp.send('Emulation.setCPUThrottlingRate', { rate: CPU_SLOWDOWN })
    await cdp.send('Network.enable')
    await cdp.send('Network.emulateNetworkConditions', NETWORK)

    /**
     * Registered before navigation with `buffered: true`, so entries emitted during the load —
     * which is all of the interesting ones — are not missed by a listener that attached late.
     */
    await page.addInitScript(() => {
      const store = { lcp: 0, cls: 0 }
      ;(window as unknown as { __vitals: typeof store }).__vitals = store

      new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) store.lcp = Math.max(store.lcp, entry.startTime)
      }).observe({ type: 'largest-contentful-paint', buffered: true })

      new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) {
          const shift = entry as PerformanceEntry & { value: number; hadRecentInput: boolean }
          // A shift the guest caused by tapping is not a layout bug.
          if (!shift.hadRecentInput) store.cls += shift.value
        }
      }).observe({ type: 'layout-shift', buffered: true })
    })

    await page.goto(`${BASE}/?__catalogue=${CATALOGUE}`, { waitUntil: 'load' })

    // LCP is only final once the page stops changing. Rows lazy-load, so give them a moment and
    // let any late shift land in CLS rather than being measured as a pass.
    await page.waitForTimeout(3000)

    const vitals = await page.evaluate(
      () => (window as unknown as { __vitals: Vitals & { lcp: number } }).__vitals,
    )
    return { lcpMs: Math.round((vitals as unknown as { lcp: number }).lcp), cls: vitals.cls }
  } finally {
    await browser.close()
  }
}

async function main(): Promise<void> {
  const server = startServer()

  try {
    await waitForServer()

    const runs: Vitals[] = []
    for (let run = 1; run <= RUNS; run++) {
      const vitals = await measure()
      runs.push(vitals)
      console.log(`  run ${run}: LCP ${vitals.lcpMs}ms · CLS ${vitals.cls.toFixed(3)}`)
    }

    // Worst of the runs. A budget that only holds on a lucky load is not a budget.
    const lcpMs = Math.max(...runs.map((r) => r.lcpMs))
    const cls = Math.max(...runs.map((r) => r.cls))

    console.log()
    const lcpOk = lcpMs <= BROWSE_LCP_MS
    const clsOk = cls <= CLS
    console.log(`  LCP  ${lcpMs}ms / ${BROWSE_LCP_MS}ms   ${lcpOk ? '✓' : '✗'}`)
    console.log(`  CLS  ${cls.toFixed(3)} / ${CLS}        ${clsOk ? '✓' : '✗'}`)

    if (lcpOk && clsOk) {
      console.log('\nWithin budget.')
      return
    }

    console.log()
    if (!lcpOk) {
      console.error(`FAIL — the largest element took ${lcpMs}ms to paint, past ${BROWSE_LCP_MS}ms.`)
      console.error('  Usually the billboard image: check its priority, its dimensions, and that')
      console.error('  it is not waiting behind JavaScript that could have been deferred.')
    }
    if (!clsOk) {
      console.error(`FAIL — the page shifted by ${cls.toFixed(3)}, past ${CLS}.`)
      console.error('  Something is arriving without reserved space. Poster cards and the')
      console.error('  billboard need intrinsic dimensions so the row does not resize on load.')
    }
    process.exitCode = 1
  } finally {
    server.kill('SIGTERM')
  }
}

void main()
