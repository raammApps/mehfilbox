# 02 — Information Architecture

Two applications sharing one codebase: the **catalogue** (guests, unauthenticated) and the
**admin** (operators, authenticated).

## 1. Sitemap

> **Superseded — addressing (12 September 2026, D-32).** A catalogue lives at
> `mehfilbox.com/<studio>/<wedding>`, not on a subdomain; the console at `/admin`, the couple's
> account at `/my`, sign-in at `/login`. `docs/spec/16-platform-v2.md` §1 is current. The tree
> below is kept for the *pages* it lists, which are unchanged.


```
CATALOGUE — <slug>.heirloomfilms.app   (guests, no login)
├── /                       Browse: profile gate → billboard → rows
│   ├── ?title=<slug>       Title detail modal (deep-linkable)
│   └── ?profile=<id>       Active profile
├── /watch/<slug>           Full-screen player (own route — needs a fresh token)
├── /locked                 Passcode gate, when privacy=passcode
├── /renew                  Subscription lapsed — renewal screen. NEVER a 404.
└── /api/og                 Dynamic link preview image

ADMIN — admin.heirloomfilms.app    (operators, login required)
├── /login
├── /                       Catalogue list — all weddings for this org
├── /new                    Create catalogue (4-step wizard)
├── /c/<id>                 Catalogue overview: status, share, subscription
│   ├── /c/<id>/titles      Title list — upload, reorder, publish
│   ├── /c/<id>/titles/<t>  Title editor — name, synopsis, category, poster, captions
│   ├── /c/<id>/upload      Upload drop zone (also embedded in /titles)
│   ├── /c/<id>/branding    Logo, accent, presented-by
│   ├── /c/<id>/settings    Slug, privacy, passcode, dates
│   ├── /c/<id>/analytics   Views, watch time, top titles (P1)
│   └── /c/<id>/preview     Preview as guest, before publishing
├── /settings               Org branding defaults, operators (P2)
└── /billing                Subscriptions across catalogues (P1)
```

**Why `/watch/<slug>` is a real route and not just a modal.** Playback needs a fresh signed
token, full-screen chrome, and a URL a couple can bookmark and send. The modal is for
browsing; the route is for watching.

## 2. Browse page structure

Order matters. It is the difference between "a folder of files" and "a service".

A catalogue is **6–15 items**, so the whole page is roughly two screens of scroll. That is
the intended shape: short, dense, nothing filler.

```
┌─ Profile gate ────────────── first visit only, skippable
├─ Top nav ────────────────── logo · profile avatar   (no search — see doc 01 §4)
├─ Billboard ──────────────── the one piece that should hook a first-time visitor,
│                             muted autoplay trailer, ▶ Play · ⓘ More Info
├─ Continue Watching ──────── P1, only if the profile has real progress
├─ Curated row 1 ──────────┐  operator-ordered, operator-written headings
├─ Letter / photo grid     │  e.g. "The Films" · "A Message For You" · "The Day In Photos"
├─ Curated row 2 ──────────┘
└─ Footer ────────────────── presented by <planner> · privacy · renew
```

**Typical shape:** billboard + two curated rows + one non-video module. Three to five sections
total. A catalogue with nine sections is a catalogue that has stopped being curated.

**Rows with two or three cards are normal and must look deliberate**, not broken. At that
count: no scroll arrows, no peeking card, left-aligned, cards sized up so the row still fills
its width. A three-card row rendered with library-scale card widths looks like a loading
error. This is an acceptance criterion.

**Every empty module disappears entirely** — never a heading over nothing.

## 3. Admin: create-catalogue wizard

Four steps. An operator does this between phone calls, so every step must be resumable and
nothing is lost on refresh.

| Step | Collects | Notes |
|---|---|---|
| 1 · The wedding | Couple names, date, city, slug | Slug auto-suggested from names, live availability check |
| 2 · Branding | Logo, accent colour, presented-by | Prefilled from org defaults; most operators skip |
| 3 · Upload | Drag-and-drop, multi-file | Starts immediately, continues in the background through steps 4 and beyond |
| 4 · Titles | Name, category, order per file | Pre-filled from filenames; operator corrects |

Then: preview as guest → publish.

**Upload starts at step 3 and keeps running.** The operator titles files while bytes move.
Making them wait for a 6GB upload before they can type a title wastes the only thing they
have less of than money.

## 4. Navigation model

### Catalogue
- Top nav is sticky, transparent over the billboard, solid on scroll.
- Profile avatar top-right opens a switcher; no hamburger anywhere.
- Card click → `?title=<slug>` modal via `pushState`. **Android back closes the modal.**
- Play → navigates to `/watch/<slug>`. Back from the player returns to browse **at the same
  scroll position with the modal closed**.
- Player: back/Esc exits, `←/→` seek 10s, `space` play/pause, `f` fullscreen, `m` mute.

### Admin
- Persistent left rail: Catalogues · Billing · Settings.
- Inside a catalogue, a horizontal sub-nav: Overview · Titles · Branding · Settings · Analytics.
- The upload widget is global and persistent — it keeps showing progress while the operator
  navigates anywhere in the admin. Navigating away must never cancel an upload.

## 5. States

| Situation | Behaviour |
|---|---|
| Catalogue in draft | Guests get a neutral "not yet available" page, not a 404 |
| Title still processing | Card visible in admin with a progress state; **hidden from guests** until ready |
| Title failed | Admin shows the provider's reason + retry. Never silently absent. |
| A row has 2–3 cards | **Normal.** No arrows, no peeking card, left-aligned, cards sized up to fill the row. Must look deliberate — see §2. |
| Zero published titles | Billboard hidden; browse shows an honest empty state (admin only sees this) |
| No poster art | Generated poster from title name + category (doc 04 §6) |
| Playback token expired mid-watch | Silent refresh, resume at the same second |
| Subscription lapsed | `/renew` — renewal screen with the catalogue still listed. Never 404, never deletion. |
| Passcode wrong | Shake, generic message, 5 attempts then 15-min lockout |
| Guest on 2G | Ladder bottoms at 360p; offer download-for-later rather than pretending it will stream |
| JS disabled | Browse renders server-side as a plain list of titles with links to `/watch`. Playback needs JS; say so plainly. |

## 6. Deep linking and sharing

| URL | Opens |
|---|---|
| `<slug>.heirloomfilms.app` | Browse, profile gate on first visit |
| `?title=sangeet-film` | Browse with that title's modal open |
| `/watch/sangeet-film` | Straight into the player |
| `/watch/sangeet-film?t=428` | Player seeked to 7:08 — "watch the varmala" |

`?t=` is the sharing feature that will actually get used — "watch from 7:08, that's my dad
crying". It is cheap to build and it is a **flaunt** mechanic, which makes it P0-adjacent
rather than a nice-to-have. There is no `/search`; see doc 01 §4.
