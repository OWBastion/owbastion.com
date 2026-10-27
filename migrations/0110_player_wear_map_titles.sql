-- Player preference: whether map-scoped titles are worn in Bastion. A missing row
-- means the player wears them; grants and public projections are unchanged.
CREATE TABLE player_title_wear (
  player_account_id TEXT PRIMARY KEY NOT NULL REFERENCES player_accounts(id),
  wear_map_titles INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
