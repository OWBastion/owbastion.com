-- 0071_repair_pioneer_map_title_scope: re-apply the Pioneer scope invariant
-- for environments where the original data-repair migration was skipped or
-- the legacy value was restored after deployment.

UPDATE map_title_rules
SET default_scope = 'explicit',
    updated_at = CAST(strftime('%s', 'now') AS INTEGER) * 1000
WHERE lower(trim(kind)) = 'pioneer'
  AND default_scope <> 'explicit';
