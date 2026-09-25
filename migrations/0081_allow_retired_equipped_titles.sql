DROP TRIGGER IF EXISTS player_equipped_titles_validate_insert;

CREATE TRIGGER player_equipped_titles_validate_insert BEFORE INSERT ON player_equipped_titles BEGIN
  SELECT RAISE(ABORT, 'EQUIPPED_TITLE_GRANT_INVALID')
  WHERE NOT EXISTS (
    SELECT 1
    FROM player_title_grants AS grant
    JOIN title_catalog AS title ON title.key = grant.title_key
    WHERE grant.id = NEW.grant_id
      AND grant.player_account_id = NEW.player_account_id
      AND grant.status = 'active'
      AND grant.map_id IS NULL
      AND grant.gameplay_revision_id IS NULL
      AND title.scope = 'global'
      AND title.game_version IS NOT NULL
  );
  SELECT RAISE(ABORT, 'EQUIPPED_TITLE_LIMIT_EXCEEDED')
  WHERE (
    SELECT COUNT(*)
    FROM player_equipped_titles AS equipped
    JOIN player_title_grants AS grant ON grant.id = equipped.grant_id
    JOIN title_catalog AS title ON title.key = grant.title_key
    WHERE equipped.player_account_id = NEW.player_account_id
      AND grant.status = 'active'
      AND grant.map_id IS NULL
      AND grant.gameplay_revision_id IS NULL
      AND title.scope = 'global'
      AND title.game_version IS NOT NULL
  ) >= 10;
END;
