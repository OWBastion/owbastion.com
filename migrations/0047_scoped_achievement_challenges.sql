ALTER TABLE title_challenges ADD COLUMN scope TEXT NOT NULL DEFAULT 'global' CHECK (scope IN ('global', 'map'));

CREATE TABLE achievement_challenge_maps (
  challenge_id TEXT NOT NULL REFERENCES title_challenges(id) ON DELETE CASCADE,
  map_id TEXT NOT NULL REFERENCES maps(id) ON DELETE CASCADE,
  PRIMARY KEY (challenge_id, map_id)
);

CREATE INDEX achievement_challenge_maps_map_idx ON achievement_challenge_maps(map_id, challenge_id);

ALTER TABLE submissions ADD COLUMN target_map_id TEXT REFERENCES maps(id);

CREATE INDEX submissions_target_map_idx ON submissions(target_map_id);
