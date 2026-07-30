-- 0050_migrate_classic_map_title: add the platform representation of Bastion's
-- CLASSIC map title. The definition and the three allowed map variants are
-- sourced from Bastion's sync-platform-data contract.

INSERT INTO title_catalog (
  key, label, icon, category, condition, availability, scope, display_kind, color_json, game_version
)
SELECT
  'CLASSIC',
  '賽檤の盡頭灬只剩莪',
  'trophy',
  '经典版地图系列',
  '通关对应地图经典版。',
  'active',
  'map',
  'fixed',
  '{"kind":"heroColor","index":43}',
  MAX(game_version)
FROM maps
WHERE id IN ('map.circuit_royal', 'map.paris', 'map.hanamura')
HAVING COUNT(*) = 3
ON CONFLICT(key) DO NOTHING;

INSERT OR IGNORE INTO title_challenges (
  id, title_key, category_override, condition, evidence_rule, submission_mode,
  game_version, status, introduced_version, retired_version, starts_at, ends_at,
  scope, created_at, updated_at
)
SELECT
  'title.CLASSIC',
  title.key,
  NULL,
  title.condition,
  '上传包含结算画面、地图、难度与玩家信息的完整截图。',
  'manual',
  title.game_version,
  'active',
  title.game_version,
  NULL,
  NULL,
  NULL,
  'map',
  CAST(strftime('%s', 'now') AS INTEGER) * 1000,
  CAST(strftime('%s', 'now') AS INTEGER) * 1000
FROM title_catalog AS title
WHERE title.key = 'CLASSIC' AND title.scope = 'map';

INSERT OR IGNORE INTO achievement_challenge_maps (challenge_id, map_id)
SELECT 'title.CLASSIC', map.id
FROM maps AS map
WHERE map.id IN ('map.circuit_royal', 'map.paris', 'map.hanamura')
  AND EXISTS (SELECT 1 FROM title_challenges WHERE id = 'title.CLASSIC');
