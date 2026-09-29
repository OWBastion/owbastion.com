-- Screenshot-level OCR accuracy marks replace field-level annotation proposals
-- (#253). One effective row per (submission, ocr_result); players and
-- maintainers share the mark and the latest writer wins. marked_by always
-- stores the actor's platform player ID (player_accounts.player_id), matching
-- the auth subject domain. The mark is a
-- sampling hint for OCRKit screenshot-set selection, never a training label.
-- The historical ocr_feedback_proposals / reviewed_annotations /
-- dataset_snapshot tables stay in place; nothing writes to them anymore.

CREATE TABLE ocr_accuracy_feedback (
  id TEXT PRIMARY KEY NOT NULL,
  submission_id TEXT NOT NULL,
  ocr_result_id TEXT NOT NULL,
  accuracy TEXT NOT NULL CHECK (accuracy IN ('accurate', 'inaccurate')),
  marked_by TEXT NOT NULL,
  marked_by_type TEXT NOT NULL CHECK (marked_by_type IN ('player', 'maintainer')),
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE UNIQUE INDEX ocr_accuracy_feedback_result_idx
  ON ocr_accuracy_feedback (submission_id, ocr_result_id);
