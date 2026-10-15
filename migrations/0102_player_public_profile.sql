-- Player Account public-profile visibility: one simple per-Player setting,
-- defaulting to public. Public projections (leaderboards) keep a non-public
-- Player's rank and score while anonymizing display identity and detail.
ALTER TABLE player_accounts ADD COLUMN public_profile INTEGER NOT NULL DEFAULT 1;
