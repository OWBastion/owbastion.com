-- QQ login codes were looked up by an unindexed, non-unique code_hash with no
-- expiry filter, so an older abandoned-but-pending row sharing a code could
-- shadow a live attempt (#245). Before adding the partial unique index below,
-- expire every pending row that is not the newest pending row for its
-- code_hash. This is a data repair, not a rewrite: existing rows keep their
-- id, hashes, and timestamps and only move to the terminal 'expired' status
-- they would already reach on their own once polled or presented past expiry.
UPDATE qq_login_attempts
SET status = 'expired'
WHERE status = 'pending'
  AND id NOT IN (
    SELECT id FROM (
      SELECT id, ROW_NUMBER() OVER (PARTITION BY code_hash ORDER BY created_at DESC, id DESC) AS rn
      FROM qq_login_attempts
      WHERE status = 'pending'
    )
    WHERE rn = 1
  );

-- At most one live pending attempt per code from now on. SQLite can satisfy
-- `WHERE code_hash = ? AND status = 'pending'` directly from this partial
-- index, which also gives the verify lookup an indexed path.
CREATE UNIQUE INDEX qq_login_attempts_pending_code_idx ON qq_login_attempts(code_hash) WHERE status = 'pending';
