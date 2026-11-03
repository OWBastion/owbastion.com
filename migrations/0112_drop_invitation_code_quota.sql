-- Player invitations are limited by registrations per period only.
ALTER TABLE player_invitation_policy DROP COLUMN max_codes_created_per_period;
ALTER TABLE player_invitation_overrides DROP COLUMN max_codes_created_per_period;
