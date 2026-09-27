ALTER TABLE reviews ADD COLUMN gameplay_revision_id TEXT REFERENCES gameplay_revisions(id);

-- Bind existing map reviews to the default Revision established by migration
-- 0061, or to a map's sole historical Revision when it has no default. If the
-- row has no unique candidate, keep it in the legacy unscoped bucket because
-- reviews do not record enough provenance to infer a Revision safely.
UPDATE reviews
SET gameplay_revision_id = (
  SELECT revision.id
  FROM gameplay_revisions AS revision
  WHERE revision.map_id = reviews.target_id
    AND (
      revision.lifecycle = 'default'
      OR (
        revision.lifecycle = 'historical'
        AND (SELECT COUNT(*) FROM gameplay_revisions AS candidate WHERE candidate.map_id = reviews.target_id) = 1
      )
    )
)
WHERE target_type = 'map'
  AND gameplay_revision_id IS NULL
  AND EXISTS (
    SELECT 1
    FROM gameplay_revisions AS revision
    WHERE revision.map_id = reviews.target_id
      AND (
        revision.lifecycle = 'default'
        OR (
          revision.lifecycle = 'historical'
          AND (SELECT COUNT(*) FROM gameplay_revisions AS candidate WHERE candidate.map_id = reviews.target_id) = 1
        )
      )
  );

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
