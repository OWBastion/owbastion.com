-- Public leaderboard playerKey lookup: stores the domain leaderboardPlayerKey
-- (sha256("leaderboard:" + id), first 24 hex chars) on the account row so the
-- anonymous public summary endpoint resolves by index instead of scanning and
-- hashing every account. Rows predating the column keep NULL and are backfilled
-- by the read path on first lookup; the key value itself is unchanged.
ALTER TABLE player_accounts ADD COLUMN leaderboard_key TEXT;
CREATE UNIQUE INDEX player_accounts_leaderboard_key_idx ON player_accounts (leaderboard_key);
