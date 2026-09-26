import { describe, expect, it } from "vitest";
import { parseCanonicalChallengeConditions } from "@owbastion/domain";
import { assessChallengeOcrQuality } from "./ocr-response";

const conditions = parseCanonicalChallengeConditions({
  operator: "and",
  conditions: [
    { type: "map", mapId: "map.test" },
    { type: "completed" },
    { type: "difficulty_at_least", difficulty: "传奇" },
  ],
});

const response = {
  schema_version: "1",
  ok: true,
  layout_version: "1280x720-v6",
  fields: {
    map_name: { status: "ok", confidence: 0.9 },
    challenge_completed: { status: "ok", confidence: 0.9 },
    difficulty: { status: "ok", confidence: 0.9 },
  },
  data: { map_name: "测试地图", challenge_completed: true, difficulty: "地狱" },
};

describe("platform-owned Challenge OCR quality policy", () => {
  it("accepts supported layouts with reliable evidence for every required Condition field", () => {
    expect(assessChallengeOcrQuality(conditions, response).accepted).toBe(true);
  });

  it("routes unsupported layouts and low-confidence required evidence to review", () => {
    expect(assessChallengeOcrQuality(conditions, { ...response, layout_version: "future-layout" }).reasons).toContain("unsupported_layout_version");
    expect(assessChallengeOcrQuality(conditions, {
      ...response,
      fields: { ...response.fields, difficulty: { status: "ok", confidence: 0.4 } },
    }).reasons).toContain("difficulty:low_confidence");
  });

  it("allows human visual confirmation to bypass OCR quality metadata but not missing business facts", () => {
    expect(assessChallengeOcrQuality(conditions, { ...response, layout_version: "future-layout", fields: {} }, true).accepted).toBe(true);
    expect(assessChallengeOcrQuality(conditions, { ...response, data: { ...response.data, difficulty: null } }, true).reasons).toContain("difficulty:missing_value");
  });
});
