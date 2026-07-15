INSERT OR IGNORE INTO identities (id, created_at, updated_at) VALUES
  ('00000000-0000-4000-8000-000000000001', 1700000000000, 1700000000000),
  ('00000000-0000-4000-8000-000000000002', 1700000000000, 1700000000000);

INSERT OR IGNORE INTO player_accounts (id, player_id, player_name, normalized_player_name, status, is_admin, created_at, updated_at) VALUES
  ('00000000-0000-4000-8000-000000000101', 'local-player', '本地玩家', '本地玩家', 'active', 0, 1700000000000, 1700000000000),
  ('00000000-0000-4000-8000-000000000102', 'local-admin', '本地管理员', '本地管理员', 'active', 1, 1700000000000, 1700000000000);

UPDATE player_accounts SET is_admin = 1 WHERE player_id = 'local-admin';

INSERT OR IGNORE INTO bindings (id, identity_id, player_account_id, provider, group_open_id, member_open_id, created_at) VALUES
  ('00000000-0000-4000-8000-000000000201', '00000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000101', 'qq', 'local-test-group', 'local-test-member', 1700000000000),
  ('00000000-0000-4000-8000-000000000202', '00000000-0000-4000-8000-000000000002', '00000000-0000-4000-8000-000000000102', 'qq', 'local-test-group', 'local-admin-member', 1700000000000);

INSERT OR IGNORE INTO qq_group_access (group_open_id, environment, enabled, created_at, updated_at) VALUES
  ('local-test-group', 'test', 1, 1700000000000, 1700000000000);

INSERT OR IGNORE INTO submissions (id, binding_id, status, challenge_type, map_name, source_provider, source_conversation_id, source_message_id, created_at, updated_at) VALUES
  ('00000000-0000-4000-8000-000000000301', '00000000-0000-4000-8000-000000000201', 'received', 'map_completion', '国王大道', 'qq', 'local-test-group', 'local-message-301', 1700000001000, 1700000001000),
  ('00000000-0000-4000-8000-000000000302', '00000000-0000-4000-8000-000000000201', 'evidence_pending', 'map_completion', '新渣客城', 'qq', 'local-test-group', 'local-message-302', 1700000002000, 1700000002000),
  ('00000000-0000-4000-8000-000000000303', '00000000-0000-4000-8000-000000000201', 'evidence_stored', 'map_completion', '渣客镇', 'qq', 'local-test-group', 'local-message-303', 1700000003000, 1700000003000),
  ('00000000-0000-4000-8000-000000000304', '00000000-0000-4000-8000-000000000201', 'ocr_pending', 'map_completion', '努巴尼', 'qq', 'local-test-group', 'local-message-304', 1700000004000, 1700000004000),
  ('00000000-0000-4000-8000-000000000305', '00000000-0000-4000-8000-000000000201', 'resubmission_required', 'map_completion', '艾兴瓦尔德', 'qq', 'local-test-group', 'local-message-305', 1700000005000, 1700000005000);
