-- The API and domain already accept map_variant as an OCR feedback field.
-- Widen the persisted proposal and reviewed-annotation constraints while
-- preserving existing proposals, annotations, and snapshot membership.

PRAGMA defer_foreign_keys = ON;

CREATE TABLE ocr_feedback_proposals_next (
  id TEXT PRIMARY KEY NOT NULL,
  submission_id TEXT NOT NULL,
  ocr_result_id TEXT NOT NULL,
  field_key TEXT NOT NULL CHECK (field_key IN ('map_name', 'difficulty', 'viewer_player', 'challenge_completed', 'map_variant', 'achievement_titles')),
  original_value TEXT,
  feedback_type TEXT NOT NULL CHECK (feedback_type IN ('confirmed', 'corrected', 'passive_report')),
  prompt_origin TEXT CHECK (prompt_origin IN ('uncertainty', 'conflict', 'grouped', 'calibration', 'passive')),
  proposed_value TEXT,
  model_version TEXT,
  layout_version TEXT,
  player_account_id TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'submitted' CHECK (status IN ('submitted', 'withdrawn')),
  review_state TEXT NOT NULL DEFAULT 'pending' CHECK (review_state IN ('pending', 'accepted', 'rejected')),
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE TABLE reviewed_annotations_next (
  id TEXT PRIMARY KEY NOT NULL,
  submission_id TEXT NOT NULL,
  ocr_result_id TEXT NOT NULL,
  proposal_id TEXT REFERENCES ocr_feedback_proposals(id),
  field_key TEXT NOT NULL CHECK (field_key IN ('map_name', 'difficulty', 'viewer_player', 'challenge_completed', 'map_variant', 'achievement_titles')),
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

CREATE TABLE dataset_snapshot_annotations_next (
  snapshot_id TEXT NOT NULL REFERENCES dataset_snapshots(id),
  annotation_id TEXT NOT NULL REFERENCES reviewed_annotations(id),
  position INTEGER NOT NULL,
  evidence_object_key TEXT,
  evidence_content_type TEXT,
  evidence_available INTEGER NOT NULL DEFAULT 0 CHECK (evidence_available IN (0, 1)),
  PRIMARY KEY (snapshot_id, annotation_id)
);

INSERT INTO ocr_feedback_proposals_next (
  id, submission_id, ocr_result_id, field_key, original_value, feedback_type,
  prompt_origin, proposed_value, model_version, layout_version, player_account_id,
  status, review_state, created_at, updated_at
)
SELECT
  id, submission_id, ocr_result_id, field_key, original_value, feedback_type,
  prompt_origin, proposed_value, model_version, layout_version, player_account_id,
  status, review_state, created_at, updated_at
FROM ocr_feedback_proposals;

INSERT INTO reviewed_annotations_next (
  id, submission_id, ocr_result_id, proposal_id, field_key, original_ocr_value,
  model_version, layout_version, reviewed_value, normalized_value, player_account_id,
  player_proposed_value, prompt_origin, review_state, reviewed_by, reviewed_at,
  note, supersedes_annotation_id, created_at
)
SELECT
  id, submission_id, ocr_result_id, proposal_id, field_key, original_ocr_value,
  model_version, layout_version, reviewed_value, normalized_value, player_account_id,
  player_proposed_value, prompt_origin, review_state, reviewed_by, reviewed_at,
  note, supersedes_annotation_id, created_at
FROM reviewed_annotations
ORDER BY created_at, id;

INSERT INTO dataset_snapshot_annotations_next (
  snapshot_id, annotation_id, position, evidence_object_key, evidence_content_type,
  evidence_available
)
SELECT
  snapshot_id, annotation_id, position, evidence_object_key, evidence_content_type,
  evidence_available
FROM dataset_snapshot_annotations;

DROP TABLE dataset_snapshot_annotations;
DROP TABLE reviewed_annotations;
DROP TABLE ocr_feedback_proposals;

ALTER TABLE ocr_feedback_proposals_next RENAME TO ocr_feedback_proposals;
ALTER TABLE reviewed_annotations_next RENAME TO reviewed_annotations;
ALTER TABLE dataset_snapshot_annotations_next RENAME TO dataset_snapshot_annotations;

CREATE UNIQUE INDEX ocr_feedback_proposals_replay_idx
  ON ocr_feedback_proposals(submission_id, ocr_result_id, field_key, player_account_id);

CREATE INDEX ocr_feedback_proposals_queue_idx
  ON ocr_feedback_proposals(status, created_at);

CREATE UNIQUE INDEX reviewed_annotations_proposal_idx
  ON reviewed_annotations(proposal_id)
  WHERE proposal_id IS NOT NULL;

CREATE UNIQUE INDEX reviewed_annotations_active_field_idx
  ON reviewed_annotations(submission_id, ocr_result_id, field_key)
  WHERE review_state = 'accepted';

CREATE INDEX reviewed_annotations_queue_idx
  ON reviewed_annotations(review_state, reviewed_at);

CREATE INDEX reviewed_annotations_field_idx
  ON reviewed_annotations(field_key, model_version, layout_version);

CREATE INDEX dataset_snapshot_annotations_annotation_idx
  ON dataset_snapshot_annotations(annotation_id);
