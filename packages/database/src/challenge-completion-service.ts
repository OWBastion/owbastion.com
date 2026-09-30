import { and, eq, or, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";
import type { AuthContext } from "@owbastion/domain";
import { challengeSatisfies, challenges, gameplayRevisionChallengeAssignments, mapTitleRuleCompat, mapTitleRewards, mapTitleRules, playerTitleGrants, submissions, titleCatalog } from "./schema";
import type { CanonicalChallengeOverlay } from "./canonical-challenge-service";

export type ChallengeCompletionAward = {
  challengeId: string;
  titleKey: string;
  mapId: string | null;
  gameplayRevisionId: string | null;
  slot: string | null;
  completionSourceType: "submission" | "challenge_satisfies";
  satisfiedBy: string | null;
  root: boolean;
  grantable: boolean;
};

type CanonicalChallengeLoader = (
  challengeIds: string[],
  overlay: CanonicalChallengeOverlay | null,
) => Promise<Array<typeof challenges.$inferSelect | null>>;

export const createChallengeCompletionServices = (
  database: D1Database,
  db: ReturnType<typeof drizzle>,
  loadCanonicalChallenges: CanonicalChallengeLoader,
) => {
  const challengeCompletionAwardKey = (award: ChallengeCompletionAward) => `${award.challengeId}:${award.mapId ?? ""}:${award.gameplayRevisionId ?? ""}`;
  const titleGrantScopeKey = (item: { titleKey: string; mapId: string | null; gameplayRevisionId?: string | null; snapshot?: { gameplayRevisionId: string | null } | null }) => `${item.titleKey}:${item.mapId ?? ""}:${item.gameplayRevisionId ?? item.snapshot?.gameplayRevisionId ?? ""}`;
  const addChallengeCompletionAward = (awards: globalThis.Map<string, ChallengeCompletionAward>, award: ChallengeCompletionAward) => {
    const key = challengeCompletionAwardKey(award);
    const existing = awards.get(key);
    if (!existing || (!existing.root && award.root)) awards.set(key, award);
  };
  const selectCompletionGrantAwards = <T extends ChallengeCompletionAward & { grantId: string }>(
    awards: T[],
    directGrantsByScope: globalThis.Map<string, { canonicalChallengeId: string }>,
  ) => {
    const selected = new globalThis.Map<string, T>();
    for (const award of awards) {
      if (!award.grantable) continue;
      const scope = titleGrantScopeKey(award);
      const directGrant = directGrantsByScope.get(scope);
      if (directGrant) {
        if (award.root && award.challengeId === directGrant.canonicalChallengeId) selected.set(scope, award);
      } else if (!selected.has(scope)) {
        selected.set(scope, award);
      }
    }
    return selected;
  };

  const submissionCompletionStatements = (input: {
    row: typeof submissions.$inferSelect;
    completionAwards: ChallengeCompletionAward[];
    grantAwards: Array<ChallengeCompletionAward & { grantId: string }>;
    completionAuditAwards: ChallengeCompletionAward[];
    grantAuditAwards: Array<ChallengeCompletionAward & { grantId: string }>;
    timestamp: number;
    reviewId: string;
    auth: AuthContext;
  }) => {
    const statements: D1PreparedStatement[] = [];
    for (const award of input.completionAwards) statements.push(database.prepare("INSERT OR IGNORE INTO challenge_completions (id, player_account_id, challenge_id, gameplay_revision_id, status, source_type, source_id, completed_at, created_at) SELECT ?, s.player_account_id, ?, ?, 'active', ?, s.id, ?, ? FROM submissions s WHERE s.id = ? AND EXISTS (SELECT 1 FROM submission_reviews WHERE id = ?)").bind(crypto.randomUUID(), award.challengeId, award.gameplayRevisionId, award.completionSourceType, input.timestamp, input.timestamp, input.row.id, input.reviewId));
    for (const award of input.grantAwards) statements.push(database.prepare("INSERT OR IGNORE INTO player_title_grants (id, player_account_id, title_key, map_id, gameplay_revision_id, slot, status, source_type, source_id, granted_by, granted_at, completion_id) SELECT ?, s.player_account_id, ?, ?, ?, ?, 'active', 'submission', s.id, ?, ?, (SELECT completion.id FROM challenge_completions completion WHERE completion.player_account_id = s.player_account_id AND completion.challenge_id = ? AND completion.status = 'active' AND completion.gameplay_revision_id IS ? LIMIT 1) FROM submissions s WHERE s.id = ? AND EXISTS (SELECT 1 FROM submission_reviews WHERE id = ?) AND EXISTS (SELECT 1 FROM challenge_completions completion WHERE completion.player_account_id = s.player_account_id AND completion.challenge_id = ? AND completion.status = 'active' AND completion.gameplay_revision_id IS ?)").bind(award.grantId, award.titleKey, award.mapId, award.gameplayRevisionId, award.slot, input.auth.subject, input.timestamp, award.challengeId, award.gameplayRevisionId, input.row.id, input.reviewId, award.challengeId, award.gameplayRevisionId));
    for (const award of input.completionAuditAwards) statements.push(database.prepare("INSERT INTO audit_events (id, correlation_id, actor_type, actor_id, operation, entity_type, entity_id, payload_json, created_at) SELECT ?, ?, ?, ?, 'challenge.completion.submission', 'challenge_completion', id, ?, ? FROM challenge_completions WHERE player_account_id = ? AND challenge_id = ? AND gameplay_revision_id IS ? AND status = 'active' AND source_id = ? LIMIT 1").bind(crypto.randomUUID(), crypto.randomUUID(), input.auth.actorType, input.auth.subject, JSON.stringify({ submissionId: input.row.id, challengeId: award.challengeId, titleKey: award.titleKey, mapId: award.mapId, gameplayRevisionId: award.gameplayRevisionId, satisfaction: award.satisfiedBy }), input.timestamp, input.row.playerAccountId, award.challengeId, award.gameplayRevisionId, input.row.id));
    for (const award of input.grantAuditAwards) statements.push(database.prepare("INSERT INTO audit_events (id, correlation_id, actor_type, actor_id, operation, entity_type, entity_id, payload_json, created_at) SELECT ?, ?, ?, ?, 'submission.grant', 'player_title_grant', id, ?, ? FROM player_title_grants WHERE id = ? AND status = 'active'").bind(crypto.randomUUID(), crypto.randomUUID(), input.auth.actorType, input.auth.subject, JSON.stringify({ submissionId: input.row.id, titleKey: award.titleKey, mapId: award.mapId, gameplayRevisionId: award.gameplayRevisionId, challengeId: award.challengeId, satisfiedBy: award.satisfiedBy }), input.timestamp, award.grantId));
    return statements;
  };

  const challengeCompletionChains = async (input: {
    playerAccountId: string;
    roots: Array<{ challengeId: string; slot: string | null }>;
    eligibilityAt: number;
    overlay?: CanonicalChallengeOverlay | null;
  }): Promise<ChallengeCompletionAward[][]> => {
    const overlay = input.overlay ?? null;
    const rootChallenges = await loadCanonicalChallenges(input.roots.map((root) => root.challengeId), overlay);
    if (rootChallenges.some((challenge) => !challenge)) throw new Error("CHALLENGE_NOT_FOUND");
    const results = input.roots.map(() => [] as ChallengeCompletionAward[]);
    const seen = input.roots.map(() => new Set<string>());
    let pending = rootChallenges.flatMap((challenge, rootIndex) => challenge ? [{ rootIndex, challenge, root: true }] : []);

    while (pending.length) {
      const current = pending.filter((entry) => {
        if (seen[entry.rootIndex].has(entry.challenge.id)) return false;
        seen[entry.rootIndex].add(entry.challenge.id);
        return true;
      });
      pending = [];
      const titleKeys = [...new Set(current.map(({ challenge }) => challenge.titleKey))];
      const challengeIds = [...new Set(current.map(({ challenge }) => challenge.id))];
      const [titleRows, grantRows, satisfiedRows] = await Promise.all([
        titleKeys.length ? db.select({ key: titleCatalog.key, lifecycle: titleCatalog.lifecycle }).from(titleCatalog).where(sql`${titleCatalog.key} IN (SELECT value FROM json_each(${JSON.stringify(titleKeys)}))`) : Promise.resolve([]),
        titleKeys.length ? db.select({ titleKey: playerTitleGrants.titleKey, mapId: playerTitleGrants.mapId, gameplayRevisionId: playerTitleGrants.gameplayRevisionId, status: playerTitleGrants.status, revocationType: playerTitleGrants.revocationType }).from(playerTitleGrants).where(and(
          eq(playerTitleGrants.playerAccountId, input.playerAccountId),
          sql`${playerTitleGrants.titleKey} IN (SELECT value FROM json_each(${JSON.stringify(titleKeys)}))`,
          or(eq(playerTitleGrants.status, "active"), and(eq(playerTitleGrants.status, "revoked"), eq(playerTitleGrants.revocationType, "administrator"))),
        )) : Promise.resolve([]),
        challengeIds.length ? db.select({ challengeId: challengeSatisfies.challengeId, satisfiedChallengeId: challengeSatisfies.satisfiedChallengeId }).from(challengeSatisfies).where(sql`${challengeSatisfies.challengeId} IN (SELECT value FROM json_each(${JSON.stringify(challengeIds)}))`) : Promise.resolve([]),
      ]);
      const titleByKey = new globalThis.Map(titleRows.map((title) => [title.key, title]));
      const ownedKeys = new Set(grantRows.filter((grant) => grant.status === "active").map((grant) => JSON.stringify([grant.titleKey, grant.mapId, grant.gameplayRevisionId])));
      const revokedKeys = new Set(grantRows.filter((grant) => grant.status === "revoked" && grant.revocationType === "administrator").map((grant) => JSON.stringify([grant.titleKey, grant.mapId, grant.gameplayRevisionId])));
      const satisfiedByChallenge = new globalThis.Map<string, typeof satisfiedRows>();
      for (const relation of satisfiedRows) satisfiedByChallenge.set(relation.challengeId, [...(satisfiedByChallenge.get(relation.challengeId) ?? []), relation]);
      const eligible = current.filter(({ challenge }) => {
        const title = titleByKey.get(challenge.titleKey);
        const preArchiveSubmission = challenge.status === "archived" && challenge.endsAt !== null && input.eligibilityAt < challenge.endsAt;
        return Boolean(title && title.lifecycle === "active" && challenge.manual !== 1 && (challenge.status === "active" || preArchiveSubmission)
          && (challenge.startsAt === null || input.eligibilityAt >= challenge.startsAt)
          && (challenge.endsAt === null || input.eligibilityAt < challenge.endsAt));
      }).map((entry) => ({
        ...entry,
        mapId: entry.root ? rootChallenges[entry.rootIndex]!.mapId : entry.challenge.mapId,
        gameplayRevisionId: entry.root ? rootChallenges[entry.rootIndex]!.gameplayRevisionId : entry.challenge.gameplayRevisionId,
      })).filter(({ challenge, mapId, gameplayRevisionId }) => !ownedKeys.has(JSON.stringify([challenge.titleKey, mapId, gameplayRevisionId])));

      const compatIds = [...new Set(eligible.filter(({ challenge, mapId }) => challenge.sourceFamily === "map_title_rule" && mapId).map(({ challenge }) => challenge.sourceId))];
      const compatRows = compatIds.length ? await db.select().from(mapTitleRuleCompat).where(sql`${mapTitleRuleCompat.legacyChallengeId} IN (SELECT value FROM json_each(${JSON.stringify(compatIds)}))`) : [];
      const compatByChallengeMap = new globalThis.Map(compatRows.map((relation) => [`${relation.legacyChallengeId}:${relation.mapId}`, relation.ruleId]));
      const assignmentCandidates = eligible.map((entry) => ({
        ...entry,
        assignmentFamily: entry.challenge.sourceFamily,
        assignmentId: compatByChallengeMap.get(`${entry.challenge.sourceId}:${entry.mapId}`) ?? entry.challenge.sourceId,
      }));
      const revisionIds = [...new Set(assignmentCandidates.flatMap(({ mapId, gameplayRevisionId }) => mapId && gameplayRevisionId ? [gameplayRevisionId] : []))];
      const ruleIds = [...new Set(assignmentCandidates.filter(({ assignmentFamily }) => assignmentFamily === "map_title_rule").map(({ assignmentId }) => assignmentId))];
      const mapIds = [...new Set(assignmentCandidates.flatMap(({ mapId }) => mapId ? [mapId] : []))];
      const [assignmentRows, ruleRows, rewardRows] = await Promise.all([
        revisionIds.length ? db.select().from(gameplayRevisionChallengeAssignments).where(sql`${gameplayRevisionChallengeAssignments.gameplayRevisionId} IN (SELECT value FROM json_each(${JSON.stringify(revisionIds)}))`) : Promise.resolve([]),
        ruleIds.length ? db.select({ id: mapTitleRules.id, slot: mapTitleRules.slot }).from(mapTitleRules).where(sql`${mapTitleRules.id} IN (SELECT value FROM json_each(${JSON.stringify(ruleIds)}))`) : Promise.resolve([]),
        mapIds.length ? db.select({ mapId: mapTitleRewards.mapId, titleKey: mapTitleRewards.titleKey, slot: mapTitleRewards.slot }).from(mapTitleRewards).where(sql`${mapTitleRewards.mapId} IN (SELECT value FROM json_each(${JSON.stringify(mapIds)}))`) : Promise.resolve([]),
      ]);
      const assignmentByKey = new globalThis.Map(assignmentRows.map((assignment) => [`${assignment.gameplayRevisionId}:${assignment.mapId}:${assignment.challengeFamily}:${assignment.challengeId}`, assignment]));
      const ruleById = new globalThis.Map(ruleRows.map((rule) => [rule.id, rule]));
      const rewardByKey = new globalThis.Map(rewardRows.map((reward) => [`${reward.mapId}:${reward.titleKey}`, reward]));
      const nextPairs: Array<{ rootIndex: number; challengeId: string }> = [];

      for (const entry of assignmentCandidates) {
        const challenge = entry.challenge;
        const assignment = entry.mapId && entry.gameplayRevisionId
          ? assignmentByKey.get(`${entry.gameplayRevisionId}:${entry.mapId}:${entry.assignmentFamily}:${entry.assignmentId}`)
          : null;
        const ruleSlot = entry.assignmentFamily === "map_title_rule" ? ruleById.get(entry.assignmentId) : null;
        const mapReward = entry.mapId ? rewardByKey.get(`${entry.mapId}:${challenge.titleKey}`) : null;
        results[entry.rootIndex].push({
          challengeId: challenge.id,
          titleKey: challenge.titleKey,
          mapId: entry.mapId,
          gameplayRevisionId: entry.gameplayRevisionId,
          slot: entry.root ? input.roots[entry.rootIndex].slot : assignment?.slot ?? ruleSlot?.slot ?? mapReward?.slot ?? null,
          completionSourceType: entry.root ? "submission" : "challenge_satisfies",
          satisfiedBy: entry.root ? null : input.roots[entry.rootIndex].challengeId,
          root: entry.root,
          grantable: !revokedKeys.has(JSON.stringify([challenge.titleKey, entry.mapId, entry.gameplayRevisionId])),
        });
        for (const relation of satisfiedByChallenge.get(challenge.id) ?? []) nextPairs.push({ rootIndex: entry.rootIndex, challengeId: relation.satisfiedChallengeId });
      }

      const targetIds = [...new Set(nextPairs.map(({ challengeId }) => challengeId))];
      const targets = targetIds.length ? await loadCanonicalChallenges(targetIds, overlay) : [];
      const targetById = new globalThis.Map(targets.flatMap((challenge) => challenge ? [[challenge.id, challenge] as const] : []));
      pending = nextPairs.flatMap(({ rootIndex, challengeId }) => {
        const challenge = targetById.get(challengeId);
        return challenge ? [{ rootIndex, challenge, root: false }] : [];
      });
    }
    return results;
  };

  return { titleGrantScopeKey, addChallengeCompletionAward, selectCompletionGrantAwards, submissionCompletionStatements, challengeCompletionChains };
};
