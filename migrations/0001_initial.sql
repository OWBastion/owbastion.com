CREATE TABLE identities (
  id TEXT PRIMARY KEY NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE TABLE bindings (
  id TEXT PRIMARY KEY NOT NULL,
  identity_id TEXT NOT NULL REFERENCES identities(id),
  provider TEXT NOT NULL,
  external_user_id TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  UNIQUE(provider, external_user_id)
);

CREATE TABLE submissions (
  id TEXT PRIMARY KEY NOT NULL,
  binding_id TEXT NOT NULL REFERENCES bindings(id),
  status TEXT NOT NULL CHECK (status = 'received'),
  source_provider TEXT NOT NULL,
  source_conversation_id TEXT NOT NULL,
  source_message_id TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE TABLE attachments (
  id TEXT PRIMARY KEY NOT NULL,
  submission_id TEXT NOT NULL REFERENCES submissions(id),
  provider TEXT NOT NULL,
  external_attachment_id TEXT NOT NULL,
  content_type TEXT NOT NULL,
  byte_size INTEGER,
  sha256 TEXT,
  created_at INTEGER NOT NULL
);

CREATE TABLE idempotency_keys (
  id TEXT PRIMARY KEY NOT NULL,
  actor_id TEXT NOT NULL,
  operation TEXT NOT NULL,
  request_hash TEXT NOT NULL,
  response_json TEXT NOT NULL,
  created_at INTEGER NOT NULL
);

CREATE TABLE audit_events (
  id TEXT PRIMARY KEY NOT NULL,
  correlation_id TEXT NOT NULL,
  actor_type TEXT NOT NULL,
  actor_id TEXT NOT NULL,
  operation TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  payload_json TEXT NOT NULL,
  created_at INTEGER NOT NULL
);

CREATE INDEX submissions_binding_idx ON submissions(binding_id);
CREATE INDEX attachments_submission_idx ON attachments(submission_id);
CREATE INDEX audit_events_entity_idx ON audit_events(entity_type, entity_id);
