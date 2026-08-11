#!/usr/bin/env bash
set -euo pipefail

root_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
database="$(mktemp "${TMPDIR:-/tmp}/owbastion-title-grants.XXXXXX")"
empty_database="$(mktemp "${TMPDIR:-/tmp}/owbastion-title-grants-empty.XXXXXX")"
repair_database="$(mktemp "${TMPDIR:-/tmp}/owbastion-title-grants-repair.XXXXXX")"
trap 'rm -f "$database" "$empty_database" "$repair_database"' EXIT

for migration in "$root_dir"/migrations/*.sql; do
  [[ "$(basename "$migration")" == "0040_generic_title_grants.sql" || "$(basename "$migration")" == "0041_challenge_reward_mapping.sql" ]] && break
  sqlite3 -bail "$database" < "$migration"
done

sqlite3 -bail "$database" <<'SQL'
INSERT INTO player_accounts (id, player_id, player_name, normalized_player_name, is_admin, status, created_at, updated_at)
VALUES ('00000000-0000-4000-8000-000000000001', '1', 'Player', 'player', 0, 'active', 1, 1);
INSERT INTO historical_title_grants (id, scope, map_id, slot, title_key, holder_name, source_version)
VALUES ('00000000-0000-4000-8000-000000000002', 'global', NULL, NULL, 'PIONEER', 'Player', 'test');
INSERT INTO player_title_grants (id, player_account_id, historical_title_grant_id, status, granted_by, granted_at, revoked_by, revoked_at, revoke_reason)
VALUES ('00000000-0000-4000-8000-000000000003', '00000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000002', 'revoked', 'admin', 123, 'admin', 456, 'test revoke');
SQL

sqlite3 -bail "$database" < "$root_dir/migrations/0040_generic_title_grants.sql"
sqlite3 -bail "$database" < "$root_dir/migrations/0041_challenge_reward_mapping.sql"

[[ "$(sqlite3 "$database" "SELECT COUNT(*) FROM player_title_grants;")" == "1" ]]
[[ "$(sqlite3 "$database" "SELECT id || '|' || player_account_id || '|' || title_key || '|' || status || '|' || source_type || '|' || source_id || '|' || granted_at || '|' || revoked_at || '|' || revoke_reason FROM player_title_grants;")" == "00000000-0000-4000-8000-000000000003|00000000-0000-4000-8000-000000000001|PIONEER|revoked|historical|00000000-0000-4000-8000-000000000002|123|456|test revoke" ]]

for migration in "$root_dir"/migrations/*.sql; do
  sqlite3 -bail "$empty_database" < "$migration"
done
[[ "$(sqlite3 "$empty_database" "SELECT COUNT(*) FROM player_title_grants;")" == "0" ]]

for migration in "$root_dir"/migrations/*.sql; do
  [[ "$(basename "$migration")" == "0058_title_grant_inheritance.sql" ]] && break
  sqlite3 -bail "$repair_database" < "$migration"
done

sqlite3 -bail "$repair_database" <<'SQL'
INSERT INTO player_accounts (id, player_id, player_name, normalized_player_name, is_admin, status, created_at, updated_at)
VALUES ('migration-repair-player', 'migration-repair', 'Migration Repair', 'migration repair', 0, 'active', 1, 1);
INSERT INTO player_title_grants (id, player_account_id, title_key, map_id, slot, status, source_type, source_id, granted_by, granted_at)
VALUES ('migration-repair-dominator', 'migration-repair-player', 'DOMINATOR', 'map.dorado', 'dominator', 'active', 'automatic', 'migration-repair-submission', 'system:ocr', 1);
SQL

sqlite3 -bail "$repair_database" < "$root_dir/migrations/0058_title_grant_inheritance.sql"
[[ "$(sqlite3 "$repair_database" "SELECT COUNT(*) FROM player_title_grants WHERE player_account_id = 'migration-repair-player' AND status = 'active';")" == "2" ]]
[[ "$(sqlite3 "$repair_database" "SELECT slot || '|' || source_type || '|' || source_id FROM player_title_grants WHERE player_account_id = 'migration-repair-player' AND title_key = 'CONQUEROR';")" == "conqueror|automatic|migration-repair-submission" ]]
[[ "$(sqlite3 "$repair_database" "SELECT COUNT(*) FROM audit_events WHERE operation = 'title_grant.inherit' AND entity_type = 'player_title_grant';")" == "1" ]]

echo "Title grant migration scenarios passed."
