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

CREATE TABLE attachments_stage (
  id TEXT PRIMARY KEY NOT NULL,
  submission_id TEXT NOT NULL,
  provider TEXT NOT NULL,
  external_attachment_id TEXT NOT NULL,
  content_type TEXT NOT NULL,
  byte_size INTEGER,
  sha256 TEXT,
  object_key TEXT,
  upload_status TEXT NOT NULL DEFAULT 'pending',
  created_at INTEGER NOT NULL
);

CREATE TABLE ocr_results_stage (
  id TEXT PRIMARY KEY NOT NULL,
  submission_id TEXT NOT NULL,
  attempt INTEGER NOT NULL,
  status TEXT NOT NULL,
  response_json TEXT,
  match_json TEXT,
  error_code TEXT,
  created_at INTEGER NOT NULL
);

CREATE TABLE upload_sessions_stage (
  id TEXT PRIMARY KEY NOT NULL,
  submission_id TEXT NOT NULL,
  player_account_id TEXT NOT NULL,
  content_type TEXT NOT NULL,
  byte_size INTEGER NOT NULL,
  sha256 TEXT NOT NULL,
  object_key TEXT NOT NULL,
  status TEXT NOT NULL,
  expires_at INTEGER NOT NULL,
  created_at INTEGER NOT NULL
);

CREATE TABLE submission_reviews_stage (
  id TEXT PRIMARY KEY NOT NULL,
  submission_id TEXT NOT NULL,
  decision TEXT NOT NULL,
  reason TEXT,
  reviewer TEXT NOT NULL,
  created_at INTEGER NOT NULL
);

INSERT INTO submissions_next (id, binding_id, status, challenge_type, map_name, source_provider, source_conversation_id, source_message_id, created_at, updated_at, challenge_id, difficulty, player_name, review_reason)
SELECT id, binding_id, status, challenge_type, map_name, source_provider, source_conversation_id, source_message_id, created_at, updated_at, challenge_id, difficulty, player_name, review_reason
FROM submissions;

INSERT INTO attachments_stage SELECT * FROM attachments;
INSERT INTO ocr_results_stage SELECT * FROM ocr_results;
INSERT INTO upload_sessions_stage SELECT * FROM upload_sessions;
INSERT INTO submission_reviews_stage SELECT * FROM submission_reviews;

DROP TABLE attachments;
DROP TABLE ocr_results;
DROP TABLE upload_sessions;
DROP TABLE submission_reviews;
DROP TABLE submissions;

ALTER TABLE submissions_next RENAME TO submissions;

CREATE TABLE attachments (
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

CREATE TABLE ocr_results (
  id TEXT PRIMARY KEY NOT NULL,
  submission_id TEXT NOT NULL REFERENCES submissions(id),
  attempt INTEGER NOT NULL,
  status TEXT NOT NULL,
  response_json TEXT,
  match_json TEXT,
  error_code TEXT,
  created_at INTEGER NOT NULL
);

CREATE TABLE upload_sessions (
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

CREATE TABLE submission_reviews (
  id TEXT PRIMARY KEY NOT NULL,
  submission_id TEXT NOT NULL REFERENCES submissions(id),
  decision TEXT NOT NULL,
  reason TEXT,
  reviewer TEXT NOT NULL,
  created_at INTEGER NOT NULL
);

INSERT INTO attachments SELECT * FROM attachments_stage;
INSERT INTO ocr_results SELECT * FROM ocr_results_stage;
INSERT INTO upload_sessions SELECT * FROM upload_sessions_stage;
INSERT INTO submission_reviews SELECT * FROM submission_reviews_stage;

DROP TABLE attachments_stage;
DROP TABLE ocr_results_stage;
DROP TABLE upload_sessions_stage;
DROP TABLE submission_reviews_stage;

CREATE INDEX submissions_map_idx ON submissions(map_name);
CREATE INDEX submissions_binding_idx ON submissions(binding_id);
CREATE INDEX submissions_review_status_idx ON submissions(status, updated_at);
CREATE INDEX attachments_submission_idx ON attachments(submission_id);
CREATE INDEX ocr_results_submission_idx ON ocr_results(submission_id, created_at);
CREATE INDEX upload_sessions_submission_idx ON upload_sessions(submission_id);
