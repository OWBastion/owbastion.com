-- 0073_repair_paraiso_reset_title_grants: remove all map-title state copied
-- onto the current Paraiso reset revision while preserving prior history.

UPDATE gameplay_revision_challenge_assignments
SET enabled = 0,
    updated_at = CAST(strftime('%s', 'now') AS INTEGER) * 1000
WHERE gameplay_revision_id = (
    SELECT id
    FROM gameplay_revisions
    WHERE map_id = 'map.paraiso' AND lifecycle = 'default'
  )
  AND challenge_family IN ('map_title_rule', 'title_challenge')
  AND challenge_id IN (SELECT id FROM map_title_rules)
  AND enabled = 1;

UPDATE player_title_grants
SET status = 'revoked',
    revoked_by = 'migration:0073_paraiso_reset_title_grants',
    revoked_at = CAST(strftime('%s', 'now') AS INTEGER) * 1000,
    revoke_reason = '帕拉伊苏重置后的当前 revision 不继承旧地图称号数据。'
WHERE map_id = 'map.paraiso'
  AND gameplay_revision_id = (
    SELECT id
    FROM gameplay_revisions
    WHERE map_id = 'map.paraiso' AND lifecycle = 'default'
  )
  AND title_key IN ('PIONEER', 'CONQUEROR', 'DOMINATOR')
  AND status = 'active';

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
  'migration:0073_paraiso_reset_title_grants',
  'title_grant.revoke',
  'player_title_grant',
  grant_row.id,
  json_object(
    'mapId', 'map.paraiso',
    'gameplayRevisionId', grant_row.gameplay_revision_id,
    'titleKey', grant_row.title_key,
    'reason', '帕拉伊苏重置后的当前 revision 不继承旧地图称号数据。'
  ),
  CAST(strftime('%s', 'now') AS INTEGER) * 1000
FROM player_title_grants AS grant_row
WHERE grant_row.map_id = 'map.paraiso'
  AND grant_row.gameplay_revision_id = (
    SELECT id
    FROM gameplay_revisions
    WHERE map_id = 'map.paraiso' AND lifecycle = 'default'
  )
  AND grant_row.title_key IN ('PIONEER', 'CONQUEROR', 'DOMINATOR')
  AND grant_row.status = 'revoked'
  AND grant_row.revoked_by = 'migration:0073_paraiso_reset_title_grants';
