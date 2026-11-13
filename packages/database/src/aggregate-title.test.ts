import { describe, expect, it } from "vitest";
import { createPlatformServices } from "./index";
import { hashRequest } from "./portal-session";
import { createTestDatabase, now } from "../test/map-title-rule-fixtures";
import { seedMap } from "./ocr-test-harness";

const setup = async () => {
  const { database, sqlite } = createTestDatabase("map.a");
  seedMap(sqlite, "map.b");
  for (const [key, scope] of [["CONQUEROR", "map"], ["DOMINATOR", "map"], ["ALL_IN_ONE", "global"], ["SKY", "global"], ["TRAVELER", "global"]]) {
    sqlite.prepare("INSERT INTO title_catalog (key, label, icon, category, condition, scope, display_kind, game_version) VALUES (?, ?, 'award', '地图精通系列', '条件', ?, 'fixed', '2026.07.15')").run(key, key, scope);
  }
  sqlite.prepare("INSERT INTO player_accounts (id, player_id, player_name, normalized_player_name, created_at, updated_at) VALUES ('player.agg', '2001', 'Agg', 'agg', ?, ?)").run(now, now);
  sqlite.prepare("INSERT INTO portal_sessions (id, player_account_id, token_hash, expires_at, created_at) VALUES ('session.agg', 'player.agg', ?, ?, ?)").run(await hashRequest("token.agg"), now + 60_000, now);
  const grant = (id: string, titleKey: string, mapId: string | null, revisionId: string | null) => sqlite.prepare("INSERT INTO player_title_grants (id, player_account_id, title_key, map_id, gameplay_revision_id, status, source_type, source_id, granted_by, granted_at) VALUES (?, 'player.agg', ?, ?, ?, 'active', 'manual', ?, 'admin', ?)").run(id, titleKey, mapId, revisionId, `src.${id}`, now);
  for (const key of ["ALL_IN_ONE", "SKY", "TRAVELER"]) grant(`grant.${key}`, key, null, null);
  const services = createPlatformServices(database);
  const owned = async () => (await services.listCurrentPlayerTitles({ sessionToken: "token.agg" }))!.items.map((item) => item.titleKey).sort();
  return { sqlite, grant, owned, services };
};

describe("aggregate global titles", () => {
  it("require the default revision of every active map, and any clear is enough for TRAVELER", async () => {
    const { sqlite, grant, owned } = await setup();
    await expect(owned()).resolves.toEqual([]);

    grant("grant.a.dominator", "DOMINATOR", "map.a", "revision:map.a:initial");
    grant("grant.a.conqueror", "CONQUEROR", "map.a", "revision:map.a:initial");
    grant("grant.b.conqueror", "CONQUEROR", "map.b", "revision:map.b:initial");
    await expect(owned()).resolves.toEqual(["ALL_IN_ONE", "CONQUEROR", "CONQUEROR", "DOMINATOR", "TRAVELER"]);

    sqlite.prepare("UPDATE player_title_grants SET status = 'revoked' WHERE id = 'grant.b.conqueror'").run();
    await expect(owned()).resolves.toEqual(["CONQUEROR", "DOMINATOR"]);

    sqlite.exec("PRAGMA foreign_keys = OFF");
    sqlite.prepare("INSERT INTO mastery_runs (id, player_account_id, source_submission_id, map_id, gameplay_revision_id, difficulty, game_version, run_code, completion_duration_seconds, event_counters_json, acceptance_source, accepted_at, status, xp_rule_version, xp_input_snapshot_json, awarded_xp, created_at) VALUES ('run.b', 'player.agg', 'sub.b', 'map.b', 'revision:map.b:initial', '简单', '2026.07.15', 'RUN01', 60, '{}', 'manual', ?, 'active', 'v1', '{}', 1, ?)").run(now, now);
    await expect(owned()).resolves.toEqual(["CONQUEROR", "DOMINATOR", "TRAVELER"]);
  });

  it("suspends the titles when a map is reworked and ignores classic revisions", async () => {
    const { sqlite, grant, owned } = await setup();
    for (const mapId of ["map.a", "map.b"]) {
      grant(`grant.${mapId}.dominator`, "DOMINATOR", mapId, `revision:${mapId}:initial`);
      grant(`grant.${mapId}.conqueror`, "CONQUEROR", mapId, `revision:${mapId}:initial`);
    }
    await expect(owned()).resolves.toContain("SKY");

    sqlite.prepare("UPDATE gameplay_revisions SET lifecycle = 'historical' WHERE id = 'revision:map.a:initial'").run();
    sqlite.prepare("INSERT INTO gameplay_revisions (id, map_id, lifecycle, copied_from_revision_id, reset_reason, game_version, created_at, updated_at) VALUES ('revision:map.a:rework', 'map.a', 'default', 'revision:map.a:initial', 'rework', '2026.08.10', ?, ?)").run(now, now);
    sqlite.prepare("INSERT INTO gameplay_revisions (id, map_id, lifecycle, legacy_map_variant, game_version, created_at, updated_at) VALUES ('revision:map.a:classic', 'map.a', 'selectable', 'classic', '2026.07.15', ?, ?)").run(now, now);
    grant("grant.a.classic", "DOMINATOR", "map.a", "revision:map.a:classic");
    const afterRework = await owned();
    expect(afterRework).not.toContain("SKY");
    expect(afterRework).not.toContain("ALL_IN_ONE");
    expect(afterRework).not.toContain("TRAVELER");

    grant("grant.a.rework", "CONQUEROR", "map.a", "revision:map.a:rework");
    const afterConqueror = await owned();
    expect(afterConqueror).toContain("ALL_IN_ONE");
    expect(afterConqueror).toContain("TRAVELER");
    expect(afterConqueror).not.toContain("SKY");

    grant("grant.a.rework.dominator", "DOMINATOR", "map.a", "revision:map.a:rework");
    await expect(owned()).resolves.toContain("SKY");
  });

  it("stops exporting an equipped aggregate title to the game", async () => {
    const { sqlite, grant, services } = await setup();
    grant("grant.a.conqueror", "CONQUEROR", "map.a", "revision:map.a:initial");
    grant("grant.b.conqueror", "CONQUEROR", "map.b", "revision:map.b:initial");
    sqlite.prepare("INSERT INTO player_equipped_titles (grant_id, player_account_id, equipped_at) VALUES ('grant.ALL_IN_ONE', 'player.agg', ?)").run(now);
    const exported = async () => (await services.listAgentPlayerTitleGrants({ page: 1, pageSize: 20 })).items.flatMap((item) => item.titleKeys);
    await expect(exported()).resolves.toEqual(["ALL_IN_ONE"]);
    sqlite.prepare("UPDATE gameplay_revisions SET lifecycle = 'historical' WHERE id = 'revision:map.b:initial'").run();
    sqlite.prepare("INSERT INTO gameplay_revisions (id, map_id, lifecycle, copied_from_revision_id, reset_reason, game_version, created_at, updated_at) VALUES ('revision:map.b:rework', 'map.b', 'default', 'revision:map.b:initial', 'rework', '2026.08.10', ?, ?)").run(now, now);
    await expect(exported()).resolves.toEqual([]);
  });
});
