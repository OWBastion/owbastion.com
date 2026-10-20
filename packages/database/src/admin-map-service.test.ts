import { describe, expect, it } from "vitest";
import { createPlatformServices } from "./index";
import { createD1, installSchema, seedMap, seedTitle } from "../test/map-title-rule-fixtures";

describe("admin map creation and progress rules", () => {
  it("adds a new map to progress rules that cover the whole regular map pool", async () => {
    const { database, sqlite } = createD1();
    installSchema(sqlite);
    seedMap(sqlite, "map.a");
    seedMap(sqlite, "map.b");
    seedTitle(sqlite, "SKY");
    sqlite.prepare("UPDATE title_catalog SET scope = 'global', display_kind = 'fixed' WHERE key = 'SKY'").run();
    const insertChallenge = sqlite.prepare("INSERT INTO title_challenges (id, title_key, condition, evidence_rule, submission_mode, status, game_version, scope, progress_rule, created_at, updated_at) VALUES (?, 'SKY', '条件', '证据', 'manual', 'active', '26.1003.1', 'global', ?, 1, 1)");
    insertChallenge.run("title.SKY.all", JSON.stringify({ type: "required_maps_completed", mapIds: ["map.a", "map.b"], difficultyAtLeast: "地狱" }));
    insertChallenge.run("title.SKY.subset", JSON.stringify({ type: "required_maps_completed", mapIds: ["map.a"] }));
    sqlite.exec("INSERT INTO random_event_versions (game_version, availability, mode, created_at, updated_at) VALUES ('26.1003.2', 'available', NULL, 1, 1)");
    const services = createPlatformServices(database);
    const auth = { actorType: "user" as const, subject: "admin", roles: ["maintainer"], provider: "test" };

    const created = await services.createAdminMap({ contractVersion: "1", mapName: "新地图" }, auth, "map-create");

    const rules = Object.fromEntries((sqlite.prepare("SELECT id, progress_rule FROM title_challenges").all() as Array<{ id: string; progress_rule: string }>).map((row) => [row.id, JSON.parse(row.progress_rule)]));
    expect(rules["title.SKY.all"]).toEqual({ type: "required_maps_completed", mapIds: ["map.a", "map.b", created.mapId].sort(), difficultyAtLeast: "地狱" });
    expect(rules["title.SKY.subset"].mapIds).toEqual(["map.a"]);
  });
});
