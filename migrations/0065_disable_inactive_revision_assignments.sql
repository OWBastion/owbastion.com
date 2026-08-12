-- 0061 materialised legacy direct challenges without carrying their inactive
-- state into the revision assignment. Keep the historical assignment, but do
-- not expose it as enabled configuration for a new revision or a build.
UPDATE gameplay_revision_challenge_assignments
SET enabled = 0
WHERE challenge_family = 'map_challenge'
  AND enabled = 1
  AND EXISTS (
    SELECT 1
    FROM achievement_challenges AS challenge
    WHERE challenge.id = gameplay_revision_challenge_assignments.challenge_id
      AND challenge.map_id = gameplay_revision_challenge_assignments.map_id
      AND challenge.status = 'inactive'
  );
