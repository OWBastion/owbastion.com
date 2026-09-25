import { describe, expect, it } from "vitest";
import { formatWorkshopSpatialConfig, parseSpatialConfigSource } from "./spatial-config-import";

const compositeStage = (stageId: string, offset: number, setupDetection?: { position: [number, number, number]; radius: number }) => ({
  stageId,
  ...(setupDetection ? { setupDetection } : {}),
  bastionPositions: [[offset, offset + 1, offset + 2]],
  resetPosition: [offset + 3, offset + 4, offset + 5],
  endPosition: [offset + 6, offset + 7, offset + 8],
  thirdPersonPosition: [offset + 9, offset + 10, offset + 11],
  creditsPosition: [offset + 12, offset + 13, offset + 14],
  control: null,
  portalPositions: [],
  springboardPositions: [],
});

const compositeConfig = {
  composition: {
    selectionCount: 2,
    firstStageSelection: { mode: "setup_detection", fallbackStageId: "base" },
    remainingStageSelection: "random_unique",
  },
  stages: [
    compositeStage("base", 1),
    compositeStage("icebreaker", 10, { position: [20, 21, 22], radius: 30 }),
    compositeStage("laboratory", 30, { position: [40, 41, 42], radius: 30 }),
  ],
};

const sharedCompositeConfig = {
  resetPosition: [1, 2, 3],
  endPosition: [4, 5, 6],
  thirdPersonPosition: [7, 8, 9],
  creditsPosition: [10, 11, 12],
  control: { respawnAxis: "x", respawnAxisThreshold: 40 },
  composition: compositeConfig.composition,
  stages: [
    { stageId: "base", bastionPositions: [[13, 14, 15]], control: { centerPositions: [[16, 17, 18]], jumpPositions: [[17, 18, 19]], respawnPositions: [[19, 20, 21]] }, portalPositions: [], springboardPositions: [] },
    { stageId: "icebreaker", setupDetection: { position: [22, 23, 24], radius: 30 }, bastionPositions: [[25, 26, 27]], control: { centerPositions: [], jumpPositions: [[31, 32, 33]], respawnPositions: [[34, 35, 36]] }, portalPositions: [[28, 29, 30]], springboardPositions: [] },
  ],
};

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

  it("accepts localized Raw Workshop array assignments copied from the game", () => {
    const result = parseSpatialConfigSource(`
      全局.bastionPosition = 数组(矢量(-10.300, 6.832, -132.595), 矢量(-41.189, 3.790, -155.701), 矢量(-1.528, 12.665, -112.339), 矢量(10.710, 10.361, -67.628), 矢量(-15.164, 9.512, -47.168), 矢量(-4.057, 10.450, -18.278), 矢量(13.362, 4.189, 13.072), 矢量(-43.153, 3, 42.732), 矢量(-58.618, 0.007, 19.441));
      全局.endPosition = 矢量(1, 2, 3);
      全局.heroRingPosition = 矢量(4, 5, 6);
      全局.resetPosition = 矢量(7, 8, 9);
      全局.creditsPosition = 矢量(10, 11, 12);
    `);

    expect(result).toMatchObject({ ok: true });
    if (!result.ok) return;
    expect(result.config.bastionPositions).toHaveLength(9);
    expect(result.config.bastionPositions[0]).toEqual([-10.3, 6.832, -132.595]);
    expect(result.config.bastionPositions[8]).toEqual([-58.618, 0.007, 19.441]);
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

  it("preserves composed stage JSON and summarizes every atomic stage", () => {
    const result = parseSpatialConfigSource(JSON.stringify(compositeConfig));

    expect(result).toMatchObject({ ok: true, config: compositeConfig, summary: { totalPositions: 17 } });
    expect(formatWorkshopSpatialConfig(compositeConfig)).toBe(JSON.stringify(compositeConfig, null, 2));
  });

  it("rejects invalid composite JSON in the editor before submit", () => {
    const invalidConfigs = [
      { ...compositeConfig, stages: [{ ...compositeConfig.stages[0], stageId: "invalid stage" }, ...compositeConfig.stages.slice(1)] },
      { ...compositeConfig, composition: { ...compositeConfig.composition, firstStageSelection: { mode: "setup_detection", fallbackStageId: "missing" } } },
      { ...compositeConfig, composition: { ...compositeConfig.composition, selectionCount: 4 } },
      { ...compositeConfig, stages: [compositeConfig.stages[0], { ...compositeConfig.stages[1], setupDetection: undefined }, compositeConfig.stages[2]] },
    ];

    for (const config of invalidConfigs) {
      expect(parseSpatialConfigSource(JSON.stringify(config))).toMatchObject({ ok: false });
    }
  });

  it("does not flatten a composed route when Raw Workshop code is pasted", () => {
    const composite = {
      composition: {
        selectionCount: 2,
        firstStageSelection: { mode: "setup_detection", fallbackStageId: "base" },
        remainingStageSelection: "random_unique",
      },
      stages: [{ stageId: "base" }],
    };

    expect(parseSpatialConfigSource(source, composite)).toEqual({
      ok: false,
      error: "组合路线请使用平台空间 JSON 编辑原子阶段与选择约束。",
    });
  });

  it("imports shared route points separately from atomic-stage points", () => {
    const route = parseSpatialConfigSource(`
      Global.endPosition = Vector(4, 5, 6);
      Global.heroRingPosition = Vector(7, 8, 9);
      Global.resetPosition = Vector(1, 2, 3);
      Global.creditsPosition = Vector(10, 11, 12);
      Global.controlRespawnAxis = 0;
      Global.controlRespawnAxisThreshold = 40;
    `, sharedCompositeConfig, "composite-route");
    expect(route).toMatchObject({
      ok: true,
      config: {
        resetPosition: [1, 2, 3],
        endPosition: [4, 5, 6],
        thirdPersonPosition: [7, 8, 9],
        creditsPosition: [10, 11, 12],
        control: { respawnAxis: "x", respawnAxisThreshold: 40 },
      },
    });

    const stage = parseSpatialConfigSource(`
      Global.bastionPosition[0] = Vector(13, 14, 15);
      Modify Global Variable(controlCenterPosition, Append To Array, Vector(16, 17, 18));
      Modify Global Variable(controlJumpPosition, Append To Array, Vector(17, 18, 19));
      Modify Global Variable(controlRespawnPosition, Append To Array, Vector(19, 20, 21));
      Modify Global Variable(portalPosition, Append To Array, Vector(28, 29, 30));
    `, null, "composite-stage");
    expect(stage).toMatchObject({
      ok: true,
      config: {
        bastionPositions: [[13, 14, 15]],
        control: { centerPositions: [[16, 17, 18]], jumpPositions: [[17, 18, 19]], respawnPositions: [[19, 20, 21]] },
        portalPositions: [[28, 29, 30]],
      },
    });
    if (route.ok) expect(route.config).not.toHaveProperty("stages");
    if (stage.ok) expect(stage.config).not.toHaveProperty("endPosition");
  });

  it("formats route and stage imports without mixing their spatial ownership", () => {
    const route = formatWorkshopSpatialConfig({
      resetPosition: [1, 2, 3],
      endPosition: [4, 5, 6],
      thirdPersonPosition: [7, 8, 9],
      creditsPosition: [10, 11, 12],
      control: { respawnAxis: "x", respawnAxisThreshold: 40 },
    }, "composite-route");
    expect(route).toContain("Global.endPosition = Vector(4, 5, 6);");
    expect(route).toContain("Global.controlRespawnAxis = 0;");
    expect(route).not.toContain("bastionPosition");

    const stage = formatWorkshopSpatialConfig({
      bastionPositions: [[13, 14, 15]],
      control: { centerPositions: [[16, 17, 18]], jumpPositions: [[17, 18, 19]], respawnPositions: [[19, 20, 21]] },
      portalPositions: [[28, 29, 30]],
      springboardPositions: [],
    }, "composite-stage");
    expect(stage).toContain("Global.bastionPosition[0] = Vector(13, 14, 15);");
    expect(stage).toContain("Append To Array, Vector(16, 17, 18)");
    expect(stage).not.toContain("endPosition");
  });

  it("round-trips optional route anchors on a composite stage", () => {
    const stageConfig = {
      bastionPositions: [[13, 14, 15]],
      resetPosition: [-30.05, 17, -118.12],
      thirdPersonPosition: [-30.05, 17, -133.42],
      creditsPosition: [-43.73, 19, -125.54],
      endPosition: [104.77, 17.74, -137.21],
      control: null,
      portalPositions: [],
      springboardPositions: [],
    };
    const source = formatWorkshopSpatialConfig(stageConfig, "composite-stage");
    expect(parseSpatialConfigSource(source, null, "composite-stage")).toMatchObject({ ok: true, config: stageConfig });
    expect(parseSpatialConfigSource("Global.bastionPosition[0] = Vector(1, 2, 3);\nGlobal.controlRespawnAxis = 0;", null, "composite-stage")).toMatchObject({ ok: false });
  });

  it("rejects full JSON in scoped Workshop point importers", () => {
    expect(parseSpatialConfigSource(JSON.stringify(sharedCompositeConfig), null, "composite-route")).toMatchObject({ ok: false });
    expect(parseSpatialConfigSource(JSON.stringify(sharedCompositeConfig), null, "composite-stage")).toMatchObject({ ok: false });
  });
});
