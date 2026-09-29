#!/usr/bin/env bash
set -euo pipefail

root_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
empty_database="$(mktemp -t owbastion-screenshot-sets-empty.XXXXXX)"
representative_database="$(mktemp -t owbastion-screenshot-sets-representative.XXXXXX)"
trap 'rm -f "$empty_database" "$representative_database"' EXIT

apply_migrations() {
  local database="$1"
  local skip_latest="${2:-false}"
  while IFS= read -r migration; do
    local name="$(basename "$migration")"
    if [[ "$skip_latest" == "true" && "$name" == "0092_screenshot_sets.sql" ]]; then continue; fi
    sqlite3 -bail "$database" < "$migration"
  done < <(find "$root_dir/migrations" -maxdepth 1 -name '*.sql' -print | sort)
}

apply_migrations "$empty_database"
[[ "$(sqlite3 "$empty_database" "SELECT COUNT(*) FROM sqlite_master WHERE type = 'table' AND name = 'screenshot_sets';")" == "1" ]]
[[ "$(sqlite3 "$empty_database" "SELECT COUNT(*) FROM sqlite_master WHERE type = 'table' AND name = 'screenshot_set_members';")" == "1" ]]
[[ "$(sqlite3 "$empty_database" "SELECT COUNT(*) FROM pragma_table_info('screenshot_sets') WHERE name = 'version';")" == "1" ]]
[[ "$(sqlite3 "$empty_database" "PRAGMA index_list('screenshot_sets');" | grep -Ec 'screenshot_sets_status_idx')" == "1" ]]

apply_migrations "$representative_database" true
sqlite3 -bail "$representative_database" <<'SQL'
INSERT INTO player_accounts (id, player_id, player_name, normalized_player_name, is_admin, status, created_at, updated_at)
VALUES ('player-1', '1', 'Player', 'player', 0, 'active', 1, 1);
INSERT INTO submissions (id, player_account_id, binding_id, status, challenge_type, challenge_id, map_name, difficulty, player_name, source_provider, source_conversation_id, source_message_id, created_at, updated_at)
VALUES ('submission-1', 'player-1', NULL, 'approved', 'map_title_achievement', 'challenge-1', '测试地图', '困难', 'Player', 'qq', 'conv-1', 'msg-1', 1, 1);
INSERT INTO attachments (id, submission_id, provider, external_attachment_id, content_type, byte_size, sha256, object_key, upload_status, created_at)
VALUES ('attachment-1', 'submission-1', 'qq', 'ext-1', 'image/png', 100, 'a', 'uploads/submissions/submission-1/a.png', 'stored', 1);
INSERT INTO ocr_results (id, submission_id, request_id, attempt, status, response_json, created_at)
VALUES ('ocr-1', 'submission-1', 'req-1', 1, 'ok', '{"schema_version":"1","ok":true,"layout_version":"layout-v2"}', 1);
SQL
sqlite3 -bail "$representative_database" < "$root_dir/migrations/0092_screenshot_sets.sql"
sqlite3 -bail "$representative_database" "INSERT INTO screenshot_sets (id, version, status, created_by, created_at, note, eligibility_json) VALUES ('set-1', 1, 'draft', 'maintainer-1', 3, NULL, '{\"memberCount\":1,\"excludedCount\":0,\"exclusions\":[]}');"
sqlite3 -bail "$representative_database" "INSERT INTO screenshot_set_members (set_id, source_id, position, submission_id, map_name, ocr_result_id, object_key, sha256, mime_type, size_bytes, layout_version, accuracy) VALUES ('set-1', 'attachment-1', 0, 'submission-1', '测试地图', 'ocr-1', 'uploads/submissions/submission-1/a.png', 'a', 'image/png', 100, 'layout-v2', 'inaccurate');"
[[ "$(sqlite3 "$representative_database" "SELECT source_id || ':' || object_key FROM screenshot_set_members WHERE set_id = 'set-1';")" == "attachment-1:uploads/submissions/submission-1/a.png" ]]
[[ "$(sqlite3 "$representative_database" "PRAGMA foreign_key_check;")" == "" ]]
# The same screenshot cannot belong twice to one set.
if sqlite3 -bail "$representative_database" "INSERT INTO screenshot_set_members (set_id, source_id, position, submission_id, map_name, object_key, sha256, mime_type, size_bytes, layout_version) VALUES ('set-1', 'attachment-1', 1, 'submission-1', '测试地图', 'uploads/submissions/submission-1/a.png', 'a', 'image/png', 100, 'layout-v2');" 2>/dev/null; then
  echo "Expected the set membership primary key to reject a duplicate screenshot." >&2
  exit 1
fi
# Duplicate set versions are rejected.
if sqlite3 -bail "$representative_database" "INSERT INTO screenshot_sets (id, version, status, created_by, created_at, note, eligibility_json) VALUES ('set-2', 1, 'draft', 'maintainer-1', 4, NULL, '{}');" 2>/dev/null; then
  echo "Expected the version unique constraint to reject a duplicate version." >&2
  exit 1
fi
# A member requires a real attachment (provenance must resolve).
if sqlite3 -bail "$representative_database" "PRAGMA foreign_keys = ON; INSERT INTO screenshot_set_members (set_id, source_id, position, submission_id, map_name, object_key, sha256, mime_type, size_bytes, layout_version) VALUES ('set-1', 'missing-attachment', 1, 'submission-1', '测试地图', 'uploads/submissions/submission-1/missing.png', 'b', 'image/png', 100, 'layout-v2');" 2>/dev/null; then
  echo "Expected the member foreign key to reject an unknown attachment." >&2
  exit 1
fi
# Finalization is an explicit state transition; membership stays immutable.
sqlite3 -bail "$representative_database" "UPDATE screenshot_sets SET status = 'finalized', finalized_by = 'maintainer-1', finalized_at = 5 WHERE id = 'set-1';"
[[ "$(sqlite3 "$representative_database" "SELECT status FROM screenshot_sets WHERE id = 'set-1';")" == "finalized" ]]
[[ "$(sqlite3 "$representative_database" "SELECT COUNT(*) FROM screenshot_set_members WHERE set_id = 'set-1';")" == "1" ]]

echo "Screenshot set migration checks passed."
