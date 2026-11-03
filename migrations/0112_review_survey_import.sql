CREATE TABLE review_imports (
  id TEXT PRIMARY KEY NOT NULL,
  source_hash TEXT NOT NULL UNIQUE,
  file_name TEXT NOT NULL,
  row_count INTEGER NOT NULL,
  imported_by TEXT NOT NULL,
  imported_at INTEGER NOT NULL
);

-- Imported historical ratings have no player account, so player_account_id becomes nullable.
-- source_id is the row ID in the exported CSV and source_label its submitter label, both for maintainers only.
-- Several former visitors share one label, so the row ID, not the label, identifies an imported review.
CREATE TABLE reviews_next (
  id TEXT PRIMARY KEY NOT NULL,
  player_account_id TEXT REFERENCES player_accounts(id),
  import_id TEXT REFERENCES review_imports(id),
  source_id INTEGER,
  source_label TEXT,
  target_type TEXT NOT NULL CHECK (target_type IN ('event', 'map')),
  target_id TEXT NOT NULL CHECK (length(trim(target_id)) > 0),
  gameplay_revision_id TEXT REFERENCES gameplay_revisions(id),
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
  invalidation_reason TEXT,
  CHECK ((player_account_id IS NULL) = (import_id IS NOT NULL))
);

INSERT INTO reviews_next (
  id, player_account_id, target_type, target_id, gameplay_revision_id, rating, comment, comment_status,
  anonymous, status, created_at, updated_at, withdrawn_at, invalidated_at, invalidated_by, invalidation_reason
)
SELECT
  id, player_account_id, target_type, target_id, gameplay_revision_id, rating, comment, comment_status,
  anonymous, status, created_at, updated_at, withdrawn_at, invalidated_at, invalidated_by, invalidation_reason
FROM reviews;

DROP TABLE reviews;
ALTER TABLE reviews_next RENAME TO reviews;

CREATE UNIQUE INDEX reviews_player_event_idx
  ON reviews(player_account_id, target_id)
  WHERE target_type = 'event';

CREATE UNIQUE INDEX reviews_player_legacy_map_idx
  ON reviews(player_account_id, target_id)
  WHERE target_type = 'map' AND gameplay_revision_id IS NULL;

CREATE UNIQUE INDEX reviews_player_map_revision_idx
  ON reviews(player_account_id, target_id, gameplay_revision_id)
  WHERE target_type = 'map' AND gameplay_revision_id IS NOT NULL;

CREATE UNIQUE INDEX reviews_import_source_idx
  ON reviews(import_id, source_id)
  WHERE import_id IS NOT NULL;

CREATE INDEX reviews_target_status_idx
  ON reviews(target_type, target_id, gameplay_revision_id, status);
