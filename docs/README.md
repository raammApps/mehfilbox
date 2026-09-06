# Documentation

Everything written about this project, in one tree.

## Start here

| | |
|---|---|
| [`PRODUCT.md`](./PRODUCT.md) | **What the product is**, surface by surface, with what exists and what does not. Update this first on a pivot. |
| [`ARCHITECTURE.md`](./ARCHITECTURE.md) | How the system fits together, with diagrams. The best single entry point. |
| [`PROGRESS.md`](./PROGRESS.md) | What has been built, and why it was built that way |
| [`NEXT.md`](./NEXT.md) | What is left, in the order to take it up |
| [`ROADMAP.md`](./ROADMAP.md) | **Where the product is going** — the proposed feature set against what exists, every revenue stream, and the phases that get there. Read once when planning. |
| [`DEPLOYMENT.md`](./DEPLOYMENT.md) | Accounts, environment variables, DNS, and the settings that fail silently when wrong |
| [`USAGE-GUIDE.md`](./USAGE-GUIDE.md) | Every workflow, end to end — registration, a wedding built and published, the handover, what a guest sees |
| [`PRICING.md`](./PRICING.md) | **The plans and prices, on one page.** Start here for anything commercial. |
| [`COMPETITORS.md`](./COMPETITORS.md) | Who else sells this, what they charge, and the one finding that should change how we pitch |
| [`SCALE-PLAN.md`](./SCALE-PLAN.md) | Whether Vercel, Bunny and Supabase hold as volume grows, where each one breaks, and the costs that compound |
| [`PRICING-MODEL.md`](./PRICING-MODEL.md) | The working-out behind `PRICING.md` — every cost derived, and what was tried and rejected |

## The rest

| | |
|---|---|
| [`spec/`](./spec/) | The original specification, docs 01–15. **What the product is meant to be**, written before the code existed. |
| [`reference/`](./reference/) | The decision log, the business case, and the reference reel the design is measured against |
| [`wireframes/`](./wireframes/) | SVG wireframes. `spec/03-wireframes.md` carries the same content as text — read that instead; the SVGs are for humans. |
| [`archive/`](./archive/) | Superseded invite-site work. Kept for provenance, never a source of truth. |

## Spec versus reality

`spec/` says what was **intended**. Everything above it says what is **true**.

**The largest divergence is pricing.** Docs 01, 11 and 15 carry the original Phase 0 model —
₹4,000/₹7,000/₹14,000, three months included, ₹249/month afterwards. [`PRICING.md`](./PRICING.md)
is what we sell. Those sections now carry a superseded banner rather than being rewritten, because
their *reasoning* still holds even where the numbers do not. They diverge in
places, and where they do, the divergence is argued rather than silent — `CLAUDE.md` lists the
deliberate deviations, and `PROGRESS.md` records what changed and why.

Only one of them is running in production.
