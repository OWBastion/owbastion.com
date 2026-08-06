import { sql } from "drizzle-orm";
import { index, integer, primaryKey, real, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

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
}, (table) => ({
  code: uniqueIndex("binding_claims_code_idx").on(table.codeHash),
  activeInvite: uniqueIndex("binding_claims_active_invite_idx").on(table.inviteId).where(sql`status = 'pending_confirmation'`),
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
  description: text("description").notNull(), durationSeconds: integer("duration_seconds"), cooldownSeconds: real("cooldown_seconds"), weight: real("weight"),
  gameVersion: text("game_version").notNull(), effectTagsJson: text("effect_tags_json").notNull().default("[]"),
  releaseStatus: text("release_status").notNull(), archivedAt: integer("archived_at"), archivedBy: text("archived_by"), createdAt: integer("created_at").notNull(), updatedAt: integer("updated_at").notNull(),
});
export const effectGlossaryTerms = sqliteTable("effect_glossary_terms", {
  key: text("key").primaryKey(), nameZh: text("name_zh").notNull(), aliasesJson: text("aliases_json").notNull().default("[]"), category: text("category").notNull(), summary: text("summary").notNull(), definition: text("definition").notNull(), rulesJson: text("rules_json").notNull().default("[]"), sourceVersion: text("source_version").notNull(), updatedAt: integer("updated_at").notNull(),
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
  colorJson: text("color_json").notNull().default("null"),
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

// Reusable map title rule entity. One row per rule kind (e.g. conqueror).
// Replaces per-map duplication in achievement_challenges as the authoritative
// source for conditions, reward slot, display strategy, and lifecycle.
export const mapTitleRules = sqliteTable("map_title_rules", {
  id: text("id").primaryKey(),
  titleKey: text("title_key").notNull().references(() => titleCatalog.key),
  kind: text("kind").notNull(),
  condition: text("condition").notNull(),
  evidenceRule: text("evidence_rule").notNull(),
  submissionMode: text("submission_mode").notNull().default("manual"),
  displayKind: text("display_kind").notNull(),
  // slot persisted at rule level; null means no named slot (custom map titles).
  slot: text("slot"),
  mapVariant: text("map_variant"),
  // all_active: projects to every active map; explicit: only via exceptions.
  defaultScope: text("default_scope").notNull().default("all_active"),
  status: text("status").notNull().default("active"),
  introducedVersion: text("introduced_version").notNull(),
  retiredVersion: text("retired_version"),
  createdAt: integer("created_at").notNull(),
  updatedAt: integer("updated_at").notNull(),
}, (table) => ({
  kindIdx: uniqueIndex("map_title_rules_kind_idx").on(table.kind),
  titleKeyIdx: uniqueIndex("map_title_rules_title_key_idx").on(table.titleKey),
}));

// Optional per-(ruleId, mapId) overrides.
// enabled=0: disabled exception — removes the projection for this map.
// enabled=1: active exception — override fields win over rule defaults.
// title_key and display_kind cannot be overridden by an exception.
export const mapTitleRuleExceptions = sqliteTable("map_title_rule_exceptions", {
  id: text("id").primaryKey(),
  ruleId: text("rule_id").notNull().references(() => mapTitleRules.id),
  mapId: text("map_id").notNull().references(() => maps.id),
  enabled: integer("enabled").notNull().default(1),
  condition: text("condition"),
  evidenceRule: text("evidence_rule"),
  submissionMode: text("submission_mode"),
  slot: text("slot"),
  createdAt: integer("created_at").notNull(),
  updatedAt: integer("updated_at").notNull(),
}, (table) => ({
  ruleMapIdx: uniqueIndex("map_title_rule_exceptions_rule_map_idx").on(table.ruleId, table.mapId),
}));

// Compatibility mapping: retains legacy map.<mapId>.<kind> IDs.
// is_standard_instance=1: template projection (old per-map duplication).
// is_standard_instance=0: genuine map-specific exception.
export const mapTitleRuleCompat = sqliteTable("map_title_rule_compat", {
  legacyChallengeId: text("legacy_challenge_id").notNull(),
  ruleId: text("rule_id").notNull().references(() => mapTitleRules.id),
  mapId: text("map_id").notNull().references(() => maps.id),
  isStandardInstance: integer("is_standard_instance").notNull().default(1),
  createdAt: integer("created_at").notNull(),
}, (table) => ({
  legacyChallengeMap: primaryKey({ columns: [table.legacyChallengeId, table.mapId] }),
  ruleMapIdx: uniqueIndex("map_title_rule_compat_rule_map_idx").on(table.ruleId, table.mapId),
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

export const bindingInviteHistoricalTitleGrants = sqliteTable("binding_invite_historical_title_grants", {
  id: text("id").primaryKey(),
  inviteId: text("invite_id").notNull().references(() => bindingInvites.id),
  historicalTitleGrantId: text("historical_title_grant_id").notNull().references(() => historicalTitleGrants.id),
  authorizedBy: text("authorized_by").notNull(),
  status: text("status").notNull().default("authorized"),
  playerTitleGrantId: text("player_title_grant_id"),
  lastError: text("last_error"),
  createdAt: integer("created_at").notNull(),
  processedAt: integer("processed_at"),
}, (table) => ({
  inviteGrant: uniqueIndex("binding_invite_historical_title_grants_invite_grant_idx").on(table.inviteId, table.historicalTitleGrantId),
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
  condition: text("condition").notNull(),
  evidenceRule: text("evidence_rule").notNull(),
  submissionMode: text("submission_mode").notNull(),
  rewardTitleKey: text("reward_title_key").references(() => titleCatalog.key),
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
  titleKey: text("title_key").notNull().references(() => titleCatalog.key),
  mapId: text("map_id").references(() => maps.id),
  slot: text("slot"),
  status: text("status").notNull(),
  sourceType: text("source_type").notNull(),
  sourceId: text("source_id").notNull(),
  grantedBy: text("granted_by").notNull(),
  grantedAt: integer("granted_at").notNull(),
  revokedBy: text("revoked_by"),
  revokedAt: integer("revoked_at"),
  revokeReason: text("revoke_reason"),
}, (table) => ({
  sourceIdx: uniqueIndex("player_title_grants_source_idx").on(table.sourceType, table.sourceId),
}));

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
  scope: text("scope").notNull().default("global"),
  mapVariant: text("map_variant"),
  createdAt: integer("created_at").notNull(),
  updatedAt: integer("updated_at").notNull(),
});

export const achievementChallengeMaps = sqliteTable("achievement_challenge_maps", {
  challengeId: text("challenge_id").notNull().references(() => titleChallenges.id, { onDelete: "cascade" }),
  mapId: text("map_id").notNull().references(() => maps.id, { onDelete: "cascade" }),
}, (table) => ({
  primary: primaryKey({ columns: [table.challengeId, table.mapId] }),
  mapIdx: uniqueIndex("achievement_challenge_maps_map_challenge_idx").on(table.mapId, table.challengeId),
}));

export const submissions = sqliteTable("submissions", {
  id: text("id").primaryKey(),
  bindingId: text("binding_id").notNull(),
  status: text("status").notNull(),
  challengeType: text("challenge_type").notNull(),
  challengeId: text("challenge_id"),
  targetMapId: text("target_map_id").references(() => maps.id),
  mapName: text("map_name").notNull(),
  difficulty: text("difficulty"),
  playerName: text("player_name"),
  reviewReason: text("review_reason"),
  grantId: text("grant_id"),
  ocrFailCount: integer("ocr_fail_count").notNull().default(0),
  // Immutable JSON snapshot persisted at upload-session creation for rule-based
  // submissions. Null for all legacy rows. Review and grant paths must read
  // this snapshot; they must not perform a live rule lookup when not null.
  ruleSnapshotJson: text("rule_snapshot_json"),
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
  requestId: text("request_id"),
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
}, (table) => ({
  submissionIdIdx: uniqueIndex("submission_reviews_submission_id_idx").on(table.submissionId),
}));

export const submissionSpotChecks = sqliteTable("submission_spot_checks", {
  id: text("id").primaryKey(),
  submissionId: text("submission_id").notNull(),
  status: text("status").notNull(),
  policyJson: text("policy_json").notNull(),
  sampledAt: integer("sampled_at").notNull(),
  resolvedAt: integer("resolved_at"),
  reviewer: text("reviewer"),
  reason: text("reason"),
}, (table) => ({ submissionIdIdx: uniqueIndex("submission_spot_checks_submission_id_idx").on(table.submissionId) }));

export const reviews = sqliteTable("reviews", {
  id: text("id").primaryKey(),
  playerAccountId: text("player_account_id").notNull().references(() => playerAccounts.id),
  targetType: text("target_type").notNull(),
  targetId: text("target_id").notNull(),
  rating: integer("rating").notNull(),
  comment: text("comment"),
  commentStatus: text("comment_status").notNull().default("visible"),
  anonymous: integer("anonymous").notNull().default(0),
  status: text("status").notNull().default("active"),
  createdAt: integer("created_at").notNull(),
  updatedAt: integer("updated_at").notNull(),
  withdrawnAt: integer("withdrawn_at"),
  invalidatedAt: integer("invalidated_at"),
  invalidatedBy: text("invalidated_by"),
  invalidationReason: text("invalidation_reason"),
}, (table) => ({
  playerTargetIdx: uniqueIndex("reviews_player_target_idx").on(table.playerAccountId, table.targetType, table.targetId),
  targetStatusIdx: index("reviews_target_status_idx").on(table.targetType, table.targetId, table.status),
}));

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
  requestId: text("request_id"),
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
