ALTER TABLE reviews ADD COLUMN gameplay_revision_id TEXT REFERENCES gameplay_revisions(id);

DROP INDEX reviews_player_target_idx;
DROP INDEX reviews_target_status_idx;

CREATE UNIQUE INDEX reviews_player_event_idx
  ON reviews(player_account_id, target_id)
  WHERE target_type = 'event';

CREATE UNIQUE INDEX reviews_player_legacy_map_idx
  ON reviews(player_account_id, target_id)
  WHERE target_type = 'map' AND gameplay_revision_id IS NULL;

CREATE UNIQUE INDEX reviews_player_map_revision_idx
  ON reviews(player_account_id, target_id, gameplay_revision_id)
  WHERE target_type = 'map' AND gameplay_revision_id IS NOT NULL;

CREATE INDEX reviews_target_status_idx
  ON reviews(target_type, target_id, gameplay_revision_id, status);
