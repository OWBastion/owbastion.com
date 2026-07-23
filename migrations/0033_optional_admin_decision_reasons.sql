PRAGMA foreign_keys=OFF;

CREATE TABLE submission_reviews_next (
  id TEXT PRIMARY KEY NOT NULL,
  submission_id TEXT NOT NULL REFERENCES submissions(id),
  decision TEXT NOT NULL,
  reason TEXT,
  reviewer TEXT NOT NULL,
  created_at INTEGER NOT NULL
);

INSERT INTO submission_reviews_next (id, submission_id, decision, reason, reviewer, created_at)
SELECT id, submission_id, decision, reason, reviewer, created_at FROM submission_reviews;

DROP TABLE submission_reviews;
ALTER TABLE submission_reviews_next RENAME TO submission_reviews;

PRAGMA foreign_keys=ON;
