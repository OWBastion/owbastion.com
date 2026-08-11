CREATE TABLE mastery_runs (
  id TEXT PRIMARY KEY NOT NULL,
  player_account_id TEXT NOT NULL REFERENCES player_accounts(id),
  source_submission_id TEXT NOT NULL REFERENCES submissions(id),
  map_id TEXT NOT NULL REFERENCES maps(id),
  map_variant TEXT,
  difficulty TEXT NOT NULL CHECK (difficulty IN ('简单', '一般', '困难', '专家', '传奇', '地狱')),
  game_version TEXT NOT NULL,
  run_code TEXT NOT NULL,
  completion_duration_seconds INTEGER NOT NULL CHECK (completion_duration_seconds > 0),
  deaths INTEGER CHECK (deaths IS NULL OR deaths >= 0),
  skips INTEGER CHECK (skips IS NULL OR skips >= 0),
  event_counters_json TEXT NOT NULL DEFAULT '{}',
  acceptance_source TEXT NOT NULL CHECK (acceptance_source IN ('submission_automatic', 'submission_review')),
  accepted_at INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'invalidated')),
  invalidated_at INTEGER,
  invalidated_by TEXT,
  invalidation_reason TEXT,
  xp_rule_version TEXT NOT NULL,
  xp_input_snapshot_json TEXT NOT NULL,
  awarded_xp INTEGER NOT NULL CHECK (awarded_xp >= 0),
  created_at INTEGER NOT NULL
);

CREATE UNIQUE INDEX mastery_runs_source_submission_idx
  ON mastery_runs(source_submission_id);

CREATE UNIQUE INDEX mastery_runs_active_player_run_code_idx
  ON mastery_runs(player_account_id, run_code)
  WHERE status = 'active';

CREATE INDEX mastery_runs_active_player_map_accepted_idx
  ON mastery_runs(player_account_id, map_id, accepted_at DESC)
  WHERE status = 'active';

CREATE TABLE mastery_run_lifecycle_events (
  id TEXT PRIMARY KEY NOT NULL,
  mastery_run_id TEXT NOT NULL REFERENCES mastery_runs(id),
  transition TEXT NOT NULL CHECK (transition IN ('accepted', 'invalidated', 'restored')),
  actor_type TEXT NOT NULL CHECK (actor_type IN ('service', 'user')),
  actor_id TEXT NOT NULL,
  reason TEXT,
  created_at INTEGER NOT NULL
);

CREATE INDEX mastery_run_lifecycle_events_run_created_idx
  ON mastery_run_lifecycle_events(mastery_run_id, created_at DESC);
