#!/usr/bin/env bash
set -euo pipefail

root_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
database="$(mktemp "${TMPDIR:-/tmp}/owbastion-title-lifecycle.XXXXXX")"
trap 'rm -f "$database"' EXIT

for migration in "$root_dir"/migrations/*.sql; do
  [[ "$(basename "$migration")" == "0107_title_lifecycle_draft_active.sql" ]] && break
  sqlite3 -bail "$database" < "$migration"
done

# Seed one row in every table that references title_catalog, every CASCADE
# grandchild of the parents 0107 empties, every NO ACTION grandchild that must
# survive through defer_foreign_keys, plus a retired title, so the rebuild
# proves it preserves the whole graph and rewrites lifecycle.
sqlite3 -bail "$database" <<'SQL'
INSERT INTO player_accounts (id, player_id, player_name, normalized_player_name, is_admin, status, created_at, updated_at)
VALUES ('lifecycle-player', 'lifecycle', 'Lifecycle Player', 'lifecycle player', 0, 'active', 1, 1);
INSERT INTO maps (id, name, game_version, status, introduced_version, created_at, updated_at)
VALUES ('map.lifecycle', 'Lifecycle Map', '26.1003.1', 'active', '26.1003.1', 1, 1);
INSERT INTO random_events (id, name, category, rarity, description, game_version, release_status, created_at, updated_at)
VALUES ('event.lifecycle', 'Lifecycle Event', 'test', 'common', 'Test', '26.1003.1', 'implemented', 1, 1);
INSERT INTO binding_invites (id, code_hash, player_name, normalized_player_name, player_id, created_by, created_at, expires_at)
VALUES ('invite.lifecycle', 'hash.lifecycle', 'Lifecycle Player', 'lifecycle player', 'lifecycle', 'admin', 1, 9999999999);
INSERT INTO title_catalog (key, label, category, condition, scope, display_kind, lifecycle, public_visibility, game_version)
VALUES
  ('LIFECYCLE_RETIRED', '已结束', '测试', '条件', 'global', 'fixed', 'retired', 1, '26.1003.1'),
  ('LIFECYCLE_DRAFT', '草稿', '测试', '条件', 'global', 'fixed', 'draft', 1, NULL),
  ('LIFECYCLE_ACTIVE', '启用', '测试', '条件', 'map', 'map_name_suffix', 'active', 1, NULL),
  ('LIFECYCLE_EQUIPPABLE', '可装备', '测试', '条件', 'global', 'fixed', 'active', 1, '26.1003.1');
INSERT INTO title_challenges (id, title_key, condition, evidence_rule, submission_mode, status, scope, game_version, created_at, updated_at)
VALUES
  ('title.LIFECYCLE_RETIRED.one', 'LIFECYCLE_RETIRED', '条件', '证据', 'manual', 'archived', 'global', '26.1003.1', 1, 1),
  ('title.LIFECYCLE_RETIRED.two', 'LIFECYCLE_RETIRED', '条件', '证据', 'manual', 'active', 'global', '26.1003.1', 1, 1);
UPDATE title_challenges SET replaced_by_challenge_id = 'title.LIFECYCLE_RETIRED.two' WHERE id = 'title.LIFECYCLE_RETIRED.one';
INSERT INTO random_event_title_challenges (event_id, challenge_id) VALUES ('event.lifecycle', 'title.LIFECYCLE_RETIRED.one');
INSERT INTO achievement_challenge_maps (challenge_id, map_id) VALUES ('title.LIFECYCLE_RETIRED.one', 'map.lifecycle');
INSERT INTO map_title_rules (id, title_key, kind, condition, evidence_rule, display_kind, status, introduced_version, created_at, updated_at)
VALUES ('rule.lifecycle', 'LIFECYCLE_ACTIVE', 'lifecycle-test', '规则条件', '证据', 'map_name_suffix', 'active', '26.1003.1', 1, 1);
INSERT INTO map_title_rule_exceptions (id, rule_id, map_id, enabled, created_at, updated_at)
VALUES ('exception.lifecycle', 'rule.lifecycle', 'map.lifecycle', 1, 1, 1);
INSERT INTO map_title_rule_compat (legacy_challenge_id, rule_id, map_id, created_at)
VALUES ('legacy.lifecycle', 'rule.lifecycle', 'map.lifecycle', 1);
INSERT INTO map_title_rewards (map_id, slot, title_key, pioneer_prefixes_json)
VALUES ('map.lifecycle', 'pioneer', 'LIFECYCLE_ACTIVE', '[]');
INSERT INTO achievement_challenges (id, map_id, type, name, difficulty, game_version, status, introduced_version, reward_title_key, created_at, updated_at)
VALUES ('achievement.lifecycle', 'map.lifecycle', 'difficulty_completion', 'Lifecycle', '困难', '26.1003.1', 'active', '26.1003.1', 'LIFECYCLE_ACTIVE', 1, 1);
INSERT INTO random_event_map_challenges (event_id, challenge_id) VALUES ('event.lifecycle', 'achievement.lifecycle');
INSERT INTO historical_title_grants (id, scope, map_id, slot, title_key, holder_name, source_version)
VALUES ('historical.lifecycle', 'map', 'map.lifecycle', 'pioneer', 'LIFECYCLE_ACTIVE', 'Holder', '26.1003.1');
INSERT INTO binding_invite_historical_title_grants (id, invite_id, historical_title_grant_id, authorized_by, status, created_at)
VALUES ('invitegrant.lifecycle', 'invite.lifecycle', 'historical.lifecycle', 'admin', 'authorized', 1);
INSERT INTO challenges (id, source_family, source_id, title_key, status, condition, created_at, updated_at)
VALUES
  ('challenge.lifecycle', 'title_challenge', 'title.LIFECYCLE_RETIRED.one', 'LIFECYCLE_RETIRED', 'archived', '条件', 1, 1),
  ('challenge.lifecycle.two', 'title_challenge', 'title.LIFECYCLE_RETIRED.two', 'LIFECYCLE_RETIRED', 'active', '条件', 1, 1);
INSERT INTO challenge_completions (id, player_account_id, challenge_id, status, source_type, source_id, completed_at, created_at)
VALUES ('completion.lifecycle', 'lifecycle-player', 'challenge.lifecycle', 'active', 'manual', 'source.lifecycle', 1, 1);
INSERT INTO challenge_satisfies (challenge_id, satisfied_challenge_id, created_at)
VALUES ('challenge.lifecycle.two', 'challenge.lifecycle', 1);
INSERT INTO player_title_grants (id, player_account_id, title_key, map_id, slot, status, source_type, source_id, granted_by, granted_at, completion_id)
VALUES
  ('grant.lifecycle', 'lifecycle-player', 'LIFECYCLE_ACTIVE', 'map.lifecycle', 'pioneer', 'active', 'manual', 'lifecycle-source', 'admin', 1, NULL),
  ('grant.lifecycle.equip', 'lifecycle-player', 'LIFECYCLE_EQUIPPABLE', NULL, NULL, 'active', 'manual', 'lifecycle-source-equip', 'admin', 1, 'completion.lifecycle');
INSERT INTO player_equipped_titles (grant_id, player_account_id, equipped_at)
VALUES ('grant.lifecycle.equip', 'lifecycle-player', 1);
SQL

snapshot() {
  sqlite3 "$database" "SELECT (SELECT COUNT(*) FROM title_catalog) || '|' ||
    (SELECT COUNT(*) FROM title_challenges) || '|' ||
    (SELECT COUNT(*) FROM random_event_title_challenges) || '|' ||
    (SELECT COUNT(*) FROM achievement_challenge_maps) || '|' ||
    (SELECT COUNT(*) FROM random_event_map_challenges) || '|' ||
    (SELECT COUNT(*) FROM map_title_rules) || '|' ||
    (SELECT COUNT(*) FROM map_title_rule_exceptions) || '|' ||
    (SELECT COUNT(*) FROM map_title_rule_compat) || '|' ||
    (SELECT COUNT(*) FROM map_title_rewards) || '|' ||
    (SELECT COUNT(*) FROM achievement_challenges) || '|' ||
    (SELECT COUNT(*) FROM historical_title_grants) || '|' ||
    (SELECT COUNT(*) FROM binding_invite_historical_title_grants) || '|' ||
    (SELECT COUNT(*) FROM player_title_grants) || '|' ||
    (SELECT COUNT(*) FROM player_equipped_titles) || '|' ||
    (SELECT COUNT(*) FROM challenges) || '|' ||
    (SELECT COUNT(*) FROM challenge_completions) || '|' ||
    (SELECT COUNT(*) FROM challenge_satisfies);"
}
before="$(snapshot)"

# D1 enforces foreign keys and applies each migration in one transaction, so
# the rehearsal does the same: FK on, BEGIN, the file, COMMIT.
(echo "PRAGMA foreign_keys=ON; BEGIN;"; cat "$root_dir/migrations/0107_title_lifecycle_draft_active.sql"; echo "COMMIT;") | sqlite3 -bail "$database"

[[ "$(snapshot)" == "$before" ]]
[[ "$(sqlite3 "$database" "SELECT key || '|' || lifecycle FROM title_catalog WHERE key LIKE 'LIFECYCLE_%' ORDER BY key;")" == $'LIFECYCLE_ACTIVE|active\nLIFECYCLE_DRAFT|draft\nLIFECYCLE_EQUIPPABLE|active\nLIFECYCLE_RETIRED|active' ]]
[[ "$(sqlite3 "$database" "PRAGMA foreign_key_check;" | wc -l | tr -d ' ')" == "0" ]]
[[ "$(sqlite3 "$database" "SELECT COUNT(*) FROM sqlite_master WHERE type='index' AND name='title_catalog_scope_idx';")" == "1" ]]
[[ "$(sqlite3 "$database" "SELECT COUNT(*) FROM sqlite_master WHERE type='trigger' AND name='player_equipped_titles_validate_insert';")" == "1" ]]
# Staged grandchildren keep their exact contents, not just their row count.
[[ "$(sqlite3 "$database" "SELECT event_id || '|' || challenge_id FROM random_event_title_challenges WHERE challenge_id LIKE 'title.LIFECYCLE_%';")" == "event.lifecycle|title.LIFECYCLE_RETIRED.one" ]]
[[ "$(sqlite3 "$database" "SELECT challenge_id || '|' || map_id FROM achievement_challenge_maps WHERE challenge_id LIKE 'title.LIFECYCLE_%';")" == "title.LIFECYCLE_RETIRED.one|map.lifecycle" ]]
[[ "$(sqlite3 "$database" "SELECT event_id || '|' || challenge_id FROM random_event_map_challenges WHERE challenge_id = 'achievement.lifecycle';")" == "event.lifecycle|achievement.lifecycle" ]]
[[ "$(sqlite3 "$database" "SELECT grant_id FROM player_equipped_titles WHERE grant_id = 'grant.lifecycle.equip';")" == "grant.lifecycle.equip" ]]
[[ "$(sqlite3 "$database" "SELECT challenge_id || '|' || satisfied_challenge_id FROM challenge_satisfies WHERE challenge_id = 'challenge.lifecycle.two';")" == "challenge.lifecycle.two|challenge.lifecycle" ]]
[[ "$(sqlite3 "$database" "SELECT replaced_by_challenge_id FROM title_challenges WHERE id='title.LIFECYCLE_RETIRED.one';")" == "title.LIFECYCLE_RETIRED.two" ]]

# The rebuilt table must enforce the new lifecycle CHECK.
if sqlite3 "$database" "INSERT INTO title_catalog (key,label,category,condition,scope,display_kind,lifecycle) VALUES ('BAD','b','b','b','global','fixed','retired');" 2>/dev/null; then
  echo "title_catalog still accepts lifecycle='retired'" >&2
  exit 1
fi
sqlite3 "$database" "INSERT INTO title_catalog (key,label,category,condition,scope,display_kind,lifecycle) VALUES ('NEW_DRAFT','b','b','b','global','fixed','draft');"
[[ "$(sqlite3 "$database" "SELECT lifecycle FROM title_catalog WHERE key='NEW_DRAFT';")" == "draft" ]]

echo "Title lifecycle migration scenarios passed."
