# Heirloom Films — build documentation

A white-label **video streaming platform for wedding films**. An operator at a wedding
management company logs in, creates a catalogue, uploads the films, arranges sections in a
customizer, and publishes a branded streaming site the couple's guests browse like a
streaming service — profiles, billboard, genre rows, Continue Watching, Trending.

The incumbent it replaces is a 40GB Google Drive folder that buffers.

**This is the specification, written before any code existed.** It was the brief: complete
enough that an agent could be pointed at it and build without further design decisions.

It has largely been built. Where the implementation diverged, the divergence is argued rather
than silent — `../../CLAUDE.md` lists the deliberate deviations and `../PROGRESS.md` records
what changed and why. Read this tree for **what was intended**; read `../ARCHITECTURE.md` for
what actually exists.

## Start here

```bash
# 1. Open the repo in Claude Code
claude

# 2. Paste this as your first prompt:
```

> Read CLAUDE.md and the files listed for P0-01 in docs/13-agent-runbook.md §2.
> Do not read any other documentation.
> Implement P0-01 from docs/09-implementation-plan.md. Only that ticket.
> Then run lint + typecheck, commit, append to docs/PROGRESS.md, and stop.

Then work ticket by ticket. One ticket per commit. `docs/09-implementation-plan.md` is the
running order; do not skip ahead, the dependencies are real.

### Context / session limits

The full doc set is ~32k tokens — **never load it all**. `docs/13-agent-runbook.md §2` maps
every ticket to the two or three files it actually needs (1.5–5k tokens each), and
`docs/PROGRESS.md` lets a fresh session cold-start in ~4k tokens no matter how big the
codebase gets. Doc 13 is the operating manual; read it before doc 01.

## What's here

```
CLAUDE.md                     Project instructions — Claude Code reads this first
docs/00-INDEX.md              Map of everything, plus glossary
docs/01-product-spec.md       Problem, users, features, user stories, acceptance criteria
docs/02-information-architecture.md   Screens, routes, navigation, states
docs/03-wireframes.md         Annotated wireframe notes + grid + card sizing
docs/04-design-system.md      Colour, type, spacing, motion, generated poster art
docs/05-technical-architecture.md     Video pipeline + cost maths, upload, playback, budgets
docs/06-data-model.md         Postgres schema, categories, computed rows, RLS, lifecycle
docs/07-api-contracts.md      Endpoints, payloads, validation, error codes
docs/08-component-spec.md     Props, states and behaviour per component
docs/09-implementation-plan.md        Ordered tickets with acceptance criteria
docs/10-testing-and-acceptance.md     Test strategy, E2E journeys, device checklist
docs/11-whitelabel-and-b2b.md         Pricing, partner onboarding, the pitch, objections
docs/12-compliance-and-risk.md        IP constraints, DPDP, WhatsApp, payments, risk register
docs/13-agent-runbook.md      Per-ticket reading map, context budget, session handoff
docs/14-modules-and-customizer.md  ★ THE DIFFERENTIATOR — module registry + customizer spec
docs/15-partners-and-scale.md      Accounts, handover, entitlements, what breaks at volume
docs/16-platform-v2.md             ★ THE SECOND PASS (12 Sept 2026) — addressing, accounts, themes, styles, credits, health, domains
reference/00-decision-log.md  Why this differs from the original brief (D-1 … D-9)
reference/original-business-case.pdf  The starting document
reference/reference-reel.mp4  The visual reference; frames/ has stills. Described in doc 14 §1
archive/invite-site/          Superseded RSVP-era specs — do NOT build from these
wireframes/index.html         Open this to browse all eight wireframes at once
wireframes/*.svg              Eight annotated wireframes
scripts/make_wireframes.py    Regenerates the wireframes
```

## The four decisions already made

1. **Full streaming design — red on black, built at full fidelity.** All ten mechanics that
   create the feeling (profile gate, hero + scrim, poster rows with a peeking card,
   click-to-open modal, mixed aspect ratios, episode framing, near-black base) are specified
   in `docs/04 §1b` and must not be softened. What differs is only the product **name** and
   **wordmark** — no `-flix` suffix, own logotype, `#d11a2a` rather than `#E50914`. That is
   where enforcement risk actually concentrates, and it costs the guest experience nothing.
   `docs/12 §1` has the full risk gradient.
2. **The customizer is the differentiator, not the streaming UI.** Anyone can copy poster
   rows in a weekend. A module registry plus a non-technical customizer turns a 6–20 hour
   bespoke build into 30 minutes of an operator's time, forty times a season. `docs/14`.
3. **B2B white-label, not direct-to-consumer.** See `docs/11 §1`.
4. ~~**3 months included, then the couple subscribes** at ₹249/mo or ₹1,999/yr. This is what
   fixes the Nov–Jan seasonality. `docs/01 §7`.

## Phasing

| Phase | Goal | Stack | Effort |
|---|---|---|---|
| **0** | Guest catalogue + player + admin + customizer | Supabase + Bunny Stream | ~140h |
| **1** | Billing, subscription lifecycle, analytics, more modules | + Razorpay | ~80h |
| **2** | Org roles, remaining modules, other occasions | | later |

**Phase 1 is conditional on a signed pilot.** If no planner commits, stopping is the correct
outcome, not a failure of the documentation.

**Two numbers decide whether this works:** playback start under 1.5s on 4G, and month-4
subscription conversion above 25%.

## Regenerating the wireframes

```bash
python3 scripts/make_wireframes.py    # stdlib only, writes to wireframes/
```
