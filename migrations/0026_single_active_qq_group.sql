DROP INDEX qq_group_access_environment_idx;

ALTER TABLE qq_group_access ADD COLUMN status TEXT NOT NULL DEFAULT 'pending';
ALTER TABLE qq_group_access ADD COLUMN bind_enabled INTEGER NOT NULL DEFAULT 0;
ALTER TABLE qq_group_access ADD COLUMN verify_enabled INTEGER NOT NULL DEFAULT 0;
UPDATE qq_group_access
SET status = CASE WHEN enabled = 1 THEN 'pending' ELSE 'legacy' END,
    bind_enabled = 0,
    verify_enabled = 0;
CREATE UNIQUE INDEX qq_group_access_one_active_idx ON qq_group_access(status) WHERE status = 'active';

ALTER TABLE qq_login_attempts ADD COLUMN purpose TEXT NOT NULL DEFAULT 'login';
ALTER TABLE qq_login_attempts ADD COLUMN player_account_id TEXT;
ALTER TABLE qq_login_attempts ADD COLUMN target_group_open_id TEXT;
CREATE INDEX qq_login_attempts_target_group_idx ON qq_login_attempts(target_group_open_id, status);
