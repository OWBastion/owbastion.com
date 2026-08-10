CREATE TABLE submission_outcomes (
  id TEXT PRIMARY KEY NOT NULL,
  submission_id TEXT NOT NULL REFERENCES submissions(id),
  outcome_key TEXT NOT NULL,
  outcome_type TEXT NOT NULL CHECK (outcome_type IN ('mastery_run', 'title_grant', 'challenge')),
  status TEXT NOT NULL CHECK (status IN ('created', 'reused', 'ineligible', 'conflict', 'invalidated')),
  entity_id TEXT,
  awarded_xp INTEGER NOT NULL DEFAULT 0 CHECK (awarded_xp >= 0),
  details_json TEXT NOT NULL DEFAULT '{}',
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE UNIQUE INDEX submission_outcomes_submission_key_idx
  ON submission_outcomes(submission_id, outcome_key);

CREATE INDEX submission_outcomes_submission_idx
  ON submission_outcomes(submission_id, created_at DESC);

CREATE INDEX submission_outcomes_type_status_idx
  ON submission_outcomes(outcome_type, status);
