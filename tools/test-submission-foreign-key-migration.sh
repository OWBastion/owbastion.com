#!/usr/bin/env bash
set -euo pipefail

root_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
database="$(mktemp "${TMPDIR:-/tmp}/owbastion-submission-foreign-keys.XXXXXX")"
trap 'rm -f "$database"' EXIT

for migration in "$root_dir"/migrations/*.sql; do
  case "$(basename "$migration")" in
    0036_submission_review_statuses.sql|0037_repair_submission_foreign_keys.sql|0038_restore_upload_pending_submission_status.sql) continue ;;
  esac
  sqlite3 -bail "$database" < "$migration"
done

sqlite3 "$database" <<'SQL'
INSERT INTO identities VALUES ('identity-1', 1, 1);
INSERT INTO player_accounts VALUES ('player-1', '1234', 'Player', 'player', 0, 'active', NULL, NULL, NULL, 1, 1);
INSERT INTO bindings VALUES ('binding-1', 'identity-1', 'player-1', 'qq', 'group-1', 'member-1', 1, 'active', NULL, NULL);
INSERT INTO submissions (id, binding_id, status, challenge_type, challenge_id, map_name, difficulty, player_name, review_reason, source_provider, source_conversation_id, source_message_id, created_at, updated_at)
VALUES ('submission-1', 'binding-1', 'received', 'map_completion', NULL, 'Test Map', NULL, NULL, NULL, 'qq', 'group-1', 'message-1', 1, 1);
INSERT INTO attachments VALUES ('attachment-1', 'submission-1', 'qq', 'attachment-1', 'image/png', 1, NULL, NULL, 'pending', 1);
INSERT INTO ocr_results VALUES ('ocr-1', 'submission-1', 1, 'succeeded', NULL, NULL, NULL, 1);
INSERT INTO upload_sessions VALUES ('upload-1', 'submission-1', 'player-1', 'image/png', 1, 'hash', 'key', 'pending', 2, 1);
INSERT INTO submission_reviews VALUES ('review-1', 'submission-1', 'approved', NULL, 'admin-1', 1);
SQL

sqlite3 -cmd 'PRAGMA foreign_keys = ON;' -bail "$database" < "$root_dir/migrations/0036_submission_review_statuses.sql"
sqlite3 -cmd 'PRAGMA foreign_keys = ON;' -bail "$database" < "$root_dir/migrations/0037_repair_submission_foreign_keys.sql"
sqlite3 -cmd 'PRAGMA foreign_keys = ON;' -bail "$database" < "$root_dir/migrations/0038_restore_upload_pending_submission_status.sql"

sqlite3 -cmd 'PRAGMA foreign_keys = ON;' -bail "$database" <<'SQL'
INSERT INTO submissions (id, binding_id, status, challenge_type, challenge_id, map_name, difficulty, player_name, review_reason, source_provider, source_conversation_id, source_message_id, created_at, updated_at)
VALUES ('submission-upload-1', 'binding-1', 'upload_pending', 'map_completion', NULL, 'Test Map', NULL, NULL, NULL, 'portal', 'portal', 'upload-1', 2, 2);
SQL

for status in evidence_pending evidence_stored ocr_pending ready_for_review ocr_review_required approved rejected resubmission_required; do
  sqlite3 -cmd 'PRAGMA foreign_keys = ON;' -bail "$database" "
    INSERT INTO submissions (id, binding_id, status, challenge_type, challenge_id, map_name, difficulty, player_name, review_reason, source_provider, source_conversation_id, source_message_id, created_at, updated_at)
    VALUES ('submission-status-${status}', 'binding-1', '${status}', 'map_completion', NULL, 'Test Map', NULL, NULL, NULL, 'portal', 'portal', 'message-${status}', 3, 3);
  "
done

sqlite3 -cmd 'PRAGMA foreign_keys = ON;' -bail "$database" <<'SQL'
INSERT INTO submission_reviews VALUES ('review-rejected-1', 'submission-status-rejected', 'rejected', '', 'admin-1', 3);
INSERT INTO submission_reviews VALUES ('review-resubmission-1', 'submission-status-resubmission_required', 'resubmission_required', NULL, 'admin-1', 3);
SQL

for table in attachments ocr_results upload_sessions submission_reviews; do
  [[ "$(sqlite3 "$database" "SELECT \"table\" FROM pragma_foreign_key_list('$table') WHERE \"from\" = 'submission_id';")" == "submissions" ]]
done

[[ "$(sqlite3 "$database" "SELECT COUNT(*) FROM attachments WHERE id = 'attachment-1';")" == "1" ]]
[[ "$(sqlite3 "$database" "SELECT COUNT(*) FROM ocr_results WHERE id = 'ocr-1';")" == "1" ]]
[[ "$(sqlite3 "$database" "SELECT COUNT(*) FROM upload_sessions WHERE id = 'upload-1';")" == "1" ]]
[[ "$(sqlite3 "$database" "SELECT COUNT(*) FROM submission_reviews WHERE id = 'review-1';")" == "1" ]]
[[ "$(sqlite3 "$database" "SELECT COUNT(*) FROM submission_reviews WHERE id IN ('review-rejected-1', 'review-resubmission-1');")" == "2" ]]
[[ "$(sqlite3 "$database" "SELECT COUNT(*) FROM submissions WHERE id = 'submission-upload-1' AND status = 'upload_pending';")" == "1" ]]
for status in received evidence_pending evidence_stored upload_pending ocr_pending ready_for_review ocr_review_required approved rejected resubmission_required; do
  [[ "$(sqlite3 "$database" "SELECT COUNT(*) FROM submissions WHERE status = '${status}';")" -ge "1" ]]
done
[[ -z "$(sqlite3 "$database" 'PRAGMA foreign_key_check;')" ]]

echo "Submission foreign-key migration scenario passed."
