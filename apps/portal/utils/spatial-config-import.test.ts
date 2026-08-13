import { describe, expect, it } from "vitest";
import { formatWorkshopSpatialConfig, parseSpatialConfigSource } from "./spatial-config-import";

const source = `
Global.bastionPosition[0] = Vector(-121.979, 0.148, 110.507);
Global.bastionPosition[1] = Vector(-93.733, -1.047, 110.100);
Global.endPosition = Vector(2.772, -6.500, -6.900);
Global.heroRingPosition = Vector(-149.170, 0.830, 100.850);
Global.resetPosition = Vector(-150.250, 0.830, 104.510);
Global.creditsPosition = Vector(-170.800, 3.650, 96.450);
`;

describe("spatial-config-import", () => {
  it("converts indexed Workshop vectors and heroRingPosition into the platform shape", () => {
    const result = parseSpatialConfigSource(source);

    expect(result).toMatchObject({ ok: true });
    if (!result.ok) return;
    expect(result.config).toMatchObject({
      bastionPositions: [[-121.979, 0.148, 110.507], [-93.733, -1.047, 110.1]],
      resetPosition: [-150.25, 0.83, 104.51],
      endPosition: [2.772, -6.5, -6.9],
      thirdPersonPosition: [-149.17, 0.83, 100.85],
      creditsPosition: [-170.8, 3.65, 96.45],
      control: null,
      portalPositions: [],
      springboardPositions: [],
      alternateStages: [],
    });
    expect(result.summary.totalPositions).toBe(6);
  });

  it("converts append-style arrays and preserves alternate stages", () => {
    const result = parseSpatialConfigSource(`
      Global.bastionPosition = Empty Array;
      Modify Global Variable(bastionPosition, Append To Array, Vector(1, 2, 3));
      Modify Global Variable(bastionPosition, Append To Array, Vector(4, 5, 6));
      Global.endPosition = Vector(7, 8, 9);
      Global.heroRingPosition = Vector(10, 11, 12);
      Global.resetPosition = Vector(13, 14, 15);
      Global.creditsPosition = Vector(16, 17, 18);
    `, { alternateStages: [{ stageId: "ruins" }] });

    expect(result).toMatchObject({ ok: true });
    if (!result.ok) return;
    expect(result.config.bastionPositions).toEqual([[1, 2, 3], [4, 5, 6]]);
    expect(result.config.alternateStages).toEqual([{ stageId: "ruins" }]);
  });

  it("maps optional control positions and respawn settings", () => {
    const result = parseSpatialConfigSource(`${source}
      Modify Global Variable(controlCenterPosition, Append To Array, Vector(20, 21, 22));
      Modify Global Variable(controlRespawnPosition, Append To Array, Vector(23, 24, 25));
      Global.controlRespawnAxis = Axis.Z;
      Global.controlRespawnAxisThreshold = 30;
    `);

    expect(result).toMatchObject({ ok: true });
    if (!result.ok) return;
    expect(result.config.control).toEqual({
      centerPositions: [[20, 21, 22]],
      jumpPositions: [],
      respawnPositions: [[23, 24, 25]],
      respawnAxis: "z",
      respawnAxisThreshold: 30,
    });
  });

  it("accepts existing platform JSON as a compatibility path", () => {
    const config = { bastionPositions: [[1, 2, 3]] };
    const result = parseSpatialConfigSource(JSON.stringify(config));
    expect(result).toMatchObject({ ok: true, config, summary: { totalPositions: 1 } });
  });

  it("reports incomplete pasted map blocks", () => {
    const result = parseSpatialConfigSource("Global.bastionPosition[0] = Vector(1, 2, 3);");
    expect(result).toEqual({ ok: false, error: "缺少必需点位：重置点、终点、第三人称点（或 heroRingPosition）、结算点。请粘贴同一张地图的完整定位代码。" });
  });

  it("renders an existing platform config back into game-style source", () => {
    const result = formatWorkshopSpatialConfig({
      bastionPositions: [[1, 2, 3]],
      resetPosition: [4, 5, 6],
      endPosition: [7, 8, 9],
      thirdPersonPosition: [10, 11, 12],
      creditsPosition: [13, 14, 15],
      control: null,
      portalPositions: [],
      springboardPositions: [],
      alternateStages: [],
    });
    expect(result).toContain("Global.bastionPosition[0] = Vector(1, 2, 3);");
    expect(result).toContain("Global.heroRingPosition = Vector(10, 11, 12);");
  });
});
