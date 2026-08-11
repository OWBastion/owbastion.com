-- 0064_gameplay_revision_spatial_config: store the typed, revision-owned
-- spatial input used by the Bastion build projection.  The JSON is validated
-- at the domain/API boundary; NULL keeps preparation revisions non-projectable.

ALTER TABLE gameplay_revisions ADD COLUMN spatial_config_json TEXT;
