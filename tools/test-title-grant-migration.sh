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
  [[ "$(basename "$migration")" == "0075_enforce_dominator_conqueror_inheritance.sql" ]] && break
  sqlite3 -bail "$repair_database" < "$migration"
done

sqlite3 -bail "$repair_database" <<'SQL'
INSERT INTO player_accounts (id, player_id, player_name, normalized_player_name, is_admin, status, created_at, updated_at)
VALUES ('migration-repair-player', 'migration-repair', 'Migration Repair', 'migration repair', 0, 'active', 1, 1);
INSERT INTO maps (id, name, game_version, status, introduced_version, created_at, updated_at)
VALUES ('map.migration-repair', 'Migration Repair', 'test', 'active', 'test', 1, 1);
INSERT INTO gameplay_revisions (id, map_id, lifecycle, legacy_map_variant, copied_from_revision_id, reset_reason, game_version, created_at, updated_at)
VALUES ('revision:map.migration-repair:initial', 'map.migration-repair', 'default', NULL, NULL, NULL, 'test', 1, 1);
INSERT INTO player_title_grants (id, player_account_id, title_key, map_id, slot, status, source_type, source_id, granted_by, granted_at)
VALUES ('migration-repair-dominator', 'migration-repair-player', 'DOMINATOR', 'map.migration-repair', 'dominator', 'active', 'automatic', 'migration-repair-submission', 'system:ocr', 1);
UPDATE player_title_grants
SET gameplay_revision_id = 'revision:map.migration-repair:initial'
WHERE id = 'migration-repair-dominator';
SQL

sqlite3 -bail "$repair_database" < "$root_dir/migrations/0075_enforce_dominator_conqueror_inheritance.sql"
[[ "$(sqlite3 "$repair_database" "SELECT COUNT(*) FROM player_title_grants WHERE player_account_id = 'migration-repair-player' AND status = 'active';")" == "2" ]]
[[ "$(sqlite3 "$repair_database" "SELECT slot || '|' || source_type || '|' || source_id FROM player_title_grants WHERE player_account_id = 'migration-repair-player' AND title_key = 'CONQUEROR';")" == "conqueror|automatic|migration-repair-submission" ]]
[[ "$(sqlite3 "$repair_database" "SELECT COUNT(*) FROM audit_events WHERE operation = 'title_grant.inherit' AND entity_type = 'player_title_grant';")" == "1" ]]

sqlite3 -bail "$repair_database" <<'SQL'
INSERT INTO player_accounts (id, player_id, player_name, normalized_player_name, is_admin, status, created_at, updated_at)
VALUES ('migration-trigger-player', 'migration-trigger', 'Migration Trigger', 'migration trigger', 0, 'active', 1, 1);
SQL

sqlite3 -bail "$repair_database" "INSERT INTO player_title_grants (id, player_account_id, title_key, map_id, gameplay_revision_id, slot, status, source_type, source_id, granted_by, granted_at) VALUES ('migration-trigger-dominator', 'migration-trigger-player', 'DOMINATOR', 'map.migration-repair', 'revision:map.migration-repair:initial', 'dominator', 'active', 'manual', 'migration-trigger-manual', 'admin', 2);"
[[ "$(sqlite3 "$repair_database" "SELECT COUNT(*) FROM player_title_grants WHERE player_account_id = 'migration-trigger-player' AND title_key = 'CONQUEROR' AND gameplay_revision_id = 'revision:map.migration-repair:initial' AND status = 'active';")" == "1" ]]
[[ "$(sqlite3 "$repair_database" "SELECT COUNT(*) FROM audit_events WHERE operation = 'title_grant.inherit' AND actor_id = 'trigger:player_title_grants_inherit_conqueror';")" == "1" ]]

echo "Title grant migration scenarios passed."
