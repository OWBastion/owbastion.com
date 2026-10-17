-- Public URL handle is optional. It is not a login identifier or BattleTag.
ALTER TABLE player_accounts ADD COLUMN public_handle TEXT COLLATE NOCASE;
CREATE UNIQUE INDEX player_accounts_public_handle_idx ON player_accounts(public_handle);
