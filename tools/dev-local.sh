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

api_pid=""
portal_pid=""

stop_tree() {
  local pid="$1"
  local child
  for child in $(pgrep -P "$pid" 2>/dev/null || true); do
    stop_tree "$child"
  done
  kill "$pid" 2>/dev/null || true
}

cleanup() {
  local status=$?
  trap - EXIT INT TERM
  [[ -z "$api_pid" ]] || stop_tree "$api_pid"
  [[ -z "$portal_pid" ]] || stop_tree "$portal_pid"
  [[ -z "$api_pid" ]] || wait "$api_pid" 2>/dev/null || true
  [[ -z "$portal_pid" ]] || wait "$portal_pid" 2>/dev/null || true
  exit "$status"
}

trap cleanup EXIT
trap 'exit 130' INT
trap 'exit 143' TERM

pnpm run dev:api:local </dev/null &
api_pid=$!
pnpm run dev:portal:local </dev/null &
portal_pid=$!

while kill -0 "$api_pid" 2>/dev/null && kill -0 "$portal_pid" 2>/dev/null; do
  sleep 1
done

exit 1
