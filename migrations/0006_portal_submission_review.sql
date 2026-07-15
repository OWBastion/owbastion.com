ALTER TABLE submissions ADD COLUMN challenge_id TEXT;
ALTER TABLE submissions ADD COLUMN difficulty TEXT;
ALTER TABLE submissions ADD COLUMN player_name TEXT;
ALTER TABLE submissions ADD COLUMN review_reason TEXT;

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

CREATE TABLE submission_reviews (
  id TEXT PRIMARY KEY NOT NULL,
  submission_id TEXT NOT NULL REFERENCES submissions(id),
  decision TEXT NOT NULL,
  reason TEXT NOT NULL,
  reviewer TEXT NOT NULL,
  created_at INTEGER NOT NULL
);

CREATE INDEX submissions_review_status_idx ON submissions(status, updated_at);
CREATE INDEX upload_sessions_submission_idx ON upload_sessions(submission_id);
CREATE INDEX ocr_results_submission_idx ON ocr_results(submission_id, created_at);
