CREATE UNIQUE INDEX binding_claims_active_invite_idx ON binding_claims(invite_id) WHERE status = 'pending_confirmation';
