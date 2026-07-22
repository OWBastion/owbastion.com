CREATE TABLE qq_group_policy_outbox (
  id TEXT PRIMARY KEY,
  created_at INTEGER NOT NULL,
  enqueued_at INTEGER,
  delivered_at INTEGER
);

CREATE INDEX qq_group_policy_outbox_pending_idx
ON qq_group_policy_outbox(enqueued_at)
WHERE delivered_at IS NULL;
