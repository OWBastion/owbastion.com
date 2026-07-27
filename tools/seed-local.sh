#!/usr/bin/env bash
set -euo pipefail

root_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$root_dir"

export WRANGLER_LOG_PATH=".wrangler/logs"
export WRANGLER_REGISTRY_PATH=".wrangler/registry"
export WRANGLER_WRITE_LOGS=false

pnpm exec wrangler d1 execute DB --local --file=scripts/seed-local.sql
