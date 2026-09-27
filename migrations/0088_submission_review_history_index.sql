-- 0053 rebuilt submission_reviews without the unique submission index from 0042.
-- A Submission can be decided again, and its latest review row is the current decision.
DROP INDEX IF EXISTS submission_reviews_submission_id_idx;
CREATE INDEX submission_reviews_submission_created_idx ON submission_reviews(submission_id, created_at);
