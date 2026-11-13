-- 0114_featured_timed_challenges: an administrator chooses which timed
-- acquisition paths the public active-challenges list shows. The flag only
-- controls that listing; it never gates Completions.
ALTER TABLE title_challenges ADD COLUMN featured INTEGER NOT NULL DEFAULT 0;
ALTER TABLE map_title_rule_exceptions ADD COLUMN featured INTEGER NOT NULL DEFAULT 0;
