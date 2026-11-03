import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migration = (name: string) => readFileSync(new URL(`../../../migrations/${name}`, import.meta.url), "utf8");
const conquerorTrigger = migration("0075_enforce_dominator_conqueror_inheritance.sql").match(/CREATE TRIGGER[\s\S]*?END;/)![0];
const pioneerMigration = migration("0113_enforce_pioneer_dominator_inheritance.sql");

const createDb = () => {
  const sqlite = new DatabaseSync(":memory:");
  sqlite.exec(`
    CREATE TABLE player_title_grants (id TEXT PRIMARY KEY, player_account_id TEXT NOT NULL, title_key TEXT NOT NULL, map_id TEXT, gameplay_revision_id TEXT, slot TEXT, status TEXT NOT NULL, source_type TEXT NOT NULL, source_id TEXT NOT NULL, granted_by TEXT NOT NULL, granted_at INTEGER NOT NULL, revoked_by TEXT, revoked_at INTEGER, revoke_reason TEXT);
    CREATE UNIQUE INDEX player_title_grants_source_idx ON player_title_grants(source_type, source_id, title_key);
    CREATE UNIQUE INDEX player_title_grants_active_identity_idx ON player_title_grants(player_account_id, title_key, COALESCE(map_id, ''), COALESCE(gameplay_revision_id, '')) WHERE status = 'active';
    CREATE TABLE audit_events (id TEXT PRIMARY KEY, correlation_id TEXT NOT NULL, actor_type TEXT NOT NULL, actor_id TEXT, operation TEXT NOT NULL, entity_type TEXT NOT NULL, entity_id TEXT, payload_json TEXT, created_at INTEGER NOT NULL);
  `);
  sqlite.exec(conquerorTrigger);
  return sqlite;
};

const addGrant = (sqlite: DatabaseSync, id: string, titleKey: string, player = "player.a", status = "active", map = "map.paris") =>
  sqlite.prepare("INSERT INTO player_title_grants (id, player_account_id, title_key, map_id, gameplay_revision_id, slot, status, source_type, source_id, granted_by, granted_at) VALUES (?, ?, ?, ?, 'revision.paris', lower(?), ?, 'automatic', ?, 'system:ocr', 1)")
    .run(id, player, titleKey, map, titleKey, status, `source.${id}`);

const activeTitles = (sqlite: DatabaseSync, player = "player.a") =>
  (sqlite.prepare("SELECT title_key FROM player_title_grants WHERE player_account_id = ? AND status = 'active' ORDER BY title_key").all(player) as { title_key: string }[]).map((row) => row.title_key);

describe("PIONEER title inheritance", () => {
  it("repairs existing PIONEER grants and cascades to CONQUEROR", () => {
    const sqlite = createDb();
    addGrant(sqlite, "p1", "PIONEER");
    addGrant(sqlite, "p2", "PIONEER", "player.b");
    addGrant(sqlite, "d2", "DOMINATOR", "player.b");
    addGrant(sqlite, "p3", "PIONEER", "player.c", "revoked");
    sqlite.exec(pioneerMigration);
    expect(activeTitles(sqlite)).toEqual(["CONQUEROR", "DOMINATOR", "PIONEER"]);
    expect(activeTitles(sqlite, "player.b")).toEqual(["CONQUEROR", "DOMINATOR", "PIONEER"]);
    expect(activeTitles(sqlite, "player.c")).toEqual([]);
    expect(sqlite.prepare("SELECT COUNT(*) AS n FROM audit_events WHERE operation = 'title_grant.inherit' AND actor_id LIKE 'migration:0113%'").get()).toEqual({ n: 1 });
  });

  it("issues DOMINATOR and CONQUEROR with every new PIONEER grant", () => {
    const sqlite = createDb();
    sqlite.exec(pioneerMigration);
    addGrant(sqlite, "p1", "PIONEER");
    expect(activeTitles(sqlite)).toEqual(["CONQUEROR", "DOMINATOR", "PIONEER"]);
    expect(sqlite.prepare("SELECT slot FROM player_title_grants WHERE title_key = 'DOMINATOR'").get()).toEqual({ slot: "dominator" });
  });

  it("does not duplicate an owned DOMINATOR or follow another map", () => {
    const sqlite = createDb();
    sqlite.exec(pioneerMigration);
    addGrant(sqlite, "d1", "DOMINATOR");
    addGrant(sqlite, "p1", "PIONEER");
    addGrant(sqlite, "p2", "PIONEER", "player.a", "active", "map.hanamura");
    expect(sqlite.prepare("SELECT COUNT(*) AS n FROM player_title_grants WHERE map_id = 'map.paris' AND status = 'active'").get()).toEqual({ n: 3 });
    expect(sqlite.prepare("SELECT title_key FROM player_title_grants WHERE map_id = 'map.hanamura' AND status = 'active' ORDER BY title_key").all()).toEqual([{ title_key: "CONQUEROR" }, { title_key: "DOMINATOR" }, { title_key: "PIONEER" }]);
  });
});
