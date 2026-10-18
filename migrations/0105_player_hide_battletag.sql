-- Player Account BattleTag visibility: a Player may keep a public profile while
-- withholding the BattleTag name from other Players. Defaults to shown.
ALTER TABLE player_accounts ADD COLUMN hide_battletag INTEGER NOT NULL DEFAULT 0;
