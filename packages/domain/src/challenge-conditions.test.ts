import { describe, expect, it } from "vitest";
import { evaluateCanonicalChallengeConditions, parseCanonicalChallengeConditions } from "./challenge-conditions";

describe("canonical Challenge Conditions", () => {
  it("parses the bounded condition vocabulary and rejects unknown rule types", () => {
    expect(parseCanonicalChallengeConditions(JSON.stringify({ operator: "and", conditions: [{ type: "map", mapId: "map.one" }, { type: "completed" }] }))).toEqual({
      operator: "and",
      conditions: [{ type: "map", mapId: "map.one" }, { type: "completed" }],
    });
    expect(parseCanonicalChallengeConditions({ operator: "and", conditions: [{ type: "script", expression: "true" }] })).toBeNull();
    expect(parseCanonicalChallengeConditions({ operator: "and", conditions: [] })).toBeNull();
  });

  it("evaluates each accepted condition from structured evidence", () => {
    const conditions = parseCanonicalChallengeConditions({ operator: "and", conditions: [
      { type: "map", mapId: "map.one" },
      { type: "completed" },
      { type: "difficulty_at_least", difficulty: "传奇" },
      { type: "map_variant", variant: "classic" },
      { type: "achievement_title", titleKey: "TITLE.ONE" },
    ] });
    expect(evaluateCanonicalChallengeConditions(conditions, {
      mapId: "map.one", completed: true, difficulty: "地狱：通关", mapVariant: "classic", achievementTitles: ["荣耀"],
    }, new Map([["TITLE.ONE", "荣耀"]]))).toEqual({
      supported: true,
      matched: true,
      requiredFields: ["map_name", "challenge_completed", "difficulty", "map_variant", "achievement_titles"],
    });
  });

  it("uses the declared operator and requires checked evidence for achievement panel text", () => {
    const conditions = parseCanonicalChallengeConditions({ operator: "or", conditions: [
      { type: "map", mapId: "map.other" },
      { type: "achievement_title", titleKey: "TITLE.ONE" },
    ] });
    const names = new Map([["TITLE.ONE", "荣耀"]]);
    expect(evaluateCanonicalChallengeConditions(conditions, { mapId: "map.one", achievementPanelText: "荣耀 ✓" }, names).matched).toBe(true);
    expect(evaluateCanonicalChallengeConditions(conditions, { mapId: "map.one", achievementPanelText: "荣耀" }, names).matched).toBe(false);
  });

  it("does not accept a higher difficulty unless the condition says at least", () => {
    const exactMap = parseCanonicalChallengeConditions({ operator: "and", conditions: [{ type: "map", mapId: "map.one" }] });
    const atLeast = parseCanonicalChallengeConditions({ operator: "and", conditions: [{ type: "difficulty_at_least", difficulty: "传奇" }] });
    expect(evaluateCanonicalChallengeConditions(exactMap, { mapId: "map.one", difficulty: "地狱" }).matched).toBe(true);
    expect(evaluateCanonicalChallengeConditions(atLeast, { difficulty: "困难" }).matched).toBe(false);
  });
});
