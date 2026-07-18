#!/usr/bin/env bash
set -euo pipefail

if matches=$(rg -n -i "type[[:space:]]*=[[:space:]]*[\"']file[\"']" apps/portal --glob '*.vue' --glob '*.ts' --glob '*.tsx'); then
  printf 'Portal file inputs must use UFileUpload:\n%s\n' "$matches" >&2
  exit 1
fi

printf 'Portal file upload check passed.\n'
