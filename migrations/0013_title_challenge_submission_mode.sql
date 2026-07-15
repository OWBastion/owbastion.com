ALTER TABLE title_challenges ADD COLUMN submission_mode TEXT NOT NULL DEFAULT 'manual' CHECK (submission_mode IN ('manual', 'automatic'));

UPDATE title_challenges
SET submission_mode = 'automatic'
WHERE title_key IN ('SKY', 'ALL_IN_ONE', 'TRAVELER');
