import { afterEach, describe, expect, it, vi } from "vitest";
import type { Challenge } from "@owbastion/contracts";
import { createPlatformServices } from "@owbastion/database";
import { createD1, installSchema, seedMap, seedRevisionAssignment, seedTitle } from "./ocr-test-harness";

const mapId = "map.projection";
const revisionId = `revision:${mapId}:initial`;
const definitionVersion = "2026.07.15";
const revisionVersion = "2026.10.01";
const introducedVersion = "2026.06.01";
const retiredVersion = "2026.12.01";
const auth = { actorType: "user" as const, subject: "admin", roles: ["maintainer"], provider: "test" };
const spatialConfig = JSON.stringify({
  bastionPositions: [[1, 2, 3]], resetPosition: [4, 5, 6], endPosition: [7, 8, 9],
  thirdPersonPosition: [10, 11, 12], creditsPosition: [13, 14, 15],
  control: null, portalPositions: [], springboardPositions: [],
});
const fixtures: ReturnType<typeof createD1>[] = [];
afterEach(() => { fixtures.splice(0).forEach(({ sqlite }) => sqlite.close()); });
const fixture = () => {
  const d1 = createD1();
  fixtures.push(d1);
  installSchema(d1.sqlite);
  return d1;
};
const seedEvent = (sqlite: ReturnType<typeof createD1>["sqlite"]) => {
  sqlite.prepare("INSERT INTO random_events (id, name, category, rarity, description, game_version, release_status, created_at, updated_at) VALUES ('event.projection', 'Projection', 'buff', 'N', 'fixture', ?, 'implemented', 1, 1)").run(definitionVersion);
};
const seedProjection = (sqlite: ReturnType<typeof createD1>["sqlite"], spatial: string | null) => {
  seedMap(sqlite, mapId);
  sqlite.prepare("UPDATE gameplay_revisions SET game_version = ?, spatial_config_json = ? WHERE id = ?").run(revisionVersion, spatial, revisionId);
  seedTitle(sqlite, "CONQUEROR");
  seedTitle(sqlite, "REWORK");
  seedTitle(sqlite, "GLOBAL");
  sqlite.prepare("UPDATE title_catalog SET scope = 'global' WHERE key = 'GLOBAL'").run();
  sqlite.prepare("INSERT INTO achievement_challenges (id, map_id, type, name, game_version, status, introduced_version, retired_version, created_at, updated_at) VALUES ('challenge.direct', ?, 'difficulty_completion', 'Direct', ?, 'sunsetting', ?, ?, 1, 1)").run(mapId, definitionVersion, introducedVersion, retiredVersion);
  sqlite.prepare("INSERT INTO map_title_rules (id, title_key, kind, condition, evidence_rule, display_kind, status, introduced_version, retired_version, created_at, updated_at) VALUES ('rule.conqueror', 'CONQUEROR', 'conqueror', 'condition', 'evidence', 'map_name_suffix', 'sunsetting', ?, ?, 1, 1)").run(definitionVersion, retiredVersion);
  for (const [id, key, scope] of [["title.rework", "REWORK", "map"], ["title.global", "GLOBAL", "global"]]) {
    sqlite.prepare("INSERT INTO title_challenges (id, title_key, condition, evidence_rule, submission_mode, game_version, status, introduced_version, retired_version, scope, created_at, updated_at) VALUES (?, ?, 'condition', 'evidence', 'manual', ?, 'sunsetting', ?, ?, ?, 1, 1)").run(id, key, definitionVersion, introducedVersion, retiredVersion, scope);
  }
  sqlite.prepare("INSERT INTO achievement_challenge_maps (challenge_id, map_id) VALUES ('title.rework', ?)").run(mapId);
  for (const [challengeFamily, challengeId] of [["map_challenge", "challenge.direct"], ["map_title_rule", "rule.conqueror"], ["title_challenge", "title.rework"]] as const) {
    seedRevisionAssignment(sqlite, { gameplayRevisionId: revisionId, mapId, challengeFamily, challengeId });
  }
  seedEvent(sqlite);
  sqlite.prepare("INSERT INTO random_event_map_challenges (event_id, challenge_id) VALUES ('event.projection', 'challenge.direct')").run();
  sqlite.prepare("INSERT INTO random_event_title_challenges (event_id, challenge_id) VALUES ('event.projection', 'title.global')").run();
};
const expectRevisionVersions = (items: Challenge[]) => {
  expect(items).toEqual(expect.arrayContaining(["challenge.direct", `${mapId}.conqueror`, "title.rework"].map((challengeId) =>
    expect.objectContaining({ challengeId, gameplayRevisionId: revisionId, gameVersion: revisionVersion, retiredVersion }),
  )));
};
const expectEventVersions = (event: { challenges: Challenge[]; gameVersion: string } | null | undefined) => {
  expect(event).toMatchObject({ gameVersion: definitionVersion, challenges: expect.arrayContaining([
    expect.objectContaining({ challengeId: "challenge.direct", gameplayRevisionId: revisionId, gameVersion: revisionVersion }),
    expect.objectContaining({ challengeId: "title.global", gameVersion: definitionVersion }),
  ]) });
};

describe("public database service revision projection", () => {
  it.each(["missing spatial data", "invalid spatial data", "unresolved build reference", "build ready"])("projects authoritative versions with %s", async (buildState) => {
    const { database, sqlite } = fixture();
    seedProjection(sqlite, buildState === "missing spatial data" ? null : buildState === "invalid spatial data" ? "{}" : spatialConfig);
    if (buildState === "unresolved build reference") seedRevisionAssignment(sqlite, { gameplayRevisionId: revisionId, mapId, challengeFamily: "map_challenge", challengeId: "challenge.missing" });
    const services = createPlatformServices(database);
    const maps = await services.listAgentMaps({ page: 1, pageSize: 20 });
    expect(maps.items[0]?.gameplayRevisions).toHaveLength(buildState === "build ready" ? 1 : 0);
    expectRevisionVersions(await services.listChallenges({ family: "map" }));
    await expect(services.listChallenges({ family: "achievement" })).resolves.toContainEqual(expect.objectContaining({ challengeId: "title.global", gameVersion: definitionVersion }));
    expectEventVersions((await services.listRandomEvents({}))[0]);
    expectEventVersions(await services.getRandomEvent({ eventId: "event.projection" }));
    expectEventVersions((await services.listAgentEvents({ page: 1, pageSize: 20 })).items[0]);
    expectEventVersions(await services.getAgentEvent({ eventId: "event.projection" }));
    const achievements = await services.listAgentAchievements({ page: 1, pageSize: 20, mapId });
    if (buildState === "build ready") expectRevisionVersions(achievements.items);
    else expect(achievements.items.filter((item) => item.family === "map")).toEqual([]);
  });

  it("preserves admin definition/history versions and stored records", async () => {
    const { database, sqlite } = fixture();
    seedProjection(sqlite, null);
    sqlite.prepare("INSERT INTO gameplay_revisions (id, map_id, lifecycle, game_version, created_at, updated_at) VALUES ('revision:historical', ?, 'historical', '2026.05.01', 1, 1)").run(mapId);
    seedRevisionAssignment(sqlite, { gameplayRevisionId: "revision:historical", mapId, challengeFamily: "map_challenge", challengeId: "challenge.direct" });
    const storedDefinitions = () => [
      sqlite.prepare("SELECT game_version, introduced_version, retired_version FROM achievement_challenges").all(),
      sqlite.prepare("SELECT introduced_version, retired_version FROM map_title_rules").all(),
      sqlite.prepare("SELECT game_version, introduced_version, retired_version FROM title_challenges ORDER BY id").all(),
    ];
    const before = storedDefinitions();
    const services = createPlatformServices(database);
    expectRevisionVersions(await services.listChallenges({ family: "map" }));
    const admin = await services.listAdminChallenges({ family: "map" }, auth);
    expect(admin.items).toEqual(expect.arrayContaining([
      expect.objectContaining({ challengeId: "challenge.direct", gameplayRevisionId: revisionId, gameVersion: definitionVersion, introducedVersion, retiredVersion }),
      expect.objectContaining({ challengeId: "challenge.direct", gameplayRevisionId: "revision:historical", gameVersion: definitionVersion, introducedVersion, retiredVersion }),
      expect.objectContaining({ challengeId: `${mapId}.conqueror`, gameVersion: definitionVersion, introducedVersion: definitionVersion, retiredVersion }),
      expect.objectContaining({ challengeId: "title.rework", gameVersion: definitionVersion, introducedVersion: definitionVersion, retiredVersion }),
    ]));
    await expect(services.listAdminChallenges({ family: "achievement" }, auth)).resolves.toMatchObject({ items: expect.arrayContaining([
      expect.objectContaining({ challengeId: "title.rework", gameVersion: definitionVersion, introducedVersion, retiredVersion }),
    ]) });
    const editor = await services.getAdminMapEditor({ mapId }, auth);
    expect(editor.challengeCatalog).toEqual(expect.arrayContaining([
      expect.objectContaining({ challengeId: "challenge.direct", gameVersion: definitionVersion }),
      expect.objectContaining({ challengeId: "rule.conqueror", gameVersion: definitionVersion }),
      expect.objectContaining({ challengeId: "title.rework", gameVersion: definitionVersion }),
    ]));
    expect(storedDefinitions()).toEqual(before);
  });

  it.each(["global achievements", "unlinked events", "missing event"])("does not read build projections for %s", async (path) => {
    const { database, sqlite } = fixture();
    seedEvent(sqlite);
    const prepare = vi.spyOn(database, "prepare");
    const services = createPlatformServices(database);
    if (path === "global achievements") await expect(services.listChallenges({ family: "achievement" })).resolves.toEqual([]);
    else if (path === "unlinked events") await expect(services.listRandomEvents({})).resolves.toMatchObject([{ challenges: [] }]);
    else await expect(services.getRandomEvent({ eventId: "event.missing" })).resolves.toBeNull();
    expect(prepare.mock.calls.map(([query]) => query).filter((query) => /\bmap_metadata\b/i.test(query))).toEqual([]);
  });
});
