-- A standalone game mode (e.g. 2026镜中回响) is played on its own selectable Gameplay Revision per map.
ALTER TABLE gameplay_revisions ADD COLUMN mode TEXT;

CREATE UNIQUE INDEX gameplay_revisions_mode_idx ON gameplay_revisions(map_id, mode) WHERE mode IS NOT NULL;
