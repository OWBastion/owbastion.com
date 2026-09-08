CREATE TABLE player_equipped_titles (
  grant_id TEXT PRIMARY KEY REFERENCES player_title_grants(id),
  player_account_id TEXT NOT NULL REFERENCES player_accounts(id),
  equipped_at INTEGER NOT NULL
);
CREATE INDEX player_equipped_titles_player_idx ON player_equipped_titles(player_account_id);
CREATE TRIGGER player_equipped_titles_validate_insert BEFORE INSERT ON player_equipped_titles BEGIN
  SELECT CASE WHEN NOT EXISTS (SELECT 1 FROM player_title_grants WHERE id = NEW.grant_id AND player_account_id = NEW.player_account_id AND status = 'active') THEN RAISE(ABORT, 'EQUIPPED_TITLE_GRANT_INVALID') END;
  SELECT CASE WHEN (SELECT COUNT(*) FROM player_equipped_titles WHERE player_account_id = NEW.player_account_id) >= 10 THEN RAISE(ABORT, 'EQUIPPED_TITLE_LIMIT_EXCEEDED') END;
END;
INSERT INTO player_equipped_titles (grant_id, player_account_id, equipped_at)
SELECT grant.id, grant.player_account_id, CAST(strftime('%s','now') AS INTEGER) * 1000 FROM player_title_grants AS grant
JOIN title_catalog AS title ON title.key = grant.title_key LEFT JOIN gameplay_revisions AS revision ON revision.id = grant.gameplay_revision_id
WHERE grant.status = 'active' AND title.availability = 'active' AND ((title.scope = 'global' AND grant.map_id IS NULL AND grant.gameplay_revision_id IS NULL) OR (title.scope = 'map' AND revision.lifecycle IN ('default', 'selectable')))
AND grant.player_account_id IN (SELECT candidate.player_account_id FROM player_title_grants AS candidate JOIN title_catalog AS candidate_title ON candidate_title.key = candidate.title_key LEFT JOIN gameplay_revisions AS candidate_revision ON candidate_revision.id = candidate.gameplay_revision_id WHERE candidate.status = 'active' AND candidate_title.availability = 'active' AND ((candidate_title.scope = 'global' AND candidate.map_id IS NULL AND candidate.gameplay_revision_id IS NULL) OR (candidate_title.scope = 'map' AND candidate_revision.lifecycle IN ('default', 'selectable'))) GROUP BY candidate.player_account_id HAVING COUNT(*) <= 10);
