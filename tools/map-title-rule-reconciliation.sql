-- Run read-only before and after 0049. Every row is aggregate-only: player
-- names and identifiers are deliberately excluded from operational output.

SELECT 'standard_rewards' AS report, title_key, COUNT(*) AS count
FROM map_title_rewards
WHERE title_key IN ('PIONEER', 'CONQUEROR', 'DOMINATOR')
GROUP BY title_key
ORDER BY title_key;

SELECT 'standard_rules' AS report, title_key, kind, default_scope, status, COUNT(*) AS count
FROM map_title_rules
WHERE kind IN ('pioneer', 'conqueror', 'dominator')
GROUP BY title_key, kind, default_scope, status
ORDER BY kind;

SELECT 'standard_exceptions' AS report, rule.kind, exception.enabled, COUNT(*) AS count
FROM map_title_rule_exceptions AS exception
INNER JOIN map_title_rules AS rule ON rule.id = exception.rule_id
WHERE rule.kind IN ('pioneer', 'conqueror', 'dominator')
GROUP BY rule.kind, exception.enabled
ORDER BY rule.kind, exception.enabled;

SELECT 'legacy_compat' AS report, rule.kind, compat.is_standard_instance, COUNT(*) AS count
FROM map_title_rule_compat AS compat
INNER JOIN map_title_rules AS rule ON rule.id = compat.rule_id
WHERE rule.kind IN ('pioneer', 'conqueror', 'dominator')
GROUP BY rule.kind, compat.is_standard_instance
ORDER BY rule.kind, compat.is_standard_instance;

SELECT 'historical_holders' AS report, title_key, slot, COUNT(*) AS count
FROM historical_title_grants
WHERE scope = 'map' AND title_key IN ('PIONEER', 'CONQUEROR', 'DOMINATOR', 'CLASSIC')
GROUP BY title_key, slot
ORDER BY title_key, slot;

SELECT 'active_player_grants' AS report, grant.title_key, grant.slot, COUNT(*) AS count
FROM player_title_grants AS grant
WHERE grant.status = 'active' AND grant.title_key IN ('PIONEER', 'CONQUEROR', 'DOMINATOR', 'CLASSIC')
GROUP BY grant.title_key, grant.slot
ORDER BY grant.title_key, grant.slot;

SELECT
  'classic_map_scope' AS report,
  map.id AS map_id,
  COUNT(challenge_map.challenge_id) AS scoped_challenge_count
FROM maps AS map
LEFT JOIN achievement_challenge_maps AS challenge_map ON challenge_map.map_id = map.id
LEFT JOIN title_challenges AS challenge ON challenge.id = challenge_map.challenge_id
LEFT JOIN title_catalog AS title ON title.key = challenge.title_key
  AND title.scope = 'map'
WHERE map.id IN ('map.circuit_royal', 'map.paris', 'map.hanamura')
GROUP BY map.id
ORDER BY map.id;
