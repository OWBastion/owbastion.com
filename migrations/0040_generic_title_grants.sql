PRAGMA foreign_keys=OFF;

CREATE TABLE player_title_grants_next (
  id TEXT PRIMARY KEY NOT NULL,
  player_account_id TEXT NOT NULL REFERENCES player_accounts(id),
  title_key TEXT NOT NULL REFERENCES title_catalog(key),
  map_id TEXT REFERENCES maps(id),
  slot TEXT,
  status TEXT NOT NULL CHECK (status IN ('active', 'revoked')),
  source_type TEXT NOT NULL CHECK (source_type IN ('historical', 'submission', 'manual', 'automatic')),
  source_id TEXT NOT NULL,
  granted_by TEXT NOT NULL,
  granted_at INTEGER NOT NULL,
  revoked_by TEXT,
  revoked_at INTEGER,
  revoke_reason TEXT
);

INSERT INTO player_title_grants_next (id, player_account_id, title_key, map_id, slot, status, source_type, source_id, granted_by, granted_at, revoked_by, revoked_at, revoke_reason)
SELECT p.id, p.player_account_id, h.title_key, h.map_id, h.slot, p.status, 'historical', h.id, p.granted_by, p.granted_at, p.revoked_by, p.revoked_at, p.revoke_reason
FROM player_title_grants p
INNER JOIN historical_title_grants h ON h.id = p.historical_title_grant_id;

DROP TABLE player_title_grants;
ALTER TABLE player_title_grants_next RENAME TO player_title_grants;

CREATE INDEX player_title_grants_player_status_idx ON player_title_grants(player_account_id, status);
CREATE UNIQUE INDEX player_title_grants_active_identity_idx ON player_title_grants(player_account_id, title_key, COALESCE(map_id, '')) WHERE status = 'active';

ALTER TABLE submissions ADD COLUMN grant_id TEXT;
PRAGMA foreign_keys=ON;
