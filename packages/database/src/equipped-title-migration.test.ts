import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migrationsDirectory = resolve(import.meta.dirname, "../../../migrations");
const migration = (name: string) => readFileSync(resolve(migrationsDirectory, name), "utf8");

describe("0080 equipped title scope repair", () => {
  it("removes map equipment and initializes only deterministic global selections", () => {
    const sqlite = new DatabaseSync(":memory:");
    sqlite.exec(`
      PRAGMA foreign_keys = ON;
      CREATE TABLE player_accounts (id TEXT PRIMARY KEY);
      CREATE TABLE title_catalog (key TEXT PRIMARY KEY, scope TEXT NOT NULL, availability TEXT NOT NULL, game_version TEXT);
      CREATE TABLE gameplay_revisions (id TEXT PRIMARY KEY, lifecycle TEXT NOT NULL);
      CREATE TABLE player_title_grants (
        id TEXT PRIMARY KEY,
        player_account_id TEXT NOT NULL REFERENCES player_accounts(id),
        title_key TEXT NOT NULL,
        map_id TEXT,
        gameplay_revision_id TEXT,
        status TEXT NOT NULL,
        granted_at INTEGER NOT NULL
      );
    `);
    sqlite.exec(`
      INSERT INTO player_accounts VALUES
        ('preserved'), ('skipped'), ('over-limit'), ('map-only');
      INSERT INTO gameplay_revisions VALUES ('revision:map.test:default', 'default');
      INSERT INTO title_catalog VALUES
        ('GLOBAL_1', 'global', 'active', '26.1'),
        ('GLOBAL_2', 'global', 'active', '26.1'),
        ('MAP_1', 'map', 'active', '26.1');
      INSERT INTO player_title_grants (id, player_account_id, title_key, status, granted_at) VALUES
        ('preserved-global', 'preserved', 'GLOBAL_1', 'active', 1),
        ('skipped-global-1', 'skipped', 'GLOBAL_1', 'active', 1),
        ('skipped-global-2', 'skipped', 'GLOBAL_2', 'active', 2);
      INSERT INTO player_title_grants (id, player_account_id, title_key, map_id, gameplay_revision_id, status, granted_at)
      VALUES
        ('map-only-map', 'map-only', 'MAP_1', 'map.test', 'revision:map.test:default', 'active', 1),
        ('preserved-map', 'preserved', 'MAP_1', 'map.test', 'revision:map.test:default', 'active', 2),
        ('skipped-map-1', 'skipped', 'MAP_1', 'map.test', 'revision:map.test:default', 'active', 3),
        ('skipped-map-2', 'skipped', 'MAP_1', 'map.test', 'revision:map.test:default', 'active', 4),
        ('skipped-map-3', 'skipped', 'MAP_1', 'map.test', 'revision:map.test:default', 'active', 5),
        ('skipped-map-4', 'skipped', 'MAP_1', 'map.test', 'revision:map.test:default', 'active', 6),
        ('skipped-map-5', 'skipped', 'MAP_1', 'map.test', 'revision:map.test:default', 'active', 7),
        ('skipped-map-6', 'skipped', 'MAP_1', 'map.test', 'revision:map.test:default', 'active', 8),
        ('skipped-map-7', 'skipped', 'MAP_1', 'map.test', 'revision:map.test:default', 'active', 9),
        ('skipped-map-8', 'skipped', 'MAP_1', 'map.test', 'revision:map.test:default', 'active', 10),
        ('skipped-map-9', 'skipped', 'MAP_1', 'map.test', 'revision:map.test:default', 'active', 11);
    `);
    sqlite.exec(`
      WITH RECURSIVE number(value) AS (SELECT 3 UNION ALL SELECT value + 1 FROM number WHERE value < 13)
      INSERT INTO title_catalog SELECT 'GLOBAL_' || value, 'global', 'active', '26.1' FROM number;
      WITH RECURSIVE number(value) AS (SELECT 1 UNION ALL SELECT value + 1 FROM number WHERE value < 11)
      INSERT INTO player_title_grants (id, player_account_id, title_key, status, granted_at)
      SELECT 'over-limit-global-' || value, 'over-limit', 'GLOBAL_' || value, 'active', value FROM number;
    `);
    sqlite.exec(migration("0077_player_equipped_titles.sql"));

    expect(sqlite.prepare("SELECT grant_id FROM player_equipped_titles ORDER BY grant_id").all()).toEqual([
      { grant_id: "map-only-map" },
      { grant_id: "preserved-global" },
      { grant_id: "preserved-map" },
    ]);
    expect(sqlite.prepare("SELECT COUNT(*) AS count FROM player_equipped_titles WHERE player_account_id = 'skipped'").get()).toEqual({ count: 0 });

    sqlite.exec(migration("0080_scope_equipped_titles_to_global.sql"));

    expect(sqlite.prepare("SELECT grant_id FROM player_equipped_titles WHERE player_account_id = 'preserved' ORDER BY grant_id").all()).toEqual([{ grant_id: "preserved-global" }]);
    expect(sqlite.prepare("SELECT grant_id FROM player_equipped_titles WHERE player_account_id = 'skipped' ORDER BY grant_id").all()).toEqual([
      { grant_id: "skipped-global-1" },
      { grant_id: "skipped-global-2" },
    ]);
    expect(sqlite.prepare("SELECT COUNT(*) AS count FROM player_equipped_titles WHERE player_account_id IN ('over-limit', 'map-only')").get()).toEqual({ count: 0 });
    expect(sqlite.prepare("SELECT COUNT(*) AS count FROM player_title_grants WHERE title_key = 'MAP_1'").get()).toEqual({ count: 11 });
    expect(() => sqlite.prepare("INSERT INTO player_equipped_titles VALUES ('preserved-map', 'preserved', 1)").run()).toThrow("EQUIPPED_TITLE_GRANT_INVALID");
  });
});
