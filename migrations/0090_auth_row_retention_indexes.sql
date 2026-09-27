CREATE INDEX binding_claims_expiry_idx ON binding_claims(status, expires_at);
CREATE INDEX portal_sessions_expiry_idx ON portal_sessions(expires_at);
