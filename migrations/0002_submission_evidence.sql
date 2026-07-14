CREATE TABLE player_accounts (
  id TEXT PRIMARY KEY NOT NULL,
  identity_id TEXT NOT NULL REFERENCES identities(id),
  handle TEXT NOT NULL,
  normalized_handle TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  UNIQUE(identity_id),
  UNIQUE(normalized_handle)
);

PRAGMA foreign_keys = OFF;
DROP INDEX submissions_binding_idx;
DROP INDEX attachments_submission_idx;
ALTER TABLE attachments RENAME TO attachments_legacy;
ALTER TABLE submissions RENAME TO submissions_legacy;

CREATE TABLE submissions (
  id TEXT PRIMARY KEY NOT NULL,
  binding_id TEXT NOT NULL REFERENCES bindings(id),
  status TEXT NOT NULL CHECK (status IN ('received', 'evidence_pending', 'evidence_stored', 'ocr_pending', 'resubmission_required')),
  challenge_type TEXT NOT NULL DEFAULT 'map_completion',
  map_name TEXT NOT NULL DEFAULT '',
  source_provider TEXT NOT NULL,
  source_conversation_id TEXT NOT NULL,
  source_message_id TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

INSERT INTO submissions (id, binding_id, status, source_provider, source_conversation_id, source_message_id, created_at, updated_at)
SELECT id, binding_id, 'received', source_provider, source_conversation_id, source_message_id, created_at, updated_at
FROM submissions_legacy;

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

INSERT INTO attachments (id, submission_id, provider, external_attachment_id, content_type, byte_size, sha256, upload_status, created_at)
SELECT id, submission_id, provider, external_attachment_id, content_type, byte_size, sha256, 'pending', created_at
FROM attachments_legacy;

DROP TABLE attachments_legacy;
DROP TABLE submissions_legacy;

PRAGMA foreign_keys = ON;

CREATE INDEX player_accounts_normalized_handle_idx ON player_accounts(normalized_handle);
CREATE INDEX submissions_map_idx ON submissions(map_name);
CREATE INDEX submissions_binding_idx ON submissions(binding_id);
CREATE INDEX attachments_submission_idx ON attachments(submission_id);
