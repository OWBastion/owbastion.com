-- 0052_add_title_challenge_map_variant: persist map variants for scoped title challenges.

ALTER TABLE title_challenges ADD COLUMN map_variant TEXT;

UPDATE title_challenges
SET map_variant = 'classic'
WHERE id = 'title.CLASSIC' AND map_variant IS NULL;
