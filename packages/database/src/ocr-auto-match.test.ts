import { describe, expect, it } from "vitest";
import { matchOcrAgainstChallenges } from "./ocr-auto-match";

const response = {
  schema_version: "1",
  ok: true,
  fields: {
    challenge_completed: { status: "ok", confidence: 0.98 },
    viewer_player: { status: "ok", confidence: 0.98 },
    map_name: { status: "ok", confidence: 0.98 },
    difficulty: { status: "ok", confidence: 0.98 },
    achievement_titles: { status: "ok", confidence: 0.98 },
  },
  data: { map_name: "萨摩亚", difficulty: "传奇", viewer_player: "Player#1234", challenge_completed: true, achievement_titles: ["征服者"] },
} as const;

const mapChallenge = (id: string, name = "萨摩亚") => ({
  challengeId: id, family: "map" as const, type: "map_completion" as const, kind: "difficulty_completion" as const,
  name: "传奇通关", mapId: "map.samoa", mapName: name, difficulty: "传奇", gameVersion: "1", status: "active" as const,
  submissionMode: "manual" as const, titleKey: "CONQUEROR",
});

describe("matchOcrAgainstChallenges", () => {
  it("returns one automatic candidate when the map evidence is unique and confident", () => {
    const result = matchOcrAgainstChallenges([mapChallenge("map.samoa.conqueror")], response, "Player#1234");
    expect(result.outcome).toBe("automatic");
    expect(result.exact.map(({ challenge }) => challenge.challengeId)).toEqual(["map.samoa.conqueror"]);
  });

  it("routes equal candidates to review instead of guessing", () => {
    const result = matchOcrAgainstChallenges([mapChallenge("one"), mapChallenge("two")], response, "Player#1234");
    expect(result.outcome).toBe("review");
    expect(result.exact).toHaveLength(2);
  });

  it("routes low confidence evidence to review", () => {
    const lowConfidence = { ...response, fields: { ...response.fields, map_name: { status: "ok", confidence: 0.4 } } };
    const result = matchOcrAgainstChallenges([mapChallenge("map.samoa.conqueror")], lowConfidence, "Player#1234");
    expect(result.outcome).toBe("review");
    expect(result.lowConfidence).toHaveLength(1);
  });

  it("does not silently auto-grant a candidate without a reward mapping", () => {
    const { titleKey: _titleKey, ...unmapped } = mapChallenge("unmapped");
    expect(matchOcrAgainstChallenges([unmapped], response, "Player#1234").outcome).toBe("review");
  });
});
