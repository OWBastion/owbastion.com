-- An event pool (random_events.game_version) may belong to a standalone mode such as 2026镜中回响.
-- Such pools stay out of the regular build's event-weight total. The mode's build may also return
-- or disable regular events, so its run-code event-weight total is recorded explicitly.
ALTER TABLE random_event_versions ADD COLUMN mode TEXT;
ALTER TABLE random_event_versions ADD COLUMN mode_weight_total REAL;
