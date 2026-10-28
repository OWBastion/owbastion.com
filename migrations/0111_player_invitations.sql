-- Player-issued invitations (#497). A missing policy row means player
-- invitations are disabled; maintainers create it from the Portal.
CREATE TABLE player_invitation_policy (
  id TEXT PRIMARY KEY NOT NULL CHECK (id = 'global'),
  enabled INTEGER NOT NULL,
  period TEXT NOT NULL CHECK (period IN ('day', 'week', 'month')),
  max_codes_created_per_period INTEGER NOT NULL CHECK (max_codes_created_per_period >= 0),
  max_registrations_per_period INTEGER NOT NULL CHECK (max_registrations_per_period >= 0),
  max_uses_per_code INTEGER NOT NULL CHECK (max_uses_per_code >= 1),
  max_validity_days INTEGER NOT NULL CHECK (max_validity_days >= 1),
  min_account_age_days INTEGER NOT NULL CHECK (min_account_age_days >= 0),
  min_approved_submissions INTEGER NOT NULL CHECK (min_approved_submissions >= 0),
  eligibility_mode TEXT NOT NULL CHECK (eligibility_mode IN ('any', 'all')),
  updated_by TEXT NOT NULL,
  updated_at INTEGER NOT NULL
);

-- A null column inherits the global policy. The period is always global.
CREATE TABLE player_invitation_overrides (
  player_account_id TEXT PRIMARY KEY NOT NULL REFERENCES player_accounts(id),
  enabled INTEGER,
  max_codes_created_per_period INTEGER CHECK (max_codes_created_per_period IS NULL OR max_codes_created_per_period >= 0),
  max_registrations_per_period INTEGER CHECK (max_registrations_per_period IS NULL OR max_registrations_per_period >= 0),
  max_uses_per_code INTEGER CHECK (max_uses_per_code IS NULL OR max_uses_per_code >= 1),
  max_validity_days INTEGER CHECK (max_validity_days IS NULL OR max_validity_days >= 1),
  min_account_age_days INTEGER CHECK (min_account_age_days IS NULL OR min_account_age_days >= 0),
  min_approved_submissions INTEGER CHECK (min_approved_submissions IS NULL OR min_approved_submissions >= 0),
  eligibility_mode TEXT CHECK (eligibility_mode IS NULL OR eligibility_mode IN ('any', 'all')),
  updated_by TEXT NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE TABLE player_invitations (
  id TEXT PRIMARY KEY NOT NULL,
  code TEXT NOT NULL,
  inviter_player_account_id TEXT NOT NULL REFERENCES player_accounts(id),
  max_uses INTEGER NOT NULL CHECK (max_uses >= 1),
  expires_at INTEGER NOT NULL,
  revoked_at INTEGER,
  revoked_by TEXT,
  created_at INTEGER NOT NULL
);
CREATE UNIQUE INDEX player_invitations_code_idx ON player_invitations(code);
CREATE INDEX player_invitations_inviter_idx ON player_invitations(inviter_player_account_id, created_at);

-- Immutable referral fact; one inviter per invitee.
CREATE TABLE player_invitation_redemptions (
  id TEXT PRIMARY KEY NOT NULL,
  invitation_id TEXT NOT NULL REFERENCES player_invitations(id),
  inviter_player_account_id TEXT NOT NULL REFERENCES player_accounts(id),
  invitee_player_account_id TEXT NOT NULL REFERENCES player_accounts(id),
  completed_at INTEGER NOT NULL
);
CREATE UNIQUE INDEX player_invitation_redemptions_invitee_idx ON player_invitation_redemptions(invitee_player_account_id);
CREATE INDEX player_invitation_redemptions_inviter_idx ON player_invitation_redemptions(inviter_player_account_id, completed_at);
CREATE INDEX player_invitation_redemptions_invitation_idx ON player_invitation_redemptions(invitation_id);

CREATE TABLE player_invitation_claims (
  id TEXT PRIMARY KEY NOT NULL,
  invitation_id TEXT NOT NULL REFERENCES player_invitations(id),
  token_hash TEXT NOT NULL,
  code_hash TEXT NOT NULL UNIQUE,
  player_name TEXT NOT NULL,
  normalized_player_name TEXT NOT NULL,
  player_id TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('pending_confirmation', 'approved', 'rejected', 'expired')),
  rejection_reason TEXT,
  member_open_id TEXT,
  group_open_id TEXT,
  message_id TEXT,
  expires_at INTEGER NOT NULL,
  created_at INTEGER NOT NULL,
  verified_at INTEGER,
  decided_at INTEGER
);
CREATE INDEX player_invitation_claims_expiry_idx ON player_invitation_claims(status, expires_at);
CREATE INDEX player_invitation_claims_invitation_idx ON player_invitation_claims(invitation_id);
