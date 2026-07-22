CREATE TABLE qq_member_open_id_conflict_guard (id INTEGER NOT NULL CHECK (id = 1));
INSERT INTO qq_member_open_id_conflict_guard (id)
SELECT 0
WHERE EXISTS (
  SELECT 1
  FROM bindings
  GROUP BY provider, member_open_id
  HAVING COUNT(DISTINCT player_account_id) > 1
);
DROP TABLE qq_member_open_id_conflict_guard;

DROP INDEX bindings_provider_group_member_idx;

UPDATE submissions
SET binding_id = (
  SELECT canonical.id
  FROM bindings AS duplicate
  JOIN bindings AS canonical
    ON canonical.provider = duplicate.provider
    AND canonical.member_open_id = duplicate.member_open_id
  WHERE duplicate.id = submissions.binding_id
  ORDER BY canonical.created_at ASC, canonical.id ASC
  LIMIT 1
)
WHERE binding_id IN (
  SELECT duplicate.id
  FROM bindings AS duplicate
  WHERE EXISTS (
    SELECT 1
    FROM bindings AS canonical
    WHERE canonical.provider = duplicate.provider
      AND canonical.member_open_id = duplicate.member_open_id
      AND (canonical.created_at < duplicate.created_at OR (canonical.created_at = duplicate.created_at AND canonical.id < duplicate.id))
  )
);

DELETE FROM bindings
WHERE EXISTS (
  SELECT 1
  FROM bindings AS canonical
  WHERE canonical.provider = bindings.provider
    AND canonical.member_open_id = bindings.member_open_id
    AND (canonical.created_at < bindings.created_at OR (canonical.created_at = bindings.created_at AND canonical.id < bindings.id))
);

CREATE UNIQUE INDEX bindings_provider_member_idx ON bindings(provider, member_open_id);
