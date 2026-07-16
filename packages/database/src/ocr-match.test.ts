import { describe, expect, it } from "vitest";
import { matchOcrResult } from "./ocr-match";

const baseInput = {
  targetMapName: "萨摩亚",
  targetDifficulty: "传奇",
  targetPlayerName: "Player#1234",
  mapName: "萨摩亚",
  difficulty: "传奇",
  challengeCompleted: true,
  player: "Player#1234",
};

describe("matchOcrResult", () => {
  it("matches a map challenge only when all OCR fields match", () => {
    expect(matchOcrResult({ ...baseInput, challengeType: "difficulty_completion" })).toEqual({
      map: true,
      difficulty: true,
      completed: true,
      player: true,
      skipped: [],
    });
    expect(matchOcrResult({ ...baseInput, challengeType: "difficulty_completion", mapName: "釜山" }).map).toBe(false);
    expect(matchOcrResult({ ...baseInput, challengeType: "difficulty_completion", difficulty: "地狱" }).difficulty).toBe(false);
  });

  it("skips map and difficulty checks for title challenges", () => {
    expect(matchOcrResult({
      ...baseInput,
      challengeType: "title_achievement",
      mapName: "真实截图中的地图",
      difficulty: null,
    })).toEqual({
      map: true,
      difficulty: true,
      completed: true,
      player: true,
      skipped: ["map", "difficulty"],
    });
  });

  it("still requires completion and the bound player for title challenges", () => {
    expect(matchOcrResult({ ...baseInput, challengeType: "title_achievement", challengeCompleted: false }).completed).toBe(false);
    expect(matchOcrResult({ ...baseInput, challengeType: "title_achievement", player: "Other#1234" }).player).toBe(false);
  });

  it("normalizes player names before comparing them", () => {
    expect(matchOcrResult({ ...baseInput, challengeType: "title_achievement", player: " player#9999 " }).player).toBe(true);
  });
});
