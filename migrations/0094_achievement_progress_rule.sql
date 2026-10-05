ALTER TABLE title_challenges ADD COLUMN progress_rule TEXT;

PRAGMA foreign_keys=OFF;

CREATE TABLE challenge_completions_next (
  id TEXT PRIMARY KEY NOT NULL,
  player_account_id TEXT NOT NULL REFERENCES player_accounts(id),
  challenge_id TEXT NOT NULL REFERENCES challenges(id),
  gameplay_revision_id TEXT REFERENCES gameplay_revisions(id),
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'invalidated')),
  source_type TEXT NOT NULL CHECK (source_type IN ('submission', 'manual', 'challenge_satisfies', 'migration', 'verified_run_progress')),
  source_id TEXT NOT NULL,
  completed_at INTEGER NOT NULL,
  invalidated_by TEXT,
  invalidated_at INTEGER,
  invalidation_reason TEXT,
  created_at INTEGER NOT NULL,
  CHECK (status <> 'invalidated' OR invalidated_at IS NOT NULL)
);

INSERT INTO challenge_completions_next (id, player_account_id, challenge_id, gameplay_revision_id, status, source_type, source_id, completed_at, invalidated_by, invalidated_at, invalidation_reason, created_at)
SELECT id, player_account_id, challenge_id, gameplay_revision_id, status, source_type, source_id, completed_at, invalidated_by, invalidated_at, invalidation_reason, created_at
FROM challenge_completions;

DROP TABLE challenge_completions;
ALTER TABLE challenge_completions_next RENAME TO challenge_completions;

CREATE UNIQUE INDEX challenge_completions_player_challenge_idx
  ON challenge_completions(player_account_id, challenge_id, COALESCE(gameplay_revision_id, ''))
  WHERE status = 'active';
CREATE UNIQUE INDEX challenge_completions_source_idx
  ON challenge_completions(source_type, source_id, challenge_id);
CREATE INDEX challenge_completions_player_idx ON challenge_completions(player_account_id, completed_at DESC);

PRAGMA foreign_keys=ON;
