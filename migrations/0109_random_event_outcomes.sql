CREATE TABLE random_event_outcomes (
  event_id TEXT NOT NULL REFERENCES random_events(id) ON DELETE CASCADE,
  position INTEGER NOT NULL,
  name TEXT NOT NULL,
  polarity TEXT NOT NULL CHECK (polarity IN ('buff', 'debuff')),
  description TEXT NOT NULL,
  effect_tags_json TEXT NOT NULL DEFAULT '[]',
  PRIMARY KEY (event_id, position)
);
