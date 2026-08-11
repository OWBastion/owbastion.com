-- 0062_repair_legacy_classic_revisions: correct synthetic provenance left by
-- the initial gameplay-revision backfill.
--
-- CLASSIC is a legacy compatibility projection, not a copy of the map's
-- initial revision. Its game version must come from the legacy fact that made
-- the projection exist, rather than the map's mutable current metadata.

UPDATE gameplay_revisions AS revision
SET
  copied_from_revision_id = NULL,
  game_version = COALESCE(
    (
      SELECT run.game_version
      FROM mastery_runs AS run
      WHERE run.map_id = revision.map_id
        AND run.map_variant = 'classic'
      ORDER BY run.accepted_at ASC, run.id ASC
      LIMIT 1
    ),
    (
      SELECT challenge.game_version
      FROM achievement_challenges AS challenge
      WHERE challenge.map_id = revision.map_id
        AND challenge.type = 'classic_completion'
      ORDER BY challenge.introduced_version ASC, challenge.id ASC
      LIMIT 1
    ),
    (
      SELECT challenge.game_version
      FROM title_challenges AS challenge
      INNER JOIN achievement_challenge_maps AS link
        ON link.challenge_id = challenge.id
      WHERE link.map_id = revision.map_id
        AND challenge.map_variant = 'classic'
      ORDER BY challenge.introduced_version ASC, challenge.id ASC
      LIMIT 1
    ),
    (
      SELECT rule.introduced_version
      FROM map_title_rule_exceptions AS exception
      INNER JOIN map_title_rules AS rule ON rule.id = exception.rule_id
      WHERE exception.map_id = revision.map_id
        AND rule.map_variant = 'classic'
      ORDER BY rule.introduced_version ASC, rule.id ASC
      LIMIT 1
    ),
    -- 0061 only created CLASSIC rows when one of the sources above existed.
    -- Retain the already-stored value solely for malformed pre-existing data.
    revision.game_version
  )
WHERE revision.legacy_map_variant = 'classic';
