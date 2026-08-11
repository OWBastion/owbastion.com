-- 0061_gameplay_revisions: introduce stable gameplay revisions beneath maps.
--
-- Existing map identities remain stable. This migration materialises one
-- initial revision for every map and a selectable CLASSIC revision only where
-- existing data already proves that variant. It then assigns historical facts
-- to those immutable revision identities without deleting or reclassifying any
-- grant, submission, evidence, or mastery run.

CREATE TABLE gameplay_revisions (
  id TEXT PRIMARY KEY NOT NULL,
  map_id TEXT NOT NULL REFERENCES maps(id),
  lifecycle TEXT NOT NULL CHECK (lifecycle IN ('preparing', 'default', 'selectable', 'historical')),
  legacy_map_variant TEXT CHECK (legacy_map_variant IS NULL OR legacy_map_variant IN ('classic')),
  copied_from_revision_id TEXT REFERENCES gameplay_revisions(id),
  reset_reason TEXT,
  game_version TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE INDEX gameplay_revisions_map_lifecycle_idx ON gameplay_revisions(map_id, lifecycle);
CREATE UNIQUE INDEX gameplay_revisions_one_default_idx ON gameplay_revisions(map_id) WHERE lifecycle = 'default';
CREATE UNIQUE INDEX gameplay_revisions_legacy_variant_idx ON gameplay_revisions(map_id, legacy_map_variant) WHERE legacy_map_variant IS NOT NULL;

-- Initial identities are derived from stable map IDs, never labels/localized text.
INSERT INTO gameplay_revisions (
  id, map_id, lifecycle, legacy_map_variant, copied_from_revision_id,
  reset_reason, game_version, created_at, updated_at
)
SELECT
  'revision:' || id || ':initial',
  id,
  CASE status WHEN 'active' THEN 'default' ELSE 'historical' END,
  NULL,
  NULL,
  NULL,
  game_version,
  created_at,
  updated_at
FROM maps;

-- Preserve the existing CLASSIC compatibility meaning as a selectable
-- historical revision whenever a legacy record or current challenge already
-- uses that variant. A map without such evidence does not gain a synthetic
-- CLASSIC revision.
INSERT INTO gameplay_revisions (
  id, map_id, lifecycle, legacy_map_variant, copied_from_revision_id,
  reset_reason, game_version, created_at, updated_at
)
SELECT
  'revision:' || map.id || ':classic',
  map.id,
  CASE map.status WHEN 'active' THEN 'selectable' ELSE 'historical' END,
  'classic',
  'revision:' || map.id || ':initial',
  NULL,
  map.game_version,
  map.created_at,
  map.updated_at
FROM maps AS map
WHERE EXISTS (
  SELECT 1 FROM mastery_runs AS run
  WHERE run.map_id = map.id AND run.map_variant = 'classic'
) OR EXISTS (
  SELECT 1
  FROM map_title_rule_exceptions AS exception
  INNER JOIN map_title_rules AS rule ON rule.id = exception.rule_id
  WHERE exception.map_id = map.id AND rule.map_variant = 'classic'
) OR EXISTS (
  SELECT 1 FROM achievement_challenges AS challenge
  WHERE challenge.map_id = map.id AND challenge.type = 'classic_completion'
) OR EXISTS (
  SELECT 1
  FROM achievement_challenge_maps AS link
  INNER JOIN title_challenges AS challenge ON challenge.id = link.challenge_id
  WHERE link.map_id = map.id AND challenge.map_variant = 'classic'
);

CREATE TABLE gameplay_revision_challenge_assignments (
  id TEXT PRIMARY KEY NOT NULL,
  gameplay_revision_id TEXT NOT NULL REFERENCES gameplay_revisions(id),
  map_id TEXT NOT NULL REFERENCES maps(id),
  challenge_family TEXT NOT NULL CHECK (challenge_family IN ('map_title_rule', 'map_challenge', 'title_challenge')),
  challenge_id TEXT NOT NULL,
  enabled INTEGER NOT NULL DEFAULT 1 CHECK (enabled IN (0, 1)),
  condition TEXT,
  evidence_rule TEXT,
  submission_mode TEXT CHECK (submission_mode IS NULL OR submission_mode IN ('manual', 'automatic')),
  slot TEXT CHECK (slot IS NULL OR slot IN ('pioneer', 'conqueror', 'dominator')),
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE UNIQUE INDEX gameplay_revision_challenge_assignments_revision_challenge_idx
  ON gameplay_revision_challenge_assignments(gameplay_revision_id, challenge_family, challenge_id);
CREATE INDEX gameplay_revision_challenge_assignments_map_revision_idx
  ON gameplay_revision_challenge_assignments(map_id, gameplay_revision_id);

-- Materialise the existing reusable-rule projection onto each initial fairness
-- boundary. Explicit exception values become revision-local assignment values.
INSERT INTO gameplay_revision_challenge_assignments (
  id, gameplay_revision_id, map_id, challenge_family, challenge_id, enabled,
  condition, evidence_rule, submission_mode, slot, created_at, updated_at
)
SELECT
  'assignment:' || revision.id || ':map_title_rule:' || rule.id,
  revision.id,
  revision.map_id,
  'map_title_rule',
  rule.id,
  COALESCE(exception.enabled, 1),
  exception.condition,
  exception.evidence_rule,
  exception.submission_mode,
  exception.slot,
  COALESCE(exception.created_at, rule.created_at),
  COALESCE(exception.updated_at, rule.updated_at)
FROM gameplay_revisions AS revision
INNER JOIN map_title_rules AS rule ON rule.map_variant IS NULL
LEFT JOIN map_title_rule_exceptions AS exception
  ON exception.rule_id = rule.id AND exception.map_id = revision.map_id
WHERE revision.id = 'revision:' || revision.map_id || ':initial'
  AND (rule.default_scope = 'all_active' OR exception.id IS NOT NULL)
  AND (lower(rule.kind) <> 'pioneer' OR exception.id IS NOT NULL);

-- CLASSIC keeps the exact same reusable rule model, but is assigned only to
-- the historical selectable revision that its prior data identifies.
INSERT INTO gameplay_revision_challenge_assignments (
  id, gameplay_revision_id, map_id, challenge_family, challenge_id, enabled,
  condition, evidence_rule, submission_mode, slot, created_at, updated_at
)
SELECT
  'assignment:' || revision.id || ':map_title_rule:' || rule.id,
  revision.id,
  revision.map_id,
  'map_title_rule',
  rule.id,
  COALESCE(exception.enabled, 1),
  exception.condition,
  exception.evidence_rule,
  exception.submission_mode,
  exception.slot,
  COALESCE(exception.created_at, rule.created_at),
  COALESCE(exception.updated_at, rule.updated_at)
FROM gameplay_revisions AS revision
INNER JOIN map_title_rules AS rule ON rule.map_variant = revision.legacy_map_variant
LEFT JOIN map_title_rule_exceptions AS exception
  ON exception.rule_id = rule.id AND exception.map_id = revision.map_id
WHERE revision.legacy_map_variant = 'classic'
  AND (rule.default_scope = 'all_active' OR exception.id IS NOT NULL);

-- Existing direct map challenges retain their original definition but become
-- explicit revision assignments. CLASSIC-compatible rows map to CLASSIC;
-- everything else maps to the initial/default revision.
INSERT INTO gameplay_revision_challenge_assignments (
  id, gameplay_revision_id, map_id, challenge_family, challenge_id, enabled,
  condition, evidence_rule, submission_mode, slot, created_at, updated_at
)
SELECT
  'assignment:' || revision.id || ':map_challenge:' || challenge.id,
  revision.id,
  challenge.map_id,
  'map_challenge',
  challenge.id,
  1,
  NULL,
  NULL,
  NULL,
  NULL,
  challenge.created_at,
  challenge.updated_at
FROM achievement_challenges AS challenge
INNER JOIN gameplay_revisions AS revision ON revision.map_id = challenge.map_id
WHERE (challenge.type = 'classic_completion' AND revision.legacy_map_variant = 'classic')
   OR (challenge.type <> 'classic_completion' AND revision.id = 'revision:' || challenge.map_id || ':initial');

-- Map-scoped title challenges are also assignments of the same existing title
-- challenge definition. Empty legacy allowlists retain their previous
-- all-map interpretation at the initial/current revision only.
INSERT INTO gameplay_revision_challenge_assignments (
  id, gameplay_revision_id, map_id, challenge_family, challenge_id, enabled,
  condition, evidence_rule, submission_mode, slot, created_at, updated_at
)
SELECT
  'assignment:' || revision.id || ':title_challenge:' || challenge.id,
  revision.id,
  link.map_id,
  'title_challenge',
  challenge.id,
  1,
  NULL,
  NULL,
  NULL,
  NULL,
  challenge.created_at,
  challenge.updated_at
FROM title_challenges AS challenge
INNER JOIN achievement_challenge_maps AS link ON link.challenge_id = challenge.id
INNER JOIN gameplay_revisions AS revision ON revision.map_id = link.map_id
WHERE challenge.scope = 'map'
  AND ((challenge.map_variant = 'classic' AND revision.legacy_map_variant = 'classic')
    OR (challenge.map_variant IS NULL AND revision.id = 'revision:' || link.map_id || ':initial'));

INSERT INTO gameplay_revision_challenge_assignments (
  id, gameplay_revision_id, map_id, challenge_family, challenge_id, enabled,
  condition, evidence_rule, submission_mode, slot, created_at, updated_at
)
SELECT
  'assignment:' || revision.id || ':title_challenge:' || challenge.id,
  revision.id,
  map.id,
  'title_challenge',
  challenge.id,
  1,
  NULL,
  NULL,
  NULL,
  NULL,
  challenge.created_at,
  challenge.updated_at
FROM title_challenges AS challenge
CROSS JOIN maps AS map
INNER JOIN gameplay_revisions AS revision ON revision.map_id = map.id
WHERE challenge.scope = 'map'
  AND NOT EXISTS (SELECT 1 FROM achievement_challenge_maps AS link WHERE link.challenge_id = challenge.id)
  AND ((challenge.map_variant = 'classic' AND revision.legacy_map_variant = 'classic')
    OR (challenge.map_variant IS NULL AND revision.id = 'revision:' || map.id || ':initial'));

ALTER TABLE submissions ADD COLUMN gameplay_revision_id TEXT REFERENCES gameplay_revisions(id);

UPDATE submissions
SET gameplay_revision_id = CASE
  WHEN json_valid(rule_snapshot_json)
    AND json_extract(rule_snapshot_json, '$.mapVariant') = 'classic'
    AND EXISTS (
      SELECT 1 FROM gameplay_revisions AS revision
      WHERE revision.id = 'revision:' || submissions.target_map_id || ':classic'
    ) THEN 'revision:' || target_map_id || ':classic'
  ELSE 'revision:' || target_map_id || ':initial'
END
WHERE target_map_id IS NOT NULL;

ALTER TABLE mastery_runs ADD COLUMN gameplay_revision_id TEXT REFERENCES gameplay_revisions(id);

UPDATE mastery_runs
SET gameplay_revision_id = CASE
  WHEN map_variant = 'classic'
    AND EXISTS (
      SELECT 1 FROM gameplay_revisions AS revision
      WHERE revision.id = 'revision:' || mastery_runs.map_id || ':classic'
    ) THEN 'revision:' || map_id || ':classic'
  ELSE 'revision:' || map_id || ':initial'
END;

CREATE INDEX mastery_runs_active_player_map_revision_accepted_idx
  ON mastery_runs(player_account_id, map_id, gameplay_revision_id, accepted_at DESC)
  WHERE status = 'active';

ALTER TABLE player_title_grants ADD COLUMN gameplay_revision_id TEXT REFERENCES gameplay_revisions(id);

UPDATE player_title_grants
SET gameplay_revision_id = COALESCE(
  (
    SELECT submission.gameplay_revision_id
    FROM submissions AS submission
    WHERE submission.id = player_title_grants.source_id
      AND submission.gameplay_revision_id IS NOT NULL
  ),
  CASE
    WHEN title_key = 'CLASSIC'
      AND EXISTS (
        SELECT 1 FROM gameplay_revisions AS revision
        WHERE revision.id = 'revision:' || player_title_grants.map_id || ':classic'
      ) THEN 'revision:' || map_id || ':classic'
    ELSE 'revision:' || map_id || ':initial'
  END
)
WHERE map_id IS NOT NULL;

CREATE INDEX player_title_grants_active_player_title_revision_idx
  ON player_title_grants(player_account_id, title_key, map_id, gameplay_revision_id)
  WHERE status = 'active';

ALTER TABLE historical_title_grants ADD COLUMN gameplay_revision_id TEXT REFERENCES gameplay_revisions(id);

UPDATE historical_title_grants
SET gameplay_revision_id = CASE
  WHEN title_key = 'CLASSIC'
    AND EXISTS (
      SELECT 1 FROM gameplay_revisions AS revision
      WHERE revision.id = 'revision:' || historical_title_grants.map_id || ':classic'
    ) THEN 'revision:' || map_id || ':classic'
  ELSE 'revision:' || map_id || ':initial'
END
WHERE map_id IS NOT NULL;

CREATE INDEX historical_title_grants_map_revision_idx
  ON historical_title_grants(map_id, gameplay_revision_id);
