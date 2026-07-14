import { integer, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

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
  createdAt: integer("created_at").notNull(),
  updatedAt: integer("updated_at").notNull(),
}, (table) => ({
  player: uniqueIndex("player_accounts_player_id_idx").on(table.playerId),
}));

export const submissions = sqliteTable("submissions", {
  id: text("id").primaryKey(),
  bindingId: text("binding_id").notNull(),
  status: text("status").notNull(),
  challengeType: text("challenge_type").notNull(),
  mapName: text("map_name").notNull(),
  sourceProvider: text("source_provider").notNull(),
  sourceConversationId: text("source_conversation_id").notNull(),
  sourceMessageId: text("source_message_id").notNull(),
  createdAt: integer("created_at").notNull(),
  updatedAt: integer("updated_at").notNull(),
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
