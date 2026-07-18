ALTER TABLE title_catalog ADD COLUMN icon TEXT NOT NULL DEFAULT 'award';

UPDATE title_catalog SET icon = CASE
  WHEN key IN ('PIONEER', 'CONQUEROR', 'DOMINATOR', 'ALL_IN_ONE', 'TRAVELER', 'SKY') THEN 'trophy'
  WHEN category = '难度挑战系列' THEN 'shield-check'
  WHEN category = '极限操作系列' THEN 'zap'
  WHEN category = '生存与闪避系列' THEN 'heart-pulse'
  WHEN category = '随机事件系列' OR category = '赌徒系列' THEN 'dices'
  WHEN category = '活动限定' THEN 'sparkles'
  WHEN category = '社区贡献系列' THEN 'users'
  WHEN category = '开发保留' THEN 'wrench'
  ELSE 'award'
END;
