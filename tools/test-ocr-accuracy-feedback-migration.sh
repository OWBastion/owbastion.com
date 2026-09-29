#!/usr/bin/env bash
set -euo pipefail

root_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
empty_database="$(mktemp -t owbastion-ocr-accuracy-empty.XXXXXX)"
representative_database="$(mktemp -t owbastion-ocr-accuracy-representative.XXXXXX)"
trap 'rm -f "$empty_database" "$representative_database"' EXIT

apply_migrations() {
  local database="$1"
  local skip_latest="${2:-false}"
  while IFS= read -r migration; do
    local name="$(basename "$migration")"
    if [[ "$skip_latest" == "true" && "$name" == "0091_ocr_accuracy_feedback.sql" ]]; then continue; fi
    sqlite3 -bail "$database" < "$migration"
  done < <(find "$root_dir/migrations" -maxdepth 1 -name '*.sql' -print | sort)
}

apply_migrations "$empty_database"
[[ "$(sqlite3 "$empty_database" "SELECT COUNT(*) FROM sqlite_master WHERE type = 'table' AND name = 'ocr_accuracy_feedback';")" == "1" ]]
[[ "$(sqlite3 "$empty_database" "PRAGMA index_list('ocr_accuracy_feedback');" | grep -Ec 'ocr_accuracy_feedback_result_idx')" == "1" ]]

apply_migrations "$representative_database" true
sqlite3 -bail "$representative_database" <<'SQL'
INSERT INTO player_accounts (id, player_id, player_name, normalized_player_name, is_admin, status, created_at, updated_at)
VALUES ('player-1', '1', 'Player', 'player', 0, 'active', 1, 1);
INSERT INTO bindings (id, identity_id, player_account_id, provider, group_open_id, member_open_id, status, created_at)
VALUES ('binding-1', 'identity-1', 'player-1', 'qq', 'group-1', 'member-1', 'active', 1);
INSERT INTO submissions (id, player_account_id, binding_id, status, challenge_type, challenge_id, map_name, difficulty, player_name, source_provider, source_conversation_id, source_message_id, created_at, updated_at)
VALUES ('submission-1', 'player-1', 'binding-1', 'approved', 'map_title_achievement', 'challenge-1', '测试地图', '困难', 'Player', 'qq', 'conv-1', 'msg-1', 1, 1);
INSERT INTO ocr_results (id, submission_id, request_id, attempt, status, response_json, created_at)
VALUES ('ocr-1', 'submission-1', 'req-1', 1, 'ok', '{"schema_version":"1","ok":true}', 1);
SQL
sqlite3 -bail "$representative_database" < "$root_dir/migrations/0091_ocr_accuracy_feedback.sql"
sqlite3 -bail "$representative_database" "INSERT INTO ocr_accuracy_feedback (id, submission_id, ocr_result_id, accuracy, marked_by, marked_by_type, created_at, updated_at) VALUES ('mark-1', 'submission-1', 'ocr-1', 'accurate', 'player-1', 'player', 1, 1);"
# The unique result index must reject a second mark for the same OCR result.
if sqlite3 -bail "$representative_database" "INSERT INTO ocr_accuracy_feedback (id, submission_id, ocr_result_id, accuracy, marked_by, marked_by_type, created_at, updated_at) VALUES ('mark-2', 'submission-1', 'ocr-1', 'inaccurate', 'maintainer-1', 'maintainer', 2, 2);" 2>/dev/null; then
  echo "Expected the unique index to reject a duplicate mark for the same OCR result." >&2
  exit 1
fi
# Accuracy values outside the enum and unknown marker types must be rejected.
if sqlite3 -bail "$representative_database" "INSERT INTO ocr_accuracy_feedback (id, submission_id, ocr_result_id, accuracy, marked_by, marked_by_type, created_at, updated_at) VALUES ('mark-3', 'submission-1', 'ocr-2', 'confirmed', 'player-1', 'player', 3, 3);" 2>/dev/null; then
  echo "Expected the accuracy CHECK constraint to reject 'confirmed'." >&2
  exit 1
fi
if sqlite3 -bail "$representative_database" "INSERT INTO ocr_accuracy_feedback (id, submission_id, ocr_result_id, accuracy, marked_by, marked_by_type, created_at, updated_at) VALUES ('mark-4', 'submission-1', 'ocr-2', 'accurate', 'system', 'system', 4, 4);" 2>/dev/null; then
  echo "Expected the marked_by_type CHECK constraint to reject unknown actors." >&2
  exit 1
fi
# A maintainer updating the same result in place is allowed (latest writer wins).
sqlite3 -bail "$representative_database" "UPDATE ocr_accuracy_feedback SET accuracy = 'inaccurate', marked_by = 'maintainer-1', marked_by_type = 'maintainer', updated_at = 5 WHERE id = 'mark-1';"
[[ "$(sqlite3 "$representative_database" "SELECT accuracy FROM ocr_accuracy_feedback WHERE id = 'mark-1';")" == "inaccurate" ]]
