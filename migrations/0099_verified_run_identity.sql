-- A Verified Run is identified by Player, Map, game version and match code.
DROP INDEX mastery_runs_active_player_run_code_idx;

CREATE UNIQUE INDEX mastery_runs_active_player_map_version_run_code_idx
  ON mastery_runs(player_account_id, map_id, game_version, run_code)
  WHERE status = 'active';
