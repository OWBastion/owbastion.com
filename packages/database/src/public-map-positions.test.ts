import { describe, expect, it } from "vitest";
import { createPlatformServices } from "./index";
import { createTestDatabase, seedAgentSpatialConfig, seedMap, seedSelectableGameplayRevision, sharedCompositeSpatialConfig } from "../test/map-title-rule-fixtures";

const drawnPositions = (stages: Array<{ points: Array<{ position: number[] }> }>) => stages.flatMap((stage) => stage.points.map((point) => point.position));

describe("public map positions", () => {
  it("projects only the active map's default revision and never its credits point", async () => {
    const { database, sqlite } = createTestDatabase("map.public");
    seedAgentSpatialConfig(sqlite, "revision:map.public:initial");
    const selectableRevisionId = seedSelectableGameplayRevision(sqlite, "map.public");
    seedAgentSpatialConfig(sqlite, selectableRevisionId, { bastionPositions: [[90, 91, 92]] });
    const services = createPlatformServices(database);

    const item = (await services.getPublicMapPositions({ mapId: "map.public" }))!;
    expect(item).toMatchObject({ mapId: "map.public", gameplayRevisionId: "revision:map.public:initial" });
    expect(item.stages).toHaveLength(1);
    const drawn = drawnPositions(item.stages);
    expect(drawn).toContainEqual([1, 2, 3]);
    expect(drawn).not.toContainEqual([13, 14, 15]);
    expect(drawn).not.toContainEqual([90, 91, 92]);
  });

  it("never exposes a preparing revision's draft", async () => {
    const { database, sqlite } = createTestDatabase("map.preparing");
    sqlite.prepare("UPDATE gameplay_revisions SET lifecycle = 'preparing' WHERE id = ?").run("revision:map.preparing:initial");
    seedAgentSpatialConfig(sqlite, "revision:map.preparing:initial");
    const services = createPlatformServices(database);

    expect(await services.getPublicMapPositions({ mapId: "map.preparing" })).toEqual({ mapId: "map.preparing", gameplayRevisionId: null, stages: [] });
  });

  it("omits composite respawn and credits points", async () => {
    const { database, sqlite } = createTestDatabase("map.composite");
    sqlite.prepare("UPDATE gameplay_revisions SET spatial_config_json = ? WHERE id = ?").run(JSON.stringify(sharedCompositeSpatialConfig()), "revision:map.composite:initial");
    const services = createPlatformServices(database);

    const item = (await services.getPublicMapPositions({ mapId: "map.composite" }))!;
    expect(item.stages).toHaveLength(3);
    const drawn = drawnPositions(item.stages);
    for (const hidden of [[34, 35, 36], [22, 23, 24], [13, 14, 15], [7, 8, 9]]) expect(drawn).not.toContainEqual(hidden);
    expect(item.stages.flatMap((stage) => stage.points.map((point) => point.kind))).not.toEqual(expect.arrayContaining(["control_respawn"]));
    expect(drawn).toContainEqual([4, 5, 6]);
  });

  it("returns nothing for a retired or unknown map", async () => {
    const { database, sqlite } = createTestDatabase();
    seedMap(sqlite, "map.retired", "retired");
    seedAgentSpatialConfig(sqlite, "revision:map.retired:initial");
    const services = createPlatformServices(database);

    expect(await services.getPublicMapPositions({ mapId: "map.retired" })).toBeNull();
    expect(await services.getPublicMapPositions({ mapId: "map.unknown" })).toBeNull();
  });
});
