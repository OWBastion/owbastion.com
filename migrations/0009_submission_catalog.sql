CREATE TABLE maps (
  id TEXT PRIMARY KEY NOT NULL,
  name TEXT NOT NULL,
  game_version TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('active', 'inactive')),
  introduced_version TEXT NOT NULL,
  retired_version TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE TABLE achievement_challenges (
  id TEXT PRIMARY KEY NOT NULL,
  map_id TEXT NOT NULL REFERENCES maps(id),
  type TEXT NOT NULL CHECK (type IN ('difficulty_completion', 'pioneer', 'classic_completion')),
  name TEXT NOT NULL,
  difficulty TEXT,
  game_version TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('active', 'inactive')),
  introduced_version TEXT NOT NULL,
  retired_version TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE INDEX maps_status_idx ON maps(status, name);
CREATE INDEX achievement_challenges_map_status_idx ON achievement_challenges(map_id, status, name);

INSERT INTO maps (id, name, game_version, status, introduced_version, created_at, updated_at) VALUES
  ('map.samoa', '萨摩亚', '2026.07.15', 'active', '2026.07.15', 1752537600000, 1752537600000),
  ('map.lijiang_tower', '漓江塔', '2026.07.15', 'active', '2026.07.15', 1752537600000, 1752537600000),
  ('map.oasis', '绿洲城', '2026.07.15', 'active', '2026.07.15', 1752537600000, 1752537600000),
  ('map.busan', '釜山', '2026.07.15', 'active', '2026.07.15', 1752537600000, 1752537600000),
  ('map.nepal', '尼泊尔', '2026.07.15', 'active', '2026.07.15', 1752537600000, 1752537600000);

INSERT INTO achievement_challenges (id, map_id, type, name, difficulty, game_version, status, introduced_version, created_at, updated_at) VALUES
  ('map.samoa.hell', 'map.samoa', 'difficulty_completion', '地狱难度通关', '地狱', '2026.07.15', 'active', '2026.07.15', 1752537600000, 1752537600000),
  ('map.lijiang_tower.hell', 'map.lijiang_tower', 'difficulty_completion', '地狱难度通关', '地狱', '2026.07.15', 'active', '2026.07.15', 1752537600000, 1752537600000),
  ('map.oasis.hell', 'map.oasis', 'difficulty_completion', '地狱难度通关', '地狱', '2026.07.15', 'active', '2026.07.15', 1752537600000, 1752537600000),
  ('map.busan.hell', 'map.busan', 'difficulty_completion', '地狱难度通关', '地狱', '2026.07.15', 'active', '2026.07.15', 1752537600000, 1752537600000),
  ('map.nepal.hell', 'map.nepal', 'difficulty_completion', '地狱难度通关', '地狱', '2026.07.15', 'active', '2026.07.15', 1752537600000, 1752537600000);
