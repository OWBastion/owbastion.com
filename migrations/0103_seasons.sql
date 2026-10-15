-- Seasons: a named ranking window over the same Verified Runs. A Season stores
-- only its schedule, lifecycle status, and public visibility; "scheduled",
-- "running", and "ended" are derived from time, and seasonal boards are
-- computed from Verified Runs at read time.
CREATE TABLE seasons (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  starts_at INTEGER NOT NULL,
  ends_at INTEGER NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('draft', 'active', 'archived')),
  public INTEGER NOT NULL DEFAULT 0 CHECK (public IN (0, 1)),
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  CHECK (ends_at > starts_at)
);
CREATE INDEX seasons_starts_at_idx ON seasons(starts_at);
