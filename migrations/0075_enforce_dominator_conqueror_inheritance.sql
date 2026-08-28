-- 0075_enforce_dominator_conqueror_inheritance: a map DOMINATOR entitlement
-- always includes the CONQUEROR entitlement for the same gameplay revision.

-- Repair rows written after the one-time 0058 backfill. Record the source
-- grant because this corrective migration derives its entitlement from it.
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
  'migration:0075_dominator_conqueror_inheritance',
  'title_grant.inherit',
  'player_title_grant',
  dominator.id,
  json_object(
    'sourceGrantId', dominator.id,
    'titleKey', 'CONQUEROR',
    'mapId', dominator.map_id,
    'gameplayRevisionId', dominator.gameplay_revision_id,
    'sourceType', dominator.source_type,
    'sourceId', dominator.source_id,
    'reason', '主宰称号自动继承征服者称号。'
  ),
  CAST(strftime('%s', 'now') AS INTEGER) * 1000
FROM player_title_grants AS dominator
WHERE dominator.title_key = 'DOMINATOR'
  AND dominator.map_id IS NOT NULL
  AND dominator.gameplay_revision_id IS NOT NULL
  AND dominator.status = 'active'
  AND NOT EXISTS (
    SELECT 1
    FROM player_title_grants AS conqueror
    WHERE conqueror.player_account_id = dominator.player_account_id
      AND conqueror.title_key = 'CONQUEROR'
      AND conqueror.map_id = dominator.map_id
      AND conqueror.gameplay_revision_id = dominator.gameplay_revision_id
      AND conqueror.status = 'active'
  );

INSERT INTO player_title_grants (
  id, player_account_id, title_key, map_id, gameplay_revision_id, slot, status,
  source_type, source_id, granted_by, granted_at
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
  dominator.gameplay_revision_id,
  'conqueror',
  'active',
  dominator.source_type,
  dominator.source_id,
  dominator.granted_by,
  dominator.granted_at
FROM player_title_grants AS dominator
WHERE dominator.title_key = 'DOMINATOR'
  AND dominator.map_id IS NOT NULL
  AND dominator.gameplay_revision_id IS NOT NULL
  AND dominator.status = 'active'
  AND NOT EXISTS (
    SELECT 1
    FROM player_title_grants AS conqueror
    WHERE conqueror.player_account_id = dominator.player_account_id
      AND conqueror.title_key = 'CONQUEROR'
      AND conqueror.map_id = dominator.map_id
      AND conqueror.gameplay_revision_id = dominator.gameplay_revision_id
      AND conqueror.status = 'active'
  )
ON CONFLICT(source_type, source_id, title_key) DO UPDATE SET
  map_id = excluded.map_id,
  gameplay_revision_id = excluded.gameplay_revision_id,
  slot = excluded.slot,
  status = 'active',
  granted_by = excluded.granted_by,
  granted_at = excluded.granted_at,
  revoked_by = NULL,
  revoked_at = NULL,
  revoke_reason = NULL;

CREATE TRIGGER player_title_grants_inherit_conqueror_after_dominator_insert
AFTER INSERT ON player_title_grants
WHEN NEW.title_key = 'DOMINATOR'
  AND NEW.map_id IS NOT NULL
  AND NEW.gameplay_revision_id IS NOT NULL
  AND NEW.status = 'active'
  AND NOT EXISTS (
    SELECT 1
    FROM player_title_grants AS conqueror
    WHERE conqueror.player_account_id = NEW.player_account_id
      AND conqueror.title_key = 'CONQUEROR'
      AND conqueror.map_id = NEW.map_id
      AND conqueror.gameplay_revision_id = NEW.gameplay_revision_id
      AND conqueror.status = 'active'
  )
BEGIN
  INSERT INTO player_title_grants (
    id, player_account_id, title_key, map_id, gameplay_revision_id, slot, status,
    source_type, source_id, granted_by, granted_at
  ) VALUES (
    lower(hex(randomblob(4))) || '-' || lower(hex(randomblob(2))) || '-' ||
      lower(hex(randomblob(2))) || '-' || lower(hex(randomblob(2))) || '-' ||
      lower(hex(randomblob(6))),
    NEW.player_account_id,
    'CONQUEROR',
    NEW.map_id,
    NEW.gameplay_revision_id,
    'conqueror',
    'active',
    NEW.source_type,
    NEW.source_id,
    NEW.granted_by,
    NEW.granted_at
  ) ON CONFLICT(source_type, source_id, title_key) DO UPDATE SET
    map_id = excluded.map_id,
    gameplay_revision_id = excluded.gameplay_revision_id,
    slot = excluded.slot,
    status = 'active',
    granted_by = excluded.granted_by,
    granted_at = excluded.granted_at,
    revoked_by = NULL,
    revoked_at = NULL,
    revoke_reason = NULL;

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
    'trigger:player_title_grants_inherit_conqueror',
    'title_grant.inherit',
    'player_title_grant',
    id,
    json_object(
      'sourceGrantId', NEW.id,
      'titleKey', 'CONQUEROR',
      'mapId', NEW.map_id,
      'gameplayRevisionId', NEW.gameplay_revision_id,
      'sourceType', NEW.source_type,
      'sourceId', NEW.source_id,
      'reason', '主宰称号自动继承征服者称号。'
    ),
    CAST(strftime('%s', 'now') AS INTEGER) * 1000
  FROM player_title_grants
  WHERE player_account_id = NEW.player_account_id
    AND title_key = 'CONQUEROR'
    AND map_id = NEW.map_id
    AND gameplay_revision_id = NEW.gameplay_revision_id
    AND status = 'active';
END;
