# Heirloom Films — Documentation Index

Read in this order. Each document states its own audience and what depends on it.

| # | Document | What it answers | Read before |
|---|---|---|---|
| 01 | [Product Spec](01-product-spec.md) | Who is this for, what does it do, what does "done" mean | Everything |
| 02 | [Information Architecture](02-information-architecture.md) | What screens exist, what routes, what navigation | Wireframes |
| 03 | [Wireframes](03-wireframes.md) | What each screen looks like, annotated | Component work |
| 04 | [Design System](04-design-system.md) | Tokens, type scale, colour, motion, spacing | Any UI code |
| 05 | [Technical Architecture](05-technical-architecture.md) | Multi-tenancy, rendering, hosting, media | Any backend work |
| 06 | [Data Model](06-data-model.md) | Tenant config schema, DB tables, example payloads | API work |
| 07 | [API Contracts](07-api-contracts.md) | Endpoints, request/response, validation, errors | Form work |
| 08 | [Component Spec](08-component-spec.md) | Props, states, behaviour per component | Implementation |
| 09 | [Implementation Plan](09-implementation-plan.md) | Ordered tickets with acceptance criteria | Starting work |
| 10 | [Testing & Acceptance](10-testing-and-acceptance.md) | How we know it works | Marking done |
| 11 | [White-label & B2B](11-whitelabel-and-b2b.md) | How a planner brands it, what we charge | Pitching |
| 12 | [Compliance & Risk](12-compliance-and-risk.md) | IP, DPDP Act, payments, what will bite us | Launch |
| 13 | [Agent Runbook](13-agent-runbook.md) | Which files to load per ticket; how not to blow a session | **Anything — read this first** |
| 14 | [Modules & Customizer](14-modules-and-customizer.md) | **The differentiator.** Module registry, contract, customizer spec | Any module or admin work |
| 15 | [Partners & Scale](15-partners-and-scale.md) | Who accounts belong to, how a catalogue changes hands, what breaks at volume | Any account or billing work |
| 16 | [The platform, second pass](16-platform-v2.md) | **12 September 2026.** Tenant-path addressing, two sign-in doors, couple accounts, themes, house styles, credits, the platform console, health, custom domains | Built the same day as N-60 to N-75 — read it for *why*, `PROGRESS.md` for *what* |

Also in `/reference`: `00-decision-log.md` (why this differs from the original brief),
`original-business-case.pdf`, `reference-reel.mp4` and `frames/*.jpg` (the visual reference —
described in text in doc 14 §1).
`/archive/invite-site/` holds the superseded RSVP-era specs. **Do not build from those.**

> **Do not read this whole set in one session.** See doc 13 §2 for the per-ticket reading map.

## Glossary

| Term | Meaning |
|---|---|
| **Org / Partner** | A wedding management company. Owns many catalogues. Our customer. |
| **Operator** | A person at that company who logs into the admin and builds catalogues. |
| **Catalogue** | One wedding. Resolved from subdomain (`aanya-vikram.heirloomfilms.app`) or custom domain. |
| **Title** | One video. Has a name, synopsis, category, poster and playback asset. |
| **Category** | The "genre" a title belongs to — sangeet, highlights, aerial… Fixed vocabulary, doc 06 §2. |
| **Module** | One section of a catalogue — a row, the billboard, a letter, a photo grid. Doc 14. |
| **Customizer** | The operator UI for arranging and configuring modules. The differentiator. |
| **Profile** | A device-local viewer identity ("Bride's side"). Never a person's name. |
| **Poster** | Card artwork for a title. |

## Naming note

**"Heirloom Films"** is a working name. Before any public launch, run a trademark search on the
Indian TM registry (classes 42 and 45) and a domain check. Do not print it on planner
collateral until that clears. See `docs/12-compliance-and-risk.md §3`.

---

## Working files (not part of the specification)

| File | What it is |
|---|---|
| `PROGRESS.md` | What has been built, and the reasoning that is not obvious from the code |
| `NEXT.md` | The ordered backlog. Start here to decide what to do next. |
