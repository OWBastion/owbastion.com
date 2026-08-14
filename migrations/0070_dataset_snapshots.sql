-- 0070_dataset_snapshots: immutable, versioned reviewed-annotation dataset
-- snapshots for OCRKit consumption.
--
-- A finalized snapshot is immutable: its membership and recorded provenance
-- are written once at draft creation and never change. Later reviewed
-- annotations or corrections belong to a later snapshot and never silently
-- alter the provenance of an existing training run. The platform never
-- manufactures a training transcription from business metadata; only exact
-- visible transcriptions with the required provenance are eligible.

CREATE TABLE dataset_snapshots (
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

CREATE INDEX dataset_snapshots_status_idx
  ON dataset_snapshots(status, created_at);

CREATE TABLE dataset_snapshot_annotations (
  snapshot_id TEXT NOT NULL REFERENCES dataset_snapshots(id),
  annotation_id TEXT NOT NULL REFERENCES reviewed_annotations(id),
  position INTEGER NOT NULL,
  evidence_object_key TEXT,
  evidence_content_type TEXT,
  evidence_available INTEGER NOT NULL DEFAULT 0 CHECK (evidence_available IN (0, 1)),
  PRIMARY KEY (snapshot_id, annotation_id)
);

CREATE INDEX dataset_snapshot_annotations_annotation_idx
  ON dataset_snapshot_annotations(annotation_id);
