#!/usr/bin/env bash
set -euo pipefail

root_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$root_dir"

export WRANGLER_LOG_PATH=".wrangler/logs"
export WRANGLER_REGISTRY_PATH=".wrangler/registry"
export WRANGLER_WRITE_LOGS=false
export PORTAL_ORIGIN="http://localhost:3000"
export LOCAL_DEV_AUTH=true
export NUXT_PUBLIC_LOCAL_DEV_AUTH=true

pnpm exec wrangler d1 migrations apply DB --local
pnpm run db:seed:local

pnpm run dev:api:local &
api_pid=$!
pnpm run dev:portal:local &
portal_pid=$!

cleanup() {
  kill "$api_pid" "$portal_pid" 2>/dev/null || true
}
trap cleanup EXIT INT TERM

while kill -0 "$api_pid" 2>/dev/null && kill -0 "$portal_pid" 2>/dev/null; do
  sleep 1
done

exit 1
