-- 0072_add_map_title_exception_schedule: give time-limited map title
-- exceptions an explicit submission window.

ALTER TABLE map_title_rule_exceptions ADD COLUMN starts_at INTEGER;
ALTER TABLE map_title_rule_exceptions ADD COLUMN ends_at INTEGER;
