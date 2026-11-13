-- 0115_drop_featured_timed_challenges: the public active-challenges list now follows
-- each path's administrator-set time window, so the 0114 flag has no reader.
ALTER TABLE title_challenges DROP COLUMN featured;
ALTER TABLE map_title_rule_exceptions DROP COLUMN featured;
