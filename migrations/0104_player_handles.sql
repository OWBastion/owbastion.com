-- Player handles: a maintainer-reviewed, human-readable public address (/u/{handle}).
-- One row per request or active handle. `handle` is stored in its normalized form
-- (NFKC, ASCII lowercased), which is also the display and lookup form.
-- Only pending and active rows reserve a handle; rejected rows are kept so the
-- Player can see the last decision until they submit again.
CREATE TABLE player_handles (
  id TEXT PRIMARY KEY NOT NULL,
  player_account_id TEXT NOT NULL REFERENCES player_accounts(id),
  handle TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('pending', 'active', 'rejected')),
  requested_at INTEGER NOT NULL,
  decided_at INTEGER,
  decided_by TEXT
);

CREATE UNIQUE INDEX player_handles_reserved_idx ON player_handles(handle) WHERE status IN ('pending', 'active');
CREATE UNIQUE INDEX player_handles_active_player_idx ON player_handles(player_account_id) WHERE status = 'active';
CREATE UNIQUE INDEX player_handles_request_player_idx ON player_handles(player_account_id) WHERE status IN ('pending', 'rejected');
CREATE INDEX player_handles_pending_idx ON player_handles(requested_at) WHERE status = 'pending';
