CREATE TABLE player_title_entitlements (
  player_account_id TEXT PRIMARY KEY REFERENCES player_accounts(id),
  all_titles INTEGER NOT NULL DEFAULT 1 CHECK (all_titles IN (0, 1))
);
INSERT INTO player_title_entitlements (player_account_id, all_titles)
SELECT grant.player_account_id, 1
FROM player_title_grants AS grant
JOIN title_catalog AS title ON title.key = grant.title_key
WHERE grant.status = 'active'
  AND grant.map_id IS NULL
  AND grant.gameplay_revision_id IS NULL
  AND title.scope = 'global'
  AND title.availability = 'active'
  AND title.game_version IS NOT NULL
GROUP BY grant.player_account_id
HAVING COUNT(DISTINCT grant.title_key) = (
  SELECT COUNT(*) FROM title_catalog
  WHERE scope = 'global' AND availability = 'active' AND game_version IS NOT NULL
);
