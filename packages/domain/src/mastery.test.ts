import { describe, expect, it } from "vitest";
import { buildMasteryMapProfile, buildMasteryProfiles, calculateVerifiedRunXpV3, beijingDayStart, createVerifiedRunEvidenceCompatibilityV1, isVerifiedRunEvidenceCompatibilityEnabled, isVerifiedRunGameVersionSupported, isVerifiedRunOcrLayoutSupported, normalizeMatchCode, runCodeEventWeightTotal, eventWeightTotalCode, type VerifiedRunForProjection } from "./mastery";

const run = (overrides: Partial<VerifiedRunForProjection> = {}): VerifiedRunForProjection => ({
  runId: "run-1",
  mapId: "map.test",
  gameplayRevisionId: "revision:map.test:initial",
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

describe("run codes and evidence compatibility", () => {
  it("normalizes only the canonical three-part run code", () => {
    expect(normalizeMatchCode(" 1234－5678—9012 ")).toBe("1234-5678-9012");
  });

  it("reads the event-weight total Bastion embeds in run codes from 26.1004.6", () => {
    // Bastion places round(62.7 * 100) = 6270 at group 1 digits 2-3, group 2 digit 3, group 3 digit 4.
    expect(runCodeEventWeightTotal("1629-3471-5820", "26.1004.6")).toBe(6270);
    expect(runCodeEventWeightTotal("9695-1153-2370", "26.1005.3")).toBe(6950);
    expect(runCodeEventWeightTotal("1629-3471-5820", "26.1004.5")).toBeNull();
    expect(eventWeightTotalCode(Array.from({ length: 627 }, () => 0.1))).toBe(6270);
    expect(eventWeightTotalCode([60, 9.5])).toBe(6950);
    expect(() => normalizeMatchCode("0123-4567-8901")).toThrow("MATCH_CODE_INVALID");
  });

  it("keeps the platform-owned game and OCR compatibility gate explicit", () => {
    const releasedCompatibility = createVerifiedRunEvidenceCompatibilityV1({ minimumGameVersion: "99.0101.1", supportedOcrLayoutVersions: ["test-layout-v1"] });
    expect(isVerifiedRunEvidenceCompatibilityEnabled()).toBe(false);
    expect(isVerifiedRunEvidenceCompatibilityEnabled(releasedCompatibility)).toBe(true);
    expect(isVerifiedRunGameVersionSupported("99.0101.1", releasedCompatibility)).toBe(true);
    expect(isVerifiedRunGameVersionSupported("99.0102.1", releasedCompatibility)).toBe(true);
    expect(isVerifiedRunGameVersionSupported("99.0100.9", releasedCompatibility)).toBe(false);
    expect(isVerifiedRunGameVersionSupported("legacy", releasedCompatibility)).toBe(false);
    expect(isVerifiedRunOcrLayoutSupported("test-layout-v1", releasedCompatibility)).toBe(true);
    expect(isVerifiedRunOcrLayoutSupported("test-layout-v0", releasedCompatibility)).toBe(false);
    expect(createVerifiedRunEvidenceCompatibilityV1({ minimumGameVersion: "unreleased", supportedOcrLayoutVersions: ["test-layout-v1"] }).minimumGameVersion).toBeNull();
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
    expect(buildMasteryMapProfile("map.test", "revision:map.test:initial", activeRuns, 2)).toEqual({
      mapId: "map.test",
      gameplayRevisionId: "revision:map.test:initial",
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

  it("strips ledger-only facts from the recent-run projection", () => {
    const ledgerRun = { ...run(), matchCode: "1234-5678-9012", sourceSubmissionId: "submission-1", playerAccountId: "account-1", eventCounters: { "event.alpha": 1 }, xpInputSnapshot: { ruleVersion: "v1" } } as VerifiedRunForProjection;
    const [recentRun] = buildMasteryMapProfile("map.test", "revision:map.test:initial", [ledgerRun]).recentRuns;
    expect(recentRun).toEqual(run());
    expect(JSON.stringify(recentRun)).not.toMatch(/matchCode|sourceSubmissionId|playerAccountId|eventCounters|xpInputSnapshot/);
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

  it("keeps active runs from different gameplay revisions out of each other's profiles", () => {
    const runs = [
      run({ runId: "run-default", gameplayRevisionId: "revision:map.test:r2", awardedXp: 325 }),
      run({ runId: "run-classic", gameplayRevisionId: "revision:map.test:r1", mapVariant: "classic", awardedXp: 600 }),
    ];

    expect(buildMasteryProfiles(runs).map((profile) => ({ revision: profile.gameplayRevisionId, totalXp: profile.totalXp, count: profile.verifiedRunCount }))).toEqual([
      { revision: "revision:map.test:r1", totalXp: 600, count: 1 },
      { revision: "revision:map.test:r2", totalXp: 325, count: 1 },
    ]);
  });
});

describe("verified run XP rule v3", () => {
  it("awards XP only for Legend and Hell and ignores deaths and skips", () => {
    for (const difficulty of ["简单", "一般", "困难", "专家"] as const) {
      expect(calculateVerifiedRunXpV3({ difficulty, mapRating: "T0", achievementCount: 3, dailyFirstClear: true }).awardedXp).toBe(0);
    }
    expect(calculateVerifiedRunXpV3({ difficulty: "传奇" })).toEqual({
      awardedXp: 450,
      snapshot: { ruleVersion: "v3", baseDifficultyXp: 450, mapRating: null, mapRatingBonus: 0, achievementCount: 0, achievementBonus: 0, dailyFirstClear: false, dailyFirstClearBonus: 0 },
    });
    expect(calculateVerifiedRunXpV3({ difficulty: "地狱" }).awardedXp).toBe(600);
  });

  it("adds 5% per Challenge, 10% for the daily first clear, and the map-rating bonus", () => {
    expect(calculateVerifiedRunXpV3({ difficulty: "地狱", achievementCount: 2 }).awardedXp).toBe(660);
    expect(calculateVerifiedRunXpV3({ difficulty: "地狱", dailyFirstClear: true }).awardedXp).toBe(660);
    expect(calculateVerifiedRunXpV3({ difficulty: "地狱", mapRating: "T0" }).awardedXp).toBe(720);
    expect(calculateVerifiedRunXpV3({ difficulty: "地狱", mapRating: "T5" }).awardedXp).toBe(600);
    expect([..."T0 T1 T2 T3 T4 T5".split(" ")].map((mapRating) => calculateVerifiedRunXpV3({ difficulty: "地狱", mapRating: mapRating as "T0" }).awardedXp)).toEqual([720, 696, 672, 648, 624, 600]);
    const all = calculateVerifiedRunXpV3({ difficulty: "地狱", mapRating: "T0", achievementCount: 3, dailyFirstClear: true });
    expect(all.awardedXp).toBe(870);
    expect(all.snapshot).toMatchObject({ mapRatingBonus: 0.2, achievementBonus: 0.15, dailyFirstClearBonus: 0.1 });
  });

  it("rolls the day over at Beijing midnight", () => {
    expect(beijingDayStart(Date.parse("2026-10-15T23:59:59+08:00"))).toBe(Date.parse("2026-10-15T00:00:00+08:00"));
    expect(beijingDayStart(Date.parse("2026-10-16T00:00:00+08:00"))).toBe(Date.parse("2026-10-16T00:00:00+08:00"));
  });
});
