import { and, count, desc, eq, ne } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";
import { buildMasteryProfiles, normalizeMatchCode } from "@owbastion/domain";
import type {
  MasteryMapProfile,
  VerifiedRun,
  VerifiedRunConflictField,
  VerifiedRunEventCounters,
  VerifiedRunForProjection,
  VerifiedRunInput,
} from "@owbastion/domain";
import type { CurrentPlayerMasteryResponse } from "@owbastion/contracts";
import { gameplayRevisions, verifiedRuns } from "./schema";

type Database = ReturnType<typeof drizzle>;

export const normalizeVerifiedRunEventCounters = (value: VerifiedRunEventCounters | undefined): VerifiedRunEventCounters => {
  const entries = Object.entries(value ?? {}).map(([key, count]) => {
    const normalizedKey = key.trim();
    if (!normalizedKey || !Number.isInteger(count) || count < 0) throw new Error("VERIFIED_RUN_EVENT_COUNTER_INVALID");
    return [normalizedKey, count] as const;
  }).sort(([left], [right]) => left.localeCompare(right));
  if (new Set(entries.map(([key]) => key)).size !== entries.length) throw new Error("VERIFIED_RUN_EVENT_COUNTER_INVALID");
  return Object.fromEntries(entries);
};

export const asVerifiedRun = (row: typeof verifiedRuns.$inferSelect): VerifiedRun => {
  try {
    const eventCounters = normalizeVerifiedRunEventCounters(JSON.parse(row.eventCountersJson) as VerifiedRunEventCounters);
    const xpInputSnapshot = JSON.parse(row.xpInputSnapshotJson) as VerifiedRun["xpInputSnapshot"];
    const xpRuleVersion = row.xpRuleVersion as VerifiedRun["xpRuleVersion"];
    if (xpInputSnapshot.ruleVersion !== xpRuleVersion) throw new Error("VERIFIED_RUN_XP_SNAPSHOT_INVALID");
    return {
      runId: row.id,
      playerAccountId: row.playerAccountId,
      sourceSubmissionId: row.sourceSubmissionId,
      mapId: row.mapId,
      gameplayRevisionId: row.gameplayRevisionId,
      mapVariant: (row.mapVariant ?? null) as VerifiedRun["mapVariant"],
      difficulty: row.difficulty as VerifiedRun["difficulty"],
      gameVersion: row.gameVersion,
      matchCode: row.matchCode,
      completionDurationSeconds: row.completionDurationSeconds,
      deaths: row.deaths,
      skips: row.skips,
      eventCounters,
      acceptanceSource: row.acceptanceSource as VerifiedRun["acceptanceSource"],
      acceptedAt: row.acceptedAt,
      status: row.status as VerifiedRun["status"],
      invalidatedAt: row.invalidatedAt,
      invalidatedBy: row.invalidatedBy,
      invalidationReason: row.invalidationReason,
      xpRuleVersion,
      xpInputSnapshot,
      awardedXp: row.awardedXp,
    };
  } catch {
    throw new Error("VERIFIED_RUN_DATA_INVALID");
  }
};

export const prepareVerifiedRun = (input: VerifiedRunInput, timestamp: number) => {
  const required = (value: string, error: string) => {
    const normalized = value.trim();
    if (!normalized) throw new Error(error);
    return normalized;
  };
  const completionDurationSeconds = input.completionDurationSeconds;
  if (!Number.isInteger(completionDurationSeconds) || completionDurationSeconds <= 0) throw new Error("VERIFIED_RUN_COMPLETION_DURATION_INVALID");
  const acceptedAt = input.acceptedAt ?? timestamp;
  if (!Number.isInteger(acceptedAt) || acceptedAt <= 0) throw new Error("VERIFIED_RUN_ACCEPTED_AT_INVALID");
  const mapVariant = input.mapVariant ?? null;
  if (mapVariant !== null && mapVariant !== "classic") throw new Error("VERIFIED_RUN_MAP_VARIANT_INVALID");
  if (!["submission_automatic", "submission_review"].includes(input.acceptanceSource)) throw new Error("VERIFIED_RUN_ACCEPTANCE_SOURCE_INVALID");
  return {
    playerAccountId: required(input.playerAccountId, "VERIFIED_RUN_PLAYER_NOT_FOUND"),
    sourceSubmissionId: required(input.sourceSubmissionId, "VERIFIED_RUN_SUBMISSION_NOT_FOUND"),
    mapId: required(input.mapId, "VERIFIED_RUN_MAP_NOT_FOUND"),
    gameplayRevisionId: required(input.gameplayRevisionId, "VERIFIED_RUN_GAMEPLAY_REVISION_NOT_FOUND"),
    mapVariant,
    difficulty: input.difficulty,
    gameVersion: required(input.gameVersion, "VERIFIED_RUN_GAME_VERSION_INVALID"),
    matchCode: normalizeMatchCode(input.matchCode),
    completionDurationSeconds,
    deaths: input.deaths ?? null,
    skips: input.skips ?? null,
    eventCounters: normalizeVerifiedRunEventCounters(input.eventCounters),
    acceptanceSource: input.acceptanceSource,
    acceptedAt,
    mapFactor: input.mapFactor ?? null,
  };
};

export const masteryConflictFields = (run: VerifiedRun, input: ReturnType<typeof prepareVerifiedRun>): VerifiedRunConflictField[] => {
  const fields: VerifiedRunConflictField[] = [];
  if (run.matchCode !== input.matchCode) fields.push("match_code");
  if (run.mapId !== input.mapId) fields.push("map");
  if (run.gameplayRevisionId !== input.gameplayRevisionId) fields.push("gameplay_revision");
  if (run.mapVariant !== input.mapVariant) fields.push("map_variant");
  if (run.difficulty !== input.difficulty) fields.push("difficulty");
  if (run.gameVersion !== input.gameVersion) fields.push("game_version");
  if (run.completionDurationSeconds !== input.completionDurationSeconds) fields.push("completion_duration");
  if (run.deaths !== input.deaths) fields.push("deaths");
  if (run.skips !== input.skips) fields.push("skips");
  if (JSON.stringify(run.eventCounters) !== JSON.stringify(input.eventCounters)) fields.push("event_counters");
  return fields;
};

export const masteryRevisionLifecycle = (value: string) => {
  if (!["preparing", "default", "selectable", "historical"].includes(value)) throw new Error("GAMEPLAY_REVISION_DATA_INVALID");
  return value as CurrentPlayerMasteryResponse["runs"][number]["gameplayRevisionLifecycle"];
};

export const loadActiveVerifiedRuns = async (db: Database, input: { playerAccountId: string; mapId?: string; gameplayRevisionId?: string; currentOnly?: boolean }) => {
  const rows = await db.select({ run: verifiedRuns, lifecycle: gameplayRevisions.lifecycle }).from(verifiedRuns)
    .innerJoin(gameplayRevisions, eq(verifiedRuns.gameplayRevisionId, gameplayRevisions.id))
    .where(and(
      eq(verifiedRuns.playerAccountId, input.playerAccountId),
      eq(verifiedRuns.status, "active"),
      input.mapId ? eq(verifiedRuns.mapId, input.mapId) : undefined,
      input.gameplayRevisionId ? eq(verifiedRuns.gameplayRevisionId, input.gameplayRevisionId) : undefined,
      input.currentOnly ? eq(gameplayRevisions.lifecycle, "default") : undefined,
    ));
  return rows.map(({ run, lifecycle }) => ({ run: asVerifiedRun(run), gameplayRevisionLifecycle: masteryRevisionLifecycle(lifecycle) }));
};

export const loadPlayerMasteryHistory = async (db: Database, input: { playerAccountId: string; mapId?: string; gameplayRevisionId?: string; page: number; pageSize: number }) => {
  const condition = and(
    eq(verifiedRuns.playerAccountId, input.playerAccountId),
    input.mapId ? eq(verifiedRuns.mapId, input.mapId) : undefined,
    input.gameplayRevisionId ? eq(verifiedRuns.gameplayRevisionId, input.gameplayRevisionId) : undefined,
  );
  const [rows, [{ total }]] = await Promise.all([
    db.select({ run: verifiedRuns, lifecycle: gameplayRevisions.lifecycle }).from(verifiedRuns)
      .innerJoin(gameplayRevisions, eq(verifiedRuns.gameplayRevisionId, gameplayRevisions.id))
      .where(condition).orderBy(desc(verifiedRuns.acceptedAt), desc(verifiedRuns.id)).limit(input.pageSize).offset((input.page - 1) * input.pageSize),
    db.select({ total: count() }).from(verifiedRuns).where(condition),
  ]);
  return { runs: rows.map(({ run, lifecycle }) => ({ run: asVerifiedRun(run), gameplayRevisionLifecycle: masteryRevisionLifecycle(lifecycle) })), total };
};

export const activeMasteryProfiles = async (db: Database, input: { playerAccountId: string; mapId?: string; gameplayRevisionId?: string; currentOnly?: boolean; recentLimit?: number }): Promise<MasteryMapProfile[]> => {
  const runs = await loadActiveVerifiedRuns(db, input);
  const recentLimit = Math.min(50, Math.max(1, input.recentLimit ?? 10));
  return buildMasteryProfiles(runs.map(({ run }) => run), recentLimit);
};

export const playerVerifiedRunView = (run: VerifiedRunForProjection, gameplayRevisionLifecycle: CurrentPlayerMasteryResponse["runs"][number]["gameplayRevisionLifecycle"]): CurrentPlayerMasteryResponse["runs"][number] => ({
  runId: run.runId,
  mapId: run.mapId,
  gameplayRevisionId: run.gameplayRevisionId,
  gameplayRevisionLifecycle,
  mapVariant: run.mapVariant,
  difficulty: run.difficulty,
  completionDurationSeconds: run.completionDurationSeconds,
  deaths: run.deaths,
  skips: run.skips,
  awardedXp: run.awardedXp,
  acceptedAt: run.acceptedAt,
  status: run.status,
});

export const playerMasteryProfileView = (profile: MasteryMapProfile, gameplayRevisionLifecycle: CurrentPlayerMasteryResponse["profiles"][number]["gameplayRevisionLifecycle"]): CurrentPlayerMasteryResponse["profiles"][number] => ({
  mapId: profile.mapId,
  gameplayRevisionId: profile.gameplayRevisionId,
  gameplayRevisionLifecycle,
  totalXp: profile.totalXp,
  verifiedRunCount: profile.verifiedRunCount,
  difficultyStats: profile.difficultyStats,
  lowestDeaths: profile.lowestDeaths,
  fewestSkips: profile.fewestSkips,
  highestSingleRunXp: profile.highestSingleRunXp,
  highestCompletedDifficulty: profile.highestCompletedDifficulty,
  recentRuns: profile.recentRuns.map((run) => playerVerifiedRunView(run, gameplayRevisionLifecycle)),
});

export const findConflictingVerifiedRun = (db: Database, input: { playerAccountId: string; matchCode: string; exceptRunId: string; activeOnly?: boolean }) =>
  db.select({ id: verifiedRuns.id }).from(verifiedRuns).where(and(
    eq(verifiedRuns.playerAccountId, input.playerAccountId),
    eq(verifiedRuns.matchCode, input.matchCode),
    input.activeOnly ? eq(verifiedRuns.status, "active") : undefined,
    ne(verifiedRuns.id, input.exceptRunId),
  )).get();
