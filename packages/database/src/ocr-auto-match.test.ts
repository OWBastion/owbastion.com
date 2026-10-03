import { describe, expect, it } from "vitest";
import type { Challenge } from "@owbastion/contracts";
import { parseCanonicalChallengeConditions } from "@owbastion/domain";
import { matchOcrAgainstChallenges, type CanonicalOcrChallenge } from "./ocr-auto-match";

const response = {
  schema_version: "1",
  ok: true,
  layout_version: "1280x720-v7",
  fields: {
    challenge_completed: { status: "ok", confidence: 0.98 },
    viewer_player: { status: "ok", confidence: 0.98 },
    map_name: { status: "ok", confidence: 0.98 },
    difficulty: { status: "ok", confidence: 0.98 },
    map_variant: { status: "ok", confidence: 0.98 },
    achievement_titles: { status: "ok", confidence: 0.98 },
  },
  data: { map_name: "萨摩亚", difficulty: "传奇", viewer_player: "Different#1234", challenge_completed: true, achievement_titles: ["征服者"] },
} as const;

const mapChallenge = (id: string, difficulty = "传奇", mapName = "萨摩亚"): Challenge => ({
  challengeId: id, family: "map", gameplayRevisionId: "revision:map.samoa:initial", type: "map_completion", kind: "difficulty_completion",
  name: `${difficulty}通关`, mapId: "map.samoa", mapName, difficulty, gameVersion: "1", status: "active", submissionMode: "manual", titleKey: id.toUpperCase(),
});

const candidate = (challenge: Challenge, conditions: unknown, canonicalChallengeId = `canonical:${challenge.challengeId}`): CanonicalOcrChallenge => ({
  challenge,
  canonicalChallengeId,
  conditions: parseCanonicalChallengeConditions(conditions),
});

const mapConditions = (difficulty: string) => ({ operator: "and", conditions: [
  { type: "map", mapId: "map.samoa" },
  { type: "completed" },
  { type: "difficulty_at_least", difficulty },
] });

const mapIdsByName = new Map([["萨摩亚", "map.samoa"]]);

describe("canonical OCR Challenge matching", () => {
  it("evaluates all matching Challenge Conditions, including higher difficulties only through at-least semantics", () => {
    const result = matchOcrAgainstChallenges([
      candidate(mapChallenge("map.samoa.conqueror", "传奇"), mapConditions("传奇")),
      candidate(mapChallenge("map.samoa.dominator", "地狱"), mapConditions("地狱")),
    ], { ...response, data: { ...response.data, difficulty: "地狱" } }, mapIdsByName, new Map());
    expect(result.outcome).toBe("automatic");
    expect(result.exact.map(({ challenge }) => challenge.challengeId)).toEqual(["map.samoa.conqueror", "map.samoa.dominator"]);
  });

  it("evaluates multiple Challenge families in one evidence set", () => {
    const achievement: Challenge = {
      challengeId: "title.conqueror", family: "achievement", type: "title_achievement", kind: "title_achievement",
      titleKey: "CONQUEROR", titleName: "征服者", icon: "legacy", category: "挑战", condition: "完成挑战", evidenceRule: "勾选",
      gameVersion: "1", status: "active", submissionMode: "manual",
    };
    const result = matchOcrAgainstChallenges([
      candidate(mapChallenge("map.samoa.conqueror"), mapConditions("传奇")),
      candidate(achievement, { operator: "and", conditions: [{ type: "achievement_title", titleKey: "CONQUEROR" }] }),
    ], response, mapIdsByName, new Map([["CONQUEROR", "征服者"]]));
    expect(result.outcome).toBe("automatic");
    expect(result.exact).toHaveLength(2);
  });

  it("uses only a satisfied OR Condition branch for its quality gate", () => {
    const achievement: Challenge = {
      challengeId: "title.conqueror", family: "achievement", type: "title_achievement", kind: "title_achievement",
      titleKey: "CONQUEROR", titleName: "征服者", icon: "legacy", category: "挑战", condition: "完成挑战", evidenceRule: "勾选",
      gameVersion: "1", status: "active", submissionMode: "manual",
    };
    const { achievement_titles: _field, ...fields } = response.fields;
    const { achievement_titles: _value, ...data } = response.data;
    const result = matchOcrAgainstChallenges([
      candidate(achievement, { operator: "or", conditions: [
        { type: "map", mapId: "map.samoa" },
        { type: "achievement_title", titleKey: "CONQUEROR" },
      ] }),
    ], { ...response, fields, data }, mapIdsByName, new Map([ ["CONQUEROR", "征服者"] ]));

    expect(result.outcome).toBe("automatic");
    expect(result.exact[0]?.quality.requiredFields).toEqual(["map_name"]);
  });

  it("does not let a non-matching Challenge with absent evidence block a separate match", () => {
    const achievement: Challenge = {
      challengeId: "title.flawless", family: "achievement", type: "title_achievement", kind: "title_achievement",
      titleKey: "FLAWLESS", titleName: "无伤", icon: "legacy", category: "挑战", condition: "全成就完成", evidenceRule: "成就列表",
      gameVersion: "1", status: "active", submissionMode: "manual",
    };
    const { achievement_titles: _field, ...fields } = response.fields;
    const { achievement_titles: _value, ...data } = response.data;
    const result = matchOcrAgainstChallenges([
      candidate(mapChallenge("map.samoa.conqueror"), mapConditions("传奇")),
      candidate(achievement, { operator: "and", conditions: [{ type: "achievement_title", titleKey: "FLAWLESS" }] }),
    ], { ...response, fields, data }, mapIdsByName, new Map([ ["FLAWLESS", "无伤"] ]));

    expect(result.outcome).toBe("automatic");
    expect(result.exact.map(({ challenge }) => challenge.challengeId)).toEqual(["map.samoa.conqueror"]);
    expect(result.lowConfidence).toEqual([]);
  });

  it("routes an unsupported OCR response to review even when no Challenge is a candidate", () => {
    const result = matchOcrAgainstChallenges([], { ...response, layout_version: "future-layout" }, mapIdsByName, new Map());

    expect(result.outcome).toBe("review");
  });

  it("routes unsupported layouts and weak fields to human review", () => {
    const lowConfidence = { ...response, fields: { ...response.fields, map_name: { status: "ok", confidence: 0.4 } } };
    expect(matchOcrAgainstChallenges([candidate(mapChallenge("challenge"), mapConditions("传奇"))], lowConfidence, mapIdsByName, new Map()).outcome).toBe("review");
    expect(matchOcrAgainstChallenges([candidate(mapChallenge("challenge"), mapConditions("传奇"))], { ...response, layout_version: "future-layout" }, mapIdsByName, new Map()).outcome).toBe("review");
  });

  it("lets explicit human review confirm complete facts from an unsupported layout", () => {
    const result = matchOcrAgainstChallenges(
      [candidate(mapChallenge("challenge"), mapConditions("传奇"))],
      { ...response, layout_version: "future-layout", fields: {} },
      mapIdsByName,
      new Map(),
      true,
    );
    expect(result.outcome).toBe("automatic");
    expect(result.exact).toHaveLength(1);
  });

  it("fails closed on unknown canonical Condition types", () => {
    const unsupported = candidate(mapChallenge("challenge"), { operator: "and", conditions: [{ type: "script", expression: "true" }] });
    const result = matchOcrAgainstChallenges([unsupported], response, mapIdsByName, new Map());
    expect(result.outcome).toBe("review");
    expect(result.candidates[0]?.evaluation.supported).toBe(false);
  });
});
