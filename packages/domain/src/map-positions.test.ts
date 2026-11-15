import { describe, expect, it } from "vitest";
import { agentSpatialConfigSchema, type AgentSpatialConfig } from "@owbastion/contracts";
import { mapPositionStages } from "./map-positions";

const parse = (value: unknown): AgentSpatialConfig => agentSpatialConfigSchema.parse(value);
const kinds = (stage: { points: Array<{ kind: string }> }) => stage.points.map((point) => point.kind);
const positionsOf = (stage: { points: Array<{ kind: string; position: number[] }> }, kind: string) => stage.points.filter((point) => point.kind === kind).map((point) => point.position);

const single = {
  bastionPositions: [[1, 2, 3], [4, 5, 6]],
  resetPosition: [7, 8, 9],
  endPosition: [10, 11, 12],
  thirdPersonPosition: [13, 14, 15],
  creditsPosition: [16, 17, 18],
  control: { centerPositions: [[19, 20, 21]], jumpPositions: [[22, 23, 24]], respawnPositions: [[25, 26, 27]], respawnAxis: "x", respawnAxisThreshold: 5 },
  portalPositions: [[28, 29, 30], [31, 32, 33]],
  springboardPositions: [[34, 35, 36]],
};

const compositeStage = (stageId: string, offset: number, extra: Record<string, unknown> = {}) => ({
  stageId,
  bastionPositions: [[offset, 0, 0]],
  control: { centerPositions: [[offset + 1, 0, 0]], jumpPositions: [[offset + 2, 0, 0]], respawnPositions: [[offset + 3, 0, 0]] },
  portalPositions: [],
  springboardPositions: [],
  ...extra,
});

const composite = {
  resetPosition: [100, 0, 0],
  endPosition: [101, 0, 0],
  thirdPersonPosition: [102, 0, 0],
  creditsPosition: [103, 0, 0],
  control: { respawnAxis: "x", respawnAxisThreshold: 40 },
  composition: { selectionCount: 2, firstStageSelection: { mode: "random" }, remainingStageSelection: "random_unique" },
  stages: [
    compositeStage("alpha", 10),
    compositeStage("beta", 20, { resetPosition: [200, 0, 0], thirdPersonPosition: [202, 0, 0], creditsPosition: [203, 0, 0], endPosition: [201, 0, 0] }),
  ],
};

describe("map position stages", () => {
  it("draws every role of a single-stage map except the credits point", () => {
    const [stage, ...rest] = mapPositionStages(parse(single));
    expect(rest).toEqual([]);
    expect(kinds(stage!).sort()).toEqual(["bastion", "bastion", "control_center", "control_jump", "control_respawn", "end", "portal", "portal", "reset", "springboard", "third_person"]);
    expect(stage!.points.map((point) => point.position)).not.toContainEqual([16, 17, 18]);
    expect(positionsOf(stage!, "bastion")).toEqual([[1, 2, 3], [4, 5, 6]]);
    expect(positionsOf(stage!, "portal")).toEqual([[28, 29, 30], [31, 32, 33]]);
    expect(positionsOf(stage!, "control_respawn")).toEqual([[25, 26, 27]]);
  });

  it("gives each alternate stage its own full role set after the root stage", () => {
    const alternate = { ...single, stageId: "lighthouse", setupDetection: { position: [0, 0, 0], radius: 10 }, bastionPositions: [[50, 51, 52]], creditsPosition: [53, 54, 55] };
    const stages = mapPositionStages(parse({ ...single, alternateStages: [alternate] }));
    expect(stages).toHaveLength(2);
    expect(positionsOf(stages[0]!, "bastion")).toEqual([[1, 2, 3], [4, 5, 6]]);
    expect(positionsOf(stages[1]!, "bastion")).toEqual([[50, 51, 52]]);
    expect(positionsOf(stages[1]!, "end")).toEqual([[10, 11, 12]]);
    expect(stages[1]!.points.map((point) => point.position)).not.toContainEqual([53, 54, 55]);
  });

  it("draws composite stages without respawn, end, or credits points", () => {
    const [alpha, beta] = mapPositionStages(parse(composite));
    expect(kinds(alpha!).sort()).toEqual(["bastion", "control_center", "control_jump"]);
    expect(positionsOf(alpha!, "control_jump")).toEqual([[12, 0, 0]]);
    expect(kinds(beta!).sort()).toEqual(["bastion", "control_center", "control_jump", "reset", "third_person"]);
    const drawn = [alpha!, beta!].flatMap((stage) => stage.points.map((point) => point.position));
    for (const hidden of [[13, 0, 0], [23, 0, 0], [101, 0, 0], [201, 0, 0], [103, 0, 0], [203, 0, 0]]) expect(drawn).not.toContainEqual(hidden);
  });

  it("draws a composite stage's own reset and third-person points and never the route root's", () => {
    const [alpha, beta] = mapPositionStages(parse(composite));
    expect(positionsOf(alpha!, "reset")).toEqual([]);
    expect(positionsOf(alpha!, "third_person")).toEqual([]);
    expect(positionsOf(beta!, "reset")).toEqual([[200, 0, 0]]);
    expect(positionsOf(beta!, "third_person")).toEqual([[202, 0, 0]]);
    const drawn = [alpha!, beta!].flatMap((stage) => stage.points.map((point) => point.position));
    expect(drawn).not.toContainEqual([100, 0, 0]);
    expect(drawn).not.toContainEqual([102, 0, 0]);
  });

  it("draws each legacy full-stage composite stage's own reset and third-person points without respawn, end, or credits points", () => {
    const legacyStage = (stageId: string, offset: number) => ({ ...single, stageId, bastionPositions: [[offset, 0, 0]] });
    const stages = mapPositionStages(parse({ composition: composite.composition, stages: [legacyStage("alpha", 1), legacyStage("beta", 2)] }));
    expect(stages).toHaveLength(2);
    expect(kinds(stages[0]!).sort()).toEqual(["bastion", "control_center", "control_jump", "portal", "portal", "reset", "springboard", "third_person"]);
  });
});
