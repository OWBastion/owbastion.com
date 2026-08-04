-- 0056_restrict_pioneer_map_title_scope: keep PIONEER closed by default and
-- repair automatic grants created while the migration exposed it on every map.

UPDATE map_title_rules
SET default_scope = 'explicit',
    updated_at = CAST(strftime('%s', 'now') AS INTEGER) * 1000
WHERE lower(trim(kind)) = 'pioneer'
  AND default_scope <> 'explicit';

-- Preserve a traceable record for every corrected automatic grant. A grant
-- created from an enabled explicit-map exception is not part of this repair.
INSERT INTO audit_events (
  id, correlation_id, actor_type, actor_id, operation, entity_type, entity_id,
  payload_json, created_at
)
SELECT
  lower(hex(randomblob(4))) || '-' || lower(hex(randomblob(2))) || '-' ||
    lower(hex(randomblob(2))) || '-' || lower(hex(randomblob(2))) || '-' ||
    lower(hex(randomblob(6))),
  lower(hex(randomblob(4))) || '-' || lower(hex(randomblob(2))) || '-' ||
    lower(hex(randomblob(2))) || '-' || lower(hex(randomblob(2))) || '-' ||
    lower(hex(randomblob(6))),
  'service',
  'migration:0056_pioneer_scope',
  'title_grant.revoke',
  'player_title_grant',
  grant_row.id,
  json_object(
    'titleKey', grant_row.title_key,
    'mapId', grant_row.map_id,
    'sourceType', grant_row.source_type,
    'sourceId', grant_row.source_id,
    'reason', 'OCR 优化期间开拓者规则错误地对所有地图开放；开拓者仅在地图重做或新地图上线期间限时开放。'
  ),
  CAST(strftime('%s', 'now') AS INTEGER) * 1000
FROM player_title_grants AS grant_row
WHERE grant_row.title_key = 'PIONEER'
  AND grant_row.status = 'active'
  AND grant_row.source_type = 'automatic'
  AND NOT EXISTS (
    SELECT 1
    FROM submissions AS submission
    WHERE submission.id = grant_row.source_id
      AND json_extract(submission.rule_snapshot_json, '$.defaultScope') = 'explicit'
      AND json_extract(submission.rule_snapshot_json, '$.exceptionId') IS NOT NULL
  );

-- Reopen submissions whose primary automatic grant was one of the corrected
-- Pioneer grants so the existing screenshot can be sent through OCR again.
INSERT INTO audit_events (
  id, correlation_id, actor_type, actor_id, operation, entity_type, entity_id,
  payload_json, created_at
)
SELECT
  lower(hex(randomblob(4))) || '-' || lower(hex(randomblob(2))) || '-' ||
    lower(hex(randomblob(2))) || '-' || lower(hex(randomblob(2))) || '-' ||
    lower(hex(randomblob(6))),
  lower(hex(randomblob(4))) || '-' || lower(hex(randomblob(2))) || '-' ||
    lower(hex(randomblob(2))) || '-' || lower(hex(randomblob(2))) || '-' ||
    lower(hex(randomblob(6))),
  'service',
  'migration:0056_pioneer_scope',
  'submission.corrective_review',
  'submission',
  submission.id,
  json_object(
    'grantId', grant_row.id,
    'titleKey', grant_row.title_key,
    'reason', '开拓者挑战不在当前限时开放范围内，已撤销自动发放并允许重新请求 OCR。'
  ),
  CAST(strftime('%s', 'now') AS INTEGER) * 1000
FROM submissions AS submission
INNER JOIN player_title_grants AS grant_row ON grant_row.id = submission.grant_id
WHERE submission.status = 'approved'
  AND grant_row.title_key = 'PIONEER'
  AND grant_row.status = 'active'
  AND grant_row.source_type = 'automatic'
  AND NOT EXISTS (
    SELECT 1
    FROM submissions AS source_submission
    WHERE source_submission.id = grant_row.source_id
      AND json_extract(source_submission.rule_snapshot_json, '$.defaultScope') = 'explicit'
      AND json_extract(source_submission.rule_snapshot_json, '$.exceptionId') IS NOT NULL
  );

UPDATE player_title_grants
SET status = 'revoked',
    revoked_by = 'migration:0056_pioneer_scope',
    revoked_at = CAST(strftime('%s', 'now') AS INTEGER) * 1000,
    revoke_reason = 'OCR 优化期间开拓者规则错误地对所有地图开放；开拓者仅在地图重做或新地图上线期间限时开放。'
WHERE title_key = 'PIONEER'
  AND status = 'active'
  AND source_type = 'automatic'
  AND NOT EXISTS (
    SELECT 1
    FROM submissions AS submission
    WHERE submission.id = player_title_grants.source_id
      AND json_extract(submission.rule_snapshot_json, '$.defaultScope') = 'explicit'
      AND json_extract(submission.rule_snapshot_json, '$.exceptionId') IS NOT NULL
  );

INSERT INTO audit_events (
  id, correlation_id, actor_type, actor_id, operation, entity_type, entity_id,
  payload_json, created_at
)
SELECT
  lower(hex(randomblob(4))) || '-' || lower(hex(randomblob(2))) || '-' ||
    lower(hex(randomblob(2))) || '-' || lower(hex(randomblob(2))) || '-' ||
    lower(hex(randomblob(6))),
  lower(hex(randomblob(4))) || '-' || lower(hex(randomblob(2))) || '-' ||
    lower(hex(randomblob(2))) || '-' || lower(hex(randomblob(2))) || '-' ||
    lower(hex(randomblob(6))),
  'service',
  'migration:0056_pioneer_scope',
  'submission.spot_check.revoked',
  'submission',
  spot_check.submission_id,
  json_object(
    'decision', 'revoked',
    'reason', '关联的开拓者自动发放已由 corrective migration 撤销。'
  ),
  CAST(strftime('%s', 'now') AS INTEGER) * 1000
FROM submission_spot_checks AS spot_check
INNER JOIN submissions AS submission ON submission.id = spot_check.submission_id
WHERE spot_check.status = 'pending'
  AND submission.status = 'approved'
  AND submission.grant_id IN (
    SELECT grant_row.id
    FROM player_title_grants AS grant_row
    WHERE grant_row.title_key = 'PIONEER'
      AND grant_row.status = 'revoked'
      AND grant_row.revoked_by = 'migration:0056_pioneer_scope'
  );

UPDATE submission_reviews
SET decision = 'resubmission_required',
    reason = '开拓者挑战不在当前限时开放范围内，已撤销自动发放；管理员可重新请求 OCR。',
    reviewer = 'migration:0056_pioneer_scope',
    created_at = CAST(strftime('%s', 'now') AS INTEGER) * 1000
WHERE submission_id IN (
  SELECT id
  FROM submissions
  WHERE status = 'approved'
    AND grant_id IN (
      SELECT grant_row.id
      FROM player_title_grants AS grant_row
      WHERE grant_row.title_key = 'PIONEER'
        AND grant_row.status = 'revoked'
        AND grant_row.revoked_by = 'migration:0056_pioneer_scope'
    )
);

UPDATE submissions
SET status = 'resubmission_required',
    review_reason = '开拓者挑战不在当前限时开放范围内，已撤销自动发放；管理员可重新请求 OCR。',
    grant_id = NULL,
    updated_at = CAST(strftime('%s', 'now') AS INTEGER) * 1000
WHERE status = 'approved'
  AND grant_id IN (
    SELECT grant_row.id
    FROM player_title_grants AS grant_row
    WHERE grant_row.title_key = 'PIONEER'
      AND grant_row.status = 'revoked'
      AND grant_row.revoked_by = 'migration:0056_pioneer_scope'
  );

UPDATE submission_spot_checks
SET status = 'revoked',
    resolved_at = CAST(strftime('%s', 'now') AS INTEGER) * 1000,
    reviewer = 'migration:0056_pioneer_scope',
    reason = '关联的开拓者自动发放已由 corrective migration 撤销。'
WHERE status = 'pending'
  AND submission_id IN (
    SELECT id
    FROM submissions
    WHERE status = 'resubmission_required'
      AND review_reason = '开拓者挑战不在当前限时开放范围内，已撤销自动发放；管理员可重新请求 OCR。'
  );
