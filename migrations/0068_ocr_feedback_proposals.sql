-- 0068_ocr_feedback_proposals: store player OCR-result confirmation and
-- correction proposals. A proposal is an annotation proposal, never ground
-- truth: it does not change the Submission decision, challenge, Grant, or
-- mastery outcome. Original OCR evidence is never overwritten; this table
-- retains the immutable context of the recognition it refers to.

CREATE TABLE ocr_feedback_proposals (
  id TEXT PRIMARY KEY NOT NULL,
  submission_id TEXT NOT NULL,
  ocr_result_id TEXT NOT NULL,
  field_key TEXT NOT NULL CHECK (field_key IN ('map_name', 'difficulty', 'viewer_player', 'challenge_completed', 'achievement_titles')),
  original_value TEXT,
  feedback_type TEXT NOT NULL CHECK (feedback_type IN ('confirmed', 'corrected', 'passive_report')),
  prompt_origin TEXT CHECK (prompt_origin IN ('uncertainty', 'conflict', 'grouped', 'calibration', 'passive')),
  proposed_value TEXT,
  model_version TEXT,
  layout_version TEXT,
  player_account_id TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'submitted' CHECK (status IN ('submitted', 'withdrawn')),
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE UNIQUE INDEX ocr_feedback_proposals_replay_idx
  ON ocr_feedback_proposals(submission_id, ocr_result_id, field_key, player_account_id);

CREATE INDEX ocr_feedback_proposals_queue_idx
  ON ocr_feedback_proposals(status, created_at);
