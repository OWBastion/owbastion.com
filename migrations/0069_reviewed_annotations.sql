-- 0069_reviewed_annotations: maintainer annotation review and provenance.
-- A reviewed annotation is the ML-data-quality truth a maintainer produces
-- from a player feedback proposal or a maintainer-found OCR error. It never
-- overwrites the original OCR result or the player's proposal; every column
-- except the lifecycle state is written once at creation. Supersession
-- inserts a new row and marks the previous one superseded; it never mutates
-- an annotation already referenced by a finalized dataset snapshot.
--
-- Player proposals gain a maintainer review state (pending/accepted/rejected)
-- without disturbing the player-facing lifecycle (submitted/withdrawn).

ALTER TABLE ocr_feedback_proposals ADD COLUMN review_state TEXT NOT NULL DEFAULT 'pending' CHECK (review_state IN ('pending', 'accepted', 'rejected'));

CREATE TABLE reviewed_annotations (
  id TEXT PRIMARY KEY NOT NULL,
  submission_id TEXT NOT NULL,
  ocr_result_id TEXT NOT NULL,
  proposal_id TEXT REFERENCES ocr_feedback_proposals(id),
  field_key TEXT NOT NULL CHECK (field_key IN ('map_name', 'difficulty', 'viewer_player', 'challenge_completed', 'achievement_titles')),
  original_ocr_value TEXT,
  model_version TEXT,
  layout_version TEXT,
  reviewed_value TEXT NOT NULL CHECK (length(trim(reviewed_value)) > 0),
  normalized_value TEXT,
  player_account_id TEXT,
  player_proposed_value TEXT,
  prompt_origin TEXT CHECK (prompt_origin IN ('uncertainty', 'conflict', 'grouped', 'calibration', 'passive')),
  review_state TEXT NOT NULL DEFAULT 'accepted' CHECK (review_state IN ('accepted', 'superseded')),
  reviewed_by TEXT NOT NULL,
  reviewed_at INTEGER NOT NULL,
  note TEXT,
  supersedes_annotation_id TEXT REFERENCES reviewed_annotations(id),
  created_at INTEGER NOT NULL
);

CREATE UNIQUE INDEX reviewed_annotations_proposal_idx
  ON reviewed_annotations(proposal_id)
  WHERE proposal_id IS NOT NULL;

-- One active reviewed annotation per recognized field; supersession moves the
-- previous row out of this state instead of mutating its content.
CREATE UNIQUE INDEX reviewed_annotations_active_field_idx
  ON reviewed_annotations(submission_id, ocr_result_id, field_key)
  WHERE review_state = 'accepted';

CREATE INDEX reviewed_annotations_queue_idx
  ON reviewed_annotations(review_state, reviewed_at);

CREATE INDEX reviewed_annotations_field_idx
  ON reviewed_annotations(field_key, model_version, layout_version);
