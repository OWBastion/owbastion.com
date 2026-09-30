import { and, eq, isNull, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";
import type { Challenge } from "@owbastion/contracts";
import {
  achievementChallenges,
  gameplayRevisionChallengeAssignments,
  gameplayRevisions,
  mapTitleRuleCompat,
  mapTitleRuleExceptions,
  mapTitleRules,
  maps,
  titleCatalog,
  titleChallenges,
} from "./schema";

// Immutable snapshot shape persisted to submissions.rule_snapshot_json.
// exceptionId is null when the rule default applies.
export type MapTitleRuleSnapshot = {
  challengeId?: string;
  challengeType?: string;
  ruleId: string;
  ruleRevision: number;
  mapId: string | null;
  gameplayRevisionId: string | null;
  titleKey: string;
  mapVariant: "classic" | null;
  slot: string | null;
  displayKind: string;
  condition: string;
  evidenceRule: string;
  submissionMode: string;
  defaultScope: string;
  exceptionId: string | null;
  startsAt: number | null;
  endsAt: number | null;
};

type Dependencies = {
  db: ReturnType<typeof drizzle>;
  now: () => number;
  pioneerExceptionIsSubmittable: (enabled: number, startsAt: number | null, endsAt: number | null, timestamp: number) => boolean;
};

export const createChallengeSnapshotServices = ({ db, now, pioneerExceptionIsSubmittable }: Dependencies) => {
  const toMapTitleRuleSnapshot = (
    rule: typeof mapTitleRules.$inferSelect,
    mapId: string,
    revision: typeof gameplayRevisions.$inferSelect,
    assignment: typeof gameplayRevisionChallengeAssignments.$inferSelect | undefined,
    exception: typeof mapTitleRuleExceptions.$inferSelect | undefined,
    eligibilityAt: number,
  ): MapTitleRuleSnapshot | null => {
    if (!assignment || assignment.enabled === 0 || rule.status === "inactive") return null;
    const pioneer = rule.kind.trim().toLocaleLowerCase() === "pioneer";
    if (pioneer && (rule.defaultScope !== "explicit" || !pioneerExceptionIsSubmittable(exception?.enabled ?? 0, exception?.startsAt ?? null, exception?.endsAt ?? null, eligibilityAt))) return null;
    const activeException = exception?.enabled === 1 ? exception : null;
    return {
      ruleId: rule.id,
      ruleRevision: Math.max(rule.updatedAt, assignment.updatedAt, exception?.updatedAt ?? 0),
      mapId,
      gameplayRevisionId: revision.id,
      titleKey: rule.titleKey,
      mapVariant: (rule.mapVariant as "classic" | null) ?? null,
      slot: activeException?.slot ?? assignment.slot ?? rule.slot ?? null,
      displayKind: rule.displayKind,
      condition: activeException?.condition ?? assignment.condition ?? rule.condition,
      evidenceRule: activeException?.evidenceRule ?? assignment.evidenceRule ?? rule.evidenceRule,
      submissionMode: activeException?.submissionMode ?? assignment.submissionMode ?? rule.submissionMode,
      defaultScope: rule.defaultScope,
      exceptionId: activeException?.id ?? null,
      startsAt: activeException?.startsAt ?? null,
      endsAt: activeException?.endsAt ?? null,
    };
  };

  const selectGameplayRevision = async (input: {
    mapId: string;
    mapVariant: "classic" | null;
    gameplayRevisionId?: string | null;
    allowHistorical?: boolean;
  }) => {
    if (input.gameplayRevisionId) {
      const revision = await db.select().from(gameplayRevisions).where(eq(gameplayRevisions.id, input.gameplayRevisionId)).get();
      if (!revision || revision.mapId !== input.mapId) return null;
      if (!input.allowHistorical && !["default", "selectable"].includes(revision.lifecycle)) return null;
      return revision;
    }
    return input.mapVariant === "classic"
      ? await db.select().from(gameplayRevisions).where(and(
        eq(gameplayRevisions.mapId, input.mapId),
        eq(gameplayRevisions.legacyMapVariant, "classic"),
        eq(gameplayRevisions.lifecycle, "selectable"),
      )).get()
      : await db.select().from(gameplayRevisions).where(and(
        eq(gameplayRevisions.mapId, input.mapId),
        isNull(gameplayRevisions.legacyMapVariant),
        eq(gameplayRevisions.lifecycle, "default"),
      )).get();
  };

  const resolveAssignedGameplayRevision = async (input: {
    mapId: string;
    mapVariant: "classic" | null;
    challengeFamily: "map_challenge" | "map_title_rule" | "title_challenge";
    challengeId: string;
    gameplayRevisionId?: string | null;
  }) => {
    const revision = await selectGameplayRevision({
      mapId: input.mapId,
      mapVariant: input.mapVariant,
      gameplayRevisionId: input.gameplayRevisionId,
      allowHistorical: Boolean(input.gameplayRevisionId),
    });
    if (!revision) return null;
    const assignment = await db.select().from(gameplayRevisionChallengeAssignments).where(and(
      eq(gameplayRevisionChallengeAssignments.gameplayRevisionId, revision.id),
      eq(gameplayRevisionChallengeAssignments.mapId, input.mapId),
      eq(gameplayRevisionChallengeAssignments.challengeFamily, input.challengeFamily),
      eq(gameplayRevisionChallengeAssignments.challengeId, input.challengeId),
      eq(gameplayRevisionChallengeAssignments.enabled, 1),
    )).get();
    return assignment ? { revision, assignment } : null;
  };

  // Resolve a rule only when it is assigned to the selected gameplay revision.
  const resolveMapTitleProjection = async (
    ruleId: string,
    mapId: string,
    gameplayRevisionId?: string | null,
    eligibilityAt = now(),
  ): Promise<MapTitleRuleSnapshot | null> => {
    // Step 1: check map status.
    const map = await db.select({ id: maps.id, status: maps.status }).from(maps).where(eq(maps.id, mapId)).get();
    if (!map || map.status !== "active") return null;

    // Load the rule.
    const rule = await db.select().from(mapTitleRules).where(eq(mapTitleRules.id, ruleId)).get();
    if (!rule) return null;

    const mapVariant = (rule.mapVariant as "classic" | null) ?? null;
    const resolved = await resolveAssignedGameplayRevision({ mapId, mapVariant, challengeFamily: "map_title_rule", challengeId: rule.id, gameplayRevisionId });
    if (!resolved) return null;
    const { revision, assignment } = resolved;
    const exception = await db.select().from(mapTitleRuleExceptions)
      .where(and(eq(mapTitleRuleExceptions.ruleId, ruleId), eq(mapTitleRuleExceptions.mapId, mapId)))
      .get();
    return toMapTitleRuleSnapshot(rule, mapId, revision, assignment, exception, eligibilityAt);
  };

  // Resolve a compat-mapped legacy challenge ID through the rule model.
  // Returns the snapshot if the compat entry exists and the map is still active,
  // or null if the map is retired / the compat entry is missing.
  const resolveLegacyProjection = async (legacyChallengeId: string, mapId?: string, gameplayRevisionId?: string | null, eligibilityAt = now()): Promise<MapTitleRuleSnapshot | null> => {
    const rows = await db.select({ ruleId: mapTitleRuleCompat.ruleId, mapId: mapTitleRuleCompat.mapId })
      .from(mapTitleRuleCompat)
      .where(mapId ? and(eq(mapTitleRuleCompat.legacyChallengeId, legacyChallengeId), eq(mapTitleRuleCompat.mapId, mapId)) : eq(mapTitleRuleCompat.legacyChallengeId, legacyChallengeId));
    if (!rows.length) return null;
    if (!mapId && rows.length > 1) throw new Error("MAP_REQUIRED");
    const target = rows[0];
    return resolveMapTitleProjection(target.ruleId, target.mapId, gameplayRevisionId, eligibilityAt);
  };

  const toTitleChallengeSnapshot = (
    challenge: typeof titleChallenges.$inferSelect,
    title: typeof titleCatalog.$inferSelect,
    mapId: string | null,
    gameplayRevisionId: string | null,
    assignment?: typeof gameplayRevisionChallengeAssignments.$inferSelect,
  ): MapTitleRuleSnapshot => ({
    challengeId: challenge.id,
    challengeType: mapId ? "map_title_achievement" : "title_achievement",
    ruleId: `title-challenge:${challenge.id}`,
    ruleRevision: assignment ? Math.max(challenge.updatedAt, assignment.updatedAt) : challenge.updatedAt,
    mapId,
    gameplayRevisionId,
    titleKey: title.key,
    mapVariant: (challenge.mapVariant as "classic" | null) ?? null,
    slot: assignment?.slot ?? null,
    displayKind: title.displayKind,
    condition: assignment?.condition ?? challenge.condition,
    evidenceRule: assignment?.evidenceRule ?? challenge.evidenceRule,
    submissionMode: assignment?.submissionMode ?? challenge.submissionMode,
    defaultScope: challenge.scope ?? (mapId ? "map" : "global"),
    exceptionId: null,
    startsAt: null,
    endsAt: null,
  });

  const snapshotTitleChallenge = async (
    challenge: typeof titleChallenges.$inferSelect,
    title: typeof titleCatalog.$inferSelect,
    mapId: string | null,
    gameplayRevisionId?: string | null,
  ): Promise<MapTitleRuleSnapshot | null> => {
    if (!mapId) return toTitleChallengeSnapshot(challenge, title, null, null);
    const mapVariant = (challenge.mapVariant as "classic" | null) ?? null;
    const resolved = await resolveAssignedGameplayRevision({ mapId, mapVariant, challengeFamily: "title_challenge", challengeId: challenge.id, gameplayRevisionId });
    if (!resolved) return null;
    const { revision, assignment } = resolved;
    return toTitleChallengeSnapshot(challenge, title, mapId, revision.id, assignment);
  };

  const batchResolveAutomaticSnapshots = async (
    items: Challenge[],
    eligibilityAt: number,
  ): Promise<Array<MapTitleRuleSnapshot | null>> => {
    type RuleCandidate = { index: number; ruleId: string; mapId: string; gameplayRevisionId: string };
    type LegacyMapCandidate = { index: number; challengeId: string; mapId: string; gameplayRevisionId: string };
    type AchievementCandidate = { index: number; challengeId: string };

    const ruleCandidates: RuleCandidate[] = [];
    const legacyMapCandidates: LegacyMapCandidate[] = [];
    const achievementCandidates: AchievementCandidate[] = [];

    items.forEach((challenge, index) => {
      if (!challenge.titleKey) return;
      if (challenge.family === "map") {
        if (challenge.mapTitleRule) {
          ruleCandidates.push({ index, ruleId: challenge.mapTitleRule.ruleId, mapId: challenge.mapId, gameplayRevisionId: challenge.gameplayRevisionId });
        } else {
          legacyMapCandidates.push({ index, challengeId: challenge.challengeId, mapId: challenge.mapId, gameplayRevisionId: challenge.gameplayRevisionId });
        }
      } else {
        achievementCandidates.push({ index, challengeId: challenge.challengeId });
      }
    });

    const ruleIds = [...new Set(ruleCandidates.map((candidate) => candidate.ruleId))];
    const legacyMapIds = [...new Set(legacyMapCandidates.map((candidate) => candidate.challengeId))];
    const achievementIds = [...new Set(achievementCandidates.map((candidate) => candidate.challengeId))];
    const titleChallengeLookupIds = [...new Set([...legacyMapIds, ...achievementIds])];
    const mapIds = [...new Set([...ruleCandidates.map((candidate) => candidate.mapId), ...legacyMapCandidates.map((candidate) => candidate.mapId)])];
    const revisionIds = [...new Set([...ruleCandidates.map((candidate) => candidate.gameplayRevisionId), ...legacyMapCandidates.map((candidate) => candidate.gameplayRevisionId)])];

    const [mapRows, ruleRows, revisionRows, assignmentRows, exceptionRows, titleChallengeRows, achievementChallengeRows] = await Promise.all([
      mapIds.length ? db.select({ id: maps.id, status: maps.status }).from(maps).where(sql`${maps.id} IN (SELECT value FROM json_each(${JSON.stringify(mapIds)}))`) : Promise.resolve([]),
      ruleIds.length ? db.select().from(mapTitleRules).where(sql`${mapTitleRules.id} IN (SELECT value FROM json_each(${JSON.stringify(ruleIds)}))`) : Promise.resolve([]),
      revisionIds.length ? db.select().from(gameplayRevisions).where(sql`${gameplayRevisions.id} IN (SELECT value FROM json_each(${JSON.stringify(revisionIds)}))`) : Promise.resolve([]),
      revisionIds.length ? db.select().from(gameplayRevisionChallengeAssignments).where(sql`${gameplayRevisionChallengeAssignments.gameplayRevisionId} IN (SELECT value FROM json_each(${JSON.stringify(revisionIds)}))`) : Promise.resolve([]),
      ruleIds.length ? db.select().from(mapTitleRuleExceptions).where(sql`${mapTitleRuleExceptions.ruleId} IN (SELECT value FROM json_each(${JSON.stringify(ruleIds)}))`) : Promise.resolve([]),
      titleChallengeLookupIds.length ? db.select({ challenge: titleChallenges, title: titleCatalog }).from(titleChallenges).innerJoin(titleCatalog, eq(titleChallenges.titleKey, titleCatalog.key)).where(sql`${titleChallenges.id} IN (SELECT value FROM json_each(${JSON.stringify(titleChallengeLookupIds)}))`) : Promise.resolve([]),
      legacyMapIds.length ? db.select({ challenge: achievementChallenges, title: titleCatalog }).from(achievementChallenges).innerJoin(titleCatalog, eq(achievementChallenges.rewardTitleKey, titleCatalog.key)).where(sql`${achievementChallenges.id} IN (SELECT value FROM json_each(${JSON.stringify(legacyMapIds)}))`) : Promise.resolve([]),
    ]);

    const mapStatusById = new globalThis.Map(mapRows.map((row) => [row.id, row.status]));
    const ruleById = new globalThis.Map(ruleRows.map((row) => [row.id, row]));
    const revisionById = new globalThis.Map(revisionRows.map((row) => [row.id, row]));
    const assignmentByKey = new globalThis.Map(assignmentRows.map((row) => [`${row.gameplayRevisionId}:${row.mapId}:${row.challengeFamily}:${row.challengeId}`, row]));
    const exceptionByKey = new globalThis.Map(exceptionRows.map((row) => [`${row.ruleId}:${row.mapId}`, row]));
    const titleChallengeById = new globalThis.Map(titleChallengeRows.map((row) => [row.challenge.id, row]));
    const achievementChallengeById = new globalThis.Map(achievementChallengeRows.map((row) => [row.challenge.id, row]));

    const results: Array<MapTitleRuleSnapshot | null> = new Array(items.length).fill(null);

    for (const candidate of ruleCandidates) {
      if (mapStatusById.get(candidate.mapId) !== "active") continue;
      const rule = ruleById.get(candidate.ruleId);
      if (!rule) continue;
      const revision = revisionById.get(candidate.gameplayRevisionId);
      if (!revision || revision.mapId !== candidate.mapId) continue;
      const assignment = assignmentByKey.get(`${revision.id}:${candidate.mapId}:map_title_rule:${rule.id}`);
      const exception = exceptionByKey.get(`${rule.id}:${candidate.mapId}`);
      const snapshot = toMapTitleRuleSnapshot(rule, candidate.mapId, revision, assignment, exception, eligibilityAt);
      if (snapshot) results[candidate.index] = snapshot;
    }

    for (const candidate of legacyMapCandidates) {
      const titleChallengeRow = titleChallengeById.get(candidate.challengeId);
      if (titleChallengeRow) {
        const { challenge, title } = titleChallengeRow;
        const revision = revisionById.get(candidate.gameplayRevisionId);
        if (!revision || revision.mapId !== candidate.mapId) continue;
        const assignment = assignmentByKey.get(`${revision.id}:${candidate.mapId}:title_challenge:${challenge.id}`);
        if (!assignment || assignment.enabled === 0) continue;
        results[candidate.index] = toTitleChallengeSnapshot(challenge, title, candidate.mapId, revision.id, assignment);
        continue;
      }
      const achievementChallengeRow = achievementChallengeById.get(candidate.challengeId);
      if (!achievementChallengeRow) continue;
      const { challenge, title } = achievementChallengeRow;
      if (!challenge.rewardTitleKey) continue;
      const mapVariant = challenge.type === "classic_completion" ? "classic" as const : null;
      const revision = revisionById.get(candidate.gameplayRevisionId);
      if (!revision || revision.mapId !== candidate.mapId) continue;
      const assignment = assignmentByKey.get(`${revision.id}:${candidate.mapId}:map_challenge:${challenge.id}`);
      if (!assignment || assignment.enabled === 0) continue;
      results[candidate.index] = {
        challengeId: challenge.id,
        challengeType: challenge.type,
        ruleId: `challenge:${challenge.id}`,
        ruleRevision: Math.max(challenge.updatedAt, assignment.updatedAt),
        mapId: candidate.mapId,
        gameplayRevisionId: revision.id,
        titleKey: challenge.rewardTitleKey,
        mapVariant,
        slot: assignment.slot ?? null,
        displayKind: title.displayKind,
        condition: assignment.condition ?? challenge.condition,
        evidenceRule: assignment.evidenceRule ?? challenge.evidenceRule,
        submissionMode: assignment.submissionMode ?? challenge.submissionMode,
        defaultScope: "map",
        exceptionId: null,
        startsAt: null,
        endsAt: null,
      };
    }

    for (const candidate of achievementCandidates) {
      const row = titleChallengeById.get(candidate.challengeId);
      if (!row) continue;
      const { challenge, title } = row;
      results[candidate.index] = toTitleChallengeSnapshot(challenge, title, null, null);
    }

    return results;
  };

  return {
    batchResolveAutomaticSnapshots,
    resolveLegacyProjection,
    resolveMapTitleProjection,
    selectGameplayRevision,
    snapshotTitleChallenge,
  };
};
