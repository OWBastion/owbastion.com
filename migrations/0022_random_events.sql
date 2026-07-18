CREATE TABLE random_events (
  id TEXT PRIMARY KEY NOT NULL,
  name TEXT NOT NULL,
  category TEXT NOT NULL,
  rarity TEXT NOT NULL,
  description TEXT NOT NULL,
  duration_seconds INTEGER,
  cooldown_seconds INTEGER,
  weight REAL,
  appearance_probability REAL,
  game_version TEXT NOT NULL,
  effect_tags_json TEXT NOT NULL DEFAULT '[]',
  release_status TEXT NOT NULL CHECK (release_status IN ('development', 'implemented', 'removed')),
  archived_at INTEGER,
  archived_by TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE INDEX random_events_visible_idx ON random_events (archived_at, release_status, name);
CREATE TABLE random_event_map_challenges (
  event_id TEXT NOT NULL REFERENCES random_events(id) ON DELETE CASCADE,
  challenge_id TEXT NOT NULL REFERENCES achievement_challenges(id) ON DELETE CASCADE,
  PRIMARY KEY (event_id, challenge_id)
);
CREATE TABLE random_event_title_challenges (
  event_id TEXT NOT NULL REFERENCES random_events(id) ON DELETE CASCADE,
  challenge_id TEXT NOT NULL REFERENCES title_challenges(id) ON DELETE CASCADE,
  PRIMARY KEY (event_id, challenge_id)
);
CREATE TABLE random_event_imports (
  id TEXT PRIMARY KEY NOT NULL,
  source_hash TEXT NOT NULL UNIQUE,
  file_name TEXT NOT NULL,
  row_count INTEGER NOT NULL,
  imported_by TEXT NOT NULL,
  imported_at INTEGER NOT NULL
);
