#!/usr/bin/env bash
set -euo pipefail

root_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
empty_database="$(mktemp -t owbastion-datasets-empty.XXXXXX)"
representative_database="$(mktemp -t owbastion-datasets-representative.XXXXXX)"
trap 'rm -f "$empty_database" "$representative_database"' EXIT

apply_migrations() {
  local database="$1"
  local skip_latest="${2:-false}"
  while IFS= read -r migration; do
    local name="$(basename "$migration")"
    if [[ "$skip_latest" == "true" && "$name" == "0070_dataset_snapshots.sql" ]]; then continue; fi
    sqlite3 -bail "$database" < "$migration"
  done < <(find "$root_dir/migrations" -maxdepth 1 -name '*.sql' -print | sort)
}

apply_migrations "$empty_database"
[[ "$(sqlite3 "$empty_database" "SELECT COUNT(*) FROM sqlite_master WHERE type = 'table' AND name = 'dataset_snapshots';")" == "1" ]]
[[ "$(sqlite3 "$empty_database" "SELECT COUNT(*) FROM sqlite_master WHERE type = 'table' AND name = 'dataset_snapshot_annotations';")" == "1" ]]
[[ "$(sqlite3 "$empty_database" "SELECT COUNT(*) FROM pragma_table_info('dataset_snapshots') WHERE name = 'version';")" == "1" ]]
[[ "$(sqlite3 "$empty_database" "PRAGMA index_list('dataset_snapshots');" | grep -Ec 'dataset_snapshots_status_idx')" == "1" ]]

apply_migrations "$representative_database" true
sqlite3 -bail "$representative_database" <<'SQL'
INSERT INTO player_accounts (id, player_id, player_name, normalized_player_name, is_admin, status, created_at, updated_at)
VALUES ('player-1', '1', 'Player', 'player', 0, 'active', 1, 1);
INSERT INTO bindings (id, identity_id, player_account_id, provider, group_open_id, member_open_id, status, created_at)
VALUES ('binding-1', 'identity-1', 'player-1', 'qq', 'group-1', 'member-1', 'active', 1);
INSERT INTO submissions (id, binding_id, status, challenge_type, challenge_id, map_name, difficulty, player_name, source_provider, source_conversation_id, source_message_id, created_at, updated_at)
VALUES ('submission-1', 'binding-1', 'approved', 'map_title_achievement', 'challenge-1', '测试地图', '困难', 'Player', 'qq', 'conv-1', 'msg-1', 1, 1);
INSERT INTO ocr_results (id, submission_id, request_id, attempt, status, response_json, created_at)
VALUES ('ocr-1', 'submission-1', 'req-1', 1, 'ok', '{"schema_version":"1","ok":true}', 1);
INSERT INTO ocr_feedback_proposals (id, submission_id, ocr_result_id, field_key, original_value, feedback_type, prompt_origin, proposed_value, model_version, layout_version, player_account_id, status, created_at, updated_at)
VALUES ('proposal-1', 'submission-1', 'ocr-1', 'difficulty', '困难', 'corrected', 'uncertainty', '一般', 'ocr-v1', 'layout-v2', 'player-1', 'submitted', 1, 1);
INSERT INTO reviewed_annotations (id, submission_id, ocr_result_id, proposal_id, field_key, original_ocr_value, model_version, layout_version, reviewed_value, normalized_value, player_account_id, player_proposed_value, prompt_origin, review_state, reviewed_by, reviewed_at, note, created_at)
VALUES ('annotation-1', 'submission-1', 'ocr-1', 'proposal-1', 'difficulty', '困难', 'ocr-v1', 'layout-v2', '一般', '一般', 'player-1', '一般', 'uncertainty', 'accepted', 'maintainer-1', 2, NULL, 2);
SQL
sqlite3 -bail "$representative_database" < "$root_dir/migrations/0070_dataset_snapshots.sql"
sqlite3 -bail "$representative_database" "INSERT INTO dataset_snapshots (id, version, status, created_by, created_at, note, eligibility_json) VALUES ('dataset-1', 1, 'draft', 'maintainer-1', 3, NULL, '{\"eligibleCount\":1,\"excludedCount\":0,\"submissionCount\":1,\"annotationCount\":1,\"exclusions\":[]}');"
sqlite3 -bail "$representative_database" "INSERT INTO dataset_snapshot_annotations (snapshot_id, annotation_id, position, evidence_object_key, evidence_content_type, evidence_available) VALUES ('dataset-1', 'annotation-1', 0, 'evidence/1.png', 'image/png', 1);"
# The same annotation cannot belong to a second snapshot.
if sqlite3 -bail "$representative_database" "INSERT INTO dataset_snapshot_annotations (snapshot_id, annotation_id, position, evidence_object_key, evidence_content_type, evidence_available) VALUES ('dataset-1', 'annotation-1', 1, 'evidence/1.png', 'image/png', 1);" 2>/dev/null; then
  echo "Expected the snapshot membership primary key to reject a duplicate annotation." >&2
  exit 1
fi
# Duplicate snapshot versions are rejected.
if sqlite3 -bail "$representative_database" "INSERT INTO dataset_snapshots (id, version, status, created_by, created_at, note, eligibility_json) VALUES ('dataset-2', 1, 'draft', 'maintainer-1', 4, NULL, '{}');" 2>/dev/null; then
  echo "Expected the version unique constraint to reject a duplicate version." >&2
  exit 1
fi
# Finalization is an explicit state transition; the membership stays immutable.
sqlite3 -bail "$representative_database" "UPDATE dataset_snapshots SET status = 'finalized', finalized_by = 'maintainer-1', finalized_at = 5 WHERE id = 'dataset-1';"
[[ "$(sqlite3 "$representative_database" "SELECT status FROM dataset_snapshots WHERE id = 'dataset-1';")" == "finalized" ]]
[[ "$(sqlite3 "$representative_database" "SELECT COUNT(*) FROM dataset_snapshot_annotations WHERE snapshot_id = 'dataset-1';")" == "1" ]]

echo "Dataset snapshot migration checks passed."
