CREATE TABLE title_challenges (
  id TEXT PRIMARY KEY NOT NULL,
  title_key TEXT NOT NULL REFERENCES title_catalog(key),
  condition TEXT NOT NULL,
  evidence_rule TEXT NOT NULL,
  game_version TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('active', 'retired')),
  introduced_version TEXT NOT NULL,
  retired_version TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  UNIQUE (title_key)
);

CREATE INDEX title_challenges_status_idx ON title_challenges(status, title_key);
