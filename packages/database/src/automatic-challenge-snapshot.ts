import { eq, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";
import type { Challenge } from "@owbastion/contracts";
import {
  achievementChallenges,
  gameplayRevisionChallengeAssignments,
  gameplayRevisions,
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
  toMapTitleRuleSnapshot: (
    rule: typeof mapTitleRules.$inferSelect,
    mapId: string,
    revision: typeof gameplayRevisions.$inferSelect,
    assignment: typeof gameplayRevisionChallengeAssignments.$inferSelect | undefined,
    exception: typeof mapTitleRuleExceptions.$inferSelect | undefined,
    eligibilityAt: number,
  ) => MapTitleRuleSnapshot | null;
  toTitleChallengeSnapshot: (
    challenge: typeof titleChallenges.$inferSelect,
    title: typeof titleCatalog.$inferSelect,
    mapId: string | null,
    gameplayRevisionId: string | null,
    assignment?: typeof gameplayRevisionChallengeAssignments.$inferSelect,
  ) => MapTitleRuleSnapshot;
};

// Batched equivalent of resolving one MapTitleRuleSnapshot per candidate Challenge
// (formerly `automaticSnapshot`, which called `resolveMapTitleProjection` /
// `snapshotTitleChallenge` / `snapshotMapChallenge` once per candidate — up to ~6
// D1 statements each). This mirrors each function's exact branch logic against a
// handful of bulk-prefetched lookups so the statement count stays flat as the
// candidate list grows with the catalog. It never writes; only `planCanonicalChallenge`
// paths (bounded to the few actually-selected candidates) materialize `challenges` rows.
export const createAutomaticChallengeSnapshotResolver = ({ db, toMapTitleRuleSnapshot, toTitleChallengeSnapshot }: Dependencies) => async (
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
