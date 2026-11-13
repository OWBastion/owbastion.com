import { index, integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const seasons = sqliteTable("seasons", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  startsAt: integer("starts_at").notNull(),
  endsAt: integer("ends_at").notNull(),
  status: text("status").notNull(),
  public: integer("public").notNull().default(0),
  createdAt: integer("created_at").notNull(),
  updatedAt: integer("updated_at").notNull(),
}, (table) => ({
  startsAtIdx: index("seasons_starts_at_idx").on(table.startsAt),
}));
