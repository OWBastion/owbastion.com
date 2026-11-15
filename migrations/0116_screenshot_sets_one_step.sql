-- 0116_screenshot_sets_one_step: a screenshot set is created and finalized in
-- one step (#556), so the draft/discarded lifecycle, maintainer note and stored
-- eligibility summary have no reader. `created_at` is the finalization time.
-- Draft and discarded sets were never served to OCRKit and are dropped with
-- their members; finalized sets are copied unchanged.
PRAGMA foreign_keys = OFF;

CREATE TABLE screenshot_sets_next (
  id TEXT PRIMARY KEY NOT NULL,
  version INTEGER NOT NULL UNIQUE,
  created_by TEXT NOT NULL,
  created_at INTEGER NOT NULL
);

INSERT INTO screenshot_sets_next (id, version, created_by, created_at)
SELECT id, version, COALESCE(finalized_by, created_by), COALESCE(finalized_at, created_at)
FROM screenshot_sets
WHERE status = 'finalized';

CREATE TABLE screenshot_set_members_next (
  set_id TEXT NOT NULL REFERENCES screenshot_sets_next(id),
  source_id TEXT NOT NULL REFERENCES attachments(id),
  position INTEGER NOT NULL,
  submission_id TEXT NOT NULL,
  map_name TEXT NOT NULL,
  ocr_result_id TEXT,
  object_key TEXT NOT NULL,
  sha256 TEXT NOT NULL,
  mime_type TEXT NOT NULL,
  size_bytes INTEGER NOT NULL,
  layout_version TEXT NOT NULL,
  accuracy TEXT CHECK (accuracy IN ('accurate', 'inaccurate')),
  PRIMARY KEY (set_id, source_id)
);

INSERT INTO screenshot_set_members_next
SELECT m.set_id, m.source_id, m.position, m.submission_id, m.map_name, m.ocr_result_id, m.object_key, m.sha256, m.mime_type, m.size_bytes, m.layout_version, m.accuracy
FROM screenshot_set_members m
JOIN screenshot_sets_next s ON s.id = m.set_id;

DROP TABLE screenshot_set_members;
DROP TABLE screenshot_sets;

ALTER TABLE screenshot_sets_next RENAME TO screenshot_sets;
ALTER TABLE screenshot_set_members_next RENAME TO screenshot_set_members;

PRAGMA foreign_keys = ON;
