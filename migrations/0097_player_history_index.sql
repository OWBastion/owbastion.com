CREATE INDEX mastery_runs_player_accepted_idx
  ON mastery_runs(player_account_id, accepted_at DESC, id DESC);
