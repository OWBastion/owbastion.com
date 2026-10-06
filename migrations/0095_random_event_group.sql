ALTER TABLE random_events ADD COLUMN event_group TEXT;

-- Backfill from the "组名：事件名" naming convention, only for prefixes that at least two events share.
UPDATE random_events
SET event_group = substr(name, 1, instr(name, '：') - 1)
WHERE instr(name, '：') > 1
  AND substr(name, 1, instr(name, '：') - 1) IN (
    SELECT substr(name, 1, instr(name, '：') - 1)
    FROM random_events
    WHERE instr(name, '：') > 1
    GROUP BY 1
    HAVING COUNT(*) >= 2
  );
