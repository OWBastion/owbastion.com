import { index, integer, primaryKey, sqliteTable, text } from "drizzle-orm/sqlite-core";
import { sql } from "drizzle-orm";

export const qqChangelogPushes = sqliteTable("qq_changelog_pushes", {
  version: text("version").notNull(),
  groupOpenId: text("group_open_id").notNull(),
  generation: integer("generation").notNull(),
  idempotencyKey: text("idempotency_key").notNull(),
  markdown: text("markdown").notNull(),
  status: text("status").notNull(),
  retryable: integer("retryable"),
  errorCode: text("error_code"),
  requestedBy: text("requested_by").notNull(),
  createdAt: integer("created_at").notNull(),
  updatedAt: integer("updated_at").notNull(),
  enqueuedAt: integer("enqueued_at"),
}, (table) => ({
  pk: primaryKey({ columns: [table.version, table.groupOpenId] }),
  pendingIdx: index("qq_changelog_pushes_pending_idx").on(table.enqueuedAt).where(sql`${table.status} = 'pending'`),
}));
