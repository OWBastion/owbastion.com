-- 0054_materialise_variant_map_title_rules: move scoped variant challenges into
-- the reusable map-title rule projection while retaining their public IDs.

ALTER TABLE map_title_rules ADD COLUMN map_variant TEXT;

INSERT INTO map_title_rules (
  id, title_key, kind, condition, evidence_rule, submission_mode, display_kind,
  slot, map_variant, default_scope, status, introduced_version, retired_version,
  created_at, updated_at
)
SELECT
  'rule.' || lower(title.key),
  title.key,
  lower(title.key),
  challenge.condition,
  challenge.evidence_rule,
  challenge.submission_mode,
  title.display_kind,
  NULL,
  challenge.map_variant,
  'explicit',
  CASE challenge.status
    WHEN 'retired' THEN 'inactive'
    WHEN 'sunsetting' THEN 'sunsetting'
    ELSE 'active'
  END,
  challenge.introduced_version,
  challenge.retired_version,
  challenge.created_at,
  challenge.updated_at
FROM title_challenges AS challenge
INNER JOIN title_catalog AS title ON title.key = challenge.title_key
WHERE challenge.scope = 'map'
  AND challenge.map_variant IS NOT NULL
ON CONFLICT(title_key) DO NOTHING;

INSERT OR IGNORE INTO map_title_rule_exceptions (
  id, rule_id, map_id, enabled, condition, evidence_rule, submission_mode, slot,
  created_at, updated_at
)
SELECT
  lower(hex(randomblob(4))) || '-' || lower(hex(randomblob(2))) || '-' ||
    lower(hex(randomblob(2))) || '-' || lower(hex(randomblob(2))) || '-' ||
    lower(hex(randomblob(6))),
  rule.id,
  link.map_id,
  1,
  NULL,
  NULL,
  NULL,
  NULL,
  challenge.created_at,
  challenge.updated_at
FROM title_challenges AS challenge
INNER JOIN map_title_rules AS rule ON rule.title_key = challenge.title_key
INNER JOIN achievement_challenge_maps AS link ON link.challenge_id = challenge.id
WHERE challenge.scope = 'map'
  AND challenge.map_variant IS NOT NULL;

CREATE TABLE map_title_rule_compat_next (
  legacy_challenge_id  TEXT    NOT NULL,
  rule_id              TEXT    NOT NULL REFERENCES map_title_rules(id),
  map_id               TEXT    NOT NULL REFERENCES maps(id),
  is_standard_instance INTEGER NOT NULL DEFAULT 1
                                 CHECK (is_standard_instance IN (0, 1)),
  created_at            INTEGER NOT NULL,
  PRIMARY KEY (legacy_challenge_id, map_id)
);

INSERT INTO map_title_rule_compat_next
  (legacy_challenge_id, rule_id, map_id, is_standard_instance, created_at)
SELECT legacy_challenge_id, rule_id, map_id, is_standard_instance, created_at
FROM map_title_rule_compat;

INSERT OR IGNORE INTO map_title_rule_compat_next
  (legacy_challenge_id, rule_id, map_id, is_standard_instance, created_at)
SELECT
  challenge.id,
  rule.id,
  link.map_id,
  1,
  challenge.created_at
FROM title_challenges AS challenge
INNER JOIN map_title_rules AS rule ON rule.title_key = challenge.title_key
INNER JOIN achievement_challenge_maps AS link ON link.challenge_id = challenge.id
WHERE challenge.scope = 'map'
  AND challenge.map_variant IS NOT NULL;

DROP TABLE map_title_rule_compat;
ALTER TABLE map_title_rule_compat_next RENAME TO map_title_rule_compat;
CREATE UNIQUE INDEX map_title_rule_compat_rule_map_idx
  ON map_title_rule_compat (rule_id, map_id);
