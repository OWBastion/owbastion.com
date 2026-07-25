ALTER TABLE achievement_challenges ADD COLUMN reward_title_key TEXT REFERENCES title_catalog(key);

UPDATE achievement_challenges
SET reward_title_key = (
  SELECT reward.title_key
  FROM map_title_rewards reward
  WHERE reward.map_id = achievement_challenges.map_id
    AND reward.slot = CASE
      WHEN achievement_challenges.id LIKE '%.conqueror' THEN 'conqueror'
      WHEN achievement_challenges.id LIKE '%.dominator' THEN 'dominator'
      WHEN achievement_challenges.id LIKE '%.pioneer' THEN 'pioneer'
    END
)
WHERE reward_title_key IS NULL;
