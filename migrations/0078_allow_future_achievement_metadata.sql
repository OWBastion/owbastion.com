-- Future achievement challenges may be recorded before Bastion release metadata
-- and the activation window are known. Missing versions remain non-public until
-- the challenge is completed with release metadata.

ALTER TABLE title_catalog ADD COLUMN game_version_next TEXT;
UPDATE title_catalog SET game_version_next = game_version;
ALTER TABLE title_catalog DROP COLUMN game_version;
ALTER TABLE title_catalog RENAME COLUMN game_version_next TO game_version;

ALTER TABLE title_challenges ADD COLUMN game_version_next TEXT;
ALTER TABLE title_challenges ADD COLUMN introduced_version_next TEXT;
UPDATE title_challenges
SET game_version_next = game_version,
    introduced_version_next = introduced_version;
ALTER TABLE title_challenges DROP COLUMN game_version;
ALTER TABLE title_challenges DROP COLUMN introduced_version;
ALTER TABLE title_challenges RENAME COLUMN game_version_next TO game_version;
ALTER TABLE title_challenges RENAME COLUMN introduced_version_next TO introduced_version;
