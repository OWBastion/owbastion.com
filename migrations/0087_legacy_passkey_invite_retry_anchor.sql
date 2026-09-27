ALTER TABLE binding_invites ADD COLUMN legacy_passkey_player_account_id TEXT;
ALTER TABLE binding_invites ADD COLUMN legacy_passkey_challenge_id TEXT;

UPDATE binding_invites
SET
  legacy_passkey_player_account_id = (
    SELECT player_account_id
    FROM passkey_challenges
    WHERE passkey_challenges.invite_id = binding_invites.id
      AND passkey_challenges.purpose = 'invitation'
      AND passkey_challenges.used_at IS NOT NULL
      AND passkey_challenges.player_account_id IS NOT NULL
    ORDER BY passkey_challenges.used_at DESC, passkey_challenges.created_at DESC
    LIMIT 1
  ),
  legacy_passkey_challenge_id = (
    SELECT id
    FROM passkey_challenges
    WHERE passkey_challenges.invite_id = binding_invites.id
      AND passkey_challenges.purpose = 'invitation'
      AND passkey_challenges.used_at IS NOT NULL
      AND passkey_challenges.player_account_id IS NOT NULL
    ORDER BY passkey_challenges.used_at DESC, passkey_challenges.created_at DESC
    LIMIT 1
  )
WHERE binding_invites.redeemed_at IS NOT NULL
  AND EXISTS (
    SELECT 1
    FROM passkey_challenges
    WHERE passkey_challenges.invite_id = binding_invites.id
      AND passkey_challenges.purpose = 'invitation'
      AND passkey_challenges.used_at IS NOT NULL
      AND passkey_challenges.player_account_id IS NOT NULL
  );
