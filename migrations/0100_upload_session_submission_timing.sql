CREATE TABLE upload_sessions_next (
  id TEXT PRIMARY KEY NOT NULL,
  submission_id TEXT NOT NULL,
  player_account_id TEXT NOT NULL REFERENCES player_accounts(id),
  content_type TEXT NOT NULL,
  byte_size INTEGER NOT NULL,
  sha256 TEXT NOT NULL,
  object_key TEXT NOT NULL,
  status TEXT NOT NULL,
  expires_at INTEGER NOT NULL,
  created_at INTEGER NOT NULL
);

INSERT INTO upload_sessions_next (id, submission_id, player_account_id, content_type, byte_size, sha256, object_key, status, expires_at, created_at)
SELECT id, submission_id, player_account_id, content_type, byte_size, sha256, object_key, status, expires_at, created_at
FROM upload_sessions;

DROP TABLE upload_sessions;
ALTER TABLE upload_sessions_next RENAME TO upload_sessions;
CREATE INDEX upload_sessions_submission_idx ON upload_sessions(submission_id);
