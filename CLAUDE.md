# CLAUDE.md — Mehfilbox (implementation)

The **specification** lives in `docs/spec/`. Read
`docs/spec/README.md` first, then `docs/spec/13-agent-runbook.md §2`
for the per-ticket reading map. Never load the whole doc set.

This file covers the **codebase**: what exists, and the rules that keep it coherent.

## Context discipline

- `docs/PRODUCT.md` is **what the product is**, surface by surface, with what exists and what does
  not. It is the file to update on a pivot or a new requirement — before `NEXT.md`, before code.
- `docs/PROGRESS.md` is what was built and why.
  `docs/NEXT.md` is **what is left, in the order to take it up**. Read
  CLAUDE.md → PROGRESS → NEXT; a cold start is then ~8k tokens regardless of repo size.
  The Phase 0 build log lives in `docs/archive/progress-phase-0.md` and is **not** read on the way
  in — its lessons are distilled at the top of PROGRESS.
  Append to PROGRESS and remove the item from NEXT as each lands.
- Run `pnpm preflight` before trusting anything either file says about Supabase or Bunny.
- Never read the `.svg` wireframes into context. `docs/spec/03-wireframes.md` carries the text.
- Never read `archive/` — superseded invite-site work.

## Working rules, enforced rather than remembered

These are lint rules, tests or types, not conventions. If you find yourself wanting to break one,
the check will tell you before review does.

| Rule | Enforced by |
|---|---|
| `process.env` only in `lib/env.ts` | eslint `no-restricted-properties` |
| No `dangerouslySetInnerHTML` on tenant or guest strings | eslint `no-restricted-syntax` |
| No `any` | eslint + `tsc --strict` |
| No file outside `modules/` names a module type | `tests/unit/registry.test.ts` |
| Every English key has a Hindi entry | `tests/unit/i18n.test.ts` |
| No `-flix` in a shipped app name | `appNameSchema` in `lib/schema.ts` |
| Palette contrast | `pnpm check:contrast` |
| Secrets never in the browser bundle | `server-only` on `lib/env.ts` and the driver modules |

Run `pnpm verify` before committing. One ticket from doc 09 per commit.

## Skills

Three workflows are encoded in `.claude/skills/` rather than re-explained each session:

| | |
|---|---|
| `next-item` | Take one item from NEXT.md to a commit, following the ritual in that file |
| `add-module` | Add a module type — one folder plus one registry line |
| `ship` | Verify, commit, push, deploy, and confirm the health endpoint matches the commit |
| `parallel` | Split frontend and backend across worktrees — contract first, strict ownership, E2E as the integration test |

## Deliberate deviations from the spec

Both were forced, both are argued rather than assumed. Do not "fix" either without reading why.

1. **The guest tree is client-rendered.** Doc 08 sketches `<ModuleRenderer>` as a server
   component. Doc 14 §5.4 requires the customizer's preview to render *the real guest
   components*, and a server component cannot mount in the operator's browser. One
   implementation that both surfaces share beats two that drift. The player — the heavy chunk —
   is still lazy-loaded on its own route.

2. **`Repository` sits between the app and Postgres.** Doc 06 specifies Supabase from Phase 0
   and production runs on it. The interface exists so the suite, CI, and an offline demo run
   against an in-memory store with identical semantics. A test suite that needs a database is a
   test suite nobody runs.

## Where the risk actually is

- `lib/catalogue-access.ts` — the only place a guest request is authorised. Draft is not a 404,
  lapsed is a renewal screen, passcode precedes content. Change it once, not per route.
- `lib/admin/session.ts` — the only place `org_id` enters a query. A route that does not call
  `requireOperator` or `requireOwnedCatalogue` is visibly unscoped.
- `modules/registry.ts` — one line per module. A `switch` on module type anywhere else is the
  abstraction leaking.
- `components/admin/UploadManager.tsx` — resumable multi-gigabyte upload is where doc 13 §7 says
  the schedule slips. Do not simplify the offset handling.

## Stack

Next.js 15 App Router · TypeScript strict · Tailwind v4 with CSS custom properties for tenant
theming · Zod for every config and form · Supabase Postgres with RLS · Bunny Stream behind
`lib/video/provider.ts` · Vercel · pnpm.

## Definition of done for Phase 0

A planner is handed a phone, opens a catalogue, taps a film, and it starts playing in under a
second and a half on 4G. Then they watch their own logo and colour appear on it, live, while
someone drags a section into a different order and hits Publish.

Both in the same meeting, or the product does not work yet.
