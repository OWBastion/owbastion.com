-- Allow multiple acquisition Challenges per Title: drop UNIQUE(title_key) and
-- add replaced_by_challenge_id for save-as-new-challenge links.
--
-- D1 always enforces foreign keys, so PRAGMA foreign_keys cannot disable them.
-- The table is rebuilt without touching child tables by pausing their CASCADE
-- references: child rows are moved to staging tables, the parents rebuilt, then
-- the staged rows are moved back. defer_foreign_keys still delays the new
-- self-reference until commit.
--
-- The parent copy is a schema-preserving rebuild, not a data write; the
-- staged child rows are moved unchanged. The data-write exception for this
-- file lives in tools/migration-data-allowlist.txt.

PRAGMA defer_foreign_keys = ON;

CREATE TABLE title_challenges_next (
  id TEXT PRIMARY KEY NOT NULL,
  title_key TEXT NOT NULL REFERENCES title_catalog(key),
  category_override TEXT,
  condition TEXT NOT NULL,
  evidence_rule TEXT NOT NULL,
  submission_mode TEXT NOT NULL CHECK (submission_mode IN ('manual', 'automatic')),
  status TEXT NOT NULL CHECK (status IN ('draft', 'active', 'archived')),
  retired_version TEXT,
  starts_at INTEGER,
  ends_at INTEGER,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  scope TEXT NOT NULL DEFAULT 'global' CHECK (scope IN ('global', 'map')),
  map_variant TEXT,
  game_version TEXT,
  introduced_version TEXT,
  progress_rule TEXT,
  replaced_by_challenge_id TEXT REFERENCES title_challenges(id),
  CHECK (ends_at IS NULL OR starts_at IS NULL OR ends_at > starts_at)
);

INSERT INTO title_challenges_next (
  id, title_key, category_override, condition, evidence_rule, submission_mode,
  status, retired_version, starts_at, ends_at, created_at, updated_at,
  scope, map_variant, game_version, introduced_version, progress_rule
)
SELECT id, title_key, category_override, condition, evidence_rule, submission_mode,
  status, retired_version, starts_at, ends_at, created_at, updated_at,
  scope, map_variant, game_version, introduced_version, progress_rule
FROM title_challenges;

-- Stage CASCADE children; re-pointing them directly at the next table would
-- fail foreign_key_check (they reference the old table's name).
CREATE TABLE temp_random_event_title_challenges AS SELECT event_id, challenge_id FROM random_event_title_challenges;
DELETE FROM random_event_title_challenges;
CREATE TABLE temp_achievement_challenge_maps AS SELECT challenge_id, map_id FROM achievement_challenge_maps;
DELETE FROM achievement_challenge_maps;

DROP TABLE title_challenges;
ALTER TABLE title_challenges_next RENAME TO title_challenges;
CREATE INDEX title_challenges_status_idx ON title_challenges(status, title_key);

INSERT INTO random_event_title_challenges (event_id, challenge_id) SELECT event_id, challenge_id FROM temp_random_event_title_challenges;
INSERT INTO achievement_challenge_maps (challenge_id, map_id) SELECT challenge_id, map_id FROM temp_achievement_challenge_maps;
DROP TABLE temp_random_event_title_challenges;
DROP TABLE temp_achievement_challenge_maps;

PRAGMA foreign_key_check;
