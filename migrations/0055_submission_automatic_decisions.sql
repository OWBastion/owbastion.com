CREATE TABLE submission_spot_checks (
  id TEXT PRIMARY KEY NOT NULL,
  submission_id TEXT NOT NULL REFERENCES submissions(id),
  status TEXT NOT NULL CHECK (status IN ('pending', 'confirmed', 'revoked')),
  policy_json TEXT NOT NULL,
  sampled_at INTEGER NOT NULL,
  resolved_at INTEGER,
  reviewer TEXT,
  reason TEXT
);

CREATE UNIQUE INDEX submission_spot_checks_submission_id_idx ON submission_spot_checks(submission_id);
CREATE INDEX submission_spot_checks_status_idx ON submission_spot_checks(status, sampled_at);
