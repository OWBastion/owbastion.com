CREATE TABLE catalog_imports (
  id TEXT PRIMARY KEY NOT NULL,
  source_version TEXT NOT NULL UNIQUE,
  snapshot_hash TEXT NOT NULL UNIQUE,
  status TEXT NOT NULL CHECK (status IN ('completed')),
  row_counts_json TEXT NOT NULL,
  imported_at INTEGER NOT NULL
);

