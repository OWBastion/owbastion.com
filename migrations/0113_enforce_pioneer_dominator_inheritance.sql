-- 0113_enforce_pioneer_dominator_inheritance: a map PIONEER entitlement
-- requires Hell difficulty, so it always includes the DOMINATOR and CONQUEROR
-- entitlements for the same gameplay revision.
--
-- An administratively revoked DOMINATOR or CONQUEROR stays revoked: it is
-- neither repaired nor reissued. A revoked row from the same source (for
-- example an evidence revocation) is reactivated, as in 0075.
--
-- The 0075 trigger is recreated with the same rule: it ignored an
-- administratively revoked CONQUEROR and reissued it with every DOMINATOR.
-- Any future rebuild of player_title_grants must drop and recreate it.
--
-- The repair and the triggers share one eligibility test, so every audit row
-- written here matches a grant that is written. Triggers cover both new
-- PIONEER rows and PIONEER rows reactivated with UPDATE.

DROP TRIGGER player_title_grants_inherit_conqueror_after_dominator_insert;

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
      AND (conqueror.status = 'active' OR (conqueror.status = 'revoked' AND conqueror.revocation_type = 'administrator'))
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
    revoke_reason = NULL,
    revocation_type = NULL
  WHERE player_title_grants.status = 'revoked';

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
  'service', 'migration:0113_pioneer_dominator_inheritance', 'title_grant.inherit', 'player_title_grant', pioneer.id,
  json_object(
    'sourceGrantId', pioneer.id, 'titleKey', 'DOMINATOR', 'mapId', pioneer.map_id,
    'gameplayRevisionId', pioneer.gameplay_revision_id, 'sourceType', pioneer.source_type,
    'sourceId', pioneer.source_id, 'reason', '开拓者称号自动继承主宰称号。'
  ),
  CAST(strftime('%s', 'now') AS INTEGER) * 1000
FROM player_title_grants AS pioneer
WHERE pioneer.title_key = 'PIONEER'
  AND pioneer.map_id IS NOT NULL
  AND pioneer.gameplay_revision_id IS NOT NULL
  AND pioneer.status = 'active'
  AND NOT EXISTS (
      SELECT 1 FROM player_title_grants AS held
      WHERE held.player_account_id = pioneer.player_account_id
        AND held.title_key = 'DOMINATOR'
        AND held.map_id = pioneer.map_id
        AND held.gameplay_revision_id = pioneer.gameplay_revision_id
        AND (held.status = 'active' OR (held.status = 'revoked' AND held.revocation_type = 'administrator'))
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
  'service', 'migration:0113_pioneer_dominator_inheritance', 'title_grant.inherit', 'player_title_grant', pioneer.id,
  json_object(
    'sourceGrantId', pioneer.id, 'titleKey', 'CONQUEROR', 'mapId', pioneer.map_id,
    'gameplayRevisionId', pioneer.gameplay_revision_id, 'sourceType', pioneer.source_type,
    'sourceId', pioneer.source_id, 'reason', '开拓者称号自动继承征服者称号。'
  ),
  CAST(strftime('%s', 'now') AS INTEGER) * 1000
FROM player_title_grants AS pioneer
WHERE pioneer.title_key = 'PIONEER'
  AND pioneer.map_id IS NOT NULL
  AND pioneer.gameplay_revision_id IS NOT NULL
  AND pioneer.status = 'active'
  AND NOT EXISTS (
      SELECT 1 FROM player_title_grants AS held
      WHERE held.player_account_id = pioneer.player_account_id
        AND held.title_key = 'CONQUEROR'
        AND held.map_id = pioneer.map_id
        AND held.gameplay_revision_id = pioneer.gameplay_revision_id
        AND (held.status = 'active' OR (held.status = 'revoked' AND held.revocation_type = 'administrator'))
    );

INSERT INTO player_title_grants (
  id, player_account_id, title_key, map_id, gameplay_revision_id, slot, status,
  source_type, source_id, granted_by, granted_at
)
SELECT
  lower(substr(hex(pioneer.id || ':dominator'), 1,8)) || '-' ||
    lower(substr(hex(pioneer.id || ':dominator'), 9,4)) || '-' ||
    lower(substr(hex(pioneer.id || ':dominator'), 13,4)) || '-' ||
    lower(substr(hex(pioneer.id || ':dominator'), 17,4)) || '-' ||
    lower(substr(hex(pioneer.id || ':dominator'), 21,12)),
  pioneer.player_account_id, 'DOMINATOR', pioneer.map_id, pioneer.gameplay_revision_id, 'dominator', 'active',
  pioneer.source_type, pioneer.source_id, pioneer.granted_by, pioneer.granted_at
FROM player_title_grants AS pioneer
WHERE pioneer.title_key = 'PIONEER'
  AND pioneer.map_id IS NOT NULL
  AND pioneer.gameplay_revision_id IS NOT NULL
  AND pioneer.status = 'active'
  AND NOT EXISTS (
      SELECT 1 FROM player_title_grants AS held
      WHERE held.player_account_id = pioneer.player_account_id
        AND held.title_key = 'DOMINATOR'
        AND held.map_id = pioneer.map_id
        AND held.gameplay_revision_id = pioneer.gameplay_revision_id
        AND (held.status = 'active' OR (held.status = 'revoked' AND held.revocation_type = 'administrator'))
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
  revoke_reason = NULL,
  revocation_type = NULL
WHERE player_title_grants.status = 'revoked';

INSERT INTO player_title_grants (
  id, player_account_id, title_key, map_id, gameplay_revision_id, slot, status,
  source_type, source_id, granted_by, granted_at
)
SELECT
  lower(substr(hex(pioneer.id || ':conqueror'), 1,8)) || '-' ||
    lower(substr(hex(pioneer.id || ':conqueror'), 9,4)) || '-' ||
    lower(substr(hex(pioneer.id || ':conqueror'), 13,4)) || '-' ||
    lower(substr(hex(pioneer.id || ':conqueror'), 17,4)) || '-' ||
    lower(substr(hex(pioneer.id || ':conqueror'), 21,12)),
  pioneer.player_account_id, 'CONQUEROR', pioneer.map_id, pioneer.gameplay_revision_id, 'conqueror', 'active',
  pioneer.source_type, pioneer.source_id, pioneer.granted_by, pioneer.granted_at
FROM player_title_grants AS pioneer
WHERE pioneer.title_key = 'PIONEER'
  AND pioneer.map_id IS NOT NULL
  AND pioneer.gameplay_revision_id IS NOT NULL
  AND pioneer.status = 'active'
  AND NOT EXISTS (
      SELECT 1 FROM player_title_grants AS held
      WHERE held.player_account_id = pioneer.player_account_id
        AND held.title_key = 'CONQUEROR'
        AND held.map_id = pioneer.map_id
        AND held.gameplay_revision_id = pioneer.gameplay_revision_id
        AND (held.status = 'active' OR (held.status = 'revoked' AND held.revocation_type = 'administrator'))
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
  revoke_reason = NULL,
  revocation_type = NULL
WHERE player_title_grants.status = 'revoked';

CREATE TRIGGER player_title_grants_inherit_dominator_after_pioneer_insert
AFTER INSERT ON player_title_grants
WHEN NEW.title_key = 'PIONEER'
  AND NEW.map_id IS NOT NULL
  AND NEW.gameplay_revision_id IS NOT NULL
  AND NEW.status = 'active'
BEGIN
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
  'service', 'trigger:player_title_grants_inherit_pioneer', 'title_grant.inherit', 'player_title_grant', NEW.id,
  json_object(
    'sourceGrantId', NEW.id, 'titleKey', 'DOMINATOR', 'mapId', NEW.map_id,
    'gameplayRevisionId', NEW.gameplay_revision_id, 'sourceType', NEW.source_type,
    'sourceId', NEW.source_id, 'reason', '开拓者称号自动继承主宰称号。'
  ),
  CAST(strftime('%s', 'now') AS INTEGER) * 1000
WHERE NOT EXISTS (
      SELECT 1 FROM player_title_grants AS held
      WHERE held.player_account_id = NEW.player_account_id
        AND held.title_key = 'DOMINATOR'
        AND held.map_id = NEW.map_id
        AND held.gameplay_revision_id = NEW.gameplay_revision_id
        AND (held.status = 'active' OR (held.status = 'revoked' AND held.revocation_type = 'administrator'))
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
  'service', 'trigger:player_title_grants_inherit_pioneer', 'title_grant.inherit', 'player_title_grant', NEW.id,
  json_object(
    'sourceGrantId', NEW.id, 'titleKey', 'CONQUEROR', 'mapId', NEW.map_id,
    'gameplayRevisionId', NEW.gameplay_revision_id, 'sourceType', NEW.source_type,
    'sourceId', NEW.source_id, 'reason', '开拓者称号自动继承征服者称号。'
  ),
  CAST(strftime('%s', 'now') AS INTEGER) * 1000
WHERE NOT EXISTS (
      SELECT 1 FROM player_title_grants AS held
      WHERE held.player_account_id = NEW.player_account_id
        AND held.title_key = 'CONQUEROR'
        AND held.map_id = NEW.map_id
        AND held.gameplay_revision_id = NEW.gameplay_revision_id
        AND (held.status = 'active' OR (held.status = 'revoked' AND held.revocation_type = 'administrator'))
    );

INSERT INTO player_title_grants (
  id, player_account_id, title_key, map_id, gameplay_revision_id, slot, status,
  source_type, source_id, granted_by, granted_at
)
SELECT
  lower(hex(randomblob(4))) || '-' || lower(hex(randomblob(2))) || '-' ||
      lower(hex(randomblob(2))) || '-' || lower(hex(randomblob(2))) || '-' ||
      lower(hex(randomblob(6))),
  NEW.player_account_id, 'DOMINATOR', NEW.map_id, NEW.gameplay_revision_id, 'dominator', 'active',
  NEW.source_type, NEW.source_id, NEW.granted_by, NEW.granted_at
WHERE NOT EXISTS (
      SELECT 1 FROM player_title_grants AS held
      WHERE held.player_account_id = NEW.player_account_id
        AND held.title_key = 'DOMINATOR'
        AND held.map_id = NEW.map_id
        AND held.gameplay_revision_id = NEW.gameplay_revision_id
        AND (held.status = 'active' OR (held.status = 'revoked' AND held.revocation_type = 'administrator'))
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
  revoke_reason = NULL,
  revocation_type = NULL
WHERE player_title_grants.status = 'revoked';

INSERT INTO player_title_grants (
  id, player_account_id, title_key, map_id, gameplay_revision_id, slot, status,
  source_type, source_id, granted_by, granted_at
)
SELECT
  lower(hex(randomblob(4))) || '-' || lower(hex(randomblob(2))) || '-' ||
      lower(hex(randomblob(2))) || '-' || lower(hex(randomblob(2))) || '-' ||
      lower(hex(randomblob(6))),
  NEW.player_account_id, 'CONQUEROR', NEW.map_id, NEW.gameplay_revision_id, 'conqueror', 'active',
  NEW.source_type, NEW.source_id, NEW.granted_by, NEW.granted_at
WHERE NOT EXISTS (
      SELECT 1 FROM player_title_grants AS held
      WHERE held.player_account_id = NEW.player_account_id
        AND held.title_key = 'CONQUEROR'
        AND held.map_id = NEW.map_id
        AND held.gameplay_revision_id = NEW.gameplay_revision_id
        AND (held.status = 'active' OR (held.status = 'revoked' AND held.revocation_type = 'administrator'))
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
  revoke_reason = NULL,
  revocation_type = NULL
WHERE player_title_grants.status = 'revoked';
END;

CREATE TRIGGER player_title_grants_inherit_dominator_after_pioneer_reactivate
AFTER UPDATE OF status ON player_title_grants
WHEN NEW.title_key = 'PIONEER'
  AND NEW.map_id IS NOT NULL
  AND NEW.gameplay_revision_id IS NOT NULL
  AND NEW.status = 'active'
  AND OLD.status <> 'active'
BEGIN
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
  'service', 'trigger:player_title_grants_inherit_pioneer', 'title_grant.inherit', 'player_title_grant', NEW.id,
  json_object(
    'sourceGrantId', NEW.id, 'titleKey', 'DOMINATOR', 'mapId', NEW.map_id,
    'gameplayRevisionId', NEW.gameplay_revision_id, 'sourceType', NEW.source_type,
    'sourceId', NEW.source_id, 'reason', '开拓者称号自动继承主宰称号。'
  ),
  CAST(strftime('%s', 'now') AS INTEGER) * 1000
WHERE NOT EXISTS (
      SELECT 1 FROM player_title_grants AS held
      WHERE held.player_account_id = NEW.player_account_id
        AND held.title_key = 'DOMINATOR'
        AND held.map_id = NEW.map_id
        AND held.gameplay_revision_id = NEW.gameplay_revision_id
        AND (held.status = 'active' OR (held.status = 'revoked' AND held.revocation_type = 'administrator'))
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
  'service', 'trigger:player_title_grants_inherit_pioneer', 'title_grant.inherit', 'player_title_grant', NEW.id,
  json_object(
    'sourceGrantId', NEW.id, 'titleKey', 'CONQUEROR', 'mapId', NEW.map_id,
    'gameplayRevisionId', NEW.gameplay_revision_id, 'sourceType', NEW.source_type,
    'sourceId', NEW.source_id, 'reason', '开拓者称号自动继承征服者称号。'
  ),
  CAST(strftime('%s', 'now') AS INTEGER) * 1000
WHERE NOT EXISTS (
      SELECT 1 FROM player_title_grants AS held
      WHERE held.player_account_id = NEW.player_account_id
        AND held.title_key = 'CONQUEROR'
        AND held.map_id = NEW.map_id
        AND held.gameplay_revision_id = NEW.gameplay_revision_id
        AND (held.status = 'active' OR (held.status = 'revoked' AND held.revocation_type = 'administrator'))
    );

INSERT INTO player_title_grants (
  id, player_account_id, title_key, map_id, gameplay_revision_id, slot, status,
  source_type, source_id, granted_by, granted_at
)
SELECT
  lower(hex(randomblob(4))) || '-' || lower(hex(randomblob(2))) || '-' ||
      lower(hex(randomblob(2))) || '-' || lower(hex(randomblob(2))) || '-' ||
      lower(hex(randomblob(6))),
  NEW.player_account_id, 'DOMINATOR', NEW.map_id, NEW.gameplay_revision_id, 'dominator', 'active',
  NEW.source_type, NEW.source_id, NEW.granted_by, NEW.granted_at
WHERE NOT EXISTS (
      SELECT 1 FROM player_title_grants AS held
      WHERE held.player_account_id = NEW.player_account_id
        AND held.title_key = 'DOMINATOR'
        AND held.map_id = NEW.map_id
        AND held.gameplay_revision_id = NEW.gameplay_revision_id
        AND (held.status = 'active' OR (held.status = 'revoked' AND held.revocation_type = 'administrator'))
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
  revoke_reason = NULL,
  revocation_type = NULL
WHERE player_title_grants.status = 'revoked';

INSERT INTO player_title_grants (
  id, player_account_id, title_key, map_id, gameplay_revision_id, slot, status,
  source_type, source_id, granted_by, granted_at
)
SELECT
  lower(hex(randomblob(4))) || '-' || lower(hex(randomblob(2))) || '-' ||
      lower(hex(randomblob(2))) || '-' || lower(hex(randomblob(2))) || '-' ||
      lower(hex(randomblob(6))),
  NEW.player_account_id, 'CONQUEROR', NEW.map_id, NEW.gameplay_revision_id, 'conqueror', 'active',
  NEW.source_type, NEW.source_id, NEW.granted_by, NEW.granted_at
WHERE NOT EXISTS (
      SELECT 1 FROM player_title_grants AS held
      WHERE held.player_account_id = NEW.player_account_id
        AND held.title_key = 'CONQUEROR'
        AND held.map_id = NEW.map_id
        AND held.gameplay_revision_id = NEW.gameplay_revision_id
        AND (held.status = 'active' OR (held.status = 'revoked' AND held.revocation_type = 'administrator'))
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
  revoke_reason = NULL,
  revocation_type = NULL
WHERE player_title_grants.status = 'revoked';
END;
