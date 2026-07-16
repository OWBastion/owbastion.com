PRAGMA foreign_keys = OFF;

CREATE TABLE achievement_challenges_next (
  id TEXT PRIMARY KEY NOT NULL,
  map_id TEXT NOT NULL REFERENCES maps(id),
  type TEXT NOT NULL CHECK (type IN ('difficulty_completion', 'pioneer', 'classic_completion')),
  name TEXT NOT NULL,
  difficulty TEXT,
  game_version TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('active', 'sunsetting', 'inactive')),
  introduced_version TEXT NOT NULL,
  retired_version TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

INSERT INTO achievement_challenges_next SELECT * FROM achievement_challenges;
DROP TABLE achievement_challenges;
ALTER TABLE achievement_challenges_next RENAME TO achievement_challenges;
CREATE INDEX achievement_challenges_map_status_idx ON achievement_challenges(map_id, status, name);

CREATE TABLE title_challenges_next (
  id TEXT PRIMARY KEY NOT NULL,
  title_key TEXT NOT NULL REFERENCES title_catalog(key),
  category_override TEXT,
  condition TEXT NOT NULL,
  evidence_rule TEXT NOT NULL,
  submission_mode TEXT NOT NULL CHECK (submission_mode IN ('manual', 'automatic')),
  game_version TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('active', 'sunsetting', 'retired')),
  introduced_version TEXT NOT NULL,
  retired_version TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  UNIQUE (title_key)
);

INSERT INTO title_challenges_next SELECT id, title_key, category_override, condition, evidence_rule, submission_mode, game_version, status, introduced_version, retired_version, created_at, updated_at FROM title_challenges;
DROP TABLE title_challenges;
ALTER TABLE title_challenges_next RENAME TO title_challenges;
CREATE INDEX title_challenges_status_idx ON title_challenges(status, title_key);

PRAGMA foreign_keys = ON;
