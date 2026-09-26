#!/usr/bin/env bash
set -euo pipefail

root_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$root_dir"

actual="$(sqlite3 :memory: <<'SQL'
CREATE TABLE submissions (id TEXT PRIMARY KEY NOT NULL);
.read migrations/0059_submission_outcomes.sql
INSERT INTO submissions (id) VALUES ('submission-run'), ('submission-title'), ('submission-challenge');
INSERT INTO submission_outcomes VALUES
  ('outcome-run', 'submission-run', 'mastery_run', 'mastery_run', 'conflict', 'run-1', 0, '{"reason":"conflict","conflictFields":["run_code"]}', 10, 11),
  ('outcome-title', 'submission-title', 'title_grant', 'title_grant', 'created', 'grant-1', 0, '{}', 20, 21),
  ('outcome-challenge', 'submission-challenge', 'challenge', 'challenge', 'reused', 'challenge-1', 0, '{}', 30, 31);
.read migrations/0083_verified_run_outcome_terms.sql
SELECT id || ':' || outcome_key || ':' || outcome_type || ':' || status || ':' || entity_id || ':' || awarded_xp || ':' || details_json || ':' || created_at || ':' || updated_at FROM submission_outcomes ORDER BY id;
SQL
)"

expected=$'outcome-challenge:challenge:challenge:reused:challenge-1:0:{}:30:31\noutcome-run:verified_run:verified_run:conflict:run-1:0:{"reason":"conflict","conflictFields":["match_code"]}:10:11\noutcome-title:title_grant:title_grant:created:grant-1:0:{}:20:21'
if [[ "$actual" != "$expected" ]]; then
  echo "Unexpected Verified Run outcome migration result:" >&2
  echo "$actual" >&2
  exit 1
fi

echo "Verified Run outcome migration scenarios passed."
