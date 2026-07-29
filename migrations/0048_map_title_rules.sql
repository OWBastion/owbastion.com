-- 0048_map_title_rules: reusable map title rule model
--
-- Introduces three new tables and one new column.
-- No existing rows in achievement_challenges, map_title_rewards, or
-- player_title_grants are modified. All changes are purely additive.
--
-- map_title_rules       – one row per rule kind (e.g. conqueror, dominator, pioneer).
--                         Replaces the per-map duplication in achievement_challenges
--                         as the authoritative source for conditions, reward slot,
--                         display strategy, and lifecycle.
--
-- map_title_rule_exceptions – optional per-(ruleId, mapId) overrides.
--                         A disabled exception (enabled = 0) wins over a rule default
--                         and removes the projection for that map.
--                         An enabled exception may override only condition,
--                         evidence_rule, submission_mode, and slot.
--
-- map_title_rule_compat – compatibility mapping: retains the legacy
--                         map.<mapId>.<kind> public ID for the compatibility period.
--                         is_standard_instance = 1 means the row is a template
--                         projection, not a real map-specific exception.
--
-- submissions.rule_snapshot_json – immutable JSON snapshot persisted at
--                         upload-session creation for rule-based submissions.
--                         Null for all legacy rows; review decisions must read
--                         this snapshot rather than performing a live rule lookup.

-- ─── map_title_rules ──────────────────────────────────────────────────────────

CREATE TABLE map_title_rules (
  id                 TEXT    PRIMARY KEY NOT NULL,
  title_key          TEXT    NOT NULL REFERENCES title_catalog(key),
  kind               TEXT    NOT NULL,
  condition          TEXT    NOT NULL,
  evidence_rule      TEXT    NOT NULL,
  submission_mode    TEXT    NOT NULL DEFAULT 'manual'
                              CHECK (submission_mode IN ('manual', 'automatic')),
  display_kind       TEXT    NOT NULL
                              CHECK (display_kind IN ('fixed', 'map_name_suffix', 'map_pioneer')),
  -- slot: the reward slot that the rule default applies at grant time.
  -- null means this rule does not carry a named slot (e.g. custom map titles).
  slot               TEXT    CHECK (slot IS NULL OR slot IN ('pioneer', 'conqueror', 'dominator')),
  -- default_scope: controls which maps the rule projects to when no exception exists.
  --   'all_active'  – every active map inherits this rule.
  --   'explicit'    – only maps listed in map_title_rule_exceptions with enabled = 1.
  default_scope      TEXT    NOT NULL DEFAULT 'all_active'
                              CHECK (default_scope IN ('all_active', 'explicit')),
  status             TEXT    NOT NULL DEFAULT 'active'
                              CHECK (status IN ('active', 'sunsetting', 'inactive')),
  introduced_version TEXT    NOT NULL,
  retired_version    TEXT,
  created_at         INTEGER NOT NULL,
  updated_at         INTEGER NOT NULL
);

CREATE UNIQUE INDEX map_title_rules_kind_idx ON map_title_rules (kind);
CREATE UNIQUE INDEX map_title_rules_title_key_idx ON map_title_rules (title_key);

-- ─── map_title_rule_exceptions ────────────────────────────────────────────────

CREATE TABLE map_title_rule_exceptions (
  id              TEXT    PRIMARY KEY NOT NULL,
  rule_id         TEXT    NOT NULL REFERENCES map_title_rules(id),
  map_id          TEXT    NOT NULL REFERENCES maps(id),
  -- enabled = 0: disabled exception — the rule does not project for this map,
  --              overriding even an all_active rule default.
  -- enabled = 1: active exception — override fields below win over rule defaults.
  enabled         INTEGER NOT NULL DEFAULT 1
                           CHECK (enabled IN (0, 1)),
  -- nullable overrides; null means "inherit from the rule default".
  -- title_key and display_kind cannot be overridden by an exception.
  condition       TEXT,
  evidence_rule   TEXT,
  submission_mode TEXT    CHECK (submission_mode IS NULL OR submission_mode IN ('manual', 'automatic')),
  -- slot override: once a grant is issued from this exception, the persisted
  -- snapshot slot must not be retroactively changed. The column may be updated
  -- only before any active grant references this (rule_id, map_id) projection.
  slot            TEXT    CHECK (slot IS NULL OR slot IN ('pioneer', 'conqueror', 'dominator')),
  created_at      INTEGER NOT NULL,
  updated_at      INTEGER NOT NULL
);

-- At most one active exception per (rule, map).
CREATE UNIQUE INDEX map_title_rule_exceptions_rule_map_idx
  ON map_title_rule_exceptions (rule_id, map_id);

-- ─── map_title_rule_compat ────────────────────────────────────────────────────
-- Retains the public map.<mapId>.<kind> IDs used by existing achievement_challenges
-- rows for the compatibility period. Each row links a legacy challenge ID to its
-- authoritative rule and map so that grant/review paths can resolve both old and
-- new identifiers without live re-derivation.
--
-- is_standard_instance = 1: this ID is a template projection of the rule — the
--   achievement_challenges row was created by the old per-map duplication logic.
-- is_standard_instance = 0: this ID corresponds to a genuine map-specific
--   exception that was modelled as a separate achievement_challenges row.

CREATE TABLE map_title_rule_compat (
  legacy_challenge_id  TEXT    PRIMARY KEY NOT NULL,
  rule_id              TEXT    NOT NULL REFERENCES map_title_rules(id),
  map_id               TEXT    NOT NULL REFERENCES maps(id),
  is_standard_instance INTEGER NOT NULL DEFAULT 1
                                 CHECK (is_standard_instance IN (0, 1)),
  created_at           INTEGER NOT NULL
);

CREATE UNIQUE INDEX map_title_rule_compat_rule_map_idx
  ON map_title_rule_compat (rule_id, map_id);

-- ─── submissions.rule_snapshot_json ───────────────────────────────────────────
-- Immutable JSON blob persisted at upload-session creation for submissions that
-- are resolved against a map_title_rule. Null for all rows created before this
-- migration. Review and grant paths must read this snapshot; they must not
-- perform a live rule lookup for rows where this column is not null.
--
-- Schema of the JSON object (all fields required when not null):
--   { "ruleId": string, "ruleRevision": number, "mapId": string,
--     "titleKey": string, "slot": string|null, "displayKind": string,
--     "condition": string, "evidenceRule": string, "submissionMode": string,
--     "defaultScope": string, "exceptionId": string|null }

ALTER TABLE submissions ADD COLUMN rule_snapshot_json TEXT;
