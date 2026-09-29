-- 0092_screenshot_sets: immutable, versioned screenshot sets for OCRKit
-- training supply (#255).
--
-- A screenshot set is the explicit approval that its member screenshots may be
-- used for OCR training. Membership is selected by rule (approved Submissions
-- plus screenshots whose current recognition is marked inaccurate), frozen at
-- draft creation, and immutable once finalized; a later accuracy mark or
-- approval change belongs to a later set version and never silently alters an
-- existing set. Member rows carry the full delivery payload and provenance, so
-- a finalized set stays complete even if source metadata later changes.
--
-- Historical dataset_snapshots rows keep their reviewed-annotation semantics
-- and remain audit-only; screenshot sets are a separate version sequence.

CREATE TABLE screenshot_sets (
  id TEXT PRIMARY KEY NOT NULL,
  version INTEGER NOT NULL UNIQUE,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'finalized')),
  created_by TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  finalized_by TEXT,
  finalized_at INTEGER,
  note TEXT,
  eligibility_json TEXT NOT NULL DEFAULT '{}'
);

CREATE INDEX screenshot_sets_status_idx
  ON screenshot_sets(status, created_at);

CREATE TABLE screenshot_set_members (
  set_id TEXT NOT NULL REFERENCES screenshot_sets(id),
  source_id TEXT NOT NULL REFERENCES attachments(id),
  position INTEGER NOT NULL,
  submission_id TEXT NOT NULL,
  ocr_result_id TEXT,
  object_key TEXT NOT NULL,
  sha256 TEXT NOT NULL,
  mime_type TEXT NOT NULL,
  size_bytes INTEGER NOT NULL,
  layout_version TEXT NOT NULL,
  accuracy TEXT CHECK (accuracy IN ('accurate', 'inaccurate')),
  PRIMARY KEY (set_id, source_id)
);
