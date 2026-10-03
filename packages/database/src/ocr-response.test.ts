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
  layout_version: "1280x720-v7",
  fields: {
    map_name: { status: "ok", confidence: 0.9 },
    challenge_completed: { status: "ok", confidence: 0.9 },
    difficulty: { status: "ok", confidence: 0.9 },
  },
  data: { map_name: "测试地图", challenge_completed: true, difficulty: "地狱" },
};

describe("platform-owned Challenge OCR quality policy", () => {
  it.each(["1280x720-v7", "1280x800-v2"])("accepts current layout %s with reliable evidence for every required Condition field", (layout_version) => {
    expect(assessChallengeOcrQuality(conditions, { ...response, layout_version }).accepted).toBe(true);
  });

  it.each(["1280x720-v6", "1280x800-v1", "future-layout"])("routes unapproved layout %s to review", (layout_version) => {
    expect(assessChallengeOcrQuality(conditions, { ...response, layout_version }).reasons).toContain("unsupported_layout_version");
  });

  it("rejects cropped and conflicting layout evidence even when the layout is supported", () => {
    expect(assessChallengeOcrQuality(conditions, { ...response, quality: { cropped: true } }).reasons).toContain("cropped_input");
    expect(assessChallengeOcrQuality(conditions, { ...response, quality: { layout_version: "1280x800-v2" } }).reasons).toContain("conflicting_layout_version");
  });

  it("routes low-confidence required evidence to review", () => {
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
