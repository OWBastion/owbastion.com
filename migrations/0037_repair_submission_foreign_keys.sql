PRAGMA foreign_keys = OFF;

CREATE TABLE attachments_next (
  id TEXT PRIMARY KEY NOT NULL,
  submission_id TEXT NOT NULL REFERENCES submissions(id),
  provider TEXT NOT NULL,
  external_attachment_id TEXT NOT NULL,
  content_type TEXT NOT NULL,
  byte_size INTEGER,
  sha256 TEXT,
  object_key TEXT,
  upload_status TEXT NOT NULL DEFAULT 'pending',
  created_at INTEGER NOT NULL
);

CREATE TABLE ocr_results_next (
  id TEXT PRIMARY KEY NOT NULL,
  submission_id TEXT NOT NULL REFERENCES submissions(id),
  attempt INTEGER NOT NULL,
  status TEXT NOT NULL,
  response_json TEXT,
  match_json TEXT,
  error_code TEXT,
  created_at INTEGER NOT NULL
);

CREATE TABLE upload_sessions_next (
  id TEXT PRIMARY KEY NOT NULL,
  submission_id TEXT NOT NULL REFERENCES submissions(id),
  player_account_id TEXT NOT NULL REFERENCES player_accounts(id),
  content_type TEXT NOT NULL,
  byte_size INTEGER NOT NULL,
  sha256 TEXT NOT NULL,
  object_key TEXT NOT NULL,
  status TEXT NOT NULL,
  expires_at INTEGER NOT NULL,
  created_at INTEGER NOT NULL
);

CREATE TABLE submission_reviews_next (
  id TEXT PRIMARY KEY NOT NULL,
  submission_id TEXT NOT NULL REFERENCES submissions(id),
  decision TEXT NOT NULL,
  reason TEXT,
  reviewer TEXT NOT NULL,
  created_at INTEGER NOT NULL
);

INSERT INTO attachments_next (id, submission_id, provider, external_attachment_id, content_type, byte_size, sha256, object_key, upload_status, created_at)
SELECT id, submission_id, provider, external_attachment_id, content_type, byte_size, sha256, object_key, upload_status, created_at
FROM attachments;

INSERT INTO ocr_results_next (id, submission_id, attempt, status, response_json, match_json, error_code, created_at)
SELECT id, submission_id, attempt, status, response_json, match_json, error_code, created_at
FROM ocr_results;

INSERT INTO upload_sessions_next (id, submission_id, player_account_id, content_type, byte_size, sha256, object_key, status, expires_at, created_at)
SELECT id, submission_id, player_account_id, content_type, byte_size, sha256, object_key, status, expires_at, created_at
FROM upload_sessions;

INSERT INTO submission_reviews_next (id, submission_id, decision, reason, reviewer, created_at)
SELECT id, submission_id, decision, reason, reviewer, created_at
FROM submission_reviews;

DROP TABLE attachments;
DROP TABLE ocr_results;
DROP TABLE upload_sessions;
DROP TABLE submission_reviews;

ALTER TABLE attachments_next RENAME TO attachments;
ALTER TABLE ocr_results_next RENAME TO ocr_results;
ALTER TABLE upload_sessions_next RENAME TO upload_sessions;
ALTER TABLE submission_reviews_next RENAME TO submission_reviews;

CREATE INDEX attachments_submission_idx ON attachments(submission_id);
CREATE INDEX ocr_results_submission_idx ON ocr_results(submission_id, created_at);
CREATE INDEX upload_sessions_submission_idx ON upload_sessions(submission_id);

PRAGMA foreign_keys = ON;
