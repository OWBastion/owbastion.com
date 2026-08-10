CREATE TABLE mastery_run_conflict_resolutions (
  id TEXT PRIMARY KEY NOT NULL,
  mastery_run_id TEXT NOT NULL REFERENCES mastery_runs(id),
  conflict_submission_id TEXT NOT NULL REFERENCES submissions(id),
  action TEXT NOT NULL CHECK (action IN ('keep_existing', 'invalidate_existing')),
  actor_type TEXT NOT NULL CHECK (actor_type IN ('service', 'user')),
  actor_id TEXT NOT NULL,
  reason TEXT,
  resolved_at INTEGER NOT NULL
);

CREATE UNIQUE INDEX mastery_run_conflict_resolutions_run_submission_idx
  ON mastery_run_conflict_resolutions(mastery_run_id, conflict_submission_id);

CREATE INDEX mastery_run_conflict_resolutions_run_resolved_idx
  ON mastery_run_conflict_resolutions(mastery_run_id, resolved_at DESC);
