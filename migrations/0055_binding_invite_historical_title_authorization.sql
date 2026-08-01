CREATE TABLE binding_invite_historical_title_grants (
  id TEXT PRIMARY KEY NOT NULL,
  invite_id TEXT NOT NULL REFERENCES binding_invites(id),
  historical_title_grant_id TEXT NOT NULL REFERENCES historical_title_grants(id),
  authorized_by TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'authorized' CHECK (status IN ('authorized', 'created', 'reused', 'conflict', 'retry_required')),
  player_title_grant_id TEXT,
  last_error TEXT,
  created_at INTEGER NOT NULL,
  processed_at INTEGER,
  UNIQUE (invite_id, historical_title_grant_id)
);

CREATE INDEX binding_invite_historical_title_grants_invite_idx
  ON binding_invite_historical_title_grants(invite_id, status);

CREATE INDEX binding_invite_historical_title_grants_source_idx
  ON binding_invite_historical_title_grants(historical_title_grant_id, status);
