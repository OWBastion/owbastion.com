-- Converge stored Challenge lifecycle onto the canonical vocabulary:
-- draft | active | archived. "scheduled" and "sunsetting" are availability
-- projections of lifecycle + open window + announced retirement version, not
-- stored states. Title catalog lifecycle (draft | active | retired) is
-- unchanged. The existing CHECK constraints only allow the legacy words, so
-- each table is rebuilt with the canonical CHECK while remapping values.
--
-- Value mapping:
--   scheduled + committed start -> active (still projects "scheduled" until
--     the window opens; retirement announcement is preserved)
--   scheduled without a start   -> draft (never completable or dated)
--   sunsetting                  -> active (announcement stays in
--     retired_version)
--   retired / inactive          -> archived; archived rows carry no
--     retirement announcement or schedule window.

PRAGMA foreign_keys = OFF;
PRAGMA defer_foreign_keys = ON;

CREATE TABLE title_challenges_next (
  id TEXT PRIMARY KEY NOT NULL,
  title_key TEXT NOT NULL REFERENCES title_catalog(key),
  category_override TEXT,
  condition TEXT NOT NULL,
  evidence_rule TEXT NOT NULL,
  submission_mode TEXT NOT NULL CHECK (submission_mode IN ('manual', 'automatic')),
  status TEXT NOT NULL CHECK (status IN ('draft', 'active', 'archived')),
  retired_version TEXT,
  starts_at INTEGER,
  ends_at INTEGER,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  scope TEXT NOT NULL DEFAULT 'global' CHECK (scope IN ('global', 'map')),
  map_variant TEXT,
  game_version TEXT,
  introduced_version TEXT,
  progress_rule TEXT,
  UNIQUE (title_key),
  CHECK (ends_at IS NULL OR starts_at IS NULL OR ends_at > starts_at)
);

INSERT INTO title_challenges_next (
  id, title_key, category_override, condition, evidence_rule, submission_mode,
  status, retired_version, starts_at, ends_at, created_at, updated_at,
  scope, map_variant, game_version, introduced_version, progress_rule
)
SELECT
  id, title_key, category_override, condition, evidence_rule, submission_mode,
  CASE status
    WHEN 'scheduled' THEN CASE WHEN starts_at IS NOT NULL THEN 'active' ELSE 'draft' END
    WHEN 'sunsetting' THEN 'active'
    WHEN 'retired' THEN 'archived'
    ELSE status
  END,
  CASE WHEN status = 'retired' OR (status = 'scheduled' AND starts_at IS NULL) THEN NULL ELSE retired_version END,
  CASE WHEN status = 'retired' THEN NULL ELSE starts_at END,
  CASE WHEN status = 'retired' THEN NULL ELSE ends_at END,
  created_at, updated_at, scope, map_variant, game_version, introduced_version, progress_rule
FROM title_challenges;

DROP TABLE title_challenges;
ALTER TABLE title_challenges_next RENAME TO title_challenges;
CREATE INDEX title_challenges_status_idx ON title_challenges(status, title_key);

CREATE TABLE achievement_challenges_next (
  id TEXT PRIMARY KEY NOT NULL,
  map_id TEXT NOT NULL REFERENCES maps(id),
  type TEXT NOT NULL CHECK (type IN ('difficulty_completion', 'pioneer', 'classic_completion')),
  name TEXT NOT NULL,
  difficulty TEXT,
  game_version TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('draft', 'active', 'archived')),
  introduced_version TEXT NOT NULL,
  retired_version TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  reward_title_key TEXT REFERENCES title_catalog(key),
  condition TEXT NOT NULL DEFAULT '完成对应地图挑战。',
  evidence_rule TEXT NOT NULL DEFAULT '上传包含结算画面、地图、难度与玩家信息的完整截图。',
  submission_mode TEXT NOT NULL DEFAULT 'manual'
);

INSERT INTO achievement_challenges_next (
  id, map_id, type, name, difficulty, game_version, status, introduced_version,
  retired_version, created_at, updated_at, reward_title_key, condition,
  evidence_rule, submission_mode
)
SELECT
  id, map_id, type, name, difficulty, game_version,
  CASE status WHEN 'sunsetting' THEN 'active' WHEN 'inactive' THEN 'archived' WHEN 'retired' THEN 'archived' ELSE status END,
  introduced_version,
  CASE WHEN status IN ('active', 'sunsetting') THEN retired_version ELSE NULL END,
  created_at, updated_at, reward_title_key, condition, evidence_rule, submission_mode
FROM achievement_challenges;

DROP TABLE achievement_challenges;
ALTER TABLE achievement_challenges_next RENAME TO achievement_challenges;
CREATE INDEX achievement_challenges_map_status_idx ON achievement_challenges(map_id, status, name);

CREATE TABLE map_title_rules_next (
  id TEXT PRIMARY KEY NOT NULL,
  title_key TEXT NOT NULL REFERENCES title_catalog(key),
  kind TEXT NOT NULL,
  condition TEXT NOT NULL,
  evidence_rule TEXT NOT NULL,
  submission_mode TEXT NOT NULL DEFAULT 'manual' CHECK (submission_mode IN ('manual', 'automatic')),
  display_kind TEXT NOT NULL CHECK (display_kind IN ('fixed', 'map_name_suffix', 'map_pioneer')),
  -- slot: the reward slot that the rule default applies at grant time.
  -- null means this rule does not carry a named slot (e.g. custom map titles).
  slot TEXT CHECK (slot IS NULL OR slot IN ('pioneer', 'conqueror', 'dominator')),
  -- default_scope: controls which maps the rule projects to when no exception exists.
  --   'all_active'  – every active map inherits this rule.
  --   'explicit'    – only maps listed in map_title_rule_exceptions with enabled = 1.
  default_scope TEXT NOT NULL DEFAULT 'all_active' CHECK (default_scope IN ('all_active', 'explicit')),
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('draft', 'active', 'archived')),
  introduced_version TEXT NOT NULL,
  retired_version TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  map_variant TEXT
);

INSERT INTO map_title_rules_next (
  id, title_key, kind, condition, evidence_rule, submission_mode, display_kind,
  slot, default_scope, status, introduced_version, retired_version,
  created_at, updated_at, map_variant
)
SELECT
  id, title_key, kind, condition, evidence_rule, submission_mode, display_kind,
  slot, default_scope,
  CASE status WHEN 'sunsetting' THEN 'active' WHEN 'inactive' THEN 'archived' WHEN 'retired' THEN 'archived' ELSE status END,
  introduced_version,
  CASE WHEN status IN ('active', 'sunsetting') THEN retired_version ELSE NULL END,
  created_at, updated_at, map_variant
FROM map_title_rules;

DROP TABLE map_title_rules;
ALTER TABLE map_title_rules_next RENAME TO map_title_rules;
CREATE UNIQUE INDEX map_title_rules_kind_idx ON map_title_rules (kind);
CREATE UNIQUE INDEX map_title_rules_title_key_idx ON map_title_rules (title_key);

-- Drift repair: retiring a Title ends ordinary acquisition, so every
-- non-archived acquisition path owned by a retired Title is archived. Map
-- completion challenges are left untouched: they belong to their map and the
-- Title lifecycle already gates the reward.
UPDATE title_challenges SET status = 'archived', retired_version = NULL, starts_at = NULL, ends_at = NULL
  WHERE status != 'archived'
    AND title_key IN (SELECT key FROM title_catalog WHERE lifecycle = 'retired');
UPDATE map_title_rules SET status = 'archived', retired_version = NULL
  WHERE status != 'archived'
    AND title_key IN (SELECT key FROM title_catalog WHERE lifecycle = 'retired');

PRAGMA defer_foreign_keys = OFF;
PRAGMA foreign_keys = ON;
