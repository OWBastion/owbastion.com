#!/usr/bin/env bash
set -euo pipefail

query() {
  pnpm exec wrangler d1 execute DB --remote --config wrangler.staging-d1.toml --json --command "$1"
}

submission_schema="$(query "SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'submissions';")"
for status in upload_pending ocr_pending ready_for_review ocr_review_required approved rejected resubmission_required; do
  jq -e --arg status "$status" '.[0].results[0].sql | contains($status)' <<<"$submission_schema" >/dev/null
done

for table in attachments ocr_results upload_sessions submission_reviews; do
  foreign_keys="$(query "PRAGMA foreign_key_list(${table});")"
  jq -e --arg table "submissions" '.[0].results[] | select(.from == "submission_id" and .table == $table)' <<<"$foreign_keys" >/dev/null
done

foreign_key_check="$(query "PRAGMA foreign_key_check;")"
jq -e '.[0].results | length == 0' <<<"$foreign_key_check" >/dev/null

echo "Staging D1 submission and review schema checks passed."
