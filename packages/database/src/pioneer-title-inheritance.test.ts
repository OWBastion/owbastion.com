import { DatabaseSync } from "node:sqlite";
import { readdirSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

// Runs against the real migration chain so the triggers are exercised with the
// production schema and with the neighbouring 0075 trigger.
const migrationsDir = new URL("../../../migrations/", import.meta.url);

const createDb = () => {
  const sqlite = new DatabaseSync(":memory:");
  for (const file of readdirSync(migrationsDir).filter((name) => name.endsWith(".sql")).sort()) {
    if (file.startsWith("0113")) break;
    // Some migrations re-enable foreign keys; the seed rows here are minimal.
    sqlite.exec("PRAGMA foreign_keys = OFF");
    sqlite.exec(readFileSync(new URL(file, migrationsDir), "utf8"));
  }
  sqlite.exec("PRAGMA foreign_keys = OFF");
  return sqlite;
};

const applyRepair = (sqlite: DatabaseSync) =>
  sqlite.exec(readFileSync(new URL("0113_enforce_pioneer_dominator_inheritance.sql", migrationsDir), "utf8"));

type GrantOptions = { status?: "active" | "revoked"; revocationType?: "administrator" | "evidence"; source?: string; map?: string; revision?: string };

const addGrant = (sqlite: DatabaseSync, id: string, player: string, titleKey: string, options: GrantOptions = {}) => {
  const { status = "active", revocationType = "administrator", source = `source.${id}`, map = "map.paris", revision = "revision.paris" } = options;
  sqlite.prepare("INSERT INTO player_title_grants (id, player_account_id, title_key, map_id, gameplay_revision_id, slot, status, source_type, source_id, granted_by, granted_at, revocation_type, revoked_by, revoked_at) VALUES (?, ?, ?, ?, ?, lower(?), ?, 'automatic', ?, 'system:ocr', 1, ?, ?, ?)")
    .run(id, player, titleKey, map, revision, titleKey, status, source, status === "revoked" ? revocationType : null, status === "revoked" ? "admin" : null, status === "revoked" ? 2 : null);
};

const titles = (sqlite: DatabaseSync, player: string, status = "active") =>
  (sqlite.prepare("SELECT title_key FROM player_title_grants WHERE player_account_id = ? AND status = ? ORDER BY title_key").all(player, status) as { title_key: string }[]).map((row) => row.title_key);

const all = ["CONQUEROR", "DOMINATOR", "PIONEER"];

describe("PIONEER title inheritance", () => {
  it("repairs existing PIONEER grants with one audit row per issued title", () => {
    const sqlite = createDb();
    addGrant(sqlite, "p.a", "a", "PIONEER");
    addGrant(sqlite, "p.b", "b", "PIONEER");
    addGrant(sqlite, "d.b", "b", "DOMINATOR");
    addGrant(sqlite, "p.c", "c", "PIONEER", { status: "revoked" });
    applyRepair(sqlite);
    expect(titles(sqlite, "a")).toEqual(all);
    expect(titles(sqlite, "b")).toEqual(all);
    expect(titles(sqlite, "c")).toEqual([]);
    expect(sqlite.prepare("SELECT json_extract(payload_json, '$.titleKey') AS title FROM audit_events WHERE actor_id = 'migration:0113_pioneer_dominator_inheritance' ORDER BY title").all())
      .toEqual([{ title: "CONQUEROR" }, { title: "DOMINATOR" }]);
  });

  it("issues DOMINATOR and CONQUEROR with a new PIONEER grant", () => {
    const sqlite = createDb();
    applyRepair(sqlite);
    addGrant(sqlite, "p.a", "a", "PIONEER");
    expect(titles(sqlite, "a")).toEqual(all);
  });

  it("keeps an administrative revocation revoked", () => {
    const sqlite = createDb();
    addGrant(sqlite, "p.a", "a", "PIONEER");
    addGrant(sqlite, "d.a", "a", "DOMINATOR", { status: "revoked", source: "source.old" });
    applyRepair(sqlite);
    // Only the administratively revoked DOMINATOR stays revoked; CONQUEROR was never revoked.
    expect(titles(sqlite, "a")).toEqual(["CONQUEROR", "PIONEER"]);
    expect(titles(sqlite, "a", "revoked")).toEqual(["DOMINATOR"]);
    expect(sqlite.prepare("SELECT COUNT(*) AS n FROM audit_events WHERE actor_id LIKE 'migration:0113%' AND entity_id = 'p.a' AND json_extract(payload_json, '$.titleKey') = 'DOMINATOR'").get()).toEqual({ n: 0 });

    addGrant(sqlite, "p.b", "b", "PIONEER", { source: "source.b" });
    sqlite.prepare("UPDATE player_title_grants SET status = 'revoked', revocation_type = 'administrator' WHERE player_account_id = 'b' AND title_key = 'DOMINATOR'").run();
    sqlite.prepare("UPDATE player_title_grants SET status = 'revoked' WHERE id = 'p.b'").run();
    sqlite.prepare("UPDATE player_title_grants SET status = 'active' WHERE id = 'p.b'").run();
    expect(titles(sqlite, "b")).toEqual(["CONQUEROR", "PIONEER"]);
  });

  it("reactivates a same-source DOMINATOR that was revoked by evidence", () => {
    const sqlite = createDb();
    applyRepair(sqlite);
    addGrant(sqlite, "d.a", "a", "DOMINATOR", { status: "revoked", revocationType: "evidence", source: "source.a" });
    addGrant(sqlite, "p.a", "a", "PIONEER", { source: "source.a" });
    expect(titles(sqlite, "a")).toEqual(all);
    expect(sqlite.prepare("SELECT revocation_type FROM player_title_grants WHERE id = 'd.a'").get()).toEqual({ revocation_type: null });
  });

  it("restores inherited titles when a revoked PIONEER is reactivated by UPDATE", () => {
    const sqlite = createDb();
    applyRepair(sqlite);
    addGrant(sqlite, "p.a", "a", "PIONEER");
    sqlite.prepare("UPDATE player_title_grants SET status = 'revoked', revocation_type = 'evidence' WHERE player_account_id = 'a'").run();
    expect(titles(sqlite, "a")).toEqual([]);
    sqlite.prepare("UPDATE player_title_grants SET status = 'active', revocation_type = NULL WHERE id = 'p.a'").run();
    expect(titles(sqlite, "a")).toEqual(all);
  });

  it("stays within one map and gameplay revision and never duplicates an owned title", () => {
    const sqlite = createDb();
    applyRepair(sqlite);
    addGrant(sqlite, "d.a", "a", "DOMINATOR");
    addGrant(sqlite, "p.a", "a", "PIONEER");
    addGrant(sqlite, "p.a2", "a", "PIONEER", { map: "map.hanamura", revision: "revision.hanamura" });
    const count = (map: string) => (sqlite.prepare("SELECT COUNT(*) AS n FROM player_title_grants WHERE map_id = ? AND status = 'active'").get(map) as { n: number }).n;
    expect(count("map.paris")).toBe(3);
    expect(count("map.hanamura")).toBe(3);
  });
});
