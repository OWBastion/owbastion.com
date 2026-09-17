DROP TRIGGER IF EXISTS player_equipped_titles_validate_insert;

DELETE FROM player_equipped_titles
WHERE grant_id IN (
  SELECT equipped.grant_id
  FROM player_equipped_titles AS equipped
  JOIN player_title_grants AS grant ON grant.id = equipped.grant_id
  JOIN title_catalog AS title ON title.key = grant.title_key
  WHERE NOT (
    grant.status = 'active'
    AND grant.map_id IS NULL
    AND grant.gameplay_revision_id IS NULL
    AND title.scope = 'global'
    AND title.availability = 'active'
    AND title.game_version IS NOT NULL
  )
);

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
      AND title.availability = 'active'
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
      AND title.availability = 'active'
      AND title.game_version IS NOT NULL
  ) >= 10;
END;

INSERT INTO player_equipped_titles (grant_id, player_account_id, equipped_at)
SELECT grant.id, grant.player_account_id, CAST(strftime('%s','now') AS INTEGER) * 1000
FROM player_title_grants AS grant
JOIN title_catalog AS title ON title.key = grant.title_key
WHERE grant.status = 'active'
  AND grant.map_id IS NULL
  AND grant.gameplay_revision_id IS NULL
  AND title.scope = 'global'
  AND title.availability = 'active'
  AND title.game_version IS NOT NULL
  AND grant.player_account_id IN (
    SELECT eligible.player_account_id
    FROM player_title_grants AS eligible
    JOIN title_catalog AS eligible_title ON eligible_title.key = eligible.title_key
    WHERE eligible.status = 'active'
      AND eligible.map_id IS NULL
      AND eligible.gameplay_revision_id IS NULL
      AND eligible_title.scope = 'global'
      AND eligible_title.availability = 'active'
      AND eligible_title.game_version IS NOT NULL
    GROUP BY eligible.player_account_id
    HAVING COUNT(*) <= 10
  )
  AND NOT EXISTS (
    SELECT 1
    FROM player_equipped_titles AS existing
    JOIN player_title_grants AS existing_grant ON existing_grant.id = existing.grant_id
    JOIN title_catalog AS existing_title ON existing_title.key = existing_grant.title_key
    WHERE existing.player_account_id = grant.player_account_id
      AND existing_grant.status = 'active'
      AND existing_grant.map_id IS NULL
      AND existing_grant.gameplay_revision_id IS NULL
      AND existing_title.scope = 'global'
      AND existing_title.availability = 'active'
      AND existing_title.game_version IS NOT NULL
  )
ORDER BY grant.player_account_id, grant.granted_at, grant.id;
