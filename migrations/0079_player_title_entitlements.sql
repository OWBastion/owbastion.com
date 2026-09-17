-- Compatibility decision: accounts that satisfied the former inferred allTitles
-- projection at migration time retain that developer entitlement permanently.
CREATE TABLE player_title_entitlements (
  player_account_id TEXT PRIMARY KEY REFERENCES player_accounts(id),
  all_titles INTEGER NOT NULL DEFAULT 1 CHECK (all_titles IN (0, 1))
);
INSERT INTO player_title_entitlements (player_account_id, all_titles)
SELECT ptg.player_account_id, 1
FROM player_title_grants AS ptg
JOIN title_catalog AS title ON title.key = ptg.title_key
WHERE ptg.status = 'active'
  AND ptg.map_id IS NULL
  AND ptg.gameplay_revision_id IS NULL
  AND title.scope = 'global'
  AND title.availability = 'active'
  AND title.game_version IS NOT NULL
GROUP BY ptg.player_account_id
HAVING COUNT(DISTINCT ptg.title_key) = (
  SELECT COUNT(*) FROM title_catalog
  WHERE scope = 'global' AND availability = 'active' AND game_version IS NOT NULL
);
