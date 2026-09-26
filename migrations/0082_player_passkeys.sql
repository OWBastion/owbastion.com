PRAGMA defer_foreign_keys = ON;

CREATE TABLE submissions_player_account_preflight (
  resolved_account_count INTEGER NOT NULL CHECK (resolved_account_count = 1)
);

INSERT INTO submissions_player_account_preflight (resolved_account_count)
SELECT COUNT(DISTINCT player_accounts.id)
FROM submissions
LEFT JOIN bindings ON bindings.id = submissions.binding_id
LEFT JOIN player_accounts ON player_accounts.id = bindings.player_account_id
GROUP BY submissions.id;

DROP TABLE submissions_player_account_preflight;

CREATE TABLE submissions_next (
  id TEXT PRIMARY KEY NOT NULL,
  player_account_id TEXT NOT NULL REFERENCES player_accounts(id),
  binding_id TEXT REFERENCES bindings(id),
  status TEXT NOT NULL CHECK (status IN ('received', 'evidence_pending', 'evidence_stored', 'upload_pending', 'ocr_pending', 'awaiting_player_confirmation', 'ready_for_review', 'ocr_review_required', 'approved', 'rejected', 'resubmission_required')),
  challenge_type TEXT NOT NULL DEFAULT 'map_completion',
  map_name TEXT NOT NULL DEFAULT '',
  source_provider TEXT NOT NULL,
  source_conversation_id TEXT NOT NULL,
  source_message_id TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  challenge_id TEXT,
  difficulty TEXT,
  player_name TEXT,
  review_reason TEXT,
  grant_id TEXT,
  ocr_fail_count INTEGER NOT NULL DEFAULT 0,
  target_map_id TEXT REFERENCES maps(id),
  gameplay_revision_id TEXT REFERENCES gameplay_revisions(id),
  rule_snapshot_json TEXT
);

INSERT INTO submissions_next (id, player_account_id, binding_id, status, challenge_type, map_name, source_provider, source_conversation_id, source_message_id, created_at, updated_at, challenge_id, difficulty, player_name, review_reason, grant_id, ocr_fail_count, target_map_id, gameplay_revision_id, rule_snapshot_json)
SELECT s.id, b.player_account_id, s.binding_id, s.status, s.challenge_type, s.map_name, s.source_provider, s.source_conversation_id, s.source_message_id, s.created_at, s.updated_at, s.challenge_id, s.difficulty, s.player_name, s.review_reason, s.grant_id, s.ocr_fail_count, s.target_map_id, s.gameplay_revision_id, s.rule_snapshot_json
FROM submissions AS s
JOIN bindings AS b ON b.id = s.binding_id;

DROP TABLE submissions;
ALTER TABLE submissions_next RENAME TO submissions;

CREATE INDEX submissions_map_idx ON submissions(map_name);
CREATE INDEX submissions_binding_idx ON submissions(binding_id);
CREATE INDEX submissions_player_account_idx ON submissions(player_account_id, created_at DESC);
CREATE INDEX submissions_review_status_idx ON submissions(status, updated_at);
CREATE INDEX submissions_target_map_idx ON submissions(target_map_id);

CREATE TABLE passkey_credentials (
  id TEXT PRIMARY KEY NOT NULL,
  player_account_id TEXT NOT NULL REFERENCES player_accounts(id),
  credential_id TEXT NOT NULL,
  public_key TEXT NOT NULL,
  counter INTEGER NOT NULL,
  transports_json TEXT,
  name TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  last_used_at INTEGER
);

CREATE UNIQUE INDEX passkey_credentials_credential_id_idx ON passkey_credentials(credential_id);
CREATE INDEX passkey_credentials_player_account_idx ON passkey_credentials(player_account_id);

CREATE TABLE passkey_recovery_grants (
  id TEXT PRIMARY KEY NOT NULL,
  player_account_id TEXT NOT NULL REFERENCES player_accounts(id),
  token_hash TEXT NOT NULL,
  expires_at INTEGER NOT NULL,
  used_at INTEGER,
  created_by TEXT NOT NULL,
  created_at INTEGER NOT NULL
);

CREATE UNIQUE INDEX passkey_recovery_grants_token_idx ON passkey_recovery_grants(token_hash);

CREATE TABLE passkey_challenges (
  id TEXT PRIMARY KEY NOT NULL,
  purpose TEXT NOT NULL CHECK (purpose IN ('login', 'invitation', 'registration', 'recovery')),
  challenge TEXT NOT NULL,
  player_account_id TEXT,
  invite_id TEXT REFERENCES binding_invites(id),
  recovery_grant_id TEXT REFERENCES passkey_recovery_grants(id),
  expires_at INTEGER NOT NULL,
  used_at INTEGER,
  consumed_by TEXT,
  created_at INTEGER NOT NULL
);

CREATE INDEX passkey_challenges_expiry_idx ON passkey_challenges(expires_at, used_at);

CREATE TABLE portal_sessions (
  id TEXT PRIMARY KEY NOT NULL,
  player_account_id TEXT NOT NULL REFERENCES player_accounts(id),
  token_hash TEXT NOT NULL,
  passkey_challenge_id TEXT REFERENCES passkey_challenges(id),
  expires_at INTEGER NOT NULL,
  created_at INTEGER NOT NULL
);

CREATE UNIQUE INDEX portal_sessions_token_idx ON portal_sessions(token_hash);
CREATE UNIQUE INDEX portal_sessions_challenge_idx ON portal_sessions(passkey_challenge_id);
CREATE INDEX portal_sessions_player_account_idx ON portal_sessions(player_account_id, expires_at);

INSERT OR IGNORE INTO portal_sessions (id, player_account_id, token_hash, expires_at, created_at)
SELECT s.id, p.id, s.token_hash, s.expires_at, s.created_at
FROM qq_sessions AS s
JOIN bindings AS b ON b.provider = 'qq' AND b.member_open_id = s.member_open_id AND b.status = 'active'
JOIN player_accounts AS p ON p.id = b.player_account_id AND p.status = 'active';

DROP TABLE qq_sessions;
DROP TABLE qq_login_attempts;

PRAGMA defer_foreign_keys = OFF;
