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
      variant: true,
      achievement: true,
      skipped: [],
    });
    expect(matchOcrResult({ ...baseInput, challengeType: "difficulty_completion", mapName: "釜山" }).map).toBe(false);
    expect(matchOcrResult({ ...baseInput, challengeType: "difficulty_completion", difficulty: "地狱" }).difficulty).toBe(true);
    expect(matchOcrResult({ ...baseInput, challengeType: "difficulty_completion", difficulty: "传奇", targetDifficulty: "地狱" }).difficulty).toBe(false);
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
      variant: true,
      achievement: true,
      skipped: ["map", "difficulty"],
    });
  });

  it("still requires completion and the bound player for title challenges", () => {
    expect(matchOcrResult({ ...baseInput, challengeType: "title_achievement", challengeCompleted: false }).completed).toBe(false);
    expect(matchOcrResult({ ...baseInput, challengeType: "title_achievement", player: "Other#1234" }).player).toBe(false);
  });

  it("matches a title from the raw achievement panel when catalog candidates are absent", () => {
    expect(matchOcrResult({ ...baseInput, challengeType: "title_achievement", titleName: "钢门", achievementPanelText: "钢门 ✓" }).achievement).toBe(true);
    expect(matchOcrResult({ ...baseInput, challengeType: "title_achievement", titleName: "钢门", achievementPanelText: "英雄：51/51" }).achievement).toBe(false);
  });

  it("keeps catalog title candidates as the preferred evidence", () => {
    expect(matchOcrResult({ ...baseInput, challengeType: "title_achievement", titleName: "钢门", achievementTitles: ["钢门"] }).achievement).toBe(true);
  });

  it("matches a map-scoped title challenge against the selected map", () => {
    expect(matchOcrResult({ ...baseInput, challengeType: "map_title_achievement" }).skipped).toEqual([]);
    expect(matchOcrResult({ ...baseInput, challengeType: "map_title_achievement", mapName: "釜山" }).map).toBe(false);
    expect(matchOcrResult({ ...baseInput, challengeType: "map_title_achievement", difficulty: "地狱" }).difficulty).toBe(true);
    expect(matchOcrResult({ ...baseInput, challengeType: "map_title_achievement", targetDifficulty: null, titleName: "主宰", mapVariant: "classic" }).achievement).toBe(true);
  });

  it("normalizes player names before comparing them", () => {
    expect(matchOcrResult({ ...baseInput, challengeType: "title_achievement", player: " player#9999 " }).player).toBe(true);
  });

  it("matches classic and formal map challenges to their corresponding OCR variant", () => {
    expect(matchOcrResult({ ...baseInput, challengeType: "map_title_achievement", mapVariant: "classic", requiredMapVariant: "classic" }).variant).toBe(true);
    expect(matchOcrResult({ ...baseInput, challengeType: "map_title_achievement", mapVariant: null, requiredMapVariant: "classic" }).variant).toBe(false);
    expect(matchOcrResult({ ...baseInput, challengeType: "map_title_achievement", mapVariant: null }).variant).toBe(true);
    expect(matchOcrResult({ ...baseInput, challengeType: "map_title_achievement", mapVariant: "classic" }).variant).toBe(false);
  });
});
