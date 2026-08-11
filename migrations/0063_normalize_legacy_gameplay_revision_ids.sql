-- 0063_normalize_legacy_gameplay_revision_ids: replace the label-derived
-- legacy revision IDs emitted by 0061 with a reserved machine sequence.
--
-- legacy_map_variant retains the CLASSIC compatibility meaning. It is not part
-- of the revision identity. Rewrite every persisted reference so historical
-- facts, challenge projections, and retry/audit snapshots remain coherent.

PRAGMA foreign_keys = OFF;

CREATE TABLE gameplay_revision_id_0063_map (
  old_id TEXT PRIMARY KEY NOT NULL,
  new_id TEXT NOT NULL
);

INSERT INTO gameplay_revision_id_0063_map (old_id, new_id)
SELECT
  id,
  'revision:' || map_id || ':v0'
FROM gameplay_revisions
WHERE legacy_map_variant = 'classic'
  AND id <> 'revision:' || map_id || ':v0';

UPDATE gameplay_revision_challenge_assignments
SET id = replace(
  id,
  gameplay_revision_id,
  (
    SELECT new_id
    FROM gameplay_revision_id_0063_map
    WHERE old_id = gameplay_revision_challenge_assignments.gameplay_revision_id
  )
)
WHERE gameplay_revision_id IN (SELECT old_id FROM gameplay_revision_id_0063_map);

UPDATE gameplay_revision_challenge_assignments
SET gameplay_revision_id = (
  SELECT new_id
  FROM gameplay_revision_id_0063_map
  WHERE old_id = gameplay_revision_challenge_assignments.gameplay_revision_id
)
WHERE gameplay_revision_id IN (SELECT old_id FROM gameplay_revision_id_0063_map);

UPDATE submissions
SET gameplay_revision_id = (
  SELECT new_id
  FROM gameplay_revision_id_0063_map
  WHERE old_id = submissions.gameplay_revision_id
)
WHERE gameplay_revision_id IN (SELECT old_id FROM gameplay_revision_id_0063_map);

UPDATE mastery_runs
SET gameplay_revision_id = (
  SELECT new_id
  FROM gameplay_revision_id_0063_map
  WHERE old_id = mastery_runs.gameplay_revision_id
)
WHERE gameplay_revision_id IN (SELECT old_id FROM gameplay_revision_id_0063_map);

UPDATE player_title_grants
SET gameplay_revision_id = (
  SELECT new_id
  FROM gameplay_revision_id_0063_map
  WHERE old_id = player_title_grants.gameplay_revision_id
)
WHERE gameplay_revision_id IN (SELECT old_id FROM gameplay_revision_id_0063_map);

UPDATE historical_title_grants
SET gameplay_revision_id = (
  SELECT new_id
  FROM gameplay_revision_id_0063_map
  WHERE old_id = historical_title_grants.gameplay_revision_id
)
WHERE gameplay_revision_id IN (SELECT old_id FROM gameplay_revision_id_0063_map);

UPDATE gameplay_revisions
SET copied_from_revision_id = (
  SELECT new_id
  FROM gameplay_revision_id_0063_map
  WHERE old_id = gameplay_revisions.copied_from_revision_id
)
WHERE copied_from_revision_id IN (SELECT old_id FROM gameplay_revision_id_0063_map);

UPDATE gameplay_revisions
SET id = (
  SELECT new_id
  FROM gameplay_revision_id_0063_map
  WHERE old_id = gameplay_revisions.id
)
WHERE id IN (SELECT old_id FROM gameplay_revision_id_0063_map);

WITH RECURSIVE
  ordered_revision_ids AS (
    SELECT old_id, new_id, ROW_NUMBER() OVER (ORDER BY old_id) AS step
    FROM gameplay_revision_id_0063_map
  ),
  rewritten (id, step, value) AS (
    SELECT id, 0, rule_snapshot_json
    FROM submissions
    WHERE rule_snapshot_json IS NOT NULL
    UNION ALL
    SELECT rewritten.id, ordered_revision_ids.step, replace(rewritten.value, ordered_revision_ids.old_id, ordered_revision_ids.new_id)
    FROM rewritten
    INNER JOIN ordered_revision_ids ON ordered_revision_ids.step = rewritten.step + 1
  )
UPDATE submissions
SET rule_snapshot_json = (
  SELECT value
  FROM rewritten
  WHERE rewritten.id = submissions.id
  ORDER BY step DESC
  LIMIT 1
)
WHERE rule_snapshot_json IS NOT NULL;

WITH RECURSIVE
  ordered_revision_ids AS (
    SELECT old_id, new_id, ROW_NUMBER() OVER (ORDER BY old_id) AS step
    FROM gameplay_revision_id_0063_map
  ),
  rewritten (id, step, value) AS (
    SELECT id, 0, outcome_key
    FROM submission_outcomes
    UNION ALL
    SELECT rewritten.id, ordered_revision_ids.step, replace(rewritten.value, ordered_revision_ids.old_id, ordered_revision_ids.new_id)
    FROM rewritten
    INNER JOIN ordered_revision_ids ON ordered_revision_ids.step = rewritten.step + 1
  )
UPDATE submission_outcomes
SET outcome_key = (
  SELECT value
  FROM rewritten
  WHERE rewritten.id = submission_outcomes.id
  ORDER BY step DESC
  LIMIT 1
);

WITH RECURSIVE
  ordered_revision_ids AS (
    SELECT old_id, new_id, ROW_NUMBER() OVER (ORDER BY old_id) AS step
    FROM gameplay_revision_id_0063_map
  ),
  rewritten (id, step, value) AS (
    SELECT id, 0, details_json
    FROM submission_outcomes
    WHERE details_json IS NOT NULL
    UNION ALL
    SELECT rewritten.id, ordered_revision_ids.step, replace(rewritten.value, ordered_revision_ids.old_id, ordered_revision_ids.new_id)
    FROM rewritten
    INNER JOIN ordered_revision_ids ON ordered_revision_ids.step = rewritten.step + 1
  )
UPDATE submission_outcomes
SET details_json = (
  SELECT value
  FROM rewritten
  WHERE rewritten.id = submission_outcomes.id
  ORDER BY step DESC
  LIMIT 1
)
WHERE details_json IS NOT NULL;

WITH RECURSIVE
  ordered_revision_ids AS (
    SELECT old_id, new_id, ROW_NUMBER() OVER (ORDER BY old_id) AS step
    FROM gameplay_revision_id_0063_map
  ),
  rewritten (id, step, value) AS (
    SELECT id, 0, match_json
    FROM ocr_results
    WHERE match_json IS NOT NULL
    UNION ALL
    SELECT rewritten.id, ordered_revision_ids.step, replace(rewritten.value, ordered_revision_ids.old_id, ordered_revision_ids.new_id)
    FROM rewritten
    INNER JOIN ordered_revision_ids ON ordered_revision_ids.step = rewritten.step + 1
  )
UPDATE ocr_results
SET match_json = (
  SELECT value
  FROM rewritten
  WHERE rewritten.id = ocr_results.id
  ORDER BY step DESC
  LIMIT 1
)
WHERE match_json IS NOT NULL;

WITH RECURSIVE
  ordered_revision_ids AS (
    SELECT old_id, new_id, ROW_NUMBER() OVER (ORDER BY old_id) AS step
    FROM gameplay_revision_id_0063_map
  ),
  rewritten (id, step, value) AS (
    SELECT id, 0, response_json
    FROM idempotency_keys
    UNION ALL
    SELECT rewritten.id, ordered_revision_ids.step, replace(rewritten.value, ordered_revision_ids.old_id, ordered_revision_ids.new_id)
    FROM rewritten
    INNER JOIN ordered_revision_ids ON ordered_revision_ids.step = rewritten.step + 1
  )
UPDATE idempotency_keys
SET response_json = (
  SELECT value
  FROM rewritten
  WHERE rewritten.id = idempotency_keys.id
  ORDER BY step DESC
  LIMIT 1
);

UPDATE audit_events
SET entity_id = (
  SELECT new_id
  FROM gameplay_revision_id_0063_map
  WHERE old_id = audit_events.entity_id
)
WHERE entity_id IN (SELECT old_id FROM gameplay_revision_id_0063_map);

WITH RECURSIVE
  ordered_revision_ids AS (
    SELECT old_id, new_id, ROW_NUMBER() OVER (ORDER BY old_id) AS step
    FROM gameplay_revision_id_0063_map
  ),
  rewritten (id, step, value) AS (
    SELECT id, 0, payload_json
    FROM audit_events
    UNION ALL
    SELECT rewritten.id, ordered_revision_ids.step, replace(rewritten.value, ordered_revision_ids.old_id, ordered_revision_ids.new_id)
    FROM rewritten
    INNER JOIN ordered_revision_ids ON ordered_revision_ids.step = rewritten.step + 1
  )
UPDATE audit_events
SET payload_json = (
  SELECT value
  FROM rewritten
  WHERE rewritten.id = audit_events.id
  ORDER BY step DESC
  LIMIT 1
);

DROP TABLE gameplay_revision_id_0063_map;

PRAGMA foreign_keys = ON;
