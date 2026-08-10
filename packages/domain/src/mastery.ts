export const masteryDifficulties = ["简单", "一般", "困难", "专家", "传奇", "地狱"] as const;

export type MasteryDifficulty = (typeof masteryDifficulties)[number];
export type MasteryRunStatus = "active" | "invalidated";
export type MasteryMapVariant = "classic" | null;

export const masteryXpRuleV1 = {
  version: "v1",
  baseDifficultyXp: {
    简单: 100,
    一般: 150,
    困难: 225,
    专家: 325,
    传奇: 450,
    地狱: 600,
  } satisfies Record<MasteryDifficulty, number>,
  defaultMapFactor: 1,
  performanceBonus: {
    noDeaths: 0.05,
    noSkips: 0.05,
    cap: 0.1,
  },
  challengeBonus: 0,
} as const;

export type MasteryXpInput = {
  difficulty: MasteryDifficulty;
  mapFactor?: number | null;
  deaths?: number | null;
  skips?: number | null;
};

export type MasteryXpSnapshot = {
  ruleVersion: typeof masteryXpRuleV1.version;
  baseDifficultyXp: number;
  mapFactor: number;
  performanceBonus: number;
  performanceBonusReasons: Array<"no_deaths" | "no_skips">;
  challengeBonus: typeof masteryXpRuleV1.challengeBonus;
};

export type MasteryXpAward = {
  awardedXp: number;
  snapshot: MasteryXpSnapshot;
};

const validSettlementCount = (value: number | null | undefined) => value === undefined || value === null || Number.isInteger(value) && value >= 0;

export const normalizeMasteryRunCode = (value: string) => {
  const normalized = value.trim().replace(/[‐‑‒–—−﹘﹣－]/gu, "-").replace(/\s+/gu, "");
  if (!/^[1-9]\d{3}(?:-[1-9]\d{3}){2}$/.test(normalized)) throw new Error("MASTERY_RUN_CODE_INVALID");
  return normalized;
};

export const calculateMasteryXpV1 = (input: MasteryXpInput): MasteryXpAward => {
  if (!validSettlementCount(input.deaths) || !validSettlementCount(input.skips)) throw new Error("MASTERY_SETTLEMENT_VALUE_INVALID");
  const mapFactor = input.mapFactor ?? masteryXpRuleV1.defaultMapFactor;
  if (!Number.isFinite(mapFactor) || mapFactor <= 0) throw new Error("MASTERY_MAP_FACTOR_INVALID");

  const performanceBonusReasons: MasteryXpSnapshot["performanceBonusReasons"] = [];
  if (input.deaths === 0) performanceBonusReasons.push("no_deaths");
  if (input.skips === 0) performanceBonusReasons.push("no_skips");
  const performanceBonus = Math.min(
    masteryXpRuleV1.performanceBonus.cap,
    performanceBonusReasons.reduce((bonus, reason) => bonus + (reason === "no_deaths" ? masteryXpRuleV1.performanceBonus.noDeaths : masteryXpRuleV1.performanceBonus.noSkips), 0),
  );
  const baseDifficultyXp = masteryXpRuleV1.baseDifficultyXp[input.difficulty];
  const awardedXp = Math.round(baseDifficultyXp * mapFactor * (1 + performanceBonus)) + masteryXpRuleV1.challengeBonus;

  return {
    awardedXp,
    snapshot: {
      ruleVersion: masteryXpRuleV1.version,
      baseDifficultyXp,
      mapFactor,
      performanceBonus,
      performanceBonusReasons,
      challengeBonus: masteryXpRuleV1.challengeBonus,
    },
  };
};

export type MasteryRunForProjection = {
  runId: string;
  mapId: string;
  mapVariant: MasteryMapVariant;
  difficulty: MasteryDifficulty;
  completionDurationSeconds: number;
  deaths: number | null;
  skips: number | null;
  awardedXp: number;
  acceptedAt: number;
  status: MasteryRunStatus;
};

export type MasteryDifficultyProfile = {
  difficulty: MasteryDifficulty;
  verifiedRunCount: number;
  fastestCompletionSeconds: number;
};

export type MasteryMapProfile = {
  mapId: string;
  totalXp: number;
  verifiedRunCount: number;
  difficultyStats: MasteryDifficultyProfile[];
  lowestDeaths: number | null;
  fewestSkips: number | null;
  highestSingleRunXp: number | null;
  highestCompletedDifficulty: MasteryDifficulty | null;
  recentRuns: MasteryRunForProjection[];
};

const byMostRecent = (left: MasteryRunForProjection, right: MasteryRunForProjection) => right.acceptedAt - left.acceptedAt || right.runId.localeCompare(left.runId);

const minimum = (values: Array<number | null>) => {
  const present = values.filter((value): value is number => value !== null);
  return present.length ? Math.min(...present) : null;
};

export const buildMasteryMapProfile = (mapId: string, runs: MasteryRunForProjection[], recentLimit = 10): MasteryMapProfile => {
  const activeRuns = runs.filter((run) => run.mapId === mapId && run.status === "active");
  const difficultyStats = masteryDifficulties.flatMap((difficulty) => {
    const matching = activeRuns.filter((run) => run.difficulty === difficulty);
    return matching.length ? [{
      difficulty,
      verifiedRunCount: matching.length,
      fastestCompletionSeconds: Math.min(...matching.map((run) => run.completionDurationSeconds)),
    }] : [];
  });
  const highestCompletedDifficulty = [...masteryDifficulties].reverse().find((difficulty) => activeRuns.some((run) => run.difficulty === difficulty)) ?? null;

  return {
    mapId,
    totalXp: activeRuns.reduce((total, run) => total + run.awardedXp, 0),
    verifiedRunCount: activeRuns.length,
    difficultyStats,
    lowestDeaths: minimum(activeRuns.map((run) => run.deaths)),
    fewestSkips: minimum(activeRuns.map((run) => run.skips)),
    highestSingleRunXp: activeRuns.length ? Math.max(...activeRuns.map((run) => run.awardedXp)) : null,
    highestCompletedDifficulty,
    recentRuns: [...activeRuns].sort(byMostRecent).slice(0, recentLimit),
  };
};

export const buildMasteryProfiles = (runs: MasteryRunForProjection[], recentLimit = 10) => {
  const mapIds = [...new Set(runs.filter((run) => run.status === "active").map((run) => run.mapId))];
  return mapIds
    .map((mapId) => buildMasteryMapProfile(mapId, runs, recentLimit))
    .sort((left, right) => right.totalXp - left.totalXp || right.highestSingleRunXp! - left.highestSingleRunXp! || left.mapId.localeCompare(right.mapId));
};
