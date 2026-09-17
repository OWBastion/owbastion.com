import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(resolve(import.meta.dirname, "../../../migrations/0079_player_title_entitlements.sql"), "utf8");

describe("player title entitlement migration", () => {
  it("permanently preserves the former inferred all-title projection", () => {
    const sqlite = new DatabaseSync(":memory:");
    sqlite.exec(`
      CREATE TABLE player_accounts (id TEXT PRIMARY KEY);
      CREATE TABLE title_catalog (key TEXT PRIMARY KEY, scope TEXT NOT NULL, availability TEXT NOT NULL, game_version TEXT);
      CREATE TABLE player_title_grants (player_account_id TEXT NOT NULL, title_key TEXT NOT NULL, map_id TEXT, gameplay_revision_id TEXT, status TEXT NOT NULL);
      INSERT INTO player_accounts VALUES ('all'), ('partial'), ('retired');
      INSERT INTO title_catalog VALUES ('TITLE_A', 'global', 'active', '26.1'), ('TITLE_B', 'global', 'active', '26.1'), ('TITLE_RETIRED', 'global', 'retired', '26.1'), ('MAP_TITLE', 'map', 'active', '26.1');
      INSERT INTO player_title_grants VALUES ('all', 'TITLE_A', NULL, NULL, 'active'), ('all', 'TITLE_B', NULL, NULL, 'active'), ('partial', 'TITLE_A', NULL, NULL, 'active'), ('retired', 'TITLE_A', NULL, NULL, 'active'), ('retired', 'TITLE_B', NULL, NULL, 'revoked'), ('retired', 'TITLE_RETIRED', NULL, NULL, 'active'), ('retired', 'MAP_TITLE', 'map.test', 'revision:map.test:v1', 'active');
    `);

    sqlite.exec(migration);

    expect(sqlite.prepare("SELECT player_account_id, all_titles FROM player_title_entitlements ORDER BY player_account_id").all()).toEqual([{ player_account_id: "all", all_titles: 1 }]);
    sqlite.exec("INSERT INTO title_catalog VALUES ('TITLE_NEW', 'global', 'active', '26.2');");
    expect(sqlite.prepare("SELECT all_titles FROM player_title_entitlements WHERE player_account_id = 'all'").get()).toEqual({ all_titles: 1 });
  });
});
