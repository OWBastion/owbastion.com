CREATE TABLE qq_changelog_pushes (
  version TEXT NOT NULL,
  group_open_id TEXT NOT NULL,
  generation INTEGER NOT NULL,
  idempotency_key TEXT NOT NULL,
  markdown TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('pending', 'sent', 'failed')),
  retryable INTEGER,
  error_code TEXT,
  requested_by TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  enqueued_at INTEGER,
  PRIMARY KEY (version, group_open_id)
);

CREATE INDEX qq_changelog_pushes_pending_idx
ON qq_changelog_pushes(enqueued_at)
WHERE status = 'pending';
