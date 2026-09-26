CREATE TABLE submission_outcomes_verified_run (
  id TEXT PRIMARY KEY NOT NULL,
  submission_id TEXT NOT NULL REFERENCES submissions(id),
  outcome_key TEXT NOT NULL,
  outcome_type TEXT NOT NULL CHECK (outcome_type IN ('verified_run', 'title_grant', 'challenge')),
  status TEXT NOT NULL CHECK (status IN ('created', 'reused', 'ineligible', 'conflict', 'invalidated')),
  entity_id TEXT,
  awarded_xp INTEGER NOT NULL DEFAULT 0 CHECK (awarded_xp >= 0),
  details_json TEXT NOT NULL DEFAULT '{}',
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

INSERT INTO submission_outcomes_verified_run
  (id, submission_id, outcome_key, outcome_type, status, entity_id, awarded_xp, details_json, created_at, updated_at)
SELECT
  id,
  submission_id,
  CASE WHEN outcome_key = 'mastery_run' THEN 'verified_run' ELSE outcome_key END,
  CASE WHEN outcome_type = 'mastery_run' THEN 'verified_run' ELSE outcome_type END,
  status,
  entity_id,
  awarded_xp,
  REPLACE(details_json, '"run_code"', '"match_code"'),
  created_at,
  updated_at
FROM submission_outcomes;

DROP TABLE submission_outcomes;
ALTER TABLE submission_outcomes_verified_run RENAME TO submission_outcomes;

CREATE UNIQUE INDEX submission_outcomes_submission_key_idx
  ON submission_outcomes(submission_id, outcome_key);

CREATE INDEX submission_outcomes_submission_idx
  ON submission_outcomes(submission_id, created_at DESC);

CREATE INDEX submission_outcomes_type_status_idx
  ON submission_outcomes(outcome_type, status);
