PRAGMA foreign_keys = OFF;

CREATE TABLE submissions_next (
  id TEXT PRIMARY KEY NOT NULL,
  binding_id TEXT NOT NULL REFERENCES bindings(id),
  status TEXT NOT NULL CHECK (status IN ('received', 'evidence_pending', 'evidence_stored', 'upload_pending', 'ocr_pending', 'ready_for_review', 'ocr_review_required', 'approved', 'rejected', 'resubmission_required')),
  challenge_type TEXT NOT NULL DEFAULT 'map_completion',
  map_name TEXT NOT NULL DEFAULT '',
  source_provider TEXT NOT NULL,
  source_conversation_id TEXT NOT NULL,
  source_message_id TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  challenge_id TEXT,
  difficulty TEXT,
  player_name TEXT,
  review_reason TEXT
);

INSERT INTO submissions_next (id, binding_id, status, challenge_type, map_name, source_provider, source_conversation_id, source_message_id, created_at, updated_at, challenge_id, difficulty, player_name, review_reason)
SELECT id, binding_id, status, challenge_type, map_name, source_provider, source_conversation_id, source_message_id, created_at, updated_at, challenge_id, difficulty, player_name, review_reason
FROM submissions;

DROP TABLE submissions;
ALTER TABLE submissions_next RENAME TO submissions;

CREATE INDEX submissions_map_idx ON submissions(map_name);
CREATE INDEX submissions_binding_idx ON submissions(binding_id);
CREATE INDEX submissions_review_status_idx ON submissions(status, updated_at);

PRAGMA foreign_keys = ON;
