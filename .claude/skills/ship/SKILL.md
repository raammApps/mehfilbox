---
name: ship
description: Verify, commit, push and deploy to production, then confirm the deployment is actually live. Use when asked to ship, deploy, release, or push changes to production.
---

# Ship

Committed is not deployed. That gap has already cost this project once — a full console rebuild
sat on a local branch while production showed the old UI.

## 1. Verify — all of it

```bash
pnpm verify && pnpm test:e2e
```

`verify` is lint · typecheck · unit · knip · contrast. E2E runs three Playwright projects
including **path mode, which is what production runs**. Never ship on a partial run, and never
report success without reading the output.

If a build-affecting change was made, also:

```bash
pnpm build && pnpm check:bundle && pnpm check:vitals
```

## 2. Commit

Say what changed and **why**. Include what went wrong and what it taught — that is what the next
session needs, and this repo's history is genuinely useful because of it.

**If `docs/PRODUCT.md` changed in this change, check `docs/help/studio.md` and
`docs/help/client.md` before committing.** They are published at `/help/studio` and `/help/client`
straight from the repo (N-88) — a deploy that changes what the product does without touching the
guide is exactly the drift N-88 fixed. Refuse to call the ticket done on a `PRODUCT.md` change
that left both guides untouched without a reason.

## 3. Push and deploy

```bash
git push origin main
./scripts/deploy-vercel.sh
```

The script pushes every environment variable from `.env.vercel.local` first, then deploys. The
filename matters: `.env.production.local` would be auto-loaded by any local production build and
has broken 44 E2E tests before.

## 4. Confirm it is actually live

```bash
curl -s https://marquee-film-pub.vercel.app/api/health
```

Check **`version` matches the commit you just pushed**, and that
`drivers` reads `{"data":"supabase","video":"bunny"}`. Anything else means the environment did not
take. Report the hash you saw.

## 5. Tell the user

Say what is live, the commit it corresponds to, and anything you did **not** verify. If you did not
see the UI, say so — tests and a version hash are not the same as looking at it.

## Never

- Deploy without the user having asked for it in this session.
- Report "deployed" without the health check.
- Say "committed" and let the user assume it is live.
