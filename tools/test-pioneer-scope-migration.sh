#!/usr/bin/env bash
set -euo pipefail

root_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
database="$(mktemp "${TMPDIR:-/tmp}/owbastion-pioneer-scope.XXXXXX")"
trap 'rm -f "$database"' EXIT

for migration in "$root_dir"/migrations/*.sql; do
  [[ "$(basename "$migration")" == "0056_restrict_pioneer_map_title_scope.sql" ]] && break
  sqlite3 -bail "$database" < "$migration"
done

sqlite3 -cmd 'PRAGMA foreign_keys = ON;' -bail "$database" <<'SQL'
INSERT OR IGNORE INTO title_catalog (key, label, icon, category, condition, availability, scope, display_kind, color_json, game_version)
VALUES ('PIONEER', '开拓者', 'trophy', '地图系列', '完成地图', 'active', 'map', 'map_pioneer', 'null', '2026.07.15');
INSERT INTO maps (id, name, game_version, status, introduced_version, created_at, updated_at)
VALUES ('map.pioneer-test', '开拓者测试地图', '2026.07.15', 'active', '2026.07.15', 1, 1);
INSERT OR IGNORE INTO map_title_rules (id, title_key, kind, condition, evidence_rule, submission_mode, display_kind, slot, map_variant, default_scope, status, introduced_version, created_at, updated_at)
VALUES ('rule.pioneer', 'PIONEER', 'pioneer', '完成地图', '完整截图', 'manual', 'map_pioneer', 'pioneer', NULL, 'all_active', 'active', '2026.07.15', 1, 1);
INSERT INTO map_title_rule_exceptions (id, rule_id, map_id, enabled, created_at, updated_at)
VALUES ('exception.pioneer-test', 'rule.pioneer', 'map.pioneer-test', 1, 1, 1);
INSERT INTO identities (id, created_at, updated_at) VALUES ('identity.pioneer-test', 1, 1);
INSERT INTO player_accounts (id, player_id, player_name, normalized_player_name, is_admin, status, created_at, updated_at)
VALUES ('player.pioneer-test', 'pioneer-test', 'Pioneer Test', 'pioneer test', 0, 'active', 1, 1);
INSERT INTO player_accounts (id, player_id, player_name, normalized_player_name, is_admin, status, created_at, updated_at)
VALUES ('player.pioneer-manual', 'pioneer-manual', 'Pioneer Manual', 'pioneer manual', 0, 'active', 1, 1);
INSERT INTO player_accounts (id, player_id, player_name, normalized_player_name, is_admin, status, created_at, updated_at)
VALUES ('player.pioneer-valid', 'pioneer-valid', 'Pioneer Valid', 'pioneer valid', 0, 'active', 1, 1);
INSERT INTO bindings (id, identity_id, player_account_id, provider, group_open_id, member_open_id, created_at)
VALUES ('binding.pioneer-test', 'identity.pioneer-test', 'player.pioneer-test', 'qq', 'group.pioneer-test', 'member.pioneer-test', 1);
INSERT INTO submissions (id, binding_id, status, challenge_type, challenge_id, target_map_id, map_name, player_name, review_reason, grant_id, rule_snapshot_json, source_provider, source_conversation_id, source_message_id, created_at, updated_at)
VALUES ('submission.pioneer-bad', 'binding.pioneer-test', 'approved', 'map_title_achievement', 'map.pioneer-test.pioneer', 'map.pioneer-test', '开拓者测试地图', 'Pioneer Test', NULL, 'grant.pioneer-bad', '{"defaultScope":"all_active","exceptionId":null}', 'portal', 'portal', 'pioneer-bad', 1, 1);
INSERT INTO submission_reviews (id, submission_id, decision, reason, reviewer, created_at)
VALUES ('review.pioneer-bad', 'submission.pioneer-bad', 'approved', NULL, 'system:ocr', 1);
INSERT INTO submission_spot_checks (id, submission_id, status, policy_json, sampled_at)
VALUES ('spot.pioneer-bad', 'submission.pioneer-bad', 'pending', '{}', 1);
INSERT INTO player_title_grants (id, player_account_id, title_key, map_id, slot, status, source_type, source_id, granted_by, granted_at)
VALUES ('grant.pioneer-bad', 'player.pioneer-test', 'PIONEER', 'map.pioneer-test', 'pioneer', 'active', 'automatic', 'submission.pioneer-bad', 'system:ocr', 1);
INSERT INTO player_title_grants (id, player_account_id, title_key, map_id, slot, status, source_type, source_id, granted_by, granted_at)
VALUES ('grant.pioneer-manual', 'player.pioneer-manual', 'PIONEER', 'map.pioneer-test', 'pioneer', 'active', 'manual', 'manual.pioneer-test', 'admin', 1);
INSERT INTO submissions (id, binding_id, status, challenge_type, challenge_id, target_map_id, map_name, player_name, grant_id, rule_snapshot_json, source_provider, source_conversation_id, source_message_id, created_at, updated_at)
VALUES ('submission.pioneer-valid', 'binding.pioneer-test', 'approved', 'map_title_achievement', 'map.pioneer-test.pioneer', 'map.pioneer-test', '开拓者测试地图', 'Pioneer Valid', 'grant.pioneer-valid', '{"defaultScope":"explicit","exceptionId":"exception.pioneer-test"}', 'portal', 'portal', 'pioneer-valid', 1, 1);
INSERT INTO player_title_grants (id, player_account_id, title_key, map_id, slot, status, source_type, source_id, granted_by, granted_at)
VALUES ('grant.pioneer-valid', 'player.pioneer-valid', 'PIONEER', 'map.pioneer-test', 'pioneer', 'active', 'automatic', 'submission.pioneer-valid', 'system:ocr', 1);
SQL

sqlite3 -cmd 'PRAGMA foreign_keys = ON;' -bail "$database" < "$root_dir/migrations/0056_restrict_pioneer_map_title_scope.sql"

[[ "$(sqlite3 "$database" "SELECT default_scope FROM map_title_rules WHERE id = 'rule.pioneer';")" == "explicit" ]]
[[ "$(sqlite3 "$database" "SELECT status FROM player_title_grants WHERE id = 'grant.pioneer-bad';")" == "revoked" ]]
[[ "$(sqlite3 "$database" "SELECT status FROM player_title_grants WHERE id = 'grant.pioneer-manual';")" == "active" ]]
[[ "$(sqlite3 "$database" "SELECT status FROM player_title_grants WHERE id = 'grant.pioneer-valid';")" == "active" ]]
[[ "$(sqlite3 "$database" "SELECT status || '|' || COALESCE(grant_id, '') FROM submissions WHERE id = 'submission.pioneer-bad';")" == "resubmission_required|" ]]
[[ "$(sqlite3 "$database" "SELECT status || '|' || COALESCE(grant_id, '') FROM submissions WHERE id = 'submission.pioneer-valid';")" == "approved|grant.pioneer-valid" ]]
[[ "$(sqlite3 "$database" "SELECT decision FROM submission_reviews WHERE submission_id = 'submission.pioneer-bad';")" == "resubmission_required" ]]
[[ "$(sqlite3 "$database" "SELECT status FROM submission_spot_checks WHERE submission_id = 'submission.pioneer-bad';")" == "revoked" ]]
[[ "$(sqlite3 "$database" "SELECT COUNT(*) FROM audit_events WHERE operation IN ('title_grant.revoke', 'submission.corrective_review', 'submission.spot_check.revoked');")" == "3" ]]

sqlite3 "$database" "UPDATE map_title_rules SET default_scope = 'all_active' WHERE id = 'rule.pioneer';"
sqlite3 -cmd 'PRAGMA foreign_keys = ON;' -bail "$database" < "$root_dir/migrations/0071_repair_pioneer_map_title_scope.sql"
[[ "$(sqlite3 "$database" "SELECT default_scope FROM map_title_rules WHERE id = 'rule.pioneer';")" == "explicit" ]]

echo "Pioneer scope migration scenarios passed."
