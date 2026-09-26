export const verifiedRunDifficulties = ["简单", "一般", "困难", "专家", "传奇", "地狱"] as const;

export type VerifiedRunDifficulty = (typeof verifiedRunDifficulties)[number];
export type VerifiedRunStatus = "active" | "invalidated";
export type VerifiedRunMapVariant = "classic" | null;
export type VerifiedRunAcceptanceSource = "submission_automatic" | "submission_review";
export type VerifiedRunEventCounters = Record<string, number>;

const versionParts = (value: string) => {
  const parts = value.trim().split(".");
  if (parts.length !== 3 || parts.some((part) => !/^\d+$/u.test(part))) return null;
  return parts.map(Number);
};

export type VerifiedRunEvidenceCompatibilityV1 = {
  version: "v1";
  minimumGameVersion: string | null;
  supportedOcrLayoutVersions: readonly string[];
  requiredConfidence: number;
};

export const createVerifiedRunEvidenceCompatibilityV1 = (input: {
  minimumGameVersion?: string | null;
  supportedOcrLayoutVersions?: readonly string[];
} = {}): VerifiedRunEvidenceCompatibilityV1 => {
  const minimumGameVersion = input.minimumGameVersion?.trim() ?? "";
  return {
    version: "v1",
    minimumGameVersion: versionParts(minimumGameVersion) ? minimumGameVersion : null,
    supportedOcrLayoutVersions: [...new Set((input.supportedOcrLayoutVersions ?? []).map((value) => value.trim()).filter(Boolean))],
    requiredConfidence: 0.9,
  };
};

/**
 * The default is deliberately disabled until operators record releases that
 * carry the run-code HUD and its matching OCR layout.
 */
export const verifiedRunEvidenceCompatibilityV1 = createVerifiedRunEvidenceCompatibilityV1();

export const isVerifiedRunEvidenceCompatibilityEnabled = (compatibility: VerifiedRunEvidenceCompatibilityV1 = verifiedRunEvidenceCompatibilityV1) =>
  compatibility.minimumGameVersion !== null && compatibility.supportedOcrLayoutVersions.length > 0;

export const isVerifiedRunGameVersionSupported = (value: string, compatibility: VerifiedRunEvidenceCompatibilityV1 = verifiedRunEvidenceCompatibilityV1) => {
  const candidate = versionParts(value);
  const minimum = compatibility.minimumGameVersion ? versionParts(compatibility.minimumGameVersion) : null;
  if (!candidate || !minimum) return false;
  for (let index = 0; index < candidate.length; index += 1) {
    if (candidate[index] !== minimum[index]) return candidate[index] > minimum[index];
  }
  return true;
};

export const isVerifiedRunOcrLayoutSupported = (value: string | null | undefined, compatibility: VerifiedRunEvidenceCompatibilityV1 = verifiedRunEvidenceCompatibilityV1) =>
  typeof value === "string" && compatibility.supportedOcrLayoutVersions.includes(value.trim());

export const verifiedRunXpRuleV1 = {
  version: "v1",
  baseDifficultyXp: {
    简单: 100,
    一般: 150,
    困难: 225,
    专家: 325,
    传奇: 450,
    地狱: 600,
  } satisfies Record<VerifiedRunDifficulty, number>,
  defaultMapFactor: 1,
  performanceBonus: {
    noDeaths: 0.05,
    noSkips: 0.05,
    cap: 0.1,
  },
  challengeBonus: 0,
} as const;

export type VerifiedRunXpInput = {
  difficulty: VerifiedRunDifficulty;
  mapFactor?: number | null;
  deaths?: number | null;
  skips?: number | null;
};

export type VerifiedRunXpSnapshotV1 = {
  ruleVersion: typeof verifiedRunXpRuleV1.version;
  baseDifficultyXp: number;
  mapFactor: number;
  performanceBonus: number;
  performanceBonusReasons: Array<"no_deaths" | "no_skips">;
  challengeBonus: typeof verifiedRunXpRuleV1.challengeBonus;
};

export type VerifiedRunXpSnapshotV2 = {
  ruleVersion: "v2";
  baseDifficultyXp: number;
  mapFactor: number;
  performanceBonus: number;
  performanceBonusReasons: Array<"no_deaths" | "no_skips">;
};

export type VerifiedRunXpSnapshot = VerifiedRunXpSnapshotV1 | VerifiedRunXpSnapshotV2;

export type VerifiedRunXpAward = {
  awardedXp: number;
  snapshot: VerifiedRunXpSnapshot;
};

const validSettlementCount = (value: number | null | undefined) => value === undefined || value === null || Number.isInteger(value) && value >= 0;

export const normalizeMatchCode = (value: string) => {
  const normalized = value.trim().replace(/[‐‑‒–—−﹘﹣－]/gu, "-").replace(/\s+/gu, "");
  if (!/^[1-9]\d{3}(?:-[1-9]\d{3}){2}$/.test(normalized)) throw new Error("MATCH_CODE_INVALID");
  return normalized;
};

export const calculateVerifiedRunXpV1 = (input: VerifiedRunXpInput): { awardedXp: number; snapshot: VerifiedRunXpSnapshotV1 } => {
  if (!Object.hasOwn(verifiedRunXpRuleV1.baseDifficultyXp, input.difficulty)) throw new Error("VERIFIED_RUN_DIFFICULTY_INVALID");
  if (!validSettlementCount(input.deaths) || !validSettlementCount(input.skips)) throw new Error("VERIFIED_RUN_SETTLEMENT_VALUE_INVALID");
  const mapFactor = input.mapFactor ?? verifiedRunXpRuleV1.defaultMapFactor;
  if (!Number.isFinite(mapFactor) || mapFactor <= 0) throw new Error("VERIFIED_RUN_MAP_FACTOR_INVALID");

  const performanceBonusReasons: VerifiedRunXpSnapshotV1["performanceBonusReasons"] = [];
  if (input.deaths === 0) performanceBonusReasons.push("no_deaths");
  if (input.skips === 0) performanceBonusReasons.push("no_skips");
  const performanceBonus = Math.min(
    verifiedRunXpRuleV1.performanceBonus.cap,
    performanceBonusReasons.reduce((bonus, reason) => bonus + (reason === "no_deaths" ? verifiedRunXpRuleV1.performanceBonus.noDeaths : verifiedRunXpRuleV1.performanceBonus.noSkips), 0),
  );
  const baseDifficultyXp = verifiedRunXpRuleV1.baseDifficultyXp[input.difficulty];
  const awardedXp = Math.round(baseDifficultyXp * mapFactor * (1 + performanceBonus)) + verifiedRunXpRuleV1.challengeBonus;

  return {
    awardedXp,
    snapshot: {
      ruleVersion: verifiedRunXpRuleV1.version,
      baseDifficultyXp,
      mapFactor,
      performanceBonus,
      performanceBonusReasons,
      challengeBonus: verifiedRunXpRuleV1.challengeBonus,
    },
  };
};

export const verifiedRunXpRuleV2 = {
  version: "v2",
  baseDifficultyXp: verifiedRunXpRuleV1.baseDifficultyXp,
  defaultMapFactor: verifiedRunXpRuleV1.defaultMapFactor,
  performanceBonus: verifiedRunXpRuleV1.performanceBonus,
} as const;

export const calculateVerifiedRunXpV2 = (input: VerifiedRunXpInput): VerifiedRunXpAward => {
  if (!Object.hasOwn(verifiedRunXpRuleV2.baseDifficultyXp, input.difficulty)) throw new Error("VERIFIED_RUN_DIFFICULTY_INVALID");
  if (!validSettlementCount(input.deaths) || !validSettlementCount(input.skips)) throw new Error("VERIFIED_RUN_SETTLEMENT_VALUE_INVALID");
  const mapFactor = input.mapFactor ?? verifiedRunXpRuleV2.defaultMapFactor;
  if (!Number.isFinite(mapFactor) || mapFactor <= 0) throw new Error("VERIFIED_RUN_MAP_FACTOR_INVALID");

  const performanceBonusReasons: VerifiedRunXpSnapshotV2["performanceBonusReasons"] = [];
  if (input.deaths === 0) performanceBonusReasons.push("no_deaths");
  if (input.skips === 0) performanceBonusReasons.push("no_skips");
  const performanceBonus = Math.min(
    verifiedRunXpRuleV2.performanceBonus.cap,
    performanceBonusReasons.reduce((bonus, reason) => bonus + (reason === "no_deaths" ? verifiedRunXpRuleV2.performanceBonus.noDeaths : verifiedRunXpRuleV2.performanceBonus.noSkips), 0),
  );
  const baseDifficultyXp = verifiedRunXpRuleV2.baseDifficultyXp[input.difficulty];

  return {
    awardedXp: Math.round(baseDifficultyXp * mapFactor * (1 + performanceBonus)),
    snapshot: {
      ruleVersion: verifiedRunXpRuleV2.version,
      baseDifficultyXp,
      mapFactor,
      performanceBonus,
      performanceBonusReasons,
    },
  };
};

export type VerifiedRunForProjection = {
  runId: string;
  mapId: string;
  gameplayRevisionId: string;
  mapVariant: VerifiedRunMapVariant;
  difficulty: VerifiedRunDifficulty;
  completionDurationSeconds: number;
  deaths: number | null;
  skips: number | null;
  awardedXp: number;
  acceptedAt: number;
  status: VerifiedRunStatus;
};

export type VerifiedRunInput = {
  playerAccountId: string;
  sourceSubmissionId: string;
  mapId: string;
  gameplayRevisionId: string;
  mapVariant: VerifiedRunMapVariant;
  difficulty: VerifiedRunDifficulty;
  gameVersion: string;
  matchCode: string;
  completionDurationSeconds: number;
  deaths?: number | null;
  skips?: number | null;
  eventCounters?: VerifiedRunEventCounters;
  acceptanceSource: VerifiedRunAcceptanceSource;
  acceptedAt?: number;
  mapFactor?: number | null;
};

export type VerifiedRun = VerifiedRunForProjection & {
  playerAccountId: string;
  sourceSubmissionId: string;
  gameVersion: string;
  matchCode: string;
  eventCounters: VerifiedRunEventCounters;
  acceptanceSource: VerifiedRunAcceptanceSource;
  xpRuleVersion: VerifiedRunXpSnapshot["ruleVersion"];
  xpInputSnapshot: VerifiedRunXpSnapshot;
  invalidatedAt: number | null;
  invalidatedBy: string | null;
  invalidationReason: string | null;
};

export type VerifiedRunConflictField = "match_code" | "map" | "gameplay_revision" | "map_variant" | "difficulty" | "game_version" | "completion_duration" | "deaths" | "skips" | "event_counters";

export type RecordVerifiedRunResult =
  | { outcome: "created" | "reused"; run: VerifiedRun }
  | { outcome: "conflict"; run: VerifiedRun; conflictFields: VerifiedRunConflictField[] };

export type VerifiedRunActor = {
  actorType: "service" | "user";
  actorId: string;
};

export type VerifiedRunDifficultyProfile = {
  difficulty: VerifiedRunDifficulty;
  verifiedRunCount: number;
  fastestCompletionSeconds: number;
};

export type MasteryMapProfile = {
  mapId: string;
  gameplayRevisionId: string;
  totalXp: number;
  verifiedRunCount: number;
  difficultyStats: VerifiedRunDifficultyProfile[];
  lowestDeaths: number | null;
  fewestSkips: number | null;
  highestSingleRunXp: number | null;
  highestCompletedDifficulty: VerifiedRunDifficulty | null;
  recentRuns: VerifiedRunForProjection[];
};

const byMostRecent = (left: VerifiedRunForProjection, right: VerifiedRunForProjection) => right.acceptedAt - left.acceptedAt || right.runId.localeCompare(left.runId);

const verifiedRunProjection = (run: VerifiedRunForProjection): VerifiedRunForProjection => ({
  runId: run.runId,
  mapId: run.mapId,
  gameplayRevisionId: run.gameplayRevisionId,
  mapVariant: run.mapVariant,
  difficulty: run.difficulty,
  completionDurationSeconds: run.completionDurationSeconds,
  deaths: run.deaths,
  skips: run.skips,
  awardedXp: run.awardedXp,
  acceptedAt: run.acceptedAt,
  status: run.status,
});

const minimum = (values: Array<number | null>) => {
  const present = values.filter((value): value is number => value !== null);
  return present.length ? Math.min(...present) : null;
};

export const buildMasteryMapProfile = (mapId: string, gameplayRevisionId: string, runs: VerifiedRunForProjection[], recentLimit = 10): MasteryMapProfile => {
  const activeRuns = runs.filter((run) => run.mapId === mapId && run.gameplayRevisionId === gameplayRevisionId && run.status === "active");
  const difficultyStats = verifiedRunDifficulties.flatMap((difficulty) => {
    const matching = activeRuns.filter((run) => run.difficulty === difficulty);
    return matching.length ? [{
      difficulty,
      verifiedRunCount: matching.length,
      fastestCompletionSeconds: Math.min(...matching.map((run) => run.completionDurationSeconds)),
    }] : [];
  });
  const highestCompletedDifficulty = [...verifiedRunDifficulties].reverse().find((difficulty) => activeRuns.some((run) => run.difficulty === difficulty)) ?? null;

  return {
    mapId,
    gameplayRevisionId,
    totalXp: activeRuns.reduce((total, run) => total + run.awardedXp, 0),
    verifiedRunCount: activeRuns.length,
    difficultyStats,
    lowestDeaths: minimum(activeRuns.map((run) => run.deaths)),
    fewestSkips: minimum(activeRuns.map((run) => run.skips)),
    highestSingleRunXp: activeRuns.length ? Math.max(...activeRuns.map((run) => run.awardedXp)) : null,
    highestCompletedDifficulty,
    recentRuns: [...activeRuns].sort(byMostRecent).slice(0, recentLimit).map(verifiedRunProjection),
  };
};

export const buildMasteryProfiles = (runs: VerifiedRunForProjection[], recentLimit = 10) => {
  const revisionKeys = [...new Set(runs.filter((run) => run.status === "active").map((run) => `${run.mapId}\u0000${run.gameplayRevisionId}`))];
  return revisionKeys
    .map((key) => {
      const [mapId, gameplayRevisionId] = key.split("\u0000");
      return buildMasteryMapProfile(mapId!, gameplayRevisionId!, runs, recentLimit);
    })
    .sort((left, right) => right.totalXp - left.totalXp || right.highestSingleRunXp! - left.highestSingleRunXp! || left.mapId.localeCompare(right.mapId) || left.gameplayRevisionId.localeCompare(right.gameplayRevisionId));
};
