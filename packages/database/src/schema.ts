import { integer, primaryKey, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

export const identities = sqliteTable("identities", {
  id: text("id").primaryKey(),
  createdAt: integer("created_at").notNull(),
  updatedAt: integer("updated_at").notNull(),
});

export const bindings = sqliteTable("bindings", {
  id: text("id").primaryKey(),
  identityId: text("identity_id").notNull(),
  playerAccountId: text("player_account_id").notNull(),
  provider: text("provider").notNull(),
  groupOpenId: text("group_open_id").notNull(),
  memberOpenId: text("member_open_id").notNull(),
  createdAt: integer("created_at").notNull(),
}, (table) => ({
  providerExternalUser: uniqueIndex("bindings_provider_group_member_idx").on(table.provider, table.groupOpenId, table.memberOpenId),
}));

export const playerAccounts = sqliteTable("player_accounts", {
  id: text("id").primaryKey(),
  playerId: text("player_id").notNull(),
  playerName: text("player_name").notNull(),
  normalizedPlayerName: text("normalized_player_name").notNull(),
  isAdmin: integer("is_admin").notNull().default(0),
  status: text("status").notNull().default("active"),
  bannedAt: integer("banned_at"),
  bannedBy: text("banned_by"),
  banReason: text("ban_reason"),
  createdAt: integer("created_at").notNull(),
  updatedAt: integer("updated_at").notNull(),
}, (table) => ({
  battleTag: uniqueIndex("player_accounts_battletag_idx").on(table.normalizedPlayerName, table.playerId),
}));

export const maps = sqliteTable("maps", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  gameVersion: text("game_version").notNull(),
  status: text("status").notNull(),
  introducedVersion: text("introduced_version").notNull(),
  retiredVersion: text("retired_version"),
  createdAt: integer("created_at").notNull(),
  updatedAt: integer("updated_at").notNull(),
});

export const titleCatalog = sqliteTable("title_catalog", {
  key: text("key").primaryKey(),
  label: text("label").notNull(),
  category: text("category").notNull(),
  condition: text("condition").notNull(),
  availability: text("availability").notNull(),
  scope: text("scope").notNull(),
  displayKind: text("display_kind").notNull(),
  gameVersion: text("game_version").notNull(),
});

export const mapTitleRewards = sqliteTable("map_title_rewards", {
  mapId: text("map_id").notNull().references(() => maps.id),
  slot: text("slot").notNull(),
  titleKey: text("title_key").notNull().references(() => titleCatalog.key),
  pioneerPrefixesJson: text("pioneer_prefixes_json").notNull(),
}, (table) => ({
  mapSlot: primaryKey({ columns: [table.mapId, table.slot] }),
  mapTitle: uniqueIndex("map_title_rewards_map_title_idx").on(table.mapId, table.titleKey),
}));

export const historicalTitleGrants = sqliteTable("historical_title_grants", {
  id: text("id").primaryKey(),
  scope: text("scope").notNull(),
  mapId: text("map_id").references(() => maps.id),
  slot: text("slot"),
  titleKey: text("title_key").notNull().references(() => titleCatalog.key),
  holderName: text("holder_name").notNull(),
  sourceVersion: text("source_version").notNull(),
}, (table) => ({
  holder: uniqueIndex("historical_title_grants_holder_idx").on(table.scope, table.mapId, table.slot, table.titleKey, table.holderName),
}));

export const achievementChallenges = sqliteTable("achievement_challenges", {
  id: text("id").primaryKey(),
  mapId: text("map_id").notNull(),
  type: text("type").notNull(),
  name: text("name").notNull(),
  difficulty: text("difficulty"),
  gameVersion: text("game_version").notNull(),
  status: text("status").notNull(),
  introducedVersion: text("introduced_version").notNull(),
  retiredVersion: text("retired_version"),
  createdAt: integer("created_at").notNull(),
  updatedAt: integer("updated_at").notNull(),
});

export const playerTitleGrants = sqliteTable("player_title_grants", {
  id: text("id").primaryKey(),
  playerAccountId: text("player_account_id").notNull().references(() => playerAccounts.id),
  historicalTitleGrantId: text("historical_title_grant_id").notNull().references(() => historicalTitleGrants.id),
  status: text("status").notNull(),
  grantedBy: text("granted_by").notNull(),
  grantedAt: integer("granted_at").notNull(),
  revokedBy: text("revoked_by"),
  revokedAt: integer("revoked_at"),
  revokeReason: text("revoke_reason"),
});

export const titleChallenges = sqliteTable("title_challenges", {
  id: text("id").primaryKey(),
  titleKey: text("title_key").notNull().references(() => titleCatalog.key),
  categoryOverride: text("category_override"),
  condition: text("condition").notNull(),
  evidenceRule: text("evidence_rule").notNull(),
  submissionMode: text("submission_mode").notNull(),
  gameVersion: text("game_version").notNull(),
  status: text("status").notNull(),
  introducedVersion: text("introduced_version").notNull(),
  retiredVersion: text("retired_version"),
  createdAt: integer("created_at").notNull(),
  updatedAt: integer("updated_at").notNull(),
});

export const submissions = sqliteTable("submissions", {
  id: text("id").primaryKey(),
  bindingId: text("binding_id").notNull(),
  status: text("status").notNull(),
  challengeType: text("challenge_type").notNull(),
  challengeId: text("challenge_id"),
  mapName: text("map_name").notNull(),
  difficulty: text("difficulty"),
  playerName: text("player_name"),
  reviewReason: text("review_reason"),
  sourceProvider: text("source_provider").notNull(),
  sourceConversationId: text("source_conversation_id").notNull(),
  sourceMessageId: text("source_message_id").notNull(),
  createdAt: integer("created_at").notNull(),
  updatedAt: integer("updated_at").notNull(),
});

export const uploadSessions = sqliteTable("upload_sessions", {
  id: text("id").primaryKey(),
  submissionId: text("submission_id").notNull(),
  playerAccountId: text("player_account_id").notNull(),
  contentType: text("content_type").notNull(),
  byteSize: integer("byte_size").notNull(),
  sha256: text("sha256").notNull(),
  objectKey: text("object_key").notNull(),
  status: text("status").notNull(),
  expiresAt: integer("expires_at").notNull(),
  createdAt: integer("created_at").notNull(),
});

export const ocrResults = sqliteTable("ocr_results", {
  id: text("id").primaryKey(),
  submissionId: text("submission_id").notNull(),
  attempt: integer("attempt").notNull(),
  status: text("status").notNull(),
  responseJson: text("response_json"),
  matchJson: text("match_json"),
  errorCode: text("error_code"),
  createdAt: integer("created_at").notNull(),
});

export const submissionReviews = sqliteTable("submission_reviews", {
  id: text("id").primaryKey(),
  submissionId: text("submission_id").notNull(),
  decision: text("decision").notNull(),
  reason: text("reason").notNull(),
  reviewer: text("reviewer").notNull(),
  createdAt: integer("created_at").notNull(),
});

export const attachments = sqliteTable("attachments", {
  id: text("id").primaryKey(),
  submissionId: text("submission_id").notNull(),
  provider: text("provider").notNull(),
  externalAttachmentId: text("external_attachment_id").notNull(),
  contentType: text("content_type").notNull(),
  byteSize: integer("byte_size"),
  sha256: text("sha256"),
  objectKey: text("object_key"),
  uploadStatus: text("upload_status").notNull(),
  createdAt: integer("created_at").notNull(),
});

export const idempotencyKeys = sqliteTable("idempotency_keys", {
  id: text("id").primaryKey(),
  actorId: text("actor_id").notNull(),
  operation: text("operation").notNull(),
  requestHash: text("request_hash").notNull(),
  responseJson: text("response_json").notNull(),
  createdAt: integer("created_at").notNull(),
});

export const auditEvents = sqliteTable("audit_events", {
  id: text("id").primaryKey(),
  correlationId: text("correlation_id").notNull(),
  actorType: text("actor_type").notNull(),
  actorId: text("actor_id").notNull(),
  operation: text("operation").notNull(),
  entityType: text("entity_type").notNull(),
  entityId: text("entity_id").notNull(),
  payloadJson: text("payload_json").notNull(),
  createdAt: integer("created_at").notNull(),
});

export const qqGroupAccess = sqliteTable("qq_group_access", {
  groupOpenId: text("group_open_id").primaryKey(),
  environment: text("environment").notNull(),
  enabled: integer("enabled").notNull(),
  createdAt: integer("created_at").notNull(),
  updatedAt: integer("updated_at").notNull(),
});

export const qqLoginAttempts = sqliteTable("qq_login_attempts", {
  id: text("id").primaryKey(),
  tokenHash: text("token_hash").notNull(),
  codeHash: text("code_hash").notNull(),
  status: text("status").notNull(),
  groupOpenId: text("group_open_id"),
  memberOpenId: text("member_open_id"),
  environment: text("environment"),
  messageId: text("message_id"),
  sessionTokenHash: text("session_token_hash"),
  sessionIssuedAt: integer("session_issued_at"),
  expiresAt: integer("expires_at").notNull(),
  createdAt: integer("created_at").notNull(),
  verifiedAt: integer("verified_at"),
});

export const qqSessions = sqliteTable("qq_sessions", {
  id: text("id").primaryKey(),
  attemptId: text("attempt_id").notNull(),
  groupOpenId: text("group_open_id").notNull(),
  memberOpenId: text("member_open_id").notNull(),
  environment: text("environment").notNull(),
  tokenHash: text("token_hash").notNull(),
  expiresAt: integer("expires_at").notNull(),
  createdAt: integer("created_at").notNull(),
});
