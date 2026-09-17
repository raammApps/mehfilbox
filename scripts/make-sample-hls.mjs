#!/usr/bin/env node
/**
 * Generate a real, playable HLS package for the `fake` video driver (N-90).
 *
 * Why this exists: `useHlsPlayback.ts`'s `isManifest` check only sends a URL through `hls.js`,
 * `MediaSource` and `blob:` when it ends in `.m3u8`. `sample.webm` — everything the fake driver
 * served until now — never did, so no unit test, no component test, and no E2E run in this
 * repository ever exercised the actual streaming path a guest's browser runs. That is exactly
 * the gap that let a broken `Content-Security-Policy` reach production behind an all-green
 * suite on 18 September 2026 (`docs/PROGRESS.md`, N-86).
 *
 * Why generated, not ffmpeg, not a stock clip: doc 12 §1's licence rule and doc 13 §8's "no
 * footage of strangers" rule apply here exactly as they did to `make-sample-video.mjs`, and this
 * environment has no `ffmpeg` binary to begin with. What it has is a real H.264 encoder, inside
 * Chromium's own `MediaRecorder` — confirmed by hand before writing this script:
 * `MediaRecorder.isTypeSupported('video/mp4;codecs=avc1.42E01E')` is `true` on the Chromium
 * Playwright bundles, and recording produces genuine, spec-shaped ISO-BMFF: `ftyp`+`moov` once,
 * then a handful of `moof`+`mdat` fragment pairs — inspected byte-for-byte, not assumed.
 *
 * Two things were checked by hand, not assumed, and both matter to how this script works:
 *
 *   1. `requestData()` does *not* flush a fragment on demand for this codec — a diagnostic that
 *      called it every second for 18s got back an empty chunk every time except the very first
 *      (a bare 36-byte `ftyp`) and one enormous chunk when `stop()` finally fires. Every real
 *      fragment ships in that final chunk regardless of when `requestData()` was called, so this
 *      script no longer calls it at all — it just records for `durationMs` and stops.
 *   2. Chrome's own muxer decides fragment boundaries (empirically one every ~4s here, ~100
 *      video frames — a fixed internal GOP length, not something this script controls), so the
 *      number of `.m4s` files and their durations cannot be read off the recording loop. They
 *      are read off the fragments themselves: each `moof/traf/trun` box carries an explicit
 *      per-sample duration (confirmed via `trun`'s flags, bit 8 set), and `moov/mdia/mdhd`
 *      carries the track's timescale — together giving each fragment's real duration in seconds,
 *      independent of any wall-clock guess. An earlier version of this script paired fragments
 *      with `performance.now()` gaps between `requestData()` calls instead; that produced a
 *      manifest whose total duration (~8s) was less than half of what was actually encoded
 *      (~18s) — fragments existed on disk but the manifest never pointed at them, and a
 *      pre-existing E2E assertion (`e2e/playback.spec.ts`, seeking to 8s) is what surfaced it,
 *      since nothing about the manifest's *text* looked wrong.
 *
 * The manifest itself needs no library — HLS's fMP4 mode is `#EXT-X-MAP` naming the init segment
 * once, then one `#EXTINF` + URI pair per media segment.
 *
 *   node scripts/make-sample-hls.mjs
 *
 * Re-run only when the clip needs to change; the output (`public/media/hls/`) is committed, the
 * same rule `make-sample-video.mjs` already follows and for the same reason: CI has no browser
 * capable of encoding, only one capable of playing back what was already encoded.
 */
import { mkdir, readdir, rm, writeFile } from 'node:fs/promises'
import { chromium } from '@playwright/test'

// Nominal recording length. The *delivered* duration depends on where Chrome's muxer happens to
// place fragment boundaries (see the file header) rather than on this number directly, so it is
// set with margin over what the existing E2E assertions need: `e2e/playback.spec.ts` seeks as
// far as 8s and needs room before the 0.95 completion threshold in `app/api/progress/route.ts`.
// Re-check the actual `playlist.m3u8` total after changing this — it is not a fixed ratio of
// this constant.
const DURATION_MS = 16_000
const WIDTH = 480
const HEIGHT = 270
const BITRATE = 180_000
const OUT_DIR = 'public/media/hls'

const browser = await chromium.launch()
const page = await browser.newPage()
await page.goto('about:blank')

console.log(`Encoding ${DURATION_MS / 1000}s of H.264 at ${WIDTH}×${HEIGHT}…`)

const { initB64, segments } = await page.evaluate(
  async ({ durationMs, width, height, bitrate }) => {
    const mimeType = 'video/mp4;codecs=avc1.42E01E'
    if (!MediaRecorder.isTypeSupported(mimeType)) {
      throw new Error(`${mimeType} is not supported by this browser — cannot regenerate the HLS fixture here`)
    }

    const canvas = document.createElement('canvas')
    canvas.width = width
    canvas.height = height
    const ctx = canvas.getContext('2d')
    if (!ctx) throw new Error('no 2d context')

    // The same gradient family `make-sample-video.mjs` draws from, so this fixture reads as
    // part of the same visual set rather than a random test pattern.
    const pairs = [
      ['#f2933a', '#d4547e'],
      ['#e0b155', '#4a2350'],
      ['#3b3f8f', '#d4547e'],
    ]
    const draw = (progress) => {
      const pair = pairs[Math.floor(progress * pairs.length) % pairs.length]
      const gradient = ctx.createLinearGradient(0, 0, width, height)
      gradient.addColorStop(0, pair[0])
      gradient.addColorStop(1, pair[1])
      ctx.fillStyle = gradient
      ctx.fillRect(0, 0, width, height)
      ctx.strokeStyle = 'rgba(255,255,255,0.35)'
      ctx.lineWidth = 3
      for (let ring = 1; ring <= 5; ring++) {
        ctx.beginPath()
        ctx.arc(
          width / 2 + Math.cos(progress * Math.PI * 4) * 120,
          height / 2 + Math.sin(progress * Math.PI * 4) * 60,
          ring * 22,
          0,
          Math.PI * 2,
        )
        ctx.stroke()
      }
      // A visible, moving timecode — the point of this fixture is that a seek lands somewhere
      // observably different, the same property E2E-1 already asserts against `sample.webm`.
      ctx.fillStyle = 'rgba(255,255,255,0.9)'
      ctx.font = 'bold 32px monospace'
      ctx.fillText(`${(progress * durationMs / 1000).toFixed(1)}s`, 22, height - 22)
    }
    draw(0)

    const stream = canvas.captureStream(25)
    const recorder = new MediaRecorder(stream, { mimeType, videoBitsPerSecond: bitrate })
    const chunks = []
    recorder.ondataavailable = (event) => {
      if (event.data.size > 0) chunks.push(event.data)
    }
    const stopped = new Promise((resolve) => {
      recorder.onstop = resolve
    })

    recorder.start()
    const startedAt = performance.now()

    let running = true
    const paint = () => {
      const elapsed = performance.now() - startedAt
      draw(Math.min(1, elapsed / durationMs))
      if (running) requestAnimationFrame(paint)
    }
    requestAnimationFrame(paint)

    await new Promise((resolve) => setTimeout(resolve, durationMs))
    running = false
    recorder.stop()
    await stopped

    const toBase64 = (bytes) => {
      let binary = ''
      for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i])
      return btoa(binary)
    }

    /** Every box in `bytes[start,end)` at one level, as `{ type, start, end, bodyStart }`. */
    function childBoxes(bytes, start, end) {
      const boxes = []
      let offset = start
      while (offset + 8 <= end) {
        const view = new DataView(bytes.buffer, bytes.byteOffset + offset, 8)
        const size = view.getUint32(0)
        const type = String.fromCharCode(bytes[offset + 4], bytes[offset + 5], bytes[offset + 6], bytes[offset + 7])
        if (size < 8 || offset + size > end) break
        boxes.push({ type, start: offset, end: offset + size, bodyStart: offset + 8 })
        offset += size
      }
      return boxes
    }
    const findBox = (boxes, type) => boxes.find((b) => b.type === type)
    const u32 = (bytes, off) => new DataView(bytes.buffer, bytes.byteOffset + off, 4).getUint32(0)

    // Concatenated, not read chunk-by-chunk: checked by hand before writing this, Chrome's own
    // muxer does not promise `ftyp` and `moov` arrive in the same `ondataavailable` callback —
    // a first version of this script assumed they did and shipped a 36-byte `ftyp`-only init
    // segment that could never actually initialise a `MediaSource`.
    const all = []
    for (const chunk of chunks) all.push(new Uint8Array(await chunk.arrayBuffer()))
    const totalLength = all.reduce((sum, bytes) => sum + bytes.length, 0)
    const bytes = new Uint8Array(totalLength)
    let cursor = 0
    for (const part of all) {
      bytes.set(part, cursor)
      cursor += part.length
    }

    const topBoxes = childBoxes(bytes, 0, bytes.length)

    // moov/mdia/mdhd's timescale — every trun sample duration below is in these units.
    const moov = findBox(topBoxes, 'moov')
    const trak = findBox(childBoxes(bytes, moov.bodyStart, moov.end), 'trak')
    const mdia = findBox(childBoxes(bytes, trak.bodyStart, trak.end), 'mdia')
    const mdhd = findBox(childBoxes(bytes, mdia.bodyStart, mdia.end), 'mdhd')
    const mdhdVersion = bytes[mdhd.bodyStart]
    const timescale = mdhdVersion === 1 ? u32(bytes, mdhd.bodyStart + 20) : u32(bytes, mdhd.bodyStart + 12)

    // moov/mvex/trex's default sample duration — the fallback for the rare case a `trun` doesn't
    // carry explicit per-sample durations (it does here; checked below, not assumed).
    const mvex = findBox(childBoxes(bytes, moov.bodyStart, moov.end), 'mvex')
    const trex = mvex && findBox(childBoxes(bytes, mvex.bodyStart, mvex.end), 'trex')
    const defaultSampleDuration = trex ? u32(bytes, trex.bodyStart + 8) : 0

    /** Real duration of one `moof`'s track fragment, in timescale ticks, from its own `trun`. */
    function fragmentDurationTicks(moofBox) {
      const traf = findBox(childBoxes(bytes, moofBox.bodyStart, moofBox.end), 'traf')
      const trun = traf && findBox(childBoxes(bytes, traf.bodyStart, traf.end), 'trun')
      if (!trun) return 0
      const flags = (bytes[trun.bodyStart + 1] << 16) | (bytes[trun.bodyStart + 2] << 8) | bytes[trun.bodyStart + 3]
      const sampleCount = u32(bytes, trun.bodyStart + 4)
      const hasDataOffset = (flags & 0x000001) !== 0
      const hasFirstSampleFlags = (flags & 0x000004) !== 0
      const hasDuration = (flags & 0x000100) !== 0
      const hasSize = (flags & 0x000200) !== 0
      const hasFlags = (flags & 0x000400) !== 0
      const hasCto = (flags & 0x000800) !== 0
      if (!hasDuration) return sampleCount * defaultSampleDuration

      let cursor = trun.bodyStart + 8
      if (hasDataOffset) cursor += 4
      if (hasFirstSampleFlags) cursor += 4
      let total = 0
      for (let i = 0; i < sampleCount; i += 1) {
        total += u32(bytes, cursor)
        cursor += 4
        if (hasSize) cursor += 4
        if (hasFlags) cursor += 4
        if (hasCto) cursor += 4
      }
      return total
    }

    let initEnd = 0
    const fragments = []
    for (let b = 0; b < topBoxes.length; b += 1) {
      if (topBoxes[b].type === 'ftyp' || topBoxes[b].type === 'moov') {
        initEnd = topBoxes[b].end
        continue
      }
      if (topBoxes[b].type !== 'moof') continue
      const next = topBoxes[b + 1]
      if (!next || next.type !== 'mdat') continue
      const durationS = fragmentDurationTicks(topBoxes[b]) / timescale
      fragments.push({ bytes: bytes.slice(topBoxes[b].start, next.end), durationS })
    }
    const initBytes = bytes.slice(0, initEnd)

    const segments = fragments.map((f) => ({ base64: toBase64(f.bytes), durationS: f.durationS }))

    return { initB64: toBase64(initBytes), segments }
  },
  { durationMs: DURATION_MS, width: WIDTH, height: HEIGHT, bitrate: BITRATE },
)

await browser.close()

// A run that produces fewer segments than the last one would otherwise leave the extra old
// `.m4s` files behind, unreferenced by the new manifest but still sitting in the directory.
await mkdir(OUT_DIR, { recursive: true })
for (const entry of await readdir(OUT_DIR)) await rm(`${OUT_DIR}/${entry}`)
await writeFile(`${OUT_DIR}/init.mp4`, Buffer.from(initB64, 'base64'))

const targetDuration = Math.max(1, Math.ceil(Math.max(...segments.map((s) => s.durationS))))
const lines = [
  '#EXTM3U',
  '#EXT-X-VERSION:7',
  `#EXT-X-TARGETDURATION:${targetDuration}`,
  '#EXT-X-PLAYLIST-TYPE:VOD',
  '#EXT-X-MAP:URI="init.mp4"',
]

let totalBytes = Buffer.byteLength(initB64, 'base64')
let totalDurationS = 0
for (const [i, segment] of segments.entries()) {
  const name = `segment-${String(i).padStart(3, '0')}.m4s`
  const buffer = Buffer.from(segment.base64, 'base64')
  await writeFile(`${OUT_DIR}/${name}`, buffer)
  totalBytes += buffer.length
  totalDurationS += segment.durationS
  lines.push(`#EXTINF:${segment.durationS.toFixed(3)},`, name)
}
lines.push('#EXT-X-ENDLIST', '')

await writeFile(`${OUT_DIR}/playlist.m3u8`, lines.join('\n'))

console.log(
  `Wrote ${OUT_DIR}/ — init.mp4 + ${segments.length} segments, ${totalDurationS.toFixed(1)}s, ${(totalBytes / 1024).toFixed(0)}KB total`,
)
