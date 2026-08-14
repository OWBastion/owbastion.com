#!/usr/bin/env bash
set -euo pipefail

root_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
empty_database="$(mktemp -t owbastion-ocr-feedback-empty.XXXXXX)"
representative_database="$(mktemp -t owbastion-ocr-feedback-representative.XXXXXX)"
trap 'rm -f "$empty_database" "$representative_database"' EXIT

apply_migrations() {
  local database="$1"
  local skip_latest="${2:-false}"
  while IFS= read -r migration; do
    local name="$(basename "$migration")"
    # 0069 depends on the ocr_feedback_proposals table, so it is skipped with
    # 0068 and re-applied after the representative seeding below.
    if [[ "$skip_latest" == "true" && ( "$name" == "0068_ocr_feedback_proposals.sql" || "$name" == "0069_reviewed_annotations.sql" ) ]]; then continue; fi
    sqlite3 -bail "$database" < "$migration"
  done < <(find "$root_dir/migrations" -maxdepth 1 -name '*.sql' -print | sort)
}

apply_migrations "$empty_database"
[[ "$(sqlite3 "$empty_database" "SELECT COUNT(*) FROM sqlite_master WHERE type = 'table' AND name = 'ocr_feedback_proposals';")" == "1" ]]
[[ "$(sqlite3 "$empty_database" "PRAGMA index_list('ocr_feedback_proposals');" | grep -Ec 'ocr_feedback_proposals_(replay|queue)_idx')" == "2" ]]

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
SQL
sqlite3 -bail "$representative_database" < "$root_dir/migrations/0068_ocr_feedback_proposals.sql"
sqlite3 -bail "$representative_database" < "$root_dir/migrations/0069_reviewed_annotations.sql"
sqlite3 -bail "$representative_database" "INSERT INTO ocr_feedback_proposals (id, submission_id, ocr_result_id, field_key, original_value, feedback_type, prompt_origin, proposed_value, model_version, layout_version, player_account_id, status, created_at, updated_at) VALUES ('proposal-1', 'submission-1', 'ocr-1', 'difficulty', '困难', 'corrected', 'uncertainty', '一般', 'ocr-v1', 'layout-v2', 'player-1', 'submitted', 1, 1);"
# The replay index must reject a duplicate equivalent proposal.
if sqlite3 -bail "$representative_database" "INSERT INTO ocr_feedback_proposals (id, submission_id, ocr_result_id, field_key, original_value, feedback_type, prompt_origin, proposed_value, model_version, layout_version, player_account_id, status, created_at, updated_at) VALUES ('proposal-2', 'submission-1', 'ocr-1', 'difficulty', '困难', 'corrected', 'uncertainty', '一般', 'ocr-v1', 'layout-v2', 'player-1', 'submitted', 2, 2);" 2>/dev/null; then
  echo "Expected the replay index to reject a duplicate equivalent proposal." >&2
  exit 1
fi
# Unsafe field keys and unknown origins must be rejected by the CHECK constraints.
if sqlite3 -bail "$representative_database" "INSERT INTO ocr_feedback_proposals (id, submission_id, ocr_result_id, field_key, original_value, feedback_type, prompt_origin, proposed_value, model_version, layout_version, player_account_id, status, created_at, updated_at) VALUES ('proposal-3', 'submission-1', 'ocr-1', 'run_code', NULL, 'confirmed', NULL, NULL, NULL, NULL, 'player-1', 'submitted', 3, 3);" 2>/dev/null; then
  echo "Expected the field_key CHECK constraint to reject unsafe fields." >&2
  exit 1
fi

echo "OCR feedback migration checks passed."
