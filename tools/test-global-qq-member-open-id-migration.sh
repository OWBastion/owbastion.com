#!/usr/bin/env bash
set -euo pipefail

root_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
database="$(mktemp "${TMPDIR:-/tmp}/owbastion-global-qq-member-open-id.XXXXXX")"
trap 'rm -f "$database"' EXIT

apply_schema() {
  rm -f "$database"
  sqlite3 "$database" < "$root_dir/migrations/0001_initial.sql"
  sqlite3 "$database" < "$root_dir/migrations/0002_submission_evidence.sql"
  sqlite3 "$database" < "$root_dir/migrations/0003_group_scoped_player_bindings.sql"
  sqlite3 "$database" < "$root_dir/migrations/0004_qq_login.sql"
}

apply_schema
sqlite3 "$database" <<'SQL'
INSERT INTO identities VALUES ('identity-1', 1, 1), ('identity-2', 2, 2);
INSERT INTO player_accounts VALUES ('player-1', '1234', 'Player', 'player', 1, 1);
INSERT INTO bindings VALUES ('binding-1', 'identity-1', 'player-1', 'qq', 'group-a', 'member-1', 1), ('binding-2', 'identity-2', 'player-1', 'qq', 'group-b', 'member-1', 2);
INSERT INTO submissions VALUES ('submission-1', 'binding-2', 'received', 'map_completion', 'Test Map', 'qq', 'group-b', 'message-1', 1, 1);
SQL
sqlite3 -bail "$database" < "$root_dir/migrations/0029_global_qq_member_open_id.sql"
[[ "$(sqlite3 "$database" 'SELECT COUNT(*) FROM bindings;')" == "1" ]]
[[ "$(sqlite3 "$database" 'SELECT binding_id FROM submissions WHERE id = "submission-1";')" == "binding-1" ]]

apply_schema
sqlite3 "$database" <<'SQL'
INSERT INTO identities VALUES ('identity-1', 1, 1), ('identity-2', 2, 2);
INSERT INTO player_accounts VALUES ('player-1', '1234', 'Player', 'player', 1, 1), ('player-2', '5678', 'Other', 'other', 2, 2);
INSERT INTO bindings VALUES ('binding-1', 'identity-1', 'player-1', 'qq', 'group-a', 'member-1', 1), ('binding-2', 'identity-2', 'player-2', 'qq', 'group-b', 'member-1', 2);
SQL
if sqlite3 -bail "$database" < "$root_dir/migrations/0029_global_qq_member_open_id.sql" 2>/dev/null; then
  echo "Expected conflicting QQ member OpenID migration to fail" >&2
  exit 1
fi
[[ "$(sqlite3 "$database" 'SELECT COUNT(*) FROM bindings;')" == "2" ]]

echo "Global QQ member OpenID migration scenarios passed."
