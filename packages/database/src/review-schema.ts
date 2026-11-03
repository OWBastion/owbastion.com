import { index, integer, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";
import { sql } from "drizzle-orm";
import { gameplayRevisions, playerAccounts } from "./schema";

export const reviewImports = sqliteTable("review_imports", {
  id: text("id").primaryKey(),
  sourceHash: text("source_hash").notNull().unique(),
  fileName: text("file_name").notNull(),
  rowCount: integer("row_count").notNull(),
  importedBy: text("imported_by").notNull(),
  importedAt: integer("imported_at").notNull(),
});

export const reviews = sqliteTable("reviews", {
  id: text("id").primaryKey(),
  playerAccountId: text("player_account_id").references(() => playerAccounts.id),
  importId: text("import_id").references(() => reviewImports.id),
  sourceLabel: text("source_label"),
  targetType: text("target_type").notNull(),
  targetId: text("target_id").notNull(),
  gameplayRevisionId: text("gameplay_revision_id").references(() => gameplayRevisions.id),
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
  playerEventIdx: uniqueIndex("reviews_player_event_idx").on(table.playerAccountId, table.targetId).where(sql`${table.targetType} = 'event'`),
  playerLegacyMapIdx: uniqueIndex("reviews_player_legacy_map_idx").on(table.playerAccountId, table.targetId).where(sql`${table.targetType} = 'map' AND ${table.gameplayRevisionId} IS NULL`),
  playerMapRevisionIdx: uniqueIndex("reviews_player_map_revision_idx").on(table.playerAccountId, table.targetId, table.gameplayRevisionId).where(sql`${table.targetType} = 'map' AND ${table.gameplayRevisionId} IS NOT NULL`),
  importEventIdx: uniqueIndex("reviews_import_event_idx").on(table.importId, table.sourceLabel, table.targetId).where(sql`${table.importId} IS NOT NULL`),
  targetStatusIdx: index("reviews_target_status_idx").on(table.targetType, table.targetId, table.gameplayRevisionId, table.status),
}));
