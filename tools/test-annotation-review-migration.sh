#!/usr/bin/env bash
set -euo pipefail

root_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
empty_database="$(mktemp -t owbastion-annotations-empty.XXXXXX)"
representative_database="$(mktemp -t owbastion-annotations-representative.XXXXXX)"
trap 'rm -f "$empty_database" "$representative_database"' EXIT

apply_migrations() {
  local database="$1"
  local skip_latest="${2:-false}"
  while IFS= read -r migration; do
    local name="$(basename "$migration")"
    if [[ "$skip_latest" == "true" && ( "$name" == "0069_reviewed_annotations.sql" || "$name" == "0087_ocr_map_variant_annotations.sql" ) ]]; then continue; fi
    sqlite3 -bail "$database" < "$migration"
  done < <(find "$root_dir/migrations" -maxdepth 1 -name '*.sql' -print | sort)
}

apply_migrations "$empty_database"
[[ "$(sqlite3 "$empty_database" "SELECT COUNT(*) FROM sqlite_master WHERE type = 'table' AND name = 'reviewed_annotations';")" == "1" ]]
[[ "$(sqlite3 "$empty_database" "SELECT COUNT(*) FROM pragma_table_info('ocr_feedback_proposals') WHERE name = 'review_state';")" == "1" ]]
[[ "$(sqlite3 "$empty_database" "PRAGMA index_list('reviewed_annotations');" | grep -Ec 'reviewed_annotations_(proposal|active_field|queue|field)_idx')" == "4" ]]

apply_migrations "$representative_database" true
sqlite3 -bail "$representative_database" <<'SQL'
INSERT INTO player_accounts (id, player_id, player_name, normalized_player_name, is_admin, status, created_at, updated_at)
VALUES ('player-1', '1', 'Player', 'player', 0, 'active', 1, 1);
INSERT INTO identities (id, created_at, updated_at)
VALUES ('identity-1', 1, 1);
INSERT INTO bindings (id, identity_id, player_account_id, provider, group_open_id, member_open_id, status, created_at)
VALUES ('binding-1', 'identity-1', 'player-1', 'qq', 'group-1', 'member-1', 'active', 1);
INSERT INTO submissions (id, player_account_id, binding_id, status, challenge_type, challenge_id, map_name, difficulty, player_name, source_provider, source_conversation_id, source_message_id, created_at, updated_at)
VALUES ('submission-1', 'player-1', 'binding-1', 'approved', 'map_title_achievement', 'challenge-1', '测试地图', '困难', 'Player', 'qq', 'conv-1', 'msg-1', 1, 1);
INSERT INTO ocr_results (id, submission_id, request_id, attempt, status, response_json, created_at)
VALUES ('ocr-1', 'submission-1', 'req-1', 1, 'ok', '{"schema_version":"1","ok":true}', 1);
INSERT INTO ocr_feedback_proposals (id, submission_id, ocr_result_id, field_key, original_value, feedback_type, prompt_origin, proposed_value, model_version, layout_version, player_account_id, status, created_at, updated_at)
VALUES ('proposal-1', 'submission-1', 'ocr-1', 'difficulty', '困难', 'corrected', 'uncertainty', '一般', 'ocr-v1', 'layout-v2', 'player-1', 'submitted', 1, 1);
SQL
sqlite3 -bail "$representative_database" < "$root_dir/migrations/0069_reviewed_annotations.sql"
# Existing proposals default to pending review state.
[[ "$(sqlite3 "$representative_database" "SELECT review_state FROM ocr_feedback_proposals WHERE id = 'proposal-1';")" == "pending" ]]
sqlite3 -bail "$representative_database" "INSERT INTO reviewed_annotations (id, submission_id, ocr_result_id, proposal_id, field_key, original_ocr_value, model_version, layout_version, reviewed_value, normalized_value, player_account_id, player_proposed_value, prompt_origin, review_state, reviewed_by, reviewed_at, note, created_at) VALUES ('annotation-1', 'submission-1', 'ocr-1', 'proposal-1', 'difficulty', '困难', 'ocr-v1', 'layout-v2', '一般', '一般', 'player-1', '一般', 'uncertainty', 'accepted', 'maintainer-1', 2, NULL, 2);"
sqlite3 -bail "$representative_database" "INSERT INTO dataset_snapshots (id, version, status, created_by, created_at) VALUES ('snapshot-1', 1, 'finalized', 'maintainer-1', 2);"
sqlite3 -bail "$representative_database" "INSERT INTO dataset_snapshot_annotations (snapshot_id, annotation_id, position, evidence_object_key, evidence_content_type, evidence_available) VALUES ('snapshot-1', 'annotation-1', 0, 'evidence/one.png', 'image/png', 1);"
# The active-field index must reject a second accepted annotation for the same field.
if sqlite3 -bail "$representative_database" "INSERT INTO reviewed_annotations (id, submission_id, ocr_result_id, proposal_id, field_key, original_ocr_value, model_version, layout_version, reviewed_value, normalized_value, player_account_id, player_proposed_value, prompt_origin, review_state, reviewed_by, reviewed_at, note, created_at) VALUES ('annotation-2', 'submission-1', 'ocr-1', NULL, 'difficulty', '困难', 'ocr-v1', 'layout-v2', '普通', '一般', NULL, NULL, NULL, 'accepted', 'maintainer-1', 3, NULL, 3);" 2>/dev/null; then
  echo "Expected the active-field index to reject a second accepted annotation for the same field." >&2
  exit 1
fi
# Supersession is the auditable correction path: the old row leaves the active state.
sqlite3 -bail "$representative_database" "UPDATE reviewed_annotations SET review_state = 'superseded' WHERE id = 'annotation-1';"
sqlite3 -bail "$representative_database" "INSERT INTO reviewed_annotations (id, submission_id, ocr_result_id, proposal_id, field_key, original_ocr_value, model_version, layout_version, reviewed_value, normalized_value, player_account_id, player_proposed_value, prompt_origin, review_state, reviewed_by, reviewed_at, note, supersedes_annotation_id, created_at) VALUES ('annotation-3', 'submission-1', 'ocr-1', NULL, 'difficulty', '困难', 'ocr-v1', 'layout-v2', '普通', '一般', NULL, NULL, NULL, 'accepted', 'maintainer-1', 4, NULL, 'annotation-1', 4);"
sqlite3 -bail "$representative_database" <<'SQL'
INSERT INTO reviewed_annotations (id, submission_id, ocr_result_id, proposal_id, field_key, original_ocr_value, model_version, layout_version, reviewed_value, normalized_value, player_account_id, player_proposed_value, prompt_origin, review_state, reviewed_by, reviewed_at, note, supersedes_annotation_id, created_at)
VALUES
  ('z-parent', 'submission-1', 'ocr-1', NULL, 'map_name', '旧地图', 'ocr-v1', 'layout-v2', '旧地图', NULL, NULL, NULL, NULL, 'superseded', 'maintainer-1', 5, NULL, NULL, 5),
  ('a-child', 'submission-1', 'ocr-1', NULL, 'map_name', '旧地图', 'ocr-v1', 'layout-v2', '新地图', NULL, NULL, NULL, NULL, 'accepted', 'maintainer-1', 5, NULL, 'z-parent', 5);
SQL
[[ "$(sqlite3 "$representative_database" "SELECT reviewed_value FROM reviewed_annotations WHERE id = 'annotation-1';")" == "一般" ]]
# An empty reviewed transcription is rejected.
if sqlite3 -bail "$representative_database" "INSERT INTO reviewed_annotations (id, submission_id, ocr_result_id, proposal_id, field_key, original_ocr_value, model_version, layout_version, reviewed_value, normalized_value, player_account_id, player_proposed_value, prompt_origin, review_state, reviewed_by, reviewed_at, note, created_at) VALUES ('annotation-4', 'submission-1', 'ocr-1', NULL, 'map_name', '测试地图', 'ocr-v1', 'layout-v2', '   ', NULL, NULL, NULL, NULL, 'accepted', 'maintainer-1', 5, NULL, 5);" 2>/dev/null; then
  echo "Expected the reviewed_value CHECK constraint to reject empty transcriptions." >&2
  exit 1
fi

sqlite3 -bail "$representative_database" <<SQL
PRAGMA foreign_keys = ON;
BEGIN;
.read "$root_dir/migrations/0087_ocr_map_variant_annotations.sql"
COMMIT;
SQL
[[ "$(sqlite3 "$representative_database" "SELECT field_key || ':' || reviewed_value FROM reviewed_annotations WHERE id = 'annotation-1';")" == "difficulty:一般" ]]
[[ "$(sqlite3 "$representative_database" "SELECT supersedes_annotation_id || ':' || review_state FROM reviewed_annotations WHERE id = 'a-child';")" == "z-parent:accepted" ]]
[[ "$(sqlite3 "$representative_database" "SELECT annotation_id FROM dataset_snapshot_annotations WHERE snapshot_id = 'snapshot-1';")" == "annotation-1" ]]
sqlite3 -bail "$representative_database" <<'SQL'
INSERT INTO ocr_feedback_proposals (id, submission_id, ocr_result_id, field_key, original_value, feedback_type, prompt_origin, proposed_value, model_version, layout_version, player_account_id, status, created_at, updated_at)
VALUES ('proposal-map-variant', 'submission-1', 'ocr-1', 'map_variant', 'standard', 'corrected', 'uncertainty', 'classic', 'ocr-v1', 'layout-v2', 'player-1', 'submitted', 6, 6);
INSERT INTO reviewed_annotations (id, submission_id, ocr_result_id, proposal_id, field_key, original_ocr_value, model_version, layout_version, reviewed_value, normalized_value, player_account_id, player_proposed_value, prompt_origin, review_state, reviewed_by, reviewed_at, note, created_at)
VALUES ('annotation-map-variant', 'submission-1', 'ocr-1', 'proposal-map-variant', 'map_variant', 'standard', 'ocr-v1', 'layout-v2', 'classic', NULL, 'player-1', 'classic', 'uncertainty', 'accepted', 'maintainer-1', 7, NULL, 7);
SQL
[[ "$(sqlite3 "$representative_database" "SELECT field_key || ':' || reviewed_value FROM reviewed_annotations WHERE id = 'annotation-map-variant';")" == "map_variant:classic" ]]
[[ "$(sqlite3 "$representative_database" "PRAGMA foreign_key_check;")" == "" ]]

echo "Annotation review migration checks passed."
