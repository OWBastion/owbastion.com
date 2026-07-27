ALTER TABLE achievement_challenges ADD COLUMN condition TEXT NOT NULL DEFAULT '完成对应地图挑战。';
ALTER TABLE achievement_challenges ADD COLUMN evidence_rule TEXT NOT NULL DEFAULT '上传包含结算画面、地图、难度与玩家信息的完整截图。';
ALTER TABLE achievement_challenges ADD COLUMN submission_mode TEXT NOT NULL DEFAULT 'manual';

UPDATE achievement_challenges
SET condition = name || '。';
