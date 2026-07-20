#!/usr/bin/env bash
set -euo pipefail

root_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
database="$(mktemp "${TMPDIR:-/tmp}/owbastion-single-active-group.XXXXXX")"
trap 'rm -f "$database"' EXIT

apply_migrations() {
  rm -f "$database"
  sqlite3 "$database" < "$root_dir/migrations/0004_qq_login.sql"
  sqlite3 "$database" < "$root_dir/migrations/0026_single_active_qq_group.sql"
  sqlite3 "$database" < "$root_dir/migrations/0027_qq_group_lifecycle_order.sql"
}

assert_rows() {
  local actual="$1"
  local expected="$2"
  if [[ "$actual" != "$expected" ]]; then
    echo "Unexpected migrated QQ group rows:" >&2
    echo "$actual" >&2
    exit 1
  fi
}

apply_migrations
[[ "$(sqlite3 "$database" 'SELECT COUNT(*) FROM qq_group_access;')" == "0" ]]

rm -f "$database"
sqlite3 "$database" < "$root_dir/migrations/0004_qq_login.sql"
sqlite3 "$database" "INSERT INTO qq_group_access VALUES ('test-group', 'test', 1, 0, 0), ('production-group', 'production', 1, 0, 0);"
sqlite3 "$database" < "$root_dir/migrations/0026_single_active_qq_group.sql"
sqlite3 "$database" < "$root_dir/migrations/0027_qq_group_lifecycle_order.sql"
assert_rows "$(sqlite3 "$database" "SELECT group_open_id || ':' || status || ':' || bind_enabled || ':' || verify_enabled FROM qq_group_access ORDER BY group_open_id;")" $'production-group:pending:0:0\ntest-group:pending:0:0'

rm -f "$database"
sqlite3 "$database" < "$root_dir/migrations/0004_qq_login.sql"
sqlite3 "$database" "INSERT INTO qq_group_access VALUES ('enabled-group', 'test', 1, 0, 0), ('closed-group', 'production', 0, 0, 0);"
sqlite3 "$database" < "$root_dir/migrations/0026_single_active_qq_group.sql"
sqlite3 "$database" < "$root_dir/migrations/0027_qq_group_lifecycle_order.sql"
assert_rows "$(sqlite3 "$database" "SELECT group_open_id || ':' || status || ':' || bind_enabled || ':' || verify_enabled FROM qq_group_access ORDER BY group_open_id;")" $'closed-group:legacy:0:0\nenabled-group:pending:0:0'

echo "Single active QQ group migration scenarios passed."
