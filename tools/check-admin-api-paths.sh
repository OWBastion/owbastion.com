#!/usr/bin/env bash
set -euo pipefail

matches="$(
  find apps/portal \
    -path 'apps/portal/server' -prune -o \
    -type f \( -name '*.vue' -o -name '*.ts' -o -name '*.tsx' \) \
    ! -path 'apps/portal/composables/useAdminApi.ts' \
    ! -path 'apps/portal/composables/useAdminApi.test.ts' \
    -print0 \
  | xargs -0 grep -nHF '/v1/admin' || true
)"

if [[ -n "$matches" ]]; then
  printf 'useAdminApi callers must use proxy-relative /v1/... paths without the /admin prefix:\n%s\n' "$matches" >&2
  exit 1
fi

printf 'Admin API path contract check passed.\n'
