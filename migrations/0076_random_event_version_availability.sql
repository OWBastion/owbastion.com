-- 0076_random_event_version_availability: keep operational availability
-- separate from random-event lifecycle and balancing metadata.
CREATE TABLE random_event_versions (
  game_version TEXT PRIMARY KEY NOT NULL,
  availability TEXT NOT NULL DEFAULT 'available'
    CHECK (availability IN ('available', 'suspended')),
  suspended_at INTEGER,
  suspended_by TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
