#!/usr/bin/env bash
set -euo pipefail

root_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$root_dir"

status=0
while IFS= read -r migration; do
  name="$(basename "$migration")"
  if ! rg -q "^INSERT( OR (IGNORE|REPLACE))? INTO" "$migration"; then
    continue
  fi
  if ! rg -Fxq "$name" tools/migration-data-allowlist.txt; then
    echo "Migration contains unregistered data writes: $name" >&2
    status=1
  fi
done < <(rg --files migrations | rg '\.sql$' | sort)

if (( status != 0 )); then
  echo "Add an explicit data-repair exception to tools/migration-data-allowlist.txt or move the data into a seed/import operation." >&2
  exit "$status"
fi

echo "Migration data guard passed."
