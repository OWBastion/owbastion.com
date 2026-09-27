#!/usr/bin/env bash
set -euo pipefail

root_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
database="$(mktemp "${TMPDIR:-/tmp}/owbastion-qq-login-code-hardening.XXXXXX")"
trap 'rm -f "$database"' EXIT

apply_base_migrations() {
  rm -f "$database"
  while IFS= read -r migration; do
    sqlite3 "$database" < "$migration"
  done < <(find "$root_dir/migrations" -type f -name '*.sql' ! -name '0089_qq_login_attempt_code_hardening.sql' -print | sort)
}

apply_base_migrations
sqlite3 "$database" "INSERT INTO qq_login_attempts (id, token_hash, code_hash, status, expires_at, created_at) VALUES
  ('old-pending', 'token-old', 'shared-code', 'pending', 1000, 100),
  ('new-pending', 'token-new', 'shared-code', 'pending', 2000, 200),
  ('unrelated-pending', 'token-other', 'other-code', 'pending', 3000, 300),
  ('already-verified', 'token-verified', 'verified-code', 'verified', 4000, 400);"

sqlite3 "$database" < "$root_dir/migrations/0089_qq_login_attempt_code_hardening.sql"

statuses="$(sqlite3 "$database" "SELECT id || ':' || status FROM qq_login_attempts ORDER BY id;")"
expected=$'already-verified:verified\nnew-pending:pending\nold-pending:expired\nunrelated-pending:pending'
if [[ "$statuses" != "$expected" ]]; then
  echo "Unexpected post-migration statuses:" >&2
  echo "$statuses" >&2
  exit 1
fi

# The older duplicate is expired, never deleted or rewritten (forward-only repair).
old_row="$(sqlite3 "$database" "SELECT token_hash || ':' || code_hash || ':' || expires_at || ':' || created_at FROM qq_login_attempts WHERE id = 'old-pending';")"
if [[ "$old_row" != "token-old:shared-code:1000:100" ]]; then
  echo "Older duplicate row was rewritten instead of only having its status flipped:" >&2
  echo "$old_row" >&2
  exit 1
fi

# The partial unique index rejects a second live pending attempt for a code still in use.
if sqlite3 "$database" "INSERT INTO qq_login_attempts (id, token_hash, code_hash, status, expires_at, created_at) VALUES ('collide', 'token-collide', 'shared-code', 'pending', 5000, 500);" 2>/tmp/qq-collide-error; then
  echo "Expected a UNIQUE constraint violation when a second pending attempt reuses a live code" >&2
  exit 1
fi
if ! grep -q "UNIQUE constraint failed: qq_login_attempts.code_hash" /tmp/qq-collide-error; then
  echo "Expected the partial unique index to reject the colliding insert:" >&2
  cat /tmp/qq-collide-error >&2
  exit 1
fi
rm -f /tmp/qq-collide-error

# Once the live attempt for a code is no longer pending, the code can be reused.
sqlite3 "$database" "UPDATE qq_login_attempts SET status = 'verified' WHERE id = 'new-pending';"
sqlite3 "$database" "INSERT INTO qq_login_attempts (id, token_hash, code_hash, status, expires_at, created_at) VALUES ('reuse', 'token-reuse', 'shared-code', 'pending', 6000, 600);"
reuse_count="$(sqlite3 "$database" "SELECT COUNT(*) FROM qq_login_attempts WHERE code_hash = 'shared-code' AND status = 'pending';")"
if [[ "$reuse_count" != "1" ]]; then
  echo "Expected exactly one live pending attempt for a reused code, got $reuse_count" >&2
  exit 1
fi

# The verify lookup plan must use the new partial unique index.
plan="$(sqlite3 "$database" "EXPLAIN QUERY PLAN SELECT * FROM qq_login_attempts WHERE code_hash = 'shared-code' AND status = 'pending' AND expires_at > 0;")"
if [[ "$plan" != *"USING INDEX qq_login_attempts_pending_code_idx"* ]]; then
  echo "Expected the verify lookup to use qq_login_attempts_pending_code_idx, got:" >&2
  echo "$plan" >&2
  exit 1
fi

echo "QQ login code hardening migration scenarios passed."
