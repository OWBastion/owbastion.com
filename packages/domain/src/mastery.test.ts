import { describe, expect, it } from "vitest";
import { buildMasteryMapProfile, buildMasteryProfiles, calculateMasteryXpV1, masteryXpRuleV1, normalizeMasteryRunCode, type MasteryRunForProjection } from "./mastery";

const run = (overrides: Partial<MasteryRunForProjection> = {}): MasteryRunForProjection => ({
  runId: "run-1",
  mapId: "map.test",
  mapVariant: null,
  difficulty: "困难",
  completionDurationSeconds: 600,
  deaths: 2,
  skips: 1,
  awardedXp: 225,
  acceptedAt: 1,
  status: "active",
  ...overrides,
});

describe("mastery XP rule v1", () => {
  it("keeps all v1 constants centralized and snapshots the deterministic formula", () => {
    expect(masteryXpRuleV1).toEqual({
      version: "v1",
      baseDifficultyXp: { 简单: 100, 一般: 150, 困难: 225, 专家: 325, 传奇: 450, 地狱: 600 },
      defaultMapFactor: 1,
      performanceBonus: { noDeaths: 0.05, noSkips: 0.05, cap: 0.1 },
      challengeBonus: 0,
    });
    expect(calculateMasteryXpV1({ difficulty: "困难", mapFactor: 1.1, deaths: 0, skips: 0 })).toEqual({
      awardedXp: 272,
      snapshot: {
        ruleVersion: "v1",
        baseDifficultyXp: 225,
        mapFactor: 1.1,
        performanceBonus: 0.1,
        performanceBonusReasons: ["no_deaths", "no_skips"],
        challengeBonus: 0,
      },
    });
  });

  it("does not infer bonuses from missing settlement facts and rejects invalid configuration", () => {
    expect(calculateMasteryXpV1({ difficulty: "传奇" })).toMatchObject({ awardedXp: 450, snapshot: { performanceBonus: 0, challengeBonus: 0 } });
    expect(() => calculateMasteryXpV1({ difficulty: "传奇", mapFactor: 0 })).toThrow("MASTERY_MAP_FACTOR_INVALID");
    expect(() => calculateMasteryXpV1({ difficulty: "传奇", deaths: -1 })).toThrow("MASTERY_SETTLEMENT_VALUE_INVALID");
  });

  it("normalizes only the canonical three-part run code", () => {
    expect(normalizeMasteryRunCode(" 1234－5678—9012 ")).toBe("1234-5678-9012");
    expect(() => normalizeMasteryRunCode("0123-4567-8901")).toThrow("MASTERY_RUN_CODE_INVALID");
  });
});

describe("mastery projections", () => {
  const activeRuns = [
    run(),
    run({ runId: "run-2", difficulty: "传奇", completionDurationSeconds: 500, deaths: 0, skips: 0, awardedXp: 495, acceptedAt: 2 }),
    run({ runId: "run-3", difficulty: "传奇", completionDurationSeconds: 500, deaths: 0, skips: 1, awardedXp: 450, acceptedAt: 3 }),
    run({ runId: "run-4", difficulty: "简单", completionDurationSeconds: 900, deaths: 8, skips: 3, awardedXp: 999, acceptedAt: 4, status: "invalidated" }),
  ];

  it("returns independent personal bests, deterministic ties, and only active runs", () => {
    expect(buildMasteryMapProfile("map.test", activeRuns, 2)).toEqual({
      mapId: "map.test",
      totalXp: 1170,
      verifiedRunCount: 3,
      difficultyStats: [
        { difficulty: "困难", verifiedRunCount: 1, fastestCompletionSeconds: 600 },
        { difficulty: "传奇", verifiedRunCount: 2, fastestCompletionSeconds: 500 },
      ],
      lowestDeaths: 0,
      fewestSkips: 0,
      highestSingleRunXp: 495,
      highestCompletedDifficulty: "传奇",
      recentRuns: [activeRuns[2], activeRuns[1]],
    });
  });

  it("recomputes invalidation and restoration without cached projection drift", () => {
    const invalidated = [...activeRuns, run({ runId: "run-5", mapId: "map.other", difficulty: "专家", completionDurationSeconds: 400, deaths: 1, skips: 0, awardedXp: 325, acceptedAt: 5, status: "invalidated" })];
    expect(buildMasteryProfiles(invalidated).map((profile) => profile.mapId)).toEqual(["map.test"]);
    const restored = invalidated.map((item) => item.runId === "run-5" ? { ...item, status: "active" as const } : item);
    expect(buildMasteryProfiles(restored).map((profile) => ({ mapId: profile.mapId, totalXp: profile.totalXp, verifiedRunCount: profile.verifiedRunCount }))).toEqual([
      { mapId: "map.test", totalXp: 1170, verifiedRunCount: 3 },
      { mapId: "map.other", totalXp: 325, verifiedRunCount: 1 },
    ]);
  });
});
