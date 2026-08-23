-- 0074_submission_challenge_selections: preserve every challenge selected
-- during manual review instead of overwriting the singular submission target.
CREATE TABLE submission_challenge_selections (
  id TEXT PRIMARY KEY NOT NULL,
  submission_id TEXT NOT NULL REFERENCES submissions(id) ON DELETE CASCADE,
  position INTEGER NOT NULL,
  challenge_type TEXT NOT NULL,
  challenge_id TEXT NOT NULL,
  target_map_id TEXT REFERENCES maps(id),
  gameplay_revision_id TEXT REFERENCES gameplay_revisions(id),
  map_name TEXT NOT NULL,
  difficulty TEXT,
  rule_snapshot_json TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  UNIQUE (submission_id, position)
);

CREATE INDEX submission_challenge_selections_submission_idx
  ON submission_challenge_selections (submission_id);
