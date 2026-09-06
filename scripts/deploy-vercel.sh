#!/usr/bin/env bash
#
# Push every production environment variable to Vercel, then deploy.
#
# Exists because setting fifteen variables by hand in a web form is where a deploy goes wrong:
# one typo in BUNNY_TOKEN_AUTH_KEY and every guest gets a 403, with a green build and no error
# anywhere. This reads `.env.production.local`, which is generated and gitignored, so the values
# are the same ones the local verification scripts already proved work.
#
#   vercel login          # once, interactive — this script cannot do it for you
#   ./scripts/deploy-vercel.sh
#
# The filename matters. Next.js auto-loads `.env.production.local` on *any* production build,
# so holding deploy values there silently applies them to local builds too — which cost an
# afternoon: TENANCY_MODE=path leaked in, middleware became a no-op, and 44 E2E tests failed
# pointing at Next rather than at a filename. Next only ever loads `.env.local` and
# `.env.<NODE_ENV>.local`, and NODE_ENV is development|production|test, so `.env.vercel.local`
# is inert while `.env*.local` still keeps it out of git.
#
# Idempotent: re-running replaces each variable rather than erroring on a duplicate.
set -euo pipefail

cd "$(dirname "$0")/.."

ENV_FILE=".env.vercel.local"
PROJECT="${VERCEL_PROJECT:-mehfilbox}"
TARGET="${VERCEL_TARGET:-production}"

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
if ! vercel project ls 2>/dev/null | grep -qE "(^|[[:space:]])${PROJECT}([[:space:]]|$)"; then
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
echo "→ deploying"
vercel --prod --yes

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
