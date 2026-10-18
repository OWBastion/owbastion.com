import { DatabaseSync } from "node:sqlite";
import { readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migrationsDirectory = resolve(import.meta.dirname, "../../../migrations");
const target = "0107_title_lifecycle_draft_active.sql";
const migrationFiles = readdirSync(migrationsDirectory).filter((name) => /^\d+.*\.sql$/.test(name)).sort();
const inheritTrigger = "player_title_grants_inherit_conqueror_after_dominator_insert";

// Runs the real migration chain: the hand-built schemas other migration tests use cannot
// carry the triggers that fire while a rebuild restores staged rows.
const databaseBefore = (name: string) => {
  const sqlite = new DatabaseSync(":memory:");
  for (const file of migrationFiles) {
    if (file === name) break;
    sqlite.exec("PRAGMA foreign_keys = OFF");
    sqlite.exec(readFileSync(resolve(migrationsDirectory, file), "utf8"));
  }
  sqlite.exec("PRAGMA foreign_keys = ON");
  return sqlite;
};
const triggerSql = (sqlite: DatabaseSync) => (sqlite.prepare("SELECT sql FROM sqlite_master WHERE name = ?").get(inheritTrigger) as { sql: string } | undefined)?.sql;

describe("0107 title lifecycle rebuild", () => {
  it("restores dominator and inherited conqueror grants without duplicates and keeps the inheritance trigger", () => {
    const sqlite = databaseBefore(target);
    sqlite.exec(`
      INSERT INTO maps (id, name, game_version, status, introduced_version, created_at, updated_at) VALUES ('map.a', 'A', 'v', 'active', 'v', 1, 1);
      INSERT INTO gameplay_revisions (id, map_id, lifecycle, game_version, created_at, updated_at) VALUES ('rev.a', 'map.a', 'default', 'v', 1, 1);
      INSERT INTO player_accounts (id, player_id, player_name, normalized_player_name, created_at, updated_at) VALUES ('p1', '1001', 'A', 'a', 1, 1);
      UPDATE title_catalog SET game_version = 'v' WHERE key IN ('DOMINATOR', 'CONQUEROR');
    `);
    // Inserting the dominator makes the 0075 trigger add the conqueror after it, so a
    // restore in rowid order sees the dominator before its conqueror.
    sqlite.exec(`INSERT INTO player_title_grants (id, player_account_id, title_key, map_id, gameplay_revision_id, slot, status, source_type, source_id, granted_by, granted_at)
      VALUES ('g1', 'p1', 'DOMINATOR', 'map.a', 'rev.a', 'dominator', 'active', 'submission', 's1', 'admin', 1)`);
    const grantsBefore = sqlite.prepare("SELECT id, title_key FROM player_title_grants ORDER BY rowid").all();
    const triggerBefore = triggerSql(sqlite);
    expect(grantsBefore.map((row) => row.title_key)).toEqual(["DOMINATOR", "CONQUEROR"]);

    sqlite.exec("BEGIN");
    sqlite.exec(readFileSync(resolve(migrationsDirectory, target), "utf8"));
    sqlite.exec("COMMIT");

    expect(sqlite.prepare("SELECT id, title_key FROM player_title_grants ORDER BY rowid").all()).toEqual(grantsBefore);
    expect(triggerSql(sqlite)).toBe(triggerBefore);
    expect(sqlite.prepare("PRAGMA foreign_key_check").all()).toEqual([]);
  });
});
