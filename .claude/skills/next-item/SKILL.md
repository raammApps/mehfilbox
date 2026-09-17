---
name: next-item
description: Pick up the next item from docs/NEXT.md and take it to a commit. Use when the user says "next", "pick up N-nn", "continue the backlog", or names a backlog item. Enforces the repo's own ritual — one item, verified, documented, committed, then stop.
---

# Take one backlog item to a commit

The ritual is in `docs/NEXT.md` under "Picking up an item". This is that, enforced.

## Read only this

```
CLAUDE.md → docs/PROGRESS.md → docs/NEXT.md
```

**Do not read anything else unless the item names it.** The spec is 17 documents; loading it
speculatively is how a cheap session becomes an expensive one. `docs/archive/` is never read.

## Before starting

```bash
pnpm preflight
```

Reports the real state of Supabase and Bunny in a few seconds, and is more trustworthy than any
document — including `NEXT.md`'s own status paragraph.

## Do exactly one item

If the user did not name one, take the topmost item in the highest tier that is **not** blocked on
a credential, a DNS record, or real footage. Say which you picked and why before starting.

Items blocked on Sandeep are listed under "Held by Sandeep" — never start those, and say so if the
top item is one.

## The bar for "done"

This repo's standard is higher than "tests pass", and it is the reason to follow it:

1. **Prove the check by breaking the thing it guards.** Every gate here was verified by
   reintroducing the bug and watching it fail. A green test that has never been red proves nothing.
2. **Cover the code, not the markup.** An entire editing surface was once replaced with every test
   still green.
3. `pnpm verify` and `pnpm test:e2e` both green. Never report completion on a partial run.

## Then, in order

1. `pnpm verify` · `pnpm test:e2e`
2. **If this item changed a row in `docs/PRODUCT.md`, the guide changed too.** Update whichever of
   `docs/help/studio.md` / `docs/help/client.md` describes the affected surface, for the reader it
   affects — a studio-only change touches only the studio guide, a guest-visible one may touch
   neither (guests read nothing published). N-88 exists because this drifted once already; do not
   let it drift again.
3. Commit — say what changed and **why**, in prose. Include what went wrong and what it taught,
   because that is what the next session needs.
4. Move the item **out** of `docs/NEXT.md` and append to `docs/PROGRESS.md`. Do not leave it ticked.
5. **Stop.** Do not start the next item unless asked.

## If it turns out to be stale

Several items have been. Verify before implementing — N-7 was already done and N-8 described
features that had been cut. If it is stale, say so with evidence, remove it, and stop.
