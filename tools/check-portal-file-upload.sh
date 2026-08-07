#!/usr/bin/env bash
set -euo pipefail

if matches=$(grep -RniE --include='*.vue' --include='*.ts' --include='*.tsx' "type[[:space:]]*=[[:space:]]*[\"']file[\"']" apps/portal); then
  printf 'Portal file inputs must use UFileUpload:\n%s\n' "$matches" >&2
  exit 1
fi

printf 'Portal file upload check passed.\n'
