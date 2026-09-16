# Subsystem map — `media-infra` (media pipeline and infrastructure)

Mapped 16 September 2026 against the code on `main` (HEAD `96fb305`). Where a document and the
code disagree, the code is what is described and the disagreement is listed in §7. Line numbers
refer to the files as read on this date.

---

## 1. Summary

`media-infra` is everything between an operator's file picker and a guest's play button, plus the
scaffolding that keeps it running unattended: the `VideoProvider`/`PhotoProvider` seams and their
Bunny drivers (`lib/video/**`, `lib/photos/**`), the resumable-upload route and the client that
drives it, the signed webhook that learns when a transcode finishes, six cron jobs (two on Vercel,
four on GitHub Actions) that reconcile stuck uploads, roll up usage, drain the notification queue,
walk the lapse ladder, queue expiry warnings and prove a guest can actually watch something, the
`Repository` seam that lets all of this run against Postgres in production and an in-memory store
everywhere else, and the deploy tooling (`scripts/*`, `vercel.json`, `Dockerfile`,
`.github/workflows/ci.yml`) that puts it in front of a planner. The direct users are a studio
operator (uploads, titles, deletes), a guest (plays a film, sees a photograph), Bunny itself
(calls back in on the webhook), and whoever runs `pnpm preflight` before trusting a deployment.
The most consequential finding on this map is not in any doc: the Supabase repository driver — the
one production runs on — silently ignores the "wait for Publish" gate for both titles and
photographs, and nothing in the test suite catches it (§7.1).

## 2. Actors

| Actor | How they appear in code | What they can reach |
|---|---|---|
| **Studio/couple operator** | `requireEditableCatalogue()` (`lib/admin/session.ts:115`) | `POST /api/admin/uploads`, the Titles and Photographs screens, retry/delete/reorder |
| **Guest** | No auth; gated by `lib/catalogue-access.ts` | `POST /api/playback/token`, `GET /api/poster/[titleId]`, the cached catalogue bundle |
| **Bunny Stream** | Calls back on `POST /api/webhooks/bunny`, signature-verified | Nothing pulled; only pushes a "something changed" notification |
| **Vercel Cron** | `Authorization: Bearer $CRON_SECRET`, no header at all if unset | `GET /api/cron/reconcile` (daily 02:00 UTC), `GET /api/cron/usage` (daily 03:30 UTC) — the only two `vercel.json` has room for (`vercel.json:9-18`) |
| **GitHub Actions scheduler** | Same bearer, from `.github/workflows/{notify-drain,synthetic-check}.yml` | `GET /api/cron/{lifecycle,warnings,notify}` every 15 min / at 03:40 UTC, `GET /api/cron/synthetic` hourly — the four jobs Vercel's Hobby plan has no room for (N-54) |
| **CI (GitHub Actions)** | `DATA_DRIVER=memory, VIDEO_DRIVER=fake` (`.github/workflows/ci.yml:14-18`) | Runs the whole suite against the fake driver; never touches Bunny or Supabase |
| **A developer running a script** | Reads `.env.local` directly, bypasses `lib/env.ts` entirely (`.eslintrc.json:22-25` exempts `scripts/**`) | `pnpm preflight`, `pnpm verify:playback`, `pnpm verify:upload`, `pnpm backfill:sizes`, `pnpm repoint:photos`, `pnpm bootstrap:sql`, `pnpm db:migrate` |
| **Platform admin** | Reads `job_runs` via the platform Health page (`lib/health/probes.ts`, mapped in `platform`) | Not a writer here; the consumer of what this subsystem records |

## 3. Capabilities

Video provider seam and Bunny driver

- A five-method interface (`createUpload`, `getPlaybackToken`, `getStatus`, `getAssetUrl`, `getDownloadUrl`, `deleteAsset`, `getUsage`, `verifyWebhook` — seven, the doc-comment undercounts) with every Bunny type stopped at the file — `lib/video/provider.ts:71-126`.
- `createUpload`: `POST /library/<id>/videos` then a TUS creation signature `sha256(libraryId+apiKey+expiry+guid)`, 24h expiry, so the API key never reaches the browser — `lib/video/bunny.ts:62-94`.
- `getPlaybackToken`/`getAssetUrl` sign the **directory**, not the file — `?token=base64url(sha256(key+"/guid/"+expires))&expires=` — because HLS immediately fetches a child playlist under the same path, and a file-scoped token 403s there; verified live by `pnpm verify:playback` — `lib/video/bunny.ts:96-148`.
- `getStatus` maps Bunny's numeric status to `uploading|processing|ready|failed` and reads `storageSize` for both the ready-title size and the usage rollup from one call — `lib/video/bunny.ts:20-28,164-195`.
- `getDownloadUrl` HEAD-probes `/original` and falls back to the highest available rendition, labelling which one was handed over — `lib/video/bunny.ts:197-228`; consumed by `lib/downloads.ts` (out of this map's scope).
- `verifyWebhook`: HMAC-SHA256 of the **raw** body with the library's **read-only** key, `timingSafeEqual`, hex in `x-bunnystream-signature` — `lib/video/bunny.ts:264-304`.
- One switch on driver, memoized on `globalThis` so dev's hot reload does not lose it — `lib/video/index.ts:6-18`.
- `posterRoute`: turns a provider-relative file name into a stable, never-expiring app URL, because a signed URL persisted in `titles.poster_url` would work today and 403 in four hours — `lib/video/index.ts:20-28`.
- `FakeVideoProvider`: deterministic uploading→processing→ready on a 1.5s timer, a bundled sample clip for playback, and a webhook signer keyed on `SESSION_SECRET` — a first-class driver, not a mock, so CI/E2E/an offline demo exercise the same code paths as production — `lib/video/fake.ts:20-142`.

Upload path

- `POST /api/admin/uploads`: container/extension check, 20GB per-file cap (`MAX_UPLOAD_BYTES`), storage-quota check against real stored bytes, creates the Bunny asset, writes a `titles` row at `status='uploading'` before a single byte moves — `app/api/admin/uploads/route.ts:32-126`.
- Resumable TUS upload straight from the browser to Bunny — bytes never touch the Next.js server — `tus-js-client`, 5MB chunks (`TUS_CHUNK_BYTES`), parallelism 2, five-step retry backoff (0/2s/6s/15s/30s), resumes on the `online` event, `beforeunload` warns (does not block) — `components/admin/UploadManager.tsx:35-225`.
- `onShouldRetry` treats a bare network failure (no HTTP response at all) as always retryable and only gives up on a real 4xx that is not 409/423 (tus offset conflicts) — `components/admin/UploadManager.tsx:145-155`.
- Pre-flight rejection before any request: unsupported container, > 20GB — `components/admin/UploadManager.tsx:241-248`, `lib/video/provider.ts:128-151`.
- Per-catalogue unique slug from the filename, frozen forever (N-84, §7) — `app/api/admin/uploads/route.ts:81,129-136`, `lib/format.ts`.

Transcode and ready path

- Signed webhook handler, idempotent (re-delivering an already-recorded state is a no-op), asks `getStatus` for the truth rather than trusting the webhook's own status enum (Bunny's webhook calls "Finished" 3, the API calls it 4) — `app/api/webhooks/bunny/route.ts:17-81`.
- On `ready`: writes `titles.status/duration_s/poster_candidates/poster_url(unless custom)/poster_source/thumbnails_url`, busts the guest cache tag — `app/api/webhooks/bunny/route.ts:50-69`.
- Nightly reconcile: polls the provider for anything stuck in `uploading`/`processing` past `RECONCILE_STALL_MINUTES` (default 120), settles it either way, alerts ops the moment it has to settle even one — evidence the webhook is not arriving — `app/api/cron/reconcile/route.ts:14-124`.
- Operator-triggered retry: re-polls the provider for one title by hand — `app/api/admin/titles/[id]/retry/route.ts:19-47`.
- Title delete removes the Bunny asset (best-effort) before the row — `app/api/admin/titles/[id]/route.ts:65-78`.

Playback path

- `POST /api/playback/token`: authorises via `requireServableCatalogue` (the one guest-access gate, `lib/catalogue-access.ts`), rate-limited 60/60s per catalogue+IP, mints a token scoped to catalogue **and** title, looks up resume position — target p99 < 120ms — `app/api/playback/token/route.ts:1-64`.
- Gates on `title.published && title.status==='ready'` — **not** `title.liveAt` (§7.3) — `app/api/playback/token/route.ts:35-41`.
- `GET /api/poster/[titleId]`: mints a fresh signed URL and 302-redirects (never proxies), gated by the same catalogue servability so a draft/lapsed wedding's stills do not leak — `app/api/poster/[titleId]/route.ts:1-71`.
- `GET /api/poster/frame`: deterministic SVG placeholder for the fake driver and demo photos, no provider call — `app/api/poster/frame/route.ts:1-30`.

Photo provider seam and Bunny storage

- A three-method interface (`put`, `remove`, `urlFor`) — deliberately smaller than video's: no transcode, no webhook, no signed playback, and bytes proxy through the app because authenticating a browser PUT would mean shipping the storage zone's write/delete password to the client — `lib/photos/provider.ts:1-39`.
- `BunnyPhotoProvider`: writes to the **origin** (`<region>.storage.bunnycdn.com`, password-authenticated), reads through the **pull zone** (`<zone>.b-cdn.net`, public, unsigned — see §7.2) — `lib/photos/bunny.ts:1-68`.
- Regional origin resolver: `de` (Bunny's default) carries no prefix, every other code does — `lib/photos/bunny.ts:21-24`.
- `photoKey`: lays out storage as `c/<catalogueId>/w<width>/<photoId>.<ext>` — the width in the path is what lets `photoSrcSet` derive the whole set from one master with no extra column — `lib/photos/index.ts:35-42`.
- `defaultAlbumId`: RFC-4122-v5 deterministic id from `catalogueId`, so three parallel first-uploads racing to create the catalogue's one default album collide on the primary key instead of creating three — `lib/photos/index.ts:54-61`.
- `photoSrcSet`: derives `srcset` from a stored URL, empty (not broken) for anything uploaded before renditions existed; deliberately import-free so it is safe in a client bundle — `lib/photos/srcset.ts:1-28`.
- `FakePhotoProvider`: in-memory `Map`, a `.list()` test affordance — `lib/photos/fake.ts:1-29`.

Photo upload path

- Client cuts one decode into three JPEG renditions (2048/1024/480px, quality .88/.84/.82, never upscaled) plus a ≤4000-byte inline LQIP data URI from a 16px canvas — one `createImageBitmap` call, no server-side image processing at all — `components/admin/PhotoManager.tsx:41-116`.
- All three renditions plus metadata go up as one multipart `FormData` POST, because Vercel's ~4.5MB body cap applies before the route runs and the whole set has to clear it in one request — `components/admin/PhotoManager.tsx:150-165`.
- `POST /api/admin/catalogues/[id]/photos`: MIME allow-list (jpeg/png/webp/avif), 4MB per file (`MAX_BYTES`), storage-quota check counting every rendition, race-safe default-album creation, three `provider.put()` calls — `app/api/admin/catalogues/[id]/photos/route.ts:44-203`.
- Caption edit on blur — `PATCH /api/admin/photos/[id]` — `photos.caption` — `app/api/admin/photos/[id]/route.ts:24-44`.
- Delete removes the row, then **only the master rendition's file** (§7.5) — `app/api/admin/photos/[id]/route.ts:46-68`.

Publish gate (films and photos wait for Publish, N-57)

- `titles.live_at` / `photos.live_at`: null means the guest cannot see the row "whatever else is true of it" — `supabase/migrations/0012_content_waits_for_publish.sql:8-9`; the same promise, verbatim, in the Zod schema's own doc-comment — `lib/schema.ts:461-462`.
- `publishCatalogueContent`: promotes ready+ticked titles and not-yet-live photos to `live_at=now()`, withdraws un-ticked or no-longer-ready titles, in one call from the catalogue Publish route — `lib/db/repository.ts:110-116`, implemented at `lib/db/supabase-repository.ts:940-982` / `lib/db/memory-repository.ts:934+`.
- **On the Supabase driver, the read side of this gate does not exist** for either table (§7.1) — the single most consequential gap on this map.

Repository seam and driver parity

- One interface, three drivers, switched on `DATA_DRIVER` and memoized per process — `lib/db/index.ts:19-48`.
- `MemoryRepository`: the reference implementation; `listTitles({publishedOnly})` filters on `status==='ready' && liveAt!==null` with an explicit comment explaining why `published` alone is wrong — `lib/db/memory-repository.ts:742-759`; `listPhotosForCatalogue({liveOnly})` filters on `liveAt!==null` — `lib/db/memory-repository.ts:914-926`.
- `FileRepository`: `MemoryRepository` plus a debounced (120ms), atomic (temp-file-then-rename) JSON write, so it inherits the correct filtering above for free — `lib/db/file-repository.ts:1-62`.
- `SupabaseRepository`: the production driver. `listTitles({publishedOnly})` is `.eq('published',true).eq('status','ready')` — no `live_at` — `lib/db/supabase-repository.ts:1390-1396`. `listPhotosForCatalogue` does not even accept the `liveOnly` parameter the interface declares — `lib/db/supabase-repository.ts:1625-1631`.
- `job_runs`/`usage_rollup` read and write paths on all three drivers — `lib/db/repository.ts:141-145,384-397`.

Jobs and scheduling

- `runJob`: every cron's work runs through this, which records a `job_runs` row (`job, startedAt, finishedAt, ok, detail`) whether the work throws or returns `{ok:false}`, and never lets a recording failure fail the job itself — `lib/jobs/run.ts:18-46`.
- The registry of what should be running and how often, read by the platform Health page — `lib/jobs/run.ts:49-56`.
- Six jobs total; only two fit on Vercel's Hobby cron limit (§6, §7.6) — `reconcile`, `usage` in `vercel.json:9-18`; `notify`, `synthetic`, `lifecycle`, `warnings` driven from GitHub Actions instead.
- `cron/usage`: per-catalogue monthly rollup (`usage_rollup.stored_gb/delivered_gb/watch_seconds`) plus a `warn`-level (not `error`) alert at ≥300GB delivered in a month — flaunted hard, or the link leaked — `app/api/cron/usage/route.ts:1-103`.
- `cron/synthetic`: walks a real guest's path — resolve → load bundle → find a ready film → mint a playback token — against `DEMO_CATALOGUE_SLUG`, hourly, and emails ops on the first failing step; deliberately does not fetch the actual manifest, since that would make a Bunny edge hiccup page the app for Bunny's own outage — `app/api/cron/synthetic/route.ts:1-107`.
- Cache revalidation is tag-based (`unstable_cache` + `revalidateTag`), one tag per catalogue slug, called from every write a guest's view depends on; a `CACHE_GENERATION` string is folded into the cache key so a shape change does not serve a stale field as `undefined` after a deploy — `lib/catalogue-cache.ts:23-85`.

Logging and observability

- One structured-JSON logger; automatically redacts any field whose key matches `/passcode|password|token|secret|signature|authorization|apikey|api_key/i`, recursively — `lib/log.ts:12-26`.
- Vendor-neutral error-reporting seam; swappable sink, default sink logs `error.report` with a 6-frame-trimmed stack — `lib/observability.ts:15-71`; every route's uncaught error passes through it via the shared `route()` wrapper — `lib/http/handler.ts:10-33`.
- `requestId`: prefers Vercel's own `x-vercel-id` so a log line here lines up with the platform's record of the same request — `lib/observability.ts:79-85`.

Environment and configuration

- One Zod schema, one module, validated once at boot, `server-only` (was once pulled into the browser bundle transitively through `lib/log`) — `lib/env.ts:1-14`.
- Cross-field guards specific to this subsystem: `VIDEO_DRIVER=bunny` requires four Bunny vars, `PHOTO_DRIVER=bunny` requires three more, `DATA_DRIVER=supabase` requires the three Supabase vars and refuses `NOTIFY_DRIVER=fake` (a fake mailer against a real database writes `sent` rows for messages nobody received) — `lib/env.ts:189-292`.
- A production boot additionally refuses the example `SESSION_SECRET`, the committed dev password, and any non-Supabase data driver without an explicit `ALLOW_EPHEMERAL_DATA=1` opt-in — `lib/env.ts:294-324`.
- Scripts under `scripts/**` are lint-exempted from the "process.env only in lib/env.ts" rule and read `.env.local`/`process.env` directly — a deliberate carve-out, not an oversight — `.eslintrc.json:22-25`; this is how `preflight.ts` can diagnose a *partially* configured environment that `lib/env.ts` would refuse to boot at all.

Deploy tooling

- `pnpm preflight`: read-only, probes Supabase schema, Bunny library/token-auth/referrer settings, and the photo zone/CDN with an actual write+read; distinguishes an account key from a library key by which endpoint accepts it — `scripts/preflight.ts:1-390`.
- `pnpm verify:playback`: uploads a real clip to the configured Bunny library, waits for encode, then asserts a signed manifest, a signed **child** playlist (the step a manifest-only check would miss), a signed poster, an unsigned 403 on all three, and a real `hls.js` player reaching decoded frames — `scripts/verify-bunny-playback.ts:1-260+`.
- `pnpm verify:upload`: boots a real production build on `VIDEO_DRIVER=bunny`, drives a real upload in a real browser, drops the network mid-transfer, restores it, and asserts the percentage never falls back below where it was — the one behaviour a stubbed provider cannot prove — `scripts/verify-upload-resume.ts:1-241`.
- `pnpm backfill:sizes`: fills `titles.size_bytes` for films that reached `ready` before migration 0007 existed, since `reconcile` only ever looks at non-terminal rows and would never revisit them — report-only by default, `--write` to save — `scripts/backfill-sizes.ts:1-19`.
- `pnpm repoint:photos`: copies every object to a differently-named storage zone and rewrites `photos.url`, because the old zone's machine-generated name is the one resource visible to guests, in every photograph's URL host — `scripts/repoint-photo-cdn.ts:1-22`.
- `./scripts/deploy-vercel.sh`: pushes every var from the gitignored `.env.vercel.local`, refuses to `vercel link` a project that does not already exist (a past rename silently created and deployed to an empty second project), then deploys and prints the verification checklist — `scripts/deploy-vercel.sh:1-108`.
- `pnpm db:migrate` / `pnpm bootstrap:sql`: neither executes DDL. The first prints the ordered file list for manual `supabase db push` or `psql`; the second concatenates every migration plus a first-org insert into one paste-ready script, because the service-role key cannot run arbitrary SQL over PostgREST and building an `exec_sql` RPC would be a standing remote-DDL hole in a database holding people's weddings — `scripts/migrate.ts:1-21`, `scripts/bootstrap-supabase.ts:1-71`.

## 4. Workflows

### W1 · Upload a film

| # | Step | Where | Data written | Email | Failure modes (what is seen) |
|---|---|---|---|---|---|
| 1 | Drop or pick files | `components/admin/UploadManager.tsx:227-255` | — | — | Rejected before any request: "Not a supported video file", "Larger than the per-file limit". |
| 2 | `POST /api/admin/uploads` | `app/api/admin/uploads/route.ts:32-126` | `titles` row: `status='uploading', name.en=<filename>, category='highlights', provider='bunny', provider_id=<Bunny guid>, size_bytes=<declared>, sort_order` | — | Bad container → 400; > 20GB → 413 `UPLOAD_LIMIT`; over storage quota → 400 "This catalogue holds N GB and M GB is already used. Add storage, or remove a film first."; Bunny unreachable → 500 `INTERNAL` (`lib/video/bunny.ts:56`). |
| 3 | Browser uploads via TUS directly to `video.bunnycdn.com/tusupload` | `components/admin/UploadManager.tsx:130-183` | — (bytes never touch the app server) | — | Network drop → `interrupted`, "Waiting for the network · N%"; a real 4xx (e.g. an expired 24h TUS signature) surfaces via `shortReason()` (`:384-389`). |
| 4 | Provider finishes encoding | webhook (W3) or nightly reconcile (W4) | `titles.status/duration_s/poster_*` | — | See W3/W4. |

### W2 · Resume an interrupted upload

1. tus-js-client's own `urlStorage` persists a fingerprint to the browser's `localStorage`; `findPreviousUploads()` + `resumeFromPreviousUpload()` HEAD the provider for the true offset rather than trusting what the browser remembered before it lost connectivity — `components/admin/UploadManager.tsx:73-91,179-183`.
2. The `online` browser event re-drives every `interrupted` item — deliberately not a longer retry schedule, because the case that actually happens (a laptop asleep for an hour) is not a backoff problem — `components/admin/UploadManager.tsx:200-208`.
3. `beforeunload` shows the browser's own "leave site?" prompt while anything is `uploading`; it warns, it does not prevent a hard close — `components/admin/UploadManager.tsx:219-225`.
4. Verified end to end against real Bunny, with a real network drop, by `pnpm verify:upload` — `scripts/verify-upload-resume.ts:143-205`.
5. Failure a user can hit: the fingerprint lives in **that browser's** `localStorage`. Reopening the titles page on a different device or a cleared profile shows no in-flight item to resume — the byte-level resume is unrecoverable there, though the server-side `uploading` row still exists and will eventually be marked `failed` by reconcile after `RECONCILE_STALL_MINUTES`.

### W3 · Transcode status arrives (the webhook)

1. Bunny `POST`s `/api/webhooks/bunny` with the raw body signed `HMAC-SHA256(readOnlyKey, body)` — `app/api/webhooks/bunny/route.ts:17-27`, `lib/video/bunny.ts:264-304`.
2. Signature check fails closed: bad/missing signature → 401, logged `bunny webhook: rejected unsigned or malformed payload` — nothing written. Unknown `provider_id` → 204, logged warn — nothing written (the provider stops retrying).
3. The payload is trusted only as "something changed" — the handler re-asks `getStatus` for the truth, because Bunny's webhook `Status` enum numbers a finished video differently from its own API (`3` vs `4`) — `app/api/webhooks/bunny/route.ts:37-43`.
4. Idempotency: if the recorded state already matches, 204 and nothing is written — `app/api/webhooks/bunny/route.ts:46-48`.
5. `ready` → `titles.status='ready', duration_s, poster_candidates (via posterRoute), poster_url (unless the operator already pinned a custom one), poster_source, thumbnails_url, error_message=null`, then `revalidateCatalogue(slug)` busts the guest cache tag — `:50-69`. `failed` → `titles.status='failed', error_message` — `:70-75`. Anything else → `titles.status` only — `:76-78`.
6. No email at any step. What an operator sees: the film's row moves from "Processing" to showing a poster on the next refresh, or "N films failed to process" with a Retry button if it failed.

### W4 · Nightly reconcile (the safety net for a lost webhook)

1. Vercel cron `GET /api/cron/reconcile` at `0 2 * * *` — 02:00 UTC, 07:30 IST — `vercel.json:11-13`.
2. Bearer check against `CRON_SECRET` (fallback `SESSION_SECRET`), skipped outside `NODE_ENV=production`; Vercel sends **no header at all** when `CRON_SECRET` is unset, so a forgotten variable reads as a job that silently never runs rather than as an error — `app/api/cron/reconcile/route.ts:26-35`.
3. `runJob('reconcile', …)` wraps the work in a `job_runs` row regardless of outcome — `lib/jobs/run.ts:18-29`.
4. `listStalledTitles(120)`: `status IN ('uploading','processing') AND created_at < now-120min` — `lib/db/supabase-repository.ts:1857-1868`. The only supporting index is a **partial** one covering `status='processing'` only (`supabase/migrations/0001_initial_schema.sql:119`); the `uploading` half of the query — added later, per the code's own comment "now that `uploading` rows are examined too" (`app/api/cron/reconcile/route.ts:62-64`) — has never had a matching index added.
5. For each stalled title: no `provider_id` at all → `status='failed', error_message='The upload never reached the video provider. Upload this film again.'`. Otherwise re-polls `getStatus`; still `processing`/`uploading` → left alone (a six-gigabyte film on a slow line can legitimately outlast the window); `ready`/`failed` → written exactly as the webhook would, cache revalidated on `ready` — `app/api/cron/reconcile/route.ts:42-99`.
6. If **anything** had to be settled this way, `alertOps` emails ops: "transcode webhook is not arriving… check the Bunny library's webhook URL against `ROOT_DOMAIN`" — `:115-121`. Not alerted on `failed` alone, since a genuinely un-encodable film is the operator's problem and already visible in their console.
7. What a user sees: nothing directly for up to 24h if the webhook is broken; then the film simply "catches up" to ready/failed on its own between one page load and the next.

### W5 · Title a film, retry, delete

| # | Step | Where | Data written | Email | Failure modes |
|---|---|---|---|---|---|
| 1 | Edit name/synopsis/category/poster/"Visible to guests" on blur | `PATCH /api/admin/titles/[id]` | `titles.*`; `published=true` also sets `published_at`; choosing a poster pins `poster_source='custom'` | — | `published:true` on a non-`ready` title → 409 `TITLE_NOT_READY` (`app/api/admin/titles/[id]/route.ts:44-46`). |
| 2 | Retry a stuck/failed film | `POST /api/admin/titles/[id]/retry` | Same fields the webhook would write, from one fresh `getStatus` poll | — | No `provider_id` → 400 "This film was never uploaded. Upload it again." (`app/api/admin/titles/[id]/retry/route.ts:26-28`). |
| 3 | Delete | `DELETE /api/admin/titles/[id]` | Row removed | — | Bunny asset delete is best-effort (`.catch(() => {})`) so an already-gone provider asset never blocks the row's removal — `app/api/admin/titles/[id]/route.ts:70-73`. |

### W6 · A guest plays a film

1. The guest's browser already has a servable catalogue's bundle (passcode/draft/lapse checked by `lib/catalogue-access.ts`, out of this map's core scope) and calls `POST /api/playback/token { catalogue, titleSlug, profileId }` — `app/api/playback/token/route.ts:25-64`.
2. Rate-limited 60 requests per 60s per catalogue+IP — `:29`.
3. Title must be `published && status==='ready' && providerId` — **`liveAt` is not checked here** (§7.3) — `:34-41`.
4. `getPlaybackToken` mints a directory-scoped signed URL, TTL = `PLAYBACK_TOKEN_TTL_S` (default 4h), bound to `{catalogueId, titleId}` so one leaked token cannot unlock another film — `lib/video/bunny.ts:96-134`.
5. Response carries `playbackUrl, thumbnailsUrl, durationS, resumeAtS (from playback_progress), expiresAt, captions` — `:56-63`. A guest sees: the player opens and starts within the response's latency budget (target p99 < 120ms server-side), or "This film is still being prepared" (409 `TITLE_NOT_READY`) or "No such film" (404, deliberately identical for unpublished and missing).

### W7 · A poster frame resolves

1. `GET /api/poster/[titleId]?file=thumbnail_1.jpg` — filename validated against `^[a-zA-Z0-9._-]+$` (no path traversal out of the asset's directory) — `app/api/poster/[titleId]/route.ts:36-41`.
2. Gated on the **catalogue's** servability (`ok`, `draft`, or `locked` all count — an operator viewing their own unpublished wedding must still see its posters) — `:53-58`.
3. Mints a fresh signed asset URL (`getAssetUrl`, 1h TTL) and 302-redirects — bytes still come from Bunny's CDN, this is not a proxy — response cached 15 minutes, deliberately shorter than the token TTL so a cached redirect can never outlive the URL it points at — `:60-69`.
4. What a user sees on failure: unknown title or catalogue, or an unservable catalogue → 404 (no image, browser shows a broken-image icon in that slot).

### W8 · Upload a photograph

| # | Step | Where | Data written | Email | Failure modes |
|---|---|---|---|---|---|
| 1 | Drop/pick images | `components/admin/PhotoManager.tsx:137-155` | — | — | Non-image files silently filtered out (`.filter(f => f.type.startsWith('image/'))`). |
| 2 | Client cuts 3 renditions (2048/1024/480px JPEG) + LQIP, from one decode | `components/admin/PhotoManager.tsx:54-116` | — | — | A canvas/decode failure throws "That image could not be read"; LQIP failure is swallowed (a placeholder is a nicety). |
| 3 | One multipart POST with all 3 files | `POST /api/admin/catalogues/[id]/photos` | `photos` row: `album_id (default album, race-safe), url, lqip, width, height, size_bytes (sum of all renditions), sort_order` | — | Wrong MIME → 400; > `MAX_BYTES` (4MB) per file → 400 **"That photograph is larger than 25MB"** — wrong number, the real cap is 4MB (§7.6, `app/api/admin/catalogues/[id]/photos/route.ts:97-98`); over storage quota → 413 `UPLOAD_LIMIT`; Vercel's ~4.5MB platform body limit fires *before* the route runs and is caught client-side and reworded to "Try one under 4MB" (`components/admin/PhotoManager.tsx:171-183`). |
| 4 | Three `provider.put()` calls (master + 2 renditions) | `lib/photos/bunny.ts:37-56` | Bunny storage zone, `c/<catalogueId>/w<width>/<photoId>.jpg` | — | A rendition PUT failure is silently skipped (`if (!(rendition instanceof File) …) continue`) — the master and whichever renditions succeeded are kept; there is no rollback and no retry. |

### W9 · Edit / delete a photograph

1. Caption on blur → `PATCH /api/admin/photos/[id]` → `photos.caption`; ownership proven through the photo's album → catalogue, never from the request — `app/api/admin/photos/[id]/route.ts:24-44`.
2. Delete → `DELETE /api/admin/photos/[id]`: row removed first, then **only the master rendition's storage key** is removed (`photoKeyFromUrl(photo.url)`, no loop over the other widths) — `app/api/admin/photos/[id]/route.ts:46-68`. The `-1024` and `-480` files are never reclaimed by this path (§7.5). Contrast with catalogue-level delete, which correctly loops every width — `app/api/admin/catalogues/[id]/route.ts:170-174`.
3. What a user sees: the photograph disappears from the grid immediately (optimistic removal in `PhotoManager.tsx:233-236`); no failure is ever surfaced (`.catch(() => {})`).

### W10 · Publish carries uploaded content live — and where it silently does not

1. Studio clicks Publish in the customizer (mapped fully in `studio`); the route calls `repository.publishCatalogueContent(catalogueId)` — `app/api/admin/catalogues/[id]/publish/route.ts` (out of this map's file list, cited for context).
2. Interface contract: promote every `published=true, status='ready', live_at IS NULL` title to `live_at=now()`; withdraw every `live_at IS NOT NULL` title that is now `published=false` or not `ready`; promote every not-yet-live photo in the catalogue's albums — `lib/db/repository.ts:110-116`.
3. **On `MemoryRepository`/`FileRepository`** (dev, CI, the whole unit suite): `listTitles({publishedOnly:true})` and `listPhotosForCatalogue({liveOnly:true})` correctly read `live_at`, so a guest never sees a title or photo before this step runs — `lib/db/memory-repository.ts:742-759,914-926`; proven by a dedicated test file whose own header explains why (`tests/unit/content-publishing.test.ts:1-15`).
4. **On `SupabaseRepository`** (production): `listTitles({publishedOnly:true})` checks `published` and `status`, never `live_at` — `lib/db/supabase-repository.ts:1390-1396`; `listPhotosForCatalogue` does not implement `liveOnly` at all and returns every photo in the catalogue, live or not — `lib/db/supabase-repository.ts:1625-1631`. Both are read by the same cached bundle the guest page renders — `lib/catalogue-cache.ts:56-73` — with no re-filtering downstream in the guest modules that consume it (`modules/photo-grid/Guest.tsx:14-16`, `modules/curated-row/index.ts`, `modules/continue-watching/index.ts`).
5. What this means in practice, in production: an operator ticks "Visible to guests" on a freshly-encoded film in the Titles screen — this alone sets `titles.published=true` and, per `app/api/admin/uploads/route.ts:106` and the schema's own comment (`lib/schema.ts:461-462`), is supposed to do **nothing** to what a guest sees until the next catalogue Publish. In production it appears in the guest's browse rows immediately. A newly uploaded photograph appears in the guest gallery the moment the upload finishes, full stop — there is no gate at all on Supabase. See §7.1 for why nothing has caught this.
6. No email at any point in this workflow (it is a cache/read-path issue, not a queue).

### W11 · Usage rollup and the delivery alert

1. Vercel cron `GET /api/cron/usage` at `30 3 * * *` — same bearer pattern as W4 — `app/api/cron/usage/route.ts:29-42`.
2. Walks **every** catalogue on the platform (the one legitimate unscoped read in this subsystem — an ops job, not a request) — `repository.listAllCatalogues()` — `:51`.
3. For each catalogue, sums `provider.getUsage(providerId)` (Bunny's per-video `storageSize` + `watchTimeChart`) across every title, writes `usage_rollup.stored_gb/delivered_gb/watch_seconds` for the current month — `:56-79`. `delivered_gb` is **derived** (`watchSeconds/3600 * GB_PER_HOUR.standard`, 2.15), not measured — Bunny reports watch time per video and never bandwidth, which exists only at the pull-zone level (the whole library) — `lib/video/bunny.ts:234-262`, `lib/entitlements.ts:131`.
4. A catalogue whose usage call throws is logged as a `warning` and skipped; the rest of the rollup continues — `:95-98`.
5. `deliveredGb >= 300` → `log.warn('usage.delivery_alert', …)` — deliberately a warning, not an error, and deliberately not blocking anything: 300GB either means a couple is genuinely watching a lot (good) or a link leaked (worth acting on) — `:82-94`. No email; this is a log line an operator watches for per `docs/DEPLOYMENT.md:317-320`.

### W12 · Synthetic guest-path check

1. GitHub Actions `GET /api/cron/synthetic` hourly (`17 * * * *`) — `.github/workflows/synthetic-check.yml:10-13`.
2. Four steps, stopping at the first failure: resolve `DEMO_CATALOGUE_SLUG` via `resolveAccess` (must be `kind: 'ok'`), load its cached bundle, find a title that is `status==='ready'` with a `providerId`, mint a real playback token — `app/api/cron/synthetic/route.ts:52-91`.
3. Deliberately does **not** fetch the manifest from the CDN — that would make a Bunny edge hiccup page the app for Bunny's own outage; the token is where the app's responsibility ends — `:29-31` (doc-comment).
4. Any failing step → `alertOps` emails ops naming the step and detail, response is 503, and the GitHub Actions run itself goes red (by design — that is the signal) — `:93-107`, `.github/workflows/synthetic-check.yml:47-52`.
5. Exists specifically because `/api/health` "stayed green through every real fault this product has had" (webhook pointed at a dead URL, a storage column nothing wrote, an SMTP credential that authenticated but could not send) — `app/api/cron/synthetic/route.ts:16-20`.

### W13 · Notification drain, lifecycle, warnings (siblings sharing this subsystem's job/cron infrastructure)

1. All three call `runJob(name, …)` exactly like reconcile/usage/synthetic, so they share `job_runs` and the platform Health page's picture of "did this run last night" — `lib/jobs/run.ts`.
2. `cron/lifecycle` and `cron/warnings` run once daily at 03:40 UTC, `cron/notify` every 15 minutes, all three from `.github/workflows/notify-drain.yml:18-113` — not `vercel.json`, because Vercel's Hobby plan allows exactly two daily crons and `reconcile`+`usage` already hold both slots; a third entry fails the **deploy** outright, not the run (`app/api/cron/notify/route.ts:18-22`).
3. Ordering inside the one GitHub Actions job is deliberate: lifecycle (which catalogues lapsed) before warnings (what to warn about) before drain (actually send) — a catalogue that fell into grace this morning should be warned about grace, not an expiry it already passed — `.github/workflows/notify-drain.yml:42-47`.
4. Concurrency-limited (`cancel-in-progress: false`) so overlapping scheduled runs queue rather than both draining the same queued rows twice — `.github/workflows/notify-drain.yml:30-32`.
5. Failure a user can hit: none of this reaches a guest or operator UI directly; a broken `CRON_SECRET` shows as a 401 in the Actions log and the run goes red (explicitly called out as the interesting failure — "the queue is not draining" — `.github/workflows/notify-drain.yml:106-110`).

### W14 · Deploy to Vercel

1. `vercel login` once, interactively — the script cannot do this — then `./scripts/deploy-vercel.sh` — `scripts/deploy-vercel.sh:9-11`.
2. Refuses to `vercel link --yes` a project that is not already listed by `vercel project ls`, because `--yes` would otherwise silently **create** a second, empty project and deploy into it while production keeps serving the old one — this happened once, during a rename — `scripts/deploy-vercel.sh:47-63`.
3. Pushes every var from `.env.vercel.local` (idempotent: removes then re-adds each), skipping any that are empty — `:65-83`.
4. `vercel --prod --yes` — `:87`.
5. Prints a four-step manual checklist: `curl /api/health`, sign in and create a catalogue, **point the Bunny library's webhook at the new URL and upload one film to prove the signature** (the only local-untestable step, since it needs a public URL), check `ROOT_DOMAIN` — `:89-107`.
6. What can go wrong that the script itself will not catch: the Bunny **webhook URL** is not part of `.env.vercel.local` at all — it is a Bunny-dashboard-only setting gated behind the **account** API key, which this repo deliberately never holds (`docs/DEPLOYMENT.md:58-68`). A domain change updates `ROOT_DOMAIN` on Vercel but does **not** move the webhook; this is exactly what happened during the second-pass go-live and was caught only because someone thought to check (§7.4, `docs/GO-LIVE.md:213-244`).

### W15 · Bootstrap or migrate a Supabase project

1. Fresh project: `pnpm bootstrap:sql > bootstrap.sql`, paste into the SQL editor, run — one transaction, every migration file concatenated in filename order plus a first `orgs` insert — `scripts/bootstrap-supabase.ts:15-66`.
2. Existing project: `pnpm db:migrate` prints the ordered file list; the operator pastes the ones "not yet applied" by hand — `scripts/migrate.ts:9-20`.
3. **There is no ledger.** Which migrations have run is inferred from which tables/columns exist — "if `domains` exists, 0023 has run" — `docs/DEPLOYMENT.md:116-117`. Every migration is written `create table if not exists` / `add column if not exists` so re-applying one is harmless by convention, not by any tracking mechanism — `docs/DEPLOYMENT.md:112-114`.
4. Failure a user can hit: none of this is machine-checked — a migration skipped by mistake produces a column that reads as `undefined`/null everywhere downstream rather than an error, exactly as the tenant-path rollout once did (referenced in `lib/catalogue-cache.ts:33-36`).
5. `pnpm preflight` afterwards is the closest thing to a check — it lists the schema it can actually see — `docs/DEPLOYMENT.md:117`.

### W16 · Preflight and the "against real Bunny" verification scripts

1. `pnpm preflight`: read-only; validates Supabase reachability and table list, Bunny library key vs. account key (indistinguishable 401s otherwise), token-authentication/referrer-blocking/IP-pinning settings, and does a real write+read against the photo storage zone and CDN — `scripts/preflight.ts:47-353`.
2. Deliberately does **not** check the Bunny webhook target (§7.4/§7.9) — every other Bunny setting it checks, this one it cannot, because it is not exposed by the library key this repo holds.
3. `pnpm verify:playback`: end-to-end proof that this app's token signature is the signature Bunny expects — uploads a real clip, asserts a signed manifest, a signed **child** HLS playlist (a manifest-only check would miss a file-scoped-token bug entirely), a signed poster, all three refused unsigned, and a real `hls.js` player decoding frames — `scripts/verify-bunny-playback.ts:1-260`. Neither this nor `verify:upload` is part of `pnpm verify` or CI (`package.json:24`) — both are manual, and both consume real Bunny encoding minutes.
4. `pnpm verify:upload`: boots a real `pnpm start` production build with `VIDEO_DRIVER=bunny`, drives Playwright to upload a 25MB fixture, drops the browser context offline mid-transfer, restores it, and fails loudly (`RESTARTED`) if the percentage ever falls back rather than resuming — `scripts/verify-upload-resume.ts:139-190`.
5. What a user sees on failure: explicit `FAIL —` lines naming the exact mismatch (wrong token algorithm, pull zone not enforcing auth, poster broken, player never decoded a frame) rather than a generic non-zero exit.

### W17 · Container deploy, if not Vercel

1. `docker build -t heirloomfilms .` — multi-stage (`deps`→`builder`→`runner`), Next's `standalone` output, non-root user, `/api/health` container healthcheck — `Dockerfile:1-49`.
2. Build stage sets `SESSION_SECRET=build-time-placeholder-…` because `lib/env.ts` skips its production guards specifically during `next build`, so nothing real is ever baked into the image — `Dockerfile:23-28`, `lib/env.ts:294-296`.
3. Three things Vercel was providing that a container host must replace: wildcard TLS (a reverse proxy with a wildcard cert), **the cron scheduler** — two curl calls to `/api/cron/reconcile` and `/api/cron/usage` with `Authorization: Bearer $CRON_SECRET` — and ISR revalidation across instances (run one instance, or add shared cache handling) — `docs/DEPLOYMENT.md:359-362`.
4. What is *not* mentioned in that list: the four GitHub-Actions-only jobs (`notify`, `synthetic`, `lifecycle`, `warnings`) have no container-deploy replacement documented at all (§7.6) — a self-hosted deploy following §10 verbatim would never drain its notification queue, never walk the lapse ladder, never get a synthetic-check alert.

## 5. Data model touched

| Table.column | Written by | Migration |
|---|---|---|
| `titles.id, catalogue_id, slug, name, category, provider, provider_id, duration_s, poster_*, thumbnails_url, status, error_message, published, sort_order, published_at, created_at, view_count, watch_seconds` | Upload (W1), webhook/reconcile (W3/W4), title edit/retry/delete (W5) | `0001_initial_schema.sql:78-119` |
| `titles.size_bytes` | Upload (declared), webhook/reconcile (corrected from provider), `backfill:sizes` | `0007_storage_only.sql:9,12-14` |
| `titles.live_at` | `publishCatalogueContent` only (W10) — **not honoured by `SupabaseRepository`'s reads (§7.1)** | `0012_content_waits_for_publish.sql:10` |
| `titles` indexes: `(catalogue_id, published, category, sort_order)`, `(catalogue_id, published_at desc)`, `(provider_id)`, partial `(status, created_at) where status='processing'` | — | `0001_initial_schema.sql:115-119` |
| `titles_live_idx (catalogue_id) where live_at is not null` | — | `0012_content_waits_for_publish.sql:13` |
| `titles_catalogue_size_idx (catalogue_id) include (size_bytes)` | — | `0007_storage_only.sql:20` |
| `albums.id, catalogue_id, name, created_at` | First photo upload (default album, race-safe) | `0001_initial_schema.sql:125-131` |
| `photos.id, album_id, url, lqip, caption, width, height, sort_order` | Photo upload (W8), caption edit/delete (W9) | `0001_initial_schema.sql:134-145` |
| `photos.size_bytes` | Photo upload (sum of all renditions) | `0007_storage_only.sql:10,16-17` |
| `photos.live_at` | `publishCatalogueContent` only (W10) — **`SupabaseRepository.listPhotosForCatalogue` ignores it entirely (§7.1)** | `0012_content_waits_for_publish.sql:11` |
| `photos_album_size_idx (album_id) include (size_bytes)` | — | `0007_storage_only.sql:21` |
| `usage_rollup.catalogue_id, month, stored_gb, delivered_gb` | Usage rollup (W11) | `0001_initial_schema.sql:182-188` |
| `usage_rollup.watch_seconds` | Usage rollup (W11) | `0015_usage_watch_seconds.sql:10` |
| `job_runs.id, job, started_at, finished_at, ok, detail` | Every cron via `runJob` (W3/W4/W11/W12/W13) | `0022_job_runs.sql:6-13`, RLS on with no anon grant at `:17-18` |
| `entitlements.storage_gb` (+ `org_id`/`catalogue_id`, exactly one set) | Read only from this subsystem (upload/photo-upload quota checks); written by the platform | `0006_entitlements.sql:32-50` |
| `entitlements.max_titles/max_photos` | Dead — superseded by `storage_gb`, retained for history, nothing resolves them into limits | `0006_entitlements.sql` (comment added `0007_storage_only.sql:25-28`) |
| `plans.*` | Unused — no row is ever written (N-20, billing, out of scope) | `0006_entitlements.sql:16-27` |
| `catalogues.draft_modules/modules, status, published_at` | Read by this subsystem's Publish call and cache layer; written by the customizer (`studio` subsystem) | `0001_initial_schema.sql:35-73`, `0011_draft_branding.sql` |

RLS on `titles`/`albums`/`photos` is enabled with **both** an anon-denial and an `authenticated`-role, `current_org_id()`-scoped policy (`op_titles`/`op_albums`/`op_photos`) — `supabase/migrations/0002_row_level_security.sql:63-77`. Every route in this map goes through the service-role repository and never through that authenticated policy in practice, since operators do not talk to PostgREST directly; the policy is defense-in-depth if that ever changes.

## 6. Configuration

All read exclusively through `lib/env.ts` (§3, `.eslintrc.json:22-25` for the `scripts/**` exemption).

| Variable | Effect on this subsystem |
|---|---|
| `VIDEO_DRIVER` (`fake` default \| `bunny`) | Which `VideoProvider` `lib/video/index.ts:10-14` constructs. `bunny` requires the four keys below (`lib/env.ts:215-230`). |
| `BUNNY_LIBRARY_ID`, `BUNNY_API_KEY`, `BUNNY_CDN_HOSTNAME`, `BUNNY_TOKEN_AUTH_KEY` | Upload ticket creation, status polling, playback/poster signing. `BUNNY_API_KEY` must be the **library** key — the account key authenticates a different API and fails identically (401) if swapped. |
| `BUNNY_WEBHOOK_SECRET` | Must be the library's **read-only** key; webhook verification fails closed (titles stuck in `processing`) if wrong or unset — `lib/video/bunny.ts:275-281`. |
| `PHOTO_DRIVER` (`fake` default \| `bunny`) | Which `PhotoProvider` is used. `bunny` requires the three vars below (`lib/env.ts:278-292`). |
| `BUNNY_STORAGE_ZONE`, `BUNNY_STORAGE_PASSWORD`, `BUNNY_STORAGE_REGION` (default `de`), `BUNNY_PHOTO_CDN_HOSTNAME` | Photo origin write credential, regional origin host, and the public pull-zone read host. |
| `DATA_DRIVER` (`memory` default \| `file` \| `supabase`) | Which `Repository` — and therefore whether the N-57 publish gate actually holds (§7.1). Production must be `supabase`; enforced at boot (`lib/env.ts:317-323`). |
| `CRON_SECRET` (falls back to `SESSION_SECRET`) | Bearer every cron route checks in production. Unset ⇒ Vercel sends no `Authorization` header at all ⇒ jobs 401 and silently never run — "the one people forget" (`docs/DEPLOYMENT.md:240-243`). |
| `RECONCILE_STALL_MINUTES` (default 120) | How long an `uploading`/`processing` title waits before reconcile asks Bunny directly. `0` makes reconcile authoritative immediately — useful behind Vercel Deployment Protection, where Bunny's webhook POST would otherwise be bounced to an SSO login and never arrive at all. |
| `PLAYBACK_TOKEN_TTL_S` (default 14400 = 4h) | Playback token lifetime. |
| `DEMO_CATALOGUE_SLUG` (default `aanya-vikram`) | What `cron/synthetic` walks every hour; production must set this to a slug that actually exists there, or the check is meaningless against a catalogue that resolves `missing`. |
| `ROOT_DOMAIN` | Referenced in the reconcile-alert email text ("check the webhook URL against …") — informational, not enforced. |
| `ALLOW_EPHEMERAL_DATA` (`0`/`1`) | Opt-in to run a production build on `memory`/`file` — for Playwright and an offline demo only; refused otherwise in production. |
| `NODE_ENV` / `NEXT_PHASE` | Production guards (including the cron bearer check) are skipped during `next build` specifically so no real secret has to exist at build time. |
| `VERCEL_GIT_COMMIT_SHA` | Surfaced as `version` on `/api/health`, which reports `data` and `video` drivers but **not** `photo` (`app/api/health/route.ts:12-22`) — see §7.10. |
| `BUNNY_ACCOUNT_API_KEY` | Read by `scripts/preflight.ts` only (`process.env`, not `lib/env.ts` — no schema entry exists for it); the app itself never needs the account key, by design (`docs/DEPLOYMENT.md:62`). |

## 7. Gaps and rough edges

1. **The production repository driver silently breaks the "wait for Publish" promise for both titles and photographs — undocumented anywhere, and untested against the driver that matters.** `SupabaseRepository.listTitles(id, {publishedOnly:true})` filters on `published` and `status`, never `live_at` (`lib/db/supabase-repository.ts:1390-1396`); `SupabaseRepository.listPhotosForCatalogue` does not even accept the `liveOnly` option the `Repository` interface declares (`lib/db/repository.ts:343`, `lib/db/supabase-repository.ts:1625-1631`), so it returns every photo regardless of `live_at`. Compare `MemoryRepository`, which implements both correctly and explains why in its own comment ("`liveAt`, **not** `published`" — `lib/db/memory-repository.ts:746-757`), and `lib/schema.ts:461-462`'s own doc-comment on `titleSchema.liveAt`: *"Null means the couple cannot see it, whatever `published` says."* That is false on production today. **Why nothing catches it**: every unit test that exercises this (`tests/unit/content-publishing.test.ts`, `webhook.test.ts`, `reconcile.test.ts`, `playback-token.test.ts`) instantiates `MemoryRepository` directly (e.g. `content-publishing.test.ts:2`). The one integration test that runs against real Supabase and calls `listTitles({publishedOnly:true})` (`tests/integration/drivers.test.ts:219-277`, gated behind `RUN_INTEGRATION=1`, outside `pnpm verify` and CI) never sets `published:true` on a ready title — its assertion at `:277` only proves an *un*-published row is excluded, and its own comment ("must filter on both flags") overstates what it checks. Nothing exercises `listPhotosForCatalogue({liveOnly:true})` against Supabase at all. **Practical effect**: an operator who ticks "Visible to guests" on a ready film sees it reach the live guest gallery immediately, before the next catalogue Publish; every uploaded photograph is visible to guests the instant the upload finishes, full stop, since photos have no `published` toggle to even delay it. This is the single fact on this map most likely to change a rebuild-vs-keep decision, because it means the driver-parity promise in `CLAUDE.md`'s "deliberate deviations" section — "identical semantics" between the in-memory and Postgres drivers — does not currently hold.
2. **Photo pull zone has no token authentication at all** — a separate, already-tracked gap (N-83, verified against production 13 Sept 2026, `docs/NEXT.md:73-93`): `lib/photos/bunny.ts` never signs a URL (contrast `lib/video/bunny.ts`'s `signDirectory`), so a photograph's URL, once it leaks anywhere, returns 200 to anyone forever — no TTL, no scope. The fix is written up and undecided (sign everything vs. only passcode-protected catalogues); not yet built.
3. **`POST /api/playback/token` gates on `published`, not `live_at`** (`app/api/playback/token/route.ts:35-41`). Whether this is deliberate is not resolved anywhere in the code or comments: `components/streaming/TitleModal.tsx` — the **real** guest component, per `CLAUDE.md`'s documented deviation that the customizer preview mounts actual guest components — calls this same public endpoint, and an operator must be able to preview a just-ticked, not-yet-Published film. But the endpoint has no way to distinguish "the operator's own preview" from "a guest who has the catalogue's passcode and can guess or discover a title's slug" (slugs are derived from the upload filename, see item 8) — both get a working, TTL'd playback URL for a film the product's own promise says is not out yet. On the (correct) memory driver this is at least narrowed by the film never appearing in `bundle.titles`; on Supabase (item 1) it is moot, because the film is already listed.
4. **The Bunny webhook URL is a manual, out-of-band, account-key-gated dashboard setting that nothing in this repo can read, verify, or change.** `preflight.ts` checks every other Bunny setting (library key validity, token auth, referrer blocking, IP pinning, the photo zone) but not this one — it is not exposed by the library key the app holds (`docs/DEPLOYMENT.md:58-68`). This already caused a real incident: the second-pass domain switchover left the webhook pointed at the old alias, and the write-up calls it out explicitly — *"nothing is broken right now, and that is the trap… the webhook starts answering 200 from superseded code — uploads succeed, transcoding finishes, and titles simply never leave `processing`. A webhook that looks healthy is the hardest kind to debug"* (`docs/GO-LIVE.md:213-244`). The only proof it is still correct after any domain change is uploading one real film and watching it reach `ready` on its own (§W14 step 5) — there is no automated check.
5. **Deleting a single photograph reclaims only the master rendition's storage.** `DELETE /api/admin/photos/[id]` removes `photoKeyFromUrl(photo.url)` and nothing else (`app/api/admin/photos/[id]/route.ts:63`) — the `-1024` and `-480` files it was stored alongside are never removed by this path. Catalogue-level delete gets this right, looping every `PHOTO_WIDTHS` entry (`app/api/admin/catalogues/[id]/route.ts:168-174`) — the two code paths disagree.
6. **A wrong number in the photo-size refusal**: `MAX_BYTES = 4 * 1024 * 1024` (4MB) but the message an operator sees says *"larger than 25MB"* (`app/api/admin/catalogues/[id]/photos/route.ts:32,98`) — six times too generous, and confusing given the file that just got rejected was well under 25MB.
7. **Vercel's two-cron ceiling means four of six jobs live outside this app's own deploy path entirely.** `notify`, `synthetic`, `lifecycle`, `warnings` run from GitHub Actions (`.github/workflows/notify-drain.yml`, `synthetic-check.yml`), not `vercel.json`. Consequences: (a) a public repo's scheduled workflows disable themselves after 60 days with no commits, silently, with only a GitHub email as warning; (b) `docs/DEPLOYMENT.md §10`'s container-deploy instructions name only the two Vercel crons as "what you lose and must replace" — a literal Docker deploy following that section would never drain notifications, never run the lapse ladder, never queue warnings, and never get a synthetic-check alert, with no error anywhere pointing at the gap.
8. **A film's address is frozen to its upload filename forever** (tracked, N-84, `docs/NEXT.md:133-143`): `slug` is set once from `titleFromFilename` at upload (`app/api/admin/uploads/route.ts:81`) and a later rename never touches it, so a film titled "Sangeet" in the console can still be `/watch/whatsapp-video-2026-08-12-at-02-07-21` in every shared link.
9. **`RECONCILE_STALL_MINUTES`'s `uploading` half of the query has no supporting index.** `listStalledTitles` filters `status IN ('uploading','processing')` (`lib/db/supabase-repository.ts:1857-1863`), but the only index built for this exact query is a partial one covering `status='processing'` only (`supabase/migrations/0001_initial_schema.sql:119`), and no later migration widens it — even though the code comment explicitly marks including `uploading` as a deliberate, later fix to a real blind spot ("now that `uploading` rows are examined too" — `app/api/cron/reconcile/route.ts:62-64`).
10. **`/api/health` reports the `data` and `video` drivers but not `photo`.** A `PHOTO_DRIVER` that silently defaulted to `fake` in production (the same class of mistake `lib/env.ts:246-253`'s `NOTIFY_DRIVER` guard exists to catch, but there is no equivalent cross-field guard requiring `PHOTO_DRIVER=bunny` when `DATA_DRIVER=supabase`) would not show up on the one endpoint `docs/DEPLOYMENT.md §8` tells an operator to curl first.
11. **Storage-size backfill and CDN-zone migration are unautomated, developer-run scripts, not jobs.** `pnpm backfill:sizes` (for titles that reached `ready` before `size_bytes` existed — migration 0007) and `pnpm repoint:photos` (for moving off a machine-named storage zone) both require someone to remember to run them by hand; neither is wired into a cron, a migration, or a deploy step.
12. **The catalogue-delete cleanup loop is fully sequential.** `app/api/admin/catalogues/[id]/route.ts:159-174` `await`s each Bunny asset delete and each of three photo-rendition deletes one at a time inside nested `for` loops — a wedding with fifteen films and sixty photographs is up to 195 sequential network round-trips before the row itself is deleted.
13. **`delivered_gb` is a derived estimate presented beside `watch_seconds`, a measurement, and the two are easy to conflate.** Bunny genuinely does not expose per-video bandwidth (only per-video watch time, and pull-zone bandwidth for the whole library) — `lib/video/bunny.ts:234-244` — so `GB_PER_HOUR.standard = 2.15` (`lib/entitlements.ts:131`) is a documented placeholder pending a real fifteen-hour wedding's measured figures (N-24a). Anyone billing or capacity-planning off `usage_rollup.delivered_gb` today is billing off an assumption, not a meter reading.

Docs that the code does not match

14. `docs/DEPLOYMENT.md:80` ("Paste into the SQL editor and run. One transaction: 11 tables, 16 RLS policies…") describes the Phase-0 bootstrap; the schema is now 25 migrations and materially more tables (`titles`, `photos`, `job_runs`, `usage_rollup`, `entitlements`, `credits`, `presets`, `domains`, `transfers`… — none of that count is current). The bootstrap script itself is still correct (it concatenates whatever is in `supabase/migrations/`); only the prose number is stale.
15. `docs/DEPLOYMENT.md:333-335` describes rollback as risk-free because "nothing in a deploy migrates data" — true for the app's own writes, but silent on the fact that `SupabaseRepository`'s read-path bug (item 1) is not something any rollback fixes, since it is a property of the deployed **code**, not of the schema or the data.

## 8. Evidence index

Video provider and Bunny driver
- `lib/video/provider.ts:10-151` — interface, types, `isAcceptedVideo`, constants.
- `lib/video/bunny.ts:16-28` API base/TUS endpoint/status map; `:37-60` `call()`; `:62-94` `createUpload`; `:96-148` `getPlaybackToken`/`signDirectory`; `:150-162` `getAssetUrl`; `:164-195` `getStatus`; `:197-228` `getDownloadUrl`; `:230-232` `deleteAsset`; `:234-262` `getUsage`; `:264-304` `verifyWebhook`.
- `lib/video/index.ts:6-30` driver switch, `posterRoute`.
- `lib/video/fake.ts:20-142` whole driver.

Photo provider and Bunny storage
- `lib/photos/provider.ts:1-39` interface and the "why proxy" rationale.
- `lib/photos/bunny.ts:1-68` whole driver, `originHost`, `put`, `remove`.
- `lib/photos/index.ts:12-64` driver switch, `photoKey`, `defaultAlbumId`.
- `lib/photos/fake.ts:1-29`; `lib/photos/srcset.ts:1-28`.

Upload path
- `app/api/admin/uploads/route.ts:15-136` whole route + `uniqueSlug`.
- `components/admin/UploadManager.tsx:22-400` whole component (queue, TUS config, retry, online handler, beforeunload, pre-flight, `shortReason`, `estimate`).

Transcode, reconcile, retry, delete
- `app/api/webhooks/bunny/route.ts:1-82` whole handler.
- `app/api/cron/reconcile/route.ts:1-124` whole route.
- `app/api/admin/titles/[id]/retry/route.ts:1-47`; `app/api/admin/titles/[id]/route.ts:1-79` (PATCH/DELETE).
- `lib/jobs/run.ts:1-56` whole file.

Playback and posters
- `app/api/playback/token/route.ts:1-65` whole route.
- `app/api/poster/[titleId]/route.ts:1-71`; `app/api/poster/frame/route.ts:1-30`.
- `lib/catalogue-access.ts:1-90` (`resolveAccess`, `requireServableCatalogue`, `loadBundle`) — cited for the gate `/playback/token` and `/poster` sit behind; full guest-access mapping is the `guest`/`platform` subsystems' scope.

Photo upload, edit, delete
- `components/admin/PhotoManager.tsx:1-347` whole component.
- `app/api/admin/catalogues/[id]/photos/route.ts:1-204` whole route.
- `app/api/admin/photos/[id]/route.ts:1-83` whole route.
- `app/api/admin/catalogues/[id]/route.ts:148-196` catalogue delete (`for` loops over titles/photos, `photoKeyFromUrl`).

Publish gate and the driver-parity bug
- `lib/db/repository.ts:70-398` full `Repository` interface (`listTitles:291`, `listPhotosForCatalogue:343`, `publishCatalogueContent:116`, `countPendingContent:119`).
- `lib/db/supabase-repository.ts:1390-1396` `listTitles`; `:1625-1631` `listPhotosForCatalogue`; `:940-982` `publishCatalogueContent`; `:989-1017` `countPendingContent`; `:1259-1276` `catalogueStorageBytes`; `:1857-1868` `listStalledTitles`; `:1815-1854` `listAllCatalogues`/`upsertUsage`/`listUsage`; `:685-712` `recordJobRun`/`latestJobRuns`; `:285-345` `toTitle`/`fromTitle`/`toPhoto`/`fromPhoto`.
- `lib/db/memory-repository.ts:742-926` `listTitles`, `listPhotosForCatalogue`, `publishCatalogueContent` region.
- `lib/db/file-repository.ts:1-66` whole file.
- `lib/db/index.ts:19-59` driver switch.
- `lib/schema.ts:426-503` `titleSchema` (`liveAt` doc-comment `:461-462`), `photoSchema`, `albumSchema`; `:272-280` `jobRunSchema`; `:28-41` `CATEGORIES`.

Cache, logging, observability
- `lib/catalogue-cache.ts:1-85` whole file.
- `lib/log.ts:1-43` whole file.
- `lib/observability.ts:1-85` whole file.
- `lib/http/handler.ts:10-33` `route()`; `lib/http/errors.ts:7-70` `ERROR_CODES`/`ApiError`/`errorResponse`.

Environment and health
- `lib/env.ts:1-342` whole file (video/photo/data guards `:189-292`, production guards `:294-324`).
- `app/api/health/route.ts:1-22`.
- `lib/health/probes.ts:68-125` `probeDatabase`/`probeStream`/`probeStorage`/`probeCdn` — consumer, mapped fully under `platform`.
- `.eslintrc.json:1-27` (`no-restricted-properties` and its `scripts/**` override).
- `next.config.ts:1-40` (`images.remotePatterns` for `b-cdn.net`/`supabase.co`).

Scripts, deploy, CI
- `scripts/preflight.ts:1-390` (Service type `:26`; `checkSupabase:47-101`; `checkBunny:102-175`; `checkLibrary:176-284`; `checkPhotos:294-353`; `main:358-390`).
- `scripts/verify-bunny-playback.ts:1-260+` whole script.
- `scripts/verify-upload-resume.ts:1-241` whole script.
- `scripts/deploy-vercel.sh:1-108` whole script.
- `scripts/migrate.ts:1-21`; `scripts/bootstrap-supabase.ts:1-71`.
- `scripts/backfill-sizes.ts:1-19`; `scripts/repoint-photo-cdn.ts:1-22` (header comments; full scripts out of line-budget).
- `package.json:10-42` scripts block.
- `vercel.json:1-19` whole file.
- `Dockerfile:1-49` whole file.
- `.github/workflows/ci.yml:1-151` whole file.
- `.github/workflows/notify-drain.yml:1-113`; `.github/workflows/synthetic-check.yml:1-53`.

Data model
- `supabase/migrations/0001_initial_schema.sql:9-235` (titles/albums/photos/usage_rollup/functions).
- `supabase/migrations/0002_row_level_security.sql:15-107` (titles/albums/photos policies, anon revoke).
- `supabase/migrations/0006_entitlements.sql:1-64`; `0007_storage_only.sql:1-28`; `0012_content_waits_for_publish.sql:1-23`; `0015_usage_watch_seconds.sql:1-10`; `0022_job_runs.sql:1-18`.

Docs consulted
- `docs/DEPLOYMENT.md:16-410` (§1–§11, skipping §5 DNS/§12–13 which belong to other subsystems).
- `docs/GO-LIVE.md:213-270,364,410`.
- `docs/NEXT.md:73-143` (N-83, N-84).
- `CLAUDE.md` (deliberate-deviations §2 on `Repository`; risk-area table).

Tests that exercise this subsystem (coverage map, not evidence of behaviour)
- Unit, against `MemoryRepository` only: `tests/unit/content-publishing.test.ts`, `webhook.test.ts`, `reconcile.test.ts`, `playback-token.test.ts`, `photos.test.ts`, `photo-srcset.test.ts`, `entitlements.test.ts`.
- Integration, against real Supabase, manual only (`RUN_INTEGRATION=1`, not in `pnpm verify` or CI): `tests/integration/drivers.test.ts` (title round-trip `:219-260`, the `publishedOnly` assertion that does not cover the `liveAt` gap `:274-277`, RLS anon checks `:289-338`).
- E2E: `e2e/upload.spec.ts`, `e2e/playback.spec.ts` — both run against `VIDEO_DRIVER=fake`/`DATA_DRIVER=memory` per `.github/workflows/ci.yml:14-18`, so neither can observe the Supabase-driver gap either.
