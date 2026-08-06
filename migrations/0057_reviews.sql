CREATE TABLE reviews (
  id TEXT PRIMARY KEY NOT NULL,
  player_account_id TEXT NOT NULL REFERENCES player_accounts(id),
  target_type TEXT NOT NULL CHECK (target_type IN ('event', 'map')),
  target_id TEXT NOT NULL CHECK (length(trim(target_id)) > 0),
  rating INTEGER NOT NULL CHECK (rating BETWEEN 1 AND 5),
  comment TEXT,
  comment_status TEXT NOT NULL DEFAULT 'visible' CHECK (comment_status IN ('visible', 'hidden')),
  anonymous INTEGER NOT NULL DEFAULT 0 CHECK (anonymous IN (0, 1)),
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'withdrawn', 'invalidated')),
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  withdrawn_at INTEGER,
  invalidated_at INTEGER,
  invalidated_by TEXT,
  invalidation_reason TEXT
);

CREATE UNIQUE INDEX reviews_player_target_idx
  ON reviews(player_account_id, target_type, target_id);

CREATE INDEX reviews_target_status_idx
  ON reviews(target_type, target_id, status);
