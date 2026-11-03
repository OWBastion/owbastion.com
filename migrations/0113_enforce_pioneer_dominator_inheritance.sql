-- 0113_enforce_pioneer_dominator_inheritance: a map PIONEER entitlement
-- requires Hell difficulty, so it always includes the DOMINATOR entitlement for
-- the same gameplay revision. CONQUEROR follows through the 0075 trigger.

-- Repair PIONEER grants that never received DOMINATOR. Each repaired grant
-- fires the 0075 trigger, which adds the missing CONQUEROR. Record the source
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
  'migration:0113_pioneer_dominator_inheritance',
  'title_grant.inherit',
  'player_title_grant',
  pioneer.id,
  json_object(
    'sourceGrantId', pioneer.id,
    'titleKey', 'DOMINATOR',
    'mapId', pioneer.map_id,
    'gameplayRevisionId', pioneer.gameplay_revision_id,
    'sourceType', pioneer.source_type,
    'sourceId', pioneer.source_id,
    'reason', '开拓者称号自动继承主宰称号。'
  ),
  CAST(strftime('%s', 'now') AS INTEGER) * 1000
FROM player_title_grants AS pioneer
WHERE pioneer.title_key = 'PIONEER'
  AND pioneer.map_id IS NOT NULL
  AND pioneer.gameplay_revision_id IS NOT NULL
  AND pioneer.status = 'active'
  AND NOT EXISTS (
    SELECT 1
    FROM player_title_grants AS dominator
    WHERE dominator.player_account_id = pioneer.player_account_id
      AND dominator.title_key = 'DOMINATOR'
      AND dominator.map_id = pioneer.map_id
      AND dominator.gameplay_revision_id = pioneer.gameplay_revision_id
      AND dominator.status = 'active'
  );

INSERT INTO player_title_grants (
  id, player_account_id, title_key, map_id, gameplay_revision_id, slot, status,
  source_type, source_id, granted_by, granted_at
)
SELECT
  lower(substr(hex(pioneer.id || ':dominator'), 1, 8)) || '-' ||
    lower(substr(hex(pioneer.id || ':dominator'), 9, 4)) || '-' ||
    lower(substr(hex(pioneer.id || ':dominator'), 13, 4)) || '-' ||
    lower(substr(hex(pioneer.id || ':dominator'), 17, 4)) || '-' ||
    lower(substr(hex(pioneer.id || ':dominator'), 21, 12)),
  pioneer.player_account_id,
  'DOMINATOR',
  pioneer.map_id,
  pioneer.gameplay_revision_id,
  'dominator',
  'active',
  pioneer.source_type,
  pioneer.source_id,
  pioneer.granted_by,
  pioneer.granted_at
FROM player_title_grants AS pioneer
WHERE pioneer.title_key = 'PIONEER'
  AND pioneer.map_id IS NOT NULL
  AND pioneer.gameplay_revision_id IS NOT NULL
  AND pioneer.status = 'active'
  AND NOT EXISTS (
    SELECT 1
    FROM player_title_grants AS dominator
    WHERE dominator.player_account_id = pioneer.player_account_id
      AND dominator.title_key = 'DOMINATOR'
      AND dominator.map_id = pioneer.map_id
      AND dominator.gameplay_revision_id = pioneer.gameplay_revision_id
      AND dominator.status = 'active'
  )
ON CONFLICT(source_type, source_id, title_key) DO NOTHING;

CREATE TRIGGER player_title_grants_inherit_dominator_after_pioneer_insert
AFTER INSERT ON player_title_grants
WHEN NEW.title_key = 'PIONEER'
  AND NEW.map_id IS NOT NULL
  AND NEW.gameplay_revision_id IS NOT NULL
  AND NEW.status = 'active'
  AND NOT EXISTS (
    SELECT 1
    FROM player_title_grants AS dominator
    WHERE dominator.player_account_id = NEW.player_account_id
      AND dominator.title_key = 'DOMINATOR'
      AND dominator.map_id = NEW.map_id
      AND dominator.gameplay_revision_id = NEW.gameplay_revision_id
      AND dominator.status = 'active'
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
    'DOMINATOR',
    NEW.map_id,
    NEW.gameplay_revision_id,
    'dominator',
    'active',
    NEW.source_type,
    NEW.source_id,
    NEW.granted_by,
    NEW.granted_at
  ) ON CONFLICT(source_type, source_id, title_key) DO NOTHING;

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
    'trigger:player_title_grants_inherit_dominator',
    'title_grant.inherit',
    'player_title_grant',
    id,
    json_object(
      'sourceGrantId', NEW.id,
      'titleKey', 'DOMINATOR',
      'mapId', NEW.map_id,
      'gameplayRevisionId', NEW.gameplay_revision_id,
      'sourceType', NEW.source_type,
      'sourceId', NEW.source_id,
      'reason', '开拓者称号自动继承主宰称号。'
    ),
    CAST(strftime('%s', 'now') AS INTEGER) * 1000
  FROM player_title_grants
  WHERE player_account_id = NEW.player_account_id
    AND title_key = 'DOMINATOR'
    AND map_id = NEW.map_id
    AND gameplay_revision_id = NEW.gameplay_revision_id
    AND status = 'active'
    AND source_type = NEW.source_type
    AND source_id = NEW.source_id;
END;
