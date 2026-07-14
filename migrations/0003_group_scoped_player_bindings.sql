CREATE TABLE player_accounts_new (
  id TEXT PRIMARY KEY NOT NULL,
  player_id TEXT NOT NULL,
  player_name TEXT NOT NULL,
  normalized_player_name TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  UNIQUE(player_id)
);

INSERT INTO player_accounts_new (id, player_id, player_name, normalized_player_name, created_at, updated_at)
SELECT id, substr(handle, instr(handle, '#') + 1), substr(handle, 1, instr(handle, '#') - 1), lower(substr(handle, 1, instr(handle, '#') - 1)), created_at, updated_at
FROM player_accounts;

CREATE TABLE bindings_new (
  id TEXT PRIMARY KEY NOT NULL,
  identity_id TEXT NOT NULL REFERENCES identities(id),
  player_account_id TEXT NOT NULL,
  provider TEXT NOT NULL,
  group_open_id TEXT NOT NULL,
  member_open_id TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  UNIQUE(provider, group_open_id, member_open_id)
);

INSERT INTO bindings_new (id, identity_id, player_account_id, provider, group_open_id, member_open_id, created_at)
SELECT b.id, b.identity_id, p.id, b.provider, 'legacy', b.external_user_id, b.created_at
FROM bindings b JOIN player_accounts old ON old.identity_id = b.identity_id JOIN player_accounts_new p ON p.id = old.id;

DROP TABLE bindings;
ALTER TABLE bindings_new RENAME TO bindings;
DROP TABLE player_accounts;
ALTER TABLE player_accounts_new RENAME TO player_accounts;

CREATE INDEX player_accounts_player_id_idx ON player_accounts(player_id);
CREATE INDEX bindings_provider_group_member_idx ON bindings(provider, group_open_id, member_open_id);
