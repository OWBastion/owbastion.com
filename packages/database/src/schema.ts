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
  status: text("status").notNull().default("active"),
  revokedAt: integer("revoked_at"),
  revokedBy: text("revoked_by"),
  createdAt: integer("created_at").notNull(),
}, (table) => ({
  providerExternalUser: uniqueIndex("bindings_provider_member_idx").on(table.provider, table.memberOpenId),
}));

export const bindingInvites = sqliteTable("binding_invites", {
  id: text("id").primaryKey(), codeHash: text("code_hash").notNull(), codeCiphertext: text("code_ciphertext"), playerName: text("player_name").notNull(), normalizedPlayerName: text("normalized_player_name").notNull(), playerId: text("player_id").notNull(), createdBy: text("created_by").notNull(), createdAt: integer("created_at").notNull(), expiresAt: integer("expires_at").notNull(), redeemedAt: integer("redeemed_at"), revokedAt: integer("revoked_at"), revokedBy: text("revoked_by"),
}, (table) => ({ code: uniqueIndex("binding_invites_code_idx").on(table.codeHash) }));

export const bindingClaims = sqliteTable("binding_claims", {
  id: text("id").primaryKey(), inviteId: text("invite_id").notNull().references(() => bindingInvites.id), tokenHash: text("token_hash").notNull(), codeHash: text("code_hash").notNull(), playerName: text("player_name").notNull(), normalizedPlayerName: text("normalized_player_name").notNull(), playerId: text("player_id").notNull(), status: text("status").notNull(), memberOpenId: text("member_open_id"), groupOpenId: text("group_open_id"), messageId: text("message_id"), expiresAt: integer("expires_at").notNull(), createdAt: integer("created_at").notNull(), verifiedAt: integer("verified_at"), decidedAt: integer("decided_at"), decidedBy: text("decided_by"), decisionReason: text("decision_reason"),
}, (table) => ({ code: uniqueIndex("binding_claims_code_idx").on(table.codeHash) }));

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

export const mapMetadata = sqliteTable("map_metadata", {
  mapId: text("map_id").primaryKey().references(() => maps.id),
  difficultyRating: text("difficulty_rating"),
  mechanicsJson: text("mechanics_json").notNull().default("[]"),
  coverUrl: text("cover_url"),
  backgroundUrl: text("background_url"),
  updatedAt: integer("updated_at").notNull(),
  updatedBy: text("updated_by").notNull(),
});

export const randomEvents = sqliteTable("random_events", {
  id: text("id").primaryKey(), name: text("name").notNull(), category: text("category").notNull(), rarity: text("rarity").notNull(),
  description: text("description").notNull(), durationSeconds: integer("duration_seconds"), cooldownSeconds: integer("cooldown_seconds"), weight: integer("weight", { mode: "number" }),
  appearanceProbability: integer("appearance_probability", { mode: "number" }), categoryProbability: integer("category_probability", { mode: "number" }), groupTotalWeight: integer("group_total_weight", { mode: "number" }), groupSize: integer("group_size"), failureProbability: integer("failure_probability", { mode: "number" }), guaranteeProbability: integer("guarantee_probability", { mode: "number" }), globalAppearanceProbability: integer("global_appearance_probability", { mode: "number" }), gameVersion: text("game_version").notNull(), effectTagsJson: text("effect_tags_json").notNull().default("[]"),
  releaseStatus: text("release_status").notNull(), archivedAt: integer("archived_at"), archivedBy: text("archived_by"), createdAt: integer("created_at").notNull(), updatedAt: integer("updated_at").notNull(),
});
export const randomEventMapChallenges = sqliteTable("random_event_map_challenges", { eventId: text("event_id").notNull().references(() => randomEvents.id), challengeId: text("challenge_id").notNull().references(() => achievementChallenges.id) }, (table) => ({ primary: primaryKey({ columns: [table.eventId, table.challengeId] }) }));
export const randomEventTitleChallenges = sqliteTable("random_event_title_challenges", { eventId: text("event_id").notNull().references(() => randomEvents.id), challengeId: text("challenge_id").notNull().references(() => titleChallenges.id) }, (table) => ({ primary: primaryKey({ columns: [table.eventId, table.challengeId] }) }));
export const randomEventImports = sqliteTable("random_event_imports", { id: text("id").primaryKey(), sourceHash: text("source_hash").notNull(), fileName: text("file_name").notNull(), rowCount: integer("row_count").notNull(), importedBy: text("imported_by").notNull(), importedAt: integer("imported_at").notNull() });

export const titleCatalog = sqliteTable("title_catalog", {
  key: text("key").primaryKey(),
  label: text("label").notNull(),
  icon: text("icon").notNull().default("award"),
  iconUrl: text("icon_url"),
  iconObjectKey: text("icon_object_key"),
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

export const catalogImports = sqliteTable("catalog_imports", {
  id: text("id").primaryKey(),
  sourceVersion: text("source_version").notNull(),
  snapshotHash: text("snapshot_hash").notNull(),
  status: text("status").notNull(),
  rowCountsJson: text("row_counts_json").notNull(),
  importedAt: integer("imported_at").notNull(),
}, (table) => ({
  sourceVersion: uniqueIndex("catalog_imports_source_version_idx").on(table.sourceVersion),
  snapshotHash: uniqueIndex("catalog_imports_snapshot_hash_idx").on(table.snapshotHash),
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
  startsAt: integer("starts_at"),
  endsAt: integer("ends_at"),
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
  reason: text("reason"),
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
  displayName: text("display_name").notNull().default(""),
  environment: text("environment").notNull(),
  status: text("status").notNull().default("pending"),
  bindEnabled: integer("bind_enabled").notNull().default(0),
  verifyEnabled: integer("verify_enabled").notNull().default(0),
  lifecycleOccurredAt: integer("lifecycle_occurred_at").notNull().default(0),
  createdAt: integer("created_at").notNull(),
  updatedAt: integer("updated_at").notNull(),
});

export const qqGroupPolicyOutbox = sqliteTable("qq_group_policy_outbox", {
  id: text("id").primaryKey(),
  createdAt: integer("created_at").notNull(),
  enqueuedAt: integer("enqueued_at"),
  deliveredAt: integer("delivered_at"),
});

export const qqLoginAttempts = sqliteTable("qq_login_attempts", {
  id: text("id").primaryKey(),
  tokenHash: text("token_hash").notNull(),
  codeHash: text("code_hash").notNull(),
  status: text("status").notNull(),
  purpose: text("purpose").notNull().default("login"),
  playerAccountId: text("player_account_id"),
  targetGroupOpenId: text("target_group_open_id"),
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
