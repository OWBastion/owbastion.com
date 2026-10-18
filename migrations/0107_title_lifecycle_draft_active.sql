-- Drop the stored `retired` title lifecycle: a title's ended state is derived
-- from its acquisition paths, so lifecycle is only draft | active. Existing
-- retired rows become active; per-challenge state already records the real
-- availability of each path.
--
-- D1 always enforces foreign keys, so PRAGMA foreign_keys cannot disable them.
-- The table is rebuilt without touching child tables by pausing their
-- references: child rows are moved to staging tables, the parent is rebuilt,
-- then the staged rows are moved back (the 0106 technique). Dropping the old
-- table with children still attached leaves deferred violations that commit
-- rejects even after the replacement is renamed into place.
-- player_equipped_titles_validate_insert joins title_catalog by name and a
-- trigger whose referenced table is dropped mid-schema cannot be recreated
-- until the name resolves, so the rebuild drops it first and restores the
-- exact 0086 body alongside the scope/lifecycle index.
--
-- Converting retired rows to active and moving child rows through staging are
-- data writes; the exception for this file lives in
-- tools/migration-data-allowlist.txt.

PRAGMA defer_foreign_keys = ON;

CREATE TABLE title_catalog_next (
  key TEXT PRIMARY KEY NOT NULL,
  label TEXT NOT NULL,
  category TEXT NOT NULL,
  condition TEXT NOT NULL,
  scope TEXT NOT NULL CHECK (scope IN ('global', 'map')),
  display_kind TEXT NOT NULL CHECK (display_kind IN ('fixed', 'map_pioneer', 'map_name_suffix')),
  icon TEXT NOT NULL DEFAULT 'award',
  icon_url TEXT,
  icon_object_key TEXT,
  color_json TEXT NOT NULL DEFAULT 'null',
  game_version TEXT,
  lifecycle TEXT NOT NULL DEFAULT 'active' CHECK (lifecycle IN ('draft', 'active')),
  public_visibility INTEGER NOT NULL DEFAULT 1 CHECK (public_visibility IN (0, 1))
);

INSERT INTO title_catalog_next (
  key, label, category, condition, scope, display_kind,
  icon, icon_url, icon_object_key, color_json, game_version,
  lifecycle, public_visibility
)
SELECT key, label, category, condition, scope, display_kind,
  icon, icon_url, icon_object_key, color_json, game_version,
  CASE WHEN lifecycle = 'retired' THEN 'active' ELSE lifecycle END,
  public_visibility
FROM title_catalog;

-- Stage every table that references title_catalog plus the CASCADE
-- grandchildren of the parents this rebuild empties (emptying
-- title_challenges cascades into random_event_title_challenges and
-- achievement_challenge_maps; emptying achievement_challenges cascades into
-- random_event_map_challenges). Re-pointing rows directly at the next table
-- would fail foreign_key_check (they reference the old table's name); NO
-- ACTION grandchildren rely on defer_foreign_keys instead.
CREATE TABLE temp_title_challenges AS SELECT * FROM title_challenges;
CREATE TABLE temp_random_event_title_challenges AS SELECT * FROM random_event_title_challenges;
CREATE TABLE temp_achievement_challenge_maps AS SELECT * FROM achievement_challenge_maps;
CREATE TABLE temp_map_title_rules AS SELECT * FROM map_title_rules;
CREATE TABLE temp_map_title_rewards AS SELECT * FROM map_title_rewards;
CREATE TABLE temp_historical_title_grants AS SELECT * FROM historical_title_grants;
CREATE TABLE temp_player_title_grants AS SELECT * FROM player_title_grants;
CREATE TABLE temp_challenges AS SELECT * FROM challenges;
-- reward_title_key is nullable; staged rows keep NULL unchanged.
CREATE TABLE temp_achievement_challenges AS SELECT * FROM achievement_challenges;
CREATE TABLE temp_random_event_map_challenges AS SELECT * FROM random_event_map_challenges;
-- Deletes run only after every CASCADE descendant is staged: emptying a
-- parent cascades, so emptying grandchildren first would be too late.
DELETE FROM title_challenges;
DELETE FROM random_event_title_challenges;
DELETE FROM achievement_challenge_maps;
DELETE FROM map_title_rules;
DELETE FROM map_title_rewards;
DELETE FROM historical_title_grants;
DELETE FROM player_title_grants;
DELETE FROM challenges;
DELETE FROM achievement_challenges;
DELETE FROM random_event_map_challenges;

DROP TRIGGER player_equipped_titles_validate_insert;
DROP TABLE title_catalog;
ALTER TABLE title_catalog_next RENAME TO title_catalog;
CREATE INDEX title_catalog_scope_idx ON title_catalog(scope, lifecycle);

INSERT INTO title_challenges SELECT * FROM temp_title_challenges;
INSERT INTO map_title_rules SELECT * FROM temp_map_title_rules;
INSERT INTO map_title_rewards SELECT * FROM temp_map_title_rewards;
INSERT INTO historical_title_grants SELECT * FROM temp_historical_title_grants;
INSERT INTO player_title_grants SELECT * FROM temp_player_title_grants;
INSERT INTO challenges SELECT * FROM temp_challenges;
INSERT INTO achievement_challenges SELECT * FROM temp_achievement_challenges;
-- CASCADE grandchildren restore after their parents exist again.
INSERT INTO random_event_title_challenges SELECT * FROM temp_random_event_title_challenges;
INSERT INTO achievement_challenge_maps SELECT * FROM temp_achievement_challenge_maps;
INSERT INTO random_event_map_challenges SELECT * FROM temp_random_event_map_challenges;
DROP TABLE temp_title_challenges;
DROP TABLE temp_random_event_title_challenges;
DROP TABLE temp_achievement_challenge_maps;
DROP TABLE temp_map_title_rules;
DROP TABLE temp_map_title_rewards;
DROP TABLE temp_historical_title_grants;
DROP TABLE temp_player_title_grants;
DROP TABLE temp_challenges;
DROP TABLE temp_achievement_challenges;
DROP TABLE temp_random_event_map_challenges;

CREATE TRIGGER player_equipped_titles_validate_insert BEFORE INSERT ON player_equipped_titles BEGIN
  SELECT RAISE(ABORT, 'EQUIPPED_TITLE_GRANT_INVALID')
  WHERE NOT EXISTS (
    SELECT 1
    FROM player_title_grants AS grant
    JOIN title_catalog AS title ON title.key = grant.title_key
    LEFT JOIN gameplay_revisions AS revision ON revision.id = grant.gameplay_revision_id
    WHERE grant.id = NEW.grant_id
      AND grant.player_account_id = NEW.player_account_id
      AND grant.status = 'active'
      AND title.scope = 'global'
      AND title.game_version IS NOT NULL
      AND (
        (grant.map_id IS NULL AND grant.gameplay_revision_id IS NULL)
        OR (grant.map_id = revision.map_id AND revision.lifecycle IN ('default', 'selectable'))
      )
  );
  SELECT RAISE(ABORT, 'EQUIPPED_TITLE_LIMIT_EXCEEDED')
  WHERE (
    SELECT COUNT(*)
    FROM player_equipped_titles AS equipped
    JOIN player_title_grants AS grant ON grant.id = equipped.grant_id
    JOIN title_catalog AS title ON title.key = grant.title_key
    LEFT JOIN gameplay_revisions AS revision ON revision.id = grant.gameplay_revision_id
    WHERE equipped.player_account_id = NEW.player_account_id
      AND grant.status = 'active'
      AND title.scope = 'global'
      AND title.game_version IS NOT NULL
      AND (
        (grant.map_id IS NULL AND grant.gameplay_revision_id IS NULL)
        OR (grant.map_id = revision.map_id AND revision.lifecycle IN ('default', 'selectable'))
      )
  ) >= 10;
END;

PRAGMA foreign_key_check;
