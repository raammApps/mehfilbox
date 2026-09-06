#!/usr/bin/env bash
#
# Run the app locally against the *real* Supabase and Bunny.
#
# `pnpm dev` uses the file driver and a fake video provider, which is right for building but
# proves nothing about the product: the bugs that mattered — a Play button that 404'd, a player
# that could not load a byte — were all invisible until real services were on the other end.
#
#   ./scripts/dev-live.sh              → http://localhost:3000
#   ./scripts/dev-live.sh 192.168.1.8  → also reachable from a phone on the same wifi
#
# Reads credentials from .env.local. Uses TENANCY_MODE=path so every route works on a bare
# host, with no wildcard DNS and no /etc/hosts edit — the same addressing production runs.
set -euo pipefail

cd "$(dirname "$0")/.."

[ -f .env.local ] || { echo ".env.local not found — run 'pnpm preflight' first."; exit 1; }

# The host guests will type. Only affects share links and OG tags; routing works on any host.
HOST_ADDR="${1:-localhost}"
PORT="${PORT:-3000}"

set -a
# shellcheck disable=SC1091
. ./.env.local
set +a

export DATA_DRIVER=supabase
export VIDEO_DRIVER=bunny
export TENANCY_MODE=path
export ROOT_DOMAIN="${HOST_ADDR}:${PORT}"
# Stable, so an operator session survives a restart. Local only — production generates its own.
export SESSION_SECRET="${SESSION_SECRET:-local-dev-session-secret-0123456789abcdef}"

cat <<INFO

  Real Supabase, real Bunny. Anything you change here changes production data.

    Guest catalogue   http://${HOST_ADDR}:${PORT}/c/aanya-and-vikram
    Admin console     http://${HOST_ADDR}:${PORT}/admin
    Sign in           ${DEV_OPERATOR_EMAIL:-operator@mehfilbox.test} / whatever you set in Supabase

INFO

# -H 0.0.0.0 so a phone on the same network can reach it.
exec pnpm exec next dev --port "$PORT" --hostname 0.0.0.0
