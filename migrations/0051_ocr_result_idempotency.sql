ALTER TABLE ocr_results ADD COLUMN request_id TEXT;
CREATE UNIQUE INDEX ocr_results_submission_request_idx ON ocr_results(submission_id, request_id);
