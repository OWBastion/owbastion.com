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

load_dev_var() {
  local key="$1"
  local line
  local value
  if [[ -n "${!key:-}" || ! -f .dev.vars ]]; then
    return
  fi
  while IFS= read -r line || [[ -n "$line" ]]; do
    case "$line" in
      "$key="*)
        value="${line#"$key="}"
        if [[ "$value" == \"*\" && "$value" == *\" ]]; then
          value="${value:1:${#value}-2}"
        elif [[ "$value" == \'*\' && "$value" == *\' ]]; then
          value="${value:1:${#value}-2}"
        fi
        export "$key=$value"
        return
        ;;
    esac
  done < .dev.vars
}

load_dev_var STUDIO_GITHUB_TOKEN

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
