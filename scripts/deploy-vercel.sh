#!/usr/bin/env bash
#
# Push every environment variable to Vercel, then deploy.
#
# Exists because setting fifteen variables by hand in a web form is where a deploy goes wrong:
# one typo in BUNNY_TOKEN_AUTH_KEY and every guest gets a 403, with a green build and no error
# anywhere. This reads `.env.vercel.local` by default, which is generated and gitignored, so the
# values are the same ones the local verification scripts already proved work.
#
#   vercel login          # once, interactive — this script cannot do it for you
#   ./scripts/deploy-vercel.sh
#
# Staging (N-87): VERCEL_TARGET=preview VERCEL_ENV_FILE=.env.staging.local ./scripts/deploy-vercel.sh
# pushes to the Preview environment from a second file instead, and deploys without `--prod` — a
# plain preview build. `docs/DEPLOYMENT.md`'s staging section covers the rest of the ritual: the
# second Supabase project and Bunny library the values in that file point at, and pointing
# staging.mehfilbox.com at the deploying branch, once, in the Vercel dashboard.
#
# The filename matters. Next.js auto-loads `.env.production.local` on *any* production build,
# so holding deploy values there silently applies them to local builds too — which cost an
# afternoon: TENANCY_MODE=path leaked in, middleware became a no-op, and 44 E2E tests failed
# pointing at Next rather than at a filename. Next only ever loads `.env.local` and
# `.env.<NODE_ENV>.local`, and NODE_ENV is development|production|test, so `.env.vercel.local`
# (and `.env.staging.local`) are inert while `.env*.local` still keeps them out of git.
#
# Idempotent: re-running replaces each variable rather than erroring on a duplicate.
set -euo pipefail

cd "$(dirname "$0")/.."

ENV_FILE="${VERCEL_ENV_FILE:-.env.vercel.local}"
PROJECT="${VERCEL_PROJECT:-mehfilbox}"
TARGET="${VERCEL_TARGET:-production}"
# `vercel --prod --yes` is not reliably enough on its own — 18 September found it building the
# right commit and attaching it to *no* domain at all, right after the project's GitHub connection
# was touched (tried, then reverted the same day: it broke this, and never delivered the auto-deploy
# it promised — docs/DEPLOYMENT.md §7). So production always aliases explicitly below, regardless
# of whatever Vercel's own git-linked state happens to be.
IFS=',' read -ra PRODUCTION_DOMAINS <<< "${VERCEL_PRODUCTION_DOMAINS:-mehfilbox.com,mehfilbox.in,heirloomfilms.in}"

command -v vercel >/dev/null 2>&1 || {
  echo "The Vercel CLI is not installed."
  echo "  npm i -g vercel   (or: pnpm dlx vercel ...)"
  exit 1
}

[ -f "$ENV_FILE" ] || {
  echo "$ENV_FILE not found. It is generated and gitignored; see docs/DEPLOYMENT.md §6."
  exit 1
}

# Fails fast and clearly rather than deep inside `vercel env add`.
vercel whoami >/dev/null 2>&1 || {
  echo "Not authenticated. Run 'vercel login' first — it needs a browser, so it cannot be"
  echo "scripted. Alternatively export VERCEL_TOKEN."
  exit 1
}

# `vercel link --yes --project X` CREATES the project when X does not exist. That is how a
# rename once produced a second, empty project: the script linked to the new name, deployed
# there, and production carried on serving the old build from the old project. Nothing failed —
# the deploy reported success, and only comparing /api/health to HEAD exposed it.
#
# So: refuse to link to a project that is not already there. A missing project is a mistake in
# the name or an incomplete rename, never something a deploy script should silently fix.
echo "→ linking project '$PROJECT'"
# `2>&1`, not `2>/dev/null`: the Vercel CLI prints the project list on **stderr**. Discarding it
# made this check see an empty list and refuse every deploy — fail-closed, and still wrong.
if ! vercel project ls 2>&1 | grep -qE "(^|[[:space:]])${PROJECT}([[:space:]]|$)"; then
  echo "No Vercel project named '$PROJECT'."
  echo "Refusing to link, because --yes would CREATE it and deploy into an empty project while"
  echo "production keeps serving the old one. Rename the project first, or set VERCEL_PROJECT."
  exit 1
fi
vercel link --yes --project "$PROJECT" >/dev/null

echo "→ pushing environment ($TARGET)"
pushed=0
while IFS= read -r line; do
  # Skip comments and blanks.
  [[ "$line" =~ ^[[:space:]]*# ]] && continue
  [[ -z "${line// }" ]] && continue
  [[ "$line" != *=* ]] && continue

  name="${line%%=*}"
  value="${line#*=}"
  [ -z "$value" ] && { echo "   ! $name is empty, skipping"; continue; }

  # Remove first so a re-run updates rather than fails. The redirect is deliberate: a missing
  # variable is not an error on a first run.
  vercel env rm "$name" "$TARGET" --yes >/dev/null 2>&1 || true
  printf '%s' "$value" | vercel env add "$name" "$TARGET" >/dev/null
  echo "   ✓ $name"
  pushed=$((pushed + 1))
done < "$ENV_FILE"

echo "→ $pushed variables set"
echo "→ deploying ($TARGET)"
if [ "$TARGET" = "production" ]; then
  DEPLOY_LOG="$(vercel --prod --yes 2>&1 | tee /dev/stderr)"
else
  # No --prod: an ordinary preview build. Its stable URL comes from the Vercel dashboard's own
  # branch-to-domain assignment (staging.mehfilbox.com → the branch this deploys from), configured
  # once — this script only ever pushes variables and triggers the build.
  DEPLOY_LOG="$(vercel --yes 2>&1 | tee /dev/stderr)"
fi

if [ "$TARGET" = "production" ]; then
  # The deployment's own URL is the first `"url"` key in the JSON summary Vercel prints in this
  # (non-interactive) mode — not `inspectorUrl` or `deploymentApiUrl`, which are different key
  # names and so never match this exact pattern.
  DEPLOY_URL="$(grep -oE '"url": *"[^"]+"' <<<"$DEPLOY_LOG" | head -1 | sed -E 's/.*"([^"]+)"$/\1/')"
  if [ -z "$DEPLOY_URL" ]; then
    echo "! Could not find the new deployment's URL in Vercel's own output — alias by hand:"
    echo "    vercel alias set <deployment-url> <domain>   for each of: ${PRODUCTION_DOMAINS[*]}"
  else
    echo "→ aliasing production domains to $DEPLOY_URL"
    for domain in "${PRODUCTION_DOMAINS[@]}"; do
      vercel alias set "$DEPLOY_URL" "$domain"
      echo "   ✓ $domain"
    done
  fi
fi

cat <<'NEXT'

Deployed. Now verify, in this order — each catches a different failure:

  1. curl https://<deployment>/api/health
     Expect "drivers":{"data":"supabase","video":"bunny"}.
     Anything else means the environment did not take.

  2. Sign in at /admin and create a catalogue.

  3. Point the Bunny library's webhook at https://<deployment>/api/webhooks/bunny,
     upload one film, and watch it reach `ready` on its own. That is the only way to
     confirm the webhook signature — it needs a public URL, so it cannot be tested
     locally. If it sits in `processing`, check the logs for
     'bunny webhook: signature mismatch', which prints the headers it actually saw.

  4. If ROOT_DOMAIN does not match the real deployment URL, update it and redeploy.
     In path mode a wrong value only breaks share links and the OG card, not routing.

NEXT
