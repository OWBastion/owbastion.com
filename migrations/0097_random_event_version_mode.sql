-- An event pool (random_events.game_version) may belong to a standalone mode such as 2026镜中回响;
-- that mode's build adds the pool on top of the regular pools.
ALTER TABLE random_event_versions ADD COLUMN mode TEXT;
