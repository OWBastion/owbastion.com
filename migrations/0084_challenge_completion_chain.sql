ALTER TABLE title_catalog ADD COLUMN lifecycle TEXT NOT NULL DEFAULT 'active' CHECK (lifecycle IN ('draft', 'active', 'retired'));
ALTER TABLE title_catalog ADD COLUMN public_visibility INTEGER NOT NULL DEFAULT 1 CHECK (public_visibility IN (0, 1));
UPDATE title_catalog SET lifecycle = availability;
DROP INDEX title_catalog_scope_idx;
ALTER TABLE title_catalog DROP COLUMN availability;
CREATE INDEX title_catalog_scope_idx ON title_catalog(scope, lifecycle);

CREATE TABLE challenges (
  id TEXT PRIMARY KEY NOT NULL,
  source_family TEXT NOT NULL CHECK (source_family IN ('title_challenge', 'map_title_rule', 'map_challenge', 'manual')),
  source_id TEXT NOT NULL,
  title_key TEXT NOT NULL REFERENCES title_catalog(key),
  rule_version TEXT NOT NULL DEFAULT 'legacy',
  map_id TEXT REFERENCES maps(id),
  gameplay_revision_id TEXT REFERENCES gameplay_revisions(id),
  status TEXT NOT NULL CHECK (status IN ('draft', 'active', 'archived')),
  manual INTEGER NOT NULL DEFAULT 0 CHECK (manual IN (0, 1)),
  public_condition INTEGER NOT NULL DEFAULT 1 CHECK (public_condition IN (0, 1)),
  condition_operator TEXT NOT NULL DEFAULT 'and' CHECK (condition_operator IN ('and', 'or')),
  conditions_json TEXT NOT NULL DEFAULT '[]',
  condition TEXT NOT NULL,
  starts_at INTEGER,
  ends_at INTEGER,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  CHECK (ends_at IS NULL OR starts_at IS NULL OR ends_at > starts_at),
  CHECK (manual = 0 OR (map_id IS NULL AND gameplay_revision_id IS NULL))
);

CREATE UNIQUE INDEX challenges_source_scope_idx
  ON challenges(source_family, source_id, rule_version, COALESCE(map_id, ''), COALESCE(gameplay_revision_id, ''));
CREATE INDEX challenges_title_status_idx ON challenges(title_key, status);
CREATE UNIQUE INDEX challenges_manual_title_idx
  ON challenges(title_key) WHERE manual = 1 AND status = 'active';

CREATE TABLE challenge_completions (
  id TEXT PRIMARY KEY NOT NULL,
  player_account_id TEXT NOT NULL REFERENCES player_accounts(id),
  challenge_id TEXT NOT NULL REFERENCES challenges(id),
  gameplay_revision_id TEXT REFERENCES gameplay_revisions(id),
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'invalidated')),
  source_type TEXT NOT NULL CHECK (source_type IN ('submission', 'manual', 'challenge_satisfies', 'migration')),
  source_id TEXT NOT NULL,
  completed_at INTEGER NOT NULL,
  invalidated_by TEXT,
  invalidated_at INTEGER,
  invalidation_reason TEXT,
  created_at INTEGER NOT NULL,
  CHECK (status <> 'invalidated' OR invalidated_at IS NOT NULL)
);

CREATE UNIQUE INDEX challenge_completions_player_challenge_idx
  ON challenge_completions(player_account_id, challenge_id, COALESCE(gameplay_revision_id, ''))
  WHERE status = 'active';
CREATE UNIQUE INDEX challenge_completions_source_idx
  ON challenge_completions(source_type, source_id, challenge_id);

CREATE TABLE challenge_satisfies (
  challenge_id TEXT NOT NULL REFERENCES challenges(id),
  satisfied_challenge_id TEXT NOT NULL REFERENCES challenges(id),
  created_at INTEGER NOT NULL,
  PRIMARY KEY (challenge_id, satisfied_challenge_id),
  CHECK (challenge_id <> satisfied_challenge_id)
);

INSERT INTO challenges (
  id, source_family, source_id, title_key, status, public_condition,
  conditions_json, condition, starts_at, ends_at, created_at, updated_at
)
SELECT
  'legacy:title_challenge:' || challenge.id || '::',
  'title_challenge', challenge.id, challenge.title_key,
  CASE WHEN challenge.status IN ('scheduled', 'active', 'sunsetting') THEN 'active' ELSE 'archived' END,
  1,
  '{"operator":"and","conditions":[{"type":"achievement_title","titleKey":' || json_quote(challenge.title_key) || '}]}',
  challenge.condition, challenge.starts_at, challenge.ends_at, challenge.created_at, challenge.updated_at
FROM title_challenges AS challenge
JOIN title_catalog AS title ON title.key = challenge.title_key
WHERE challenge.scope = 'global';

INSERT OR IGNORE INTO challenges (
  id, source_family, source_id, title_key, map_id, gameplay_revision_id, status,
  public_condition, conditions_json, condition, starts_at, ends_at, created_at, updated_at
)
SELECT
  'legacy:title_challenge:' || challenge.id || ':' || assignment.map_id || ':' || assignment.gameplay_revision_id,
  'title_challenge', challenge.id, challenge.title_key, assignment.map_id, assignment.gameplay_revision_id,
  CASE WHEN challenge.status IN ('scheduled', 'active', 'sunsetting') THEN 'active' ELSE 'archived' END,
  CASE WHEN assignment.enabled = 1 THEN 1 ELSE 0 END,
  '{"operator":"and","conditions":[{"type":"achievement_title","titleKey":' || json_quote(challenge.title_key) || '},{"type":"map","mapId":' || json_quote(assignment.map_id) || '}' || CASE WHEN revision.legacy_map_variant = 'classic' THEN ',{"type":"map_variant","variant":"classic"}' ELSE '' END || ']}',
  COALESCE(assignment.condition, challenge.condition), challenge.starts_at, challenge.ends_at, challenge.created_at, challenge.updated_at
FROM title_challenges AS challenge
JOIN title_catalog AS title ON title.key = challenge.title_key
JOIN gameplay_revision_challenge_assignments AS assignment
  ON assignment.challenge_family = 'title_challenge'
  AND assignment.challenge_id = challenge.id
  AND assignment.map_id IS NOT NULL
JOIN gameplay_revisions AS revision ON revision.id = assignment.gameplay_revision_id
WHERE challenge.scope = 'map';

INSERT OR IGNORE INTO challenges (
  id, source_family, source_id, title_key, map_id, gameplay_revision_id, status,
  public_condition, conditions_json, condition, created_at, updated_at
)
SELECT
  'legacy:map_challenge:' || challenge.id || ':' || assignment.map_id || ':' || assignment.gameplay_revision_id,
  'map_challenge', challenge.id, challenge.reward_title_key, challenge.map_id, assignment.gameplay_revision_id,
  CASE WHEN challenge.status IN ('active', 'sunsetting') THEN 'active' ELSE 'archived' END,
  CASE WHEN assignment.enabled = 1 THEN 1 ELSE 0 END,
  '{"operator":"and","conditions":[{"type":"map","mapId":' || json_quote(challenge.map_id) || '},{"type":"completed"}' || CASE WHEN challenge.difficulty IS NOT NULL THEN ',{"type":"difficulty_at_least","difficulty":' || json_quote(challenge.difficulty) || '}' ELSE '' END || CASE WHEN revision.legacy_map_variant = 'classic' THEN ',{"type":"map_variant","variant":"classic"}' ELSE '' END || ']}',
  COALESCE(assignment.condition, challenge.condition), challenge.created_at, challenge.updated_at
FROM achievement_challenges AS challenge
JOIN title_catalog AS title ON title.key = challenge.reward_title_key
JOIN gameplay_revision_challenge_assignments AS assignment
  ON assignment.challenge_family = 'map_challenge'
  AND assignment.challenge_id = challenge.id
  AND assignment.map_id = challenge.map_id
JOIN gameplay_revisions AS revision ON revision.id = assignment.gameplay_revision_id
WHERE challenge.reward_title_key IS NOT NULL;

INSERT OR IGNORE INTO challenges (
  id, source_family, source_id, title_key, map_id, gameplay_revision_id, status,
  public_condition, conditions_json, condition, starts_at, ends_at, created_at, updated_at
)
SELECT
  'legacy:map_title_rule:' || COALESCE(compat.legacy_challenge_id, rule.id) || ':' || assignment.map_id || ':' || assignment.gameplay_revision_id,
  'map_title_rule', COALESCE(compat.legacy_challenge_id, rule.id), rule.title_key, assignment.map_id, assignment.gameplay_revision_id,
  CASE WHEN rule.status = 'inactive' THEN 'archived' ELSE 'active' END,
  CASE WHEN assignment.enabled = 1 AND COALESCE(exception.enabled, 1) = 1 THEN 1 ELSE 0 END,
  '{"operator":"and","conditions":[{"type":"map","mapId":' || json_quote(assignment.map_id) || '},{"type":"completed"}' || CASE rule.kind WHEN 'conqueror' THEN ',{"type":"difficulty_at_least","difficulty":"传奇"}' WHEN 'dominator' THEN ',{"type":"difficulty_at_least","difficulty":"地狱"}' WHEN 'pioneer' THEN ',{"type":"difficulty_at_least","difficulty":"地狱"}' ELSE '' END || CASE WHEN revision.legacy_map_variant = 'classic' THEN ',{"type":"map_variant","variant":"classic"}' ELSE '' END || ']}' ,
  COALESCE(exception.condition, assignment.condition, rule.condition), exception.starts_at, exception.ends_at, rule.created_at, rule.updated_at
FROM map_title_rules AS rule
JOIN title_catalog AS title ON title.key = rule.title_key
JOIN gameplay_revision_challenge_assignments AS assignment
  ON assignment.challenge_family = 'map_title_rule'
  AND assignment.challenge_id = rule.id
JOIN gameplay_revisions AS revision ON revision.id = assignment.gameplay_revision_id
LEFT JOIN map_title_rule_compat AS compat ON compat.rule_id = rule.id AND compat.map_id = assignment.map_id
LEFT JOIN map_title_rule_exceptions AS exception ON exception.rule_id = rule.id AND exception.map_id = assignment.map_id;

INSERT OR IGNORE INTO challenges (
  id, source_family, source_id, title_key, status, manual, public_condition,
  condition_operator, conditions_json, condition, created_at, updated_at
)
SELECT
  'manual:' || title.key, 'manual', title.key, title.key,
  'active',
  1, 0, 'and', '[]', 'Maintainer-issued title', CAST(strftime('%s', 'now') AS INTEGER) * 1000,
  CAST(strftime('%s', 'now') AS INTEGER) * 1000
FROM title_catalog AS title;

INSERT OR IGNORE INTO challenge_satisfies (challenge_id, satisfied_challenge_id, created_at)
SELECT higher.id, lower.id, CAST(strftime('%s', 'now') AS INTEGER) * 1000
FROM challenges AS higher
JOIN challenges AS lower
  ON lower.map_id = higher.map_id
  AND lower.gameplay_revision_id = higher.gameplay_revision_id
  AND lower.title_key = 'CONQUEROR'
WHERE higher.title_key = 'DOMINATOR'
  AND higher.map_id IS NOT NULL
  AND higher.gameplay_revision_id IS NOT NULL
  AND higher.manual = 0
  AND lower.manual = 0;

CREATE INDEX challenge_completions_player_idx ON challenge_completions(player_account_id, completed_at DESC);

ALTER TABLE player_title_grants ADD COLUMN completion_id TEXT REFERENCES challenge_completions(id);
ALTER TABLE player_title_grants ADD COLUMN revocation_type TEXT CHECK (revocation_type IS NULL OR revocation_type IN ('administrator', 'evidence'));
UPDATE player_title_grants
SET revocation_type = CASE
  WHEN EXISTS (
    SELECT 1 FROM audit_events AS audit
    WHERE audit.operation = 'submission.spot_check.revoked'
      AND audit.entity_type = 'submission'
      AND audit.entity_id = player_title_grants.source_id
  ) THEN 'evidence'
  WHEN EXISTS (
    SELECT 1 FROM mastery_runs AS run
    WHERE run.source_submission_id = player_title_grants.source_id
      AND run.status = 'invalidated'
  ) THEN 'evidence'
  WHEN revoked_by NOT LIKE 'migration:%' THEN 'administrator'
  ELSE NULL
END
WHERE status = 'revoked';

INSERT OR IGNORE INTO challenge_completions (
  id, player_account_id, challenge_id, gameplay_revision_id, status,
  source_type, source_id, completed_at, created_at
)
SELECT
  'completion:migration:' || grant.id, grant.player_account_id, challenge.id, grant.gameplay_revision_id,
  'active', 'migration', grant.id, grant.granted_at, grant.granted_at
FROM player_title_grants AS grant
JOIN challenges AS challenge ON challenge.source_family = 'manual' AND challenge.source_id = grant.title_key
WHERE grant.source_type IN ('manual', 'historical');

INSERT OR IGNORE INTO challenge_completions (
  id, player_account_id, challenge_id, gameplay_revision_id, status,
  source_type, source_id, completed_at, created_at
)
SELECT
  'completion:migration:' || grant.id, grant.player_account_id, challenge.id, grant.gameplay_revision_id,
  'active', 'migration', grant.id, grant.granted_at, grant.granted_at
FROM player_title_grants AS grant
JOIN submissions AS submission ON submission.id = grant.source_id
JOIN submission_outcomes AS outcome
  ON outcome.submission_id = submission.id
  AND outcome.outcome_type = 'challenge'
  AND outcome.status IN ('created', 'reused')
JOIN challenges AS challenge
  ON challenge.source_id = outcome.entity_id
  AND challenge.title_key = grant.title_key
  AND challenge.map_id IS json_extract(outcome.details_json, '$.mapId')
  AND challenge.gameplay_revision_id IS json_extract(outcome.details_json, '$.gameplayRevisionId')
WHERE grant.source_type IN ('submission', 'automatic')
  AND grant.status IN ('active', 'revoked');

INSERT OR IGNORE INTO challenge_completions (
  id, player_account_id, challenge_id, gameplay_revision_id, status,
  source_type, source_id, completed_at, created_at
)
SELECT
  'completion:migration:' || lower_grant.id,
  lower_grant.player_account_id,
  lower_challenge.id,
  lower_challenge.gameplay_revision_id,
  'active', 'migration', lower_grant.id, lower_grant.granted_at, lower_grant.granted_at
FROM player_title_grants AS higher_grant
JOIN submissions AS submission ON submission.id = higher_grant.source_id
JOIN submission_outcomes AS outcome
  ON outcome.submission_id = submission.id
  AND outcome.outcome_type = 'challenge'
  AND outcome.status IN ('created', 'reused')
JOIN challenges AS higher_challenge
  ON higher_challenge.source_id = outcome.entity_id
  AND higher_challenge.title_key = 'DOMINATOR'
  AND higher_challenge.map_id IS higher_grant.map_id
  AND higher_challenge.gameplay_revision_id IS higher_grant.gameplay_revision_id
JOIN challenge_satisfies AS relation ON relation.challenge_id = higher_challenge.id
JOIN challenges AS lower_challenge ON lower_challenge.id = relation.satisfied_challenge_id
JOIN player_title_grants AS lower_grant
  ON lower_grant.player_account_id = higher_grant.player_account_id
  AND lower_grant.title_key = lower_challenge.title_key
  AND lower_grant.map_id IS lower_challenge.map_id
  AND lower_grant.gameplay_revision_id IS lower_challenge.gameplay_revision_id
  AND lower_grant.source_type = higher_grant.source_type
  AND lower_grant.source_id = higher_grant.source_id
WHERE higher_grant.title_key = 'DOMINATOR'
  AND higher_grant.status IN ('active', 'revoked')
  AND lower_grant.status IN ('active', 'revoked');

UPDATE challenge_completions
SET status = 'invalidated',
    invalidated_by = COALESCE((SELECT grant.revoked_by FROM player_title_grants AS grant WHERE grant.id = challenge_completions.source_id), 'migration:0084_challenge_completion_chain'),
    invalidated_at = COALESCE((SELECT grant.revoked_at FROM player_title_grants AS grant WHERE grant.id = challenge_completions.source_id), challenge_completions.completed_at),
    invalidation_reason = (SELECT grant.revoke_reason FROM player_title_grants AS grant WHERE grant.id = challenge_completions.source_id)
WHERE source_type = 'migration'
  AND EXISTS (
    SELECT 1 FROM player_title_grants AS grant
    WHERE grant.id = challenge_completions.source_id
      AND grant.revocation_type = 'evidence'
  );

UPDATE player_title_grants
SET completion_id = (
  SELECT completion.id FROM challenge_completions AS completion
  WHERE completion.source_type = 'migration' AND completion.source_id = player_title_grants.id
  LIMIT 1
)
WHERE EXISTS (
  SELECT 1 FROM challenge_completions AS completion
  WHERE completion.source_type = 'migration' AND completion.source_id = player_title_grants.id
);

CREATE UNIQUE INDEX player_title_grants_completion_idx
  ON player_title_grants(completion_id) WHERE completion_id IS NOT NULL;

DROP INDEX player_title_grants_active_identity_idx;
CREATE UNIQUE INDEX player_title_grants_active_identity_idx
  ON player_title_grants(player_account_id, title_key, COALESCE(map_id, ''), COALESCE(gameplay_revision_id, ''))
  WHERE status = 'active';
