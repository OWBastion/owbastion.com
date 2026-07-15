UPDATE achievement_challenges
SET status = 'inactive', retired_version = '2026.07.15', updated_at = 1752537600000
WHERE type = 'difficulty_completion' AND id LIKE 'map.%.hell';

INSERT INTO achievement_challenges (id, map_id, type, name, difficulty, game_version, status, introduced_version, created_at, updated_at)
SELECT maps.id || '.conqueror', maps.id, 'difficulty_completion', '征服者', '传奇', maps.game_version, 'active', maps.game_version, 1752537600000, 1752537600000
FROM maps
INNER JOIN map_title_rewards ON map_title_rewards.map_id = maps.id
WHERE maps.status = 'active' AND map_title_rewards.slot = 'conqueror';

INSERT INTO achievement_challenges (id, map_id, type, name, difficulty, game_version, status, introduced_version, created_at, updated_at)
SELECT maps.id || '.dominator', maps.id, 'difficulty_completion', '主宰', '地狱', maps.game_version, 'active', maps.game_version, 1752537600000, 1752537600000
FROM maps
INNER JOIN map_title_rewards ON map_title_rewards.map_id = maps.id
WHERE maps.status = 'active' AND map_title_rewards.slot = 'dominator';

INSERT INTO title_challenges (id, title_key, condition, evidence_rule, game_version, status, introduced_version, created_at, updated_at)
SELECT 'title.' || key, key, condition, '上传包含结算画面、称号条件与玩家信息的完整截图。', game_version, 'active', game_version, 1752537600000, 1752537600000
FROM title_catalog
WHERE scope = 'global'
  AND availability = 'active'
  AND category <> '开发保留'
  AND condition NOT LIKE '文档未提供%';
