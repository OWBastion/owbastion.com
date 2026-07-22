ALTER TABLE bindings ADD COLUMN status TEXT NOT NULL DEFAULT 'active';
ALTER TABLE bindings ADD COLUMN revoked_at INTEGER;
ALTER TABLE bindings ADD COLUMN revoked_by TEXT;

CREATE TABLE binding_invites (
  id TEXT PRIMARY KEY NOT NULL,
  code_hash TEXT NOT NULL UNIQUE,
  player_name TEXT NOT NULL,
  normalized_player_name TEXT NOT NULL,
  player_id TEXT NOT NULL,
  created_by TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL,
  redeemed_at INTEGER,
  revoked_at INTEGER,
  revoked_by TEXT
);
CREATE TABLE binding_claims (
  id TEXT PRIMARY KEY NOT NULL,
  invite_id TEXT NOT NULL REFERENCES binding_invites(id),
  token_hash TEXT NOT NULL,
  code_hash TEXT NOT NULL UNIQUE,
  player_name TEXT NOT NULL,
  normalized_player_name TEXT NOT NULL,
  player_id TEXT NOT NULL,
  status TEXT NOT NULL,
  member_open_id TEXT,
  group_open_id TEXT,
  message_id TEXT,
  expires_at INTEGER NOT NULL,
  created_at INTEGER NOT NULL,
  verified_at INTEGER,
  decided_at INTEGER,
  decided_by TEXT,
  decision_reason TEXT
);
CREATE INDEX binding_claims_pending_idx ON binding_claims(status, created_at);
CREATE INDEX binding_claims_member_idx ON binding_claims(member_open_id, status);

-- Deployment preflight: resolve any accounts with multiple bindings before this migration.
CREATE UNIQUE INDEX bindings_active_player_idx ON bindings(player_account_id) WHERE status = 'active';
DROP INDEX bindings_provider_member_idx;
CREATE UNIQUE INDEX bindings_active_provider_member_idx ON bindings(provider, member_open_id) WHERE status = 'active';
