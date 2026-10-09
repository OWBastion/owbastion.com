-- A standalone mode such as 2026镜中回响 is a limited-time build beside the regular 随机事件 mode.
-- Its maps are its own selectable Gameplay Revisions (gameplay_revisions.mode); its event pools stay
-- out of the regular build's event-weight total; and because its build also returns or disables
-- regular events, its run-code event-weight total is recorded on the mode itself.
CREATE TABLE standalone_modes (
  mode TEXT PRIMARY KEY NOT NULL,
  event_weight_total REAL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

ALTER TABLE random_event_versions ADD COLUMN mode TEXT REFERENCES standalone_modes(mode);
