import { describe, expect, it } from "vitest";
import { spatialProblems } from "./map-readiness";

const complete = {
  bastionPositions: [[1, 2, 3]], resetPosition: [0, 0, 0], endPosition: [1, 1, 1], thirdPersonPosition: [2, 2, 2], creditsPosition: [3, 3, 3], control: null, portalPositions: [], springboardPositions: [],
};

describe("spatialProblems", () => {
  it("asks for a paste when nothing is configured", () => {
    expect(spatialProblems(null)).toEqual(["还没有粘贴点位"]);
  });

  it("lists each missing single-route point by name", () => {
    expect(spatialProblems({ ...complete, endPosition: undefined, creditsPosition: undefined })).toEqual(["缺少终点", "缺少结算点"]);
    expect(spatialProblems({ ...complete, bastionPositions: [] })).toEqual(["缺少 Bastion 出生点"]);
  });

  it("accepts a complete single route", () => {
    expect(spatialProblems(complete)).toEqual([]);
  });
});
