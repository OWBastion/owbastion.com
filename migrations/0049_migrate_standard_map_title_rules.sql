-- 0049_migrate_standard_map_title_rules: materialise the existing standard
-- map-title catalogue into the rule model without changing legacy challenges,
-- rewards, holders, grants, or submissions.
--
-- The standard rule definition is sourced from the existing map-scoped title
-- catalogue.  Missing reward relationships are not treated as an all-map
-- default: they become explicit disabled exceptions for audit and recovery.

INSERT INTO map_title_rules (
  id, title_key, kind, condition, evidence_rule, submission_mode, display_kind,
  slot, default_scope, status, introduced_version, retired_version, created_at, updated_at
)
SELECT
  'rule.' || lower(title.key),
  title.key,
  lower(title.key),
  title.condition,
  '上传包含结算画面、地图、难度与玩家信息的完整截图。',
  'manual',
  title.display_kind,
  lower(title.key),
  'all_active',
  'active',
  title.game_version,
  NULL,
  CAST(strftime('%s', 'now') AS INTEGER) * 1000,
  CAST(strftime('%s', 'now') AS INTEGER) * 1000
FROM title_catalog AS title
WHERE title.key IN ('PIONEER', 'CONQUEROR', 'DOMINATOR')
  AND title.scope = 'map'
  AND title.availability = 'active'
  AND EXISTS (
    SELECT 1 FROM map_title_rewards AS reward
    WHERE reward.title_key = title.key
  )
ON CONFLICT(kind) DO NOTHING;

-- Keep only established legacy IDs. A projection without a legacy row uses its
-- deterministic public ID at read time but does not receive a fabricated compat
-- record.
INSERT OR IGNORE INTO map_title_rule_compat (
  legacy_challenge_id, rule_id, map_id, is_standard_instance, created_at
)
SELECT
  challenge.id,
  rule.id,
  challenge.map_id,
  1,
  CAST(strftime('%s', 'now') AS INTEGER) * 1000
FROM achievement_challenges AS challenge
INNER JOIN map_title_rules AS rule
  ON challenge.id = challenge.map_id || '.' || rule.kind
WHERE rule.kind IN ('pioneer', 'conqueror', 'dominator');

-- Existing maps that do not carry a standard reward are explicit exceptions.
-- This preserves the old catalogue exactly while allowing newly added maps to
-- inherit the standard rules by default.
INSERT OR IGNORE INTO map_title_rule_exceptions (
  id, rule_id, map_id, enabled, condition, evidence_rule, submission_mode, slot,
  created_at, updated_at
)
SELECT
  lower(hex(randomblob(4))) || '-' || lower(hex(randomblob(2))) || '-' ||
    lower(hex(randomblob(2))) || '-' || lower(hex(randomblob(2))) || '-' ||
    lower(hex(randomblob(6))),
  rule.id,
  map.id,
  0,
  NULL,
  NULL,
  NULL,
  NULL,
  CAST(strftime('%s', 'now') AS INTEGER) * 1000,
  CAST(strftime('%s', 'now') AS INTEGER) * 1000
FROM maps AS map
CROSS JOIN map_title_rules AS rule
LEFT JOIN map_title_rewards AS reward
  ON reward.map_id = map.id AND reward.title_key = rule.title_key
WHERE map.status = 'active'
  AND rule.kind IN ('pioneer', 'conqueror', 'dominator')
  AND reward.map_id IS NULL;
