-- 0058_title_grant_inheritance: allow one automatic submission to issue
-- multiple title slots and repair active dominator grants missing conqueror.

DROP INDEX player_title_grants_source_idx;

CREATE UNIQUE INDEX player_title_grants_source_idx
  ON player_title_grants(source_type, source_id, title_key);

-- Record the corrective grant before inserting it. The deterministic derived
-- ID lets the audit event point to the repaired grant without exposing holder
-- names or relying on a non-repeatable random value.
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
  'migration:0058_title_grant_inheritance',
  'title_grant.inherit',
  'player_title_grant',
  lower(substr(hex(dominator.id || ':conqueror'), 1, 8)) || '-' ||
    lower(substr(hex(dominator.id || ':conqueror'), 9, 4)) || '-' ||
    lower(substr(hex(dominator.id || ':conqueror'), 13, 4)) || '-' ||
    lower(substr(hex(dominator.id || ':conqueror'), 17, 4)) || '-' ||
    lower(substr(hex(dominator.id || ':conqueror'), 21, 12)),
  json_object(
    'sourceGrantId', dominator.id,
    'titleKey', 'CONQUEROR',
    'mapId', dominator.map_id,
    'sourceType', dominator.source_type,
    'sourceId', dominator.source_id,
    'reason', '主宰称号自动继承征服者称号。'
  ),
  CAST(strftime('%s', 'now') AS INTEGER) * 1000
FROM player_title_grants AS dominator
WHERE dominator.title_key = 'DOMINATOR'
  AND dominator.map_id IS NOT NULL
  AND dominator.status = 'active'
  AND NOT EXISTS (
    SELECT 1
    FROM player_title_grants AS conqueror
    WHERE conqueror.player_account_id = dominator.player_account_id
      AND conqueror.title_key = 'CONQUEROR'
      AND conqueror.map_id = dominator.map_id
      AND conqueror.status = 'active'
  );

INSERT INTO player_title_grants (
  id, player_account_id, title_key, map_id, slot, status, source_type, source_id,
  granted_by, granted_at
)
SELECT
  lower(substr(hex(dominator.id || ':conqueror'), 1, 8)) || '-' ||
    lower(substr(hex(dominator.id || ':conqueror'), 9, 4)) || '-' ||
    lower(substr(hex(dominator.id || ':conqueror'), 13, 4)) || '-' ||
    lower(substr(hex(dominator.id || ':conqueror'), 17, 4)) || '-' ||
    lower(substr(hex(dominator.id || ':conqueror'), 21, 12)),
  dominator.player_account_id,
  'CONQUEROR',
  dominator.map_id,
  'conqueror',
  'active',
  dominator.source_type,
  dominator.source_id,
  dominator.granted_by,
  dominator.granted_at
FROM player_title_grants AS dominator
WHERE dominator.title_key = 'DOMINATOR'
  AND dominator.map_id IS NOT NULL
  AND dominator.status = 'active'
  AND NOT EXISTS (
    SELECT 1
    FROM player_title_grants AS conqueror
    WHERE conqueror.player_account_id = dominator.player_account_id
      AND conqueror.title_key = 'CONQUEROR'
      AND conqueror.map_id = dominator.map_id
      AND conqueror.status = 'active'
  );
