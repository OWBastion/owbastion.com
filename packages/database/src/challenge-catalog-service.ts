import { and, eq, inArray, isNull, notExists, or } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";
import type { Challenge } from "@owbastion/contracts";
import { groupBy } from "./group-by";
import {
  achievementChallengeMaps,
  achievementChallenges,
  gameplayRevisionChallengeAssignments,
  gameplayRevisions,
  mapTitleRuleCompat,
  mapTitleRuleExceptions,
  mapTitleRules,
  maps,
  playerTitleGrants,
  randomEventMapChallenges,
  randomEventTitleChallenges,
  titleCatalog,
  titleChallenges,
} from "./schema";

type Dependencies = {
  db: ReturnType<typeof drizzle>;
  now: () => number;
  pioneerExceptionIsSubmittable: (enabled: number, startsAt: number | null, endsAt: number | null, timestamp: number) => boolean;
  publicTitleChallengeStatus: (
    status: string,
    startsAt: number | null,
    endsAt: number | null,
    timestamp: number,
    gameVersion?: string | null,
  ) => string | null;
};

export const createChallengeCatalogServices = ({ db, now, pioneerExceptionIsSubmittable, publicTitleChallengeStatus }: Dependencies) => {
  // Batch-load challenge↔map associations once and group in memory.
  // The association table is small; prefer one full read over per-challenge queries.
  // Use globalThis.Map: the contracts `Map` type shadows the built-in Map constructor.
  const loadChallengeMapIds = async (challengeIds?: string[]): Promise<globalThis.Map<string, string[]>> => {
    const d1InBindSoftLimit = 80;
    const rows = challengeIds === undefined || challengeIds.length > d1InBindSoftLimit
      ? await db.select({ challengeId: achievementChallengeMaps.challengeId, mapId: achievementChallengeMaps.mapId }).from(achievementChallengeMaps)
      : challengeIds.length === 0
        ? []
        : await db.select({ challengeId: achievementChallengeMaps.challengeId, mapId: achievementChallengeMaps.mapId })
          .from(achievementChallengeMaps)
          .where(inArray(achievementChallengeMaps.challengeId, challengeIds));
    const allowed = challengeIds && challengeIds.length > d1InBindSoftLimit ? new Set(challengeIds) : null;
    const grouped = new globalThis.Map<string, string[]>();
    for (const [challengeId, links] of groupBy(rows, (row) => row.challengeId, ({ challengeId }) => !allowed || allowed.has(challengeId))) grouped.set(challengeId, links.map(({ mapId }) => mapId));
    return grouped;
  };

  const validateChallengeMapScope = async (scope: "global" | "map", mapIds: string[]) => {
    if (scope === "global") {
      if (mapIds.length) throw new Error("INVALID_MAP_SCOPE");
      return;
    }
    if (!mapIds.length) return;
    const targetMaps = await db.select({ id: maps.id, status: maps.status }).from(maps).where(inArray(maps.id, mapIds));
    if (targetMaps.length !== mapIds.length) throw new Error("MAP_NOT_FOUND");
    if (targetMaps.some((map) => map.status !== "active")) throw new Error("MAP_NOT_ACTIVE");
  };

  const loadTitleChallengeRevisions = async (mapIds: string[], mapVariant: "classic" | null) => {
    const assignedMapIds = mapIds.length
      ? mapIds
      : (await db.select({ id: maps.id }).from(maps).where(eq(maps.status, "active"))).map(({ id }) => id);
    if (!assignedMapIds.length) return [];
    return db.select({ revision: gameplayRevisions }).from(gameplayRevisions).where(and(
      inArray(gameplayRevisions.mapId, assignedMapIds),
      mapVariant === "classic"
        ? and(eq(gameplayRevisions.lifecycle, "selectable"), eq(gameplayRevisions.legacyMapVariant, "classic"))
        : and(eq(gameplayRevisions.lifecycle, "default"), isNull(gameplayRevisions.legacyMapVariant)),
    ));
  };

  const toTitleChallengeBase = (
    challenge: typeof titleChallenges.$inferSelect,
    title: typeof titleCatalog.$inferSelect,
  ) => ({
    challengeId: challenge.id,
    family: "achievement" as const,
    type: "title_achievement" as const,
    kind: "title_achievement" as const,
    titleKey: title.key,
    titleName: title.label,
    icon: title.icon,
    iconUrl: title.iconUrl,
    category: challenge.categoryOverride ?? title.category,
    condition: challenge.condition,
    evidenceRule: challenge.evidenceRule,
    submissionMode: challenge.submissionMode as "manual" | "automatic",
  });

  const publicTitleChallengeFields = (
    challenge: typeof titleChallenges.$inferSelect,
    title: typeof titleCatalog.$inferSelect,
    timestamp: number,
  ) => {
    const status = publicTitleChallengeStatus(challenge.status, challenge.startsAt, challenge.endsAt, timestamp, challenge.gameVersion);
    const gameVersion = challenge.gameVersion?.trim();
    if (!status || !gameVersion || !title.gameVersion?.trim()) return null;
    return {
      gameVersion,
      status: status as "scheduled" | "active" | "sunsetting",
      startsAt: challenge.startsAt ?? undefined,
      endsAt: challenge.endsAt ?? undefined,
      retiredVersion: challenge.retiredVersion ?? undefined,
    };
  };

  const toPublicTitleChallenge = (
    challenge: typeof titleChallenges.$inferSelect,
    title: typeof titleCatalog.$inferSelect,
    timestamp: number,
    mapIdsByChallenge: globalThis.Map<string, string[]>,
  ): Extract<Challenge, { family: "achievement" }> | null => {
    const fields = publicTitleChallengeFields(challenge, title, timestamp);
    if (!fields) return null;
    return {
      ...toTitleChallengeBase(challenge, title),
      ...fields,
      scope: (challenge.scope ?? "global") as "global" | "map",
      mapIds: (challenge.scope ?? "global") === "map" ? (mapIdsByChallenge.get(challenge.id) ?? []) : [],
      ...(challenge.mapVariant ? { mapVariant: challenge.mapVariant as "classic" } : {}),
    };
  };

  const toPublicMapChallenge = (
    challenge: typeof achievementChallenges.$inferSelect,
    map: typeof maps.$inferSelect,
    assignment: typeof gameplayRevisionChallengeAssignments.$inferSelect,
    revision: typeof gameplayRevisions.$inferSelect,
  ): Extract<Challenge, { family: "map" }> => ({
    challengeId: challenge.id,
    family: "map",
    gameplayRevisionId: revision.id,
    type: "map_completion",
    kind: challenge.type as "difficulty_completion" | "pioneer" | "classic_completion",
    name: challenge.name,
    mapId: map.id,
    mapName: map.name,
    ...(challenge.rewardTitleKey ? { titleKey: challenge.rewardTitleKey } : {}),
    ...(challenge.type === "classic_completion" ? { mapVariant: "classic" as const } : {}),
    condition: assignment.condition ?? challenge.condition,
    evidenceRule: assignment.evidenceRule ?? challenge.evidenceRule,
    submissionMode: (assignment.submissionMode ?? challenge.submissionMode) as "manual" | "automatic",
    difficulty: challenge.difficulty ?? undefined,
    gameVersion: challenge.gameVersion,
    status: challenge.status as "active" | "sunsetting",
    retiredVersion: challenge.retiredVersion ?? undefined,
  });

  const enabledMapChallengeAssignment = () => and(
    eq(gameplayRevisionChallengeAssignments.challengeFamily, "map_challenge"),
    eq(gameplayRevisionChallengeAssignments.challengeId, achievementChallenges.id),
    eq(gameplayRevisionChallengeAssignments.mapId, achievementChallenges.mapId),
    eq(gameplayRevisionChallengeAssignments.enabled, 1),
  );
  const mapChallengeQuery = () => db.select({ challenge: achievementChallenges, map: maps, assignment: gameplayRevisionChallengeAssignments, revision: gameplayRevisions })
    .from(achievementChallenges)
    .innerJoin(maps, eq(achievementChallenges.mapId, maps.id))
    .innerJoin(gameplayRevisionChallengeAssignments, enabledMapChallengeAssignment())
    .innerJoin(gameplayRevisions, eq(gameplayRevisionChallengeAssignments.gameplayRevisionId, gameplayRevisions.id))
    .where(and(
      inArray(achievementChallenges.status, ["active", "sunsetting"]),
      eq(maps.status, "active"),
      eq(gameplayRevisions.mapId, achievementChallenges.mapId),
      inArray(gameplayRevisions.lifecycle, ["default", "selectable"]),
      notExists(db.select({ legacyChallengeId: mapTitleRuleCompat.legacyChallengeId })
        .from(mapTitleRuleCompat)
        .where(and(
          eq(mapTitleRuleCompat.legacyChallengeId, achievementChallenges.id),
          eq(mapTitleRuleCompat.mapId, achievementChallenges.mapId),
        ))),
    ));

  // Fetch all currently public challenges in a bounded number of queries.
  // Used by the batch event list path and other composed catalog reads.
  const fetchAllPublicChallenges = async (eligibilityAt = now(), includeHiddenTitles = false): Promise<Challenge[]> => {
    const [mapRows, titleRows, mapIdsByChallenge] = await Promise.all([
      mapChallengeQuery(),
      db.select({ challenge: titleChallenges, title: titleCatalog }).from(titleChallenges).innerJoin(titleCatalog, eq(titleChallenges.titleKey, titleCatalog.key)).where(and(inArray(titleChallenges.status, ["scheduled", "active", "sunsetting"]), eq(titleCatalog.lifecycle, "active"), includeHiddenTitles ? undefined : eq(titleCatalog.publicVisibility, 1))),
      loadChallengeMapIds(),
    ]);
    const timestamp = eligibilityAt;
    const items: Challenge[] = [];
    items.push(...mapRows.map(({ challenge, map, assignment, revision }) => toPublicMapChallenge(challenge, map, assignment, revision)));
    for (const { challenge, title } of titleRows) {
      const item = toPublicTitleChallenge(challenge, title, timestamp, mapIdsByChallenge);
      // Public event composition only surfaces currently open title challenges.
      if (item && (item.status === "active" || item.status === "sunsetting") && item.scope !== "map") items.push(item);
    }
    return items;
  };

  const fetchAllAutoMatchChallenges = async (eligibilityAt = now()): Promise<Challenge[]> => [
    ...await fetchAllPublicChallenges(eligibilityAt, true),
    ...await loadMapTitleRuleChallenges(false, eligibilityAt, true),
    ...await loadMapScopedTitleChallenges(eligibilityAt, true),
  ];

  const fetchPlayerAutoMatchChallenges = async (playerAccountId: string, eligibilityAt: number): Promise<Challenge[]> => {
    const [items, grants] = await Promise.all([
      fetchAllAutoMatchChallenges(eligibilityAt),
      db.select({ titleKey: playerTitleGrants.titleKey, mapId: playerTitleGrants.mapId, gameplayRevisionId: playerTitleGrants.gameplayRevisionId })
        .from(playerTitleGrants)
        .where(and(
          eq(playerTitleGrants.playerAccountId, playerAccountId),
          or(
            eq(playerTitleGrants.status, "active"),
            and(eq(playerTitleGrants.status, "revoked"), eq(playerTitleGrants.revocationType, "administrator")),
          ),
        )),
    ]);
    const blockedScopes = new Set(grants.map((grant) => JSON.stringify([grant.titleKey, grant.mapId, grant.gameplayRevisionId])));
    return items.filter((challenge) => !challenge.titleKey || !blockedScopes.has(JSON.stringify([
      challenge.titleKey,
      challenge.family === "map" ? challenge.mapId : null,
      challenge.family === "map" ? challenge.gameplayRevisionId : null,
    ])));
  };

  // Single-event path: load only linked challenges (bounded), not the full catalog.
  const publicEventChallenges = async (eventId: string) => {
    const [mapLinks, titleLinks] = await Promise.all([
      db.select().from(randomEventMapChallenges).where(eq(randomEventMapChallenges.eventId, eventId)),
      db.select().from(randomEventTitleChallenges).where(eq(randomEventTitleChallenges.eventId, eventId)),
    ]);
    const mapChallengeIds = mapLinks.map((link) => link.challengeId);
    const titleChallengeIds = titleLinks.map((link) => link.challengeId);
    if (!mapChallengeIds.length && !titleChallengeIds.length) return [];
    const [mapRows, titleRows, mapIdsByChallenge] = await Promise.all([
      mapChallengeIds.length
        ? db.select({ challenge: achievementChallenges, map: maps, assignment: gameplayRevisionChallengeAssignments, revision: gameplayRevisions })
          .from(achievementChallenges)
          .innerJoin(maps, eq(achievementChallenges.mapId, maps.id))
          .innerJoin(gameplayRevisionChallengeAssignments, enabledMapChallengeAssignment())
          .innerJoin(gameplayRevisions, eq(gameplayRevisionChallengeAssignments.gameplayRevisionId, gameplayRevisions.id))
          .where(and(inArray(achievementChallenges.id, mapChallengeIds), inArray(achievementChallenges.status, ["active", "sunsetting"]), eq(maps.status, "active"), eq(gameplayRevisions.mapId, achievementChallenges.mapId), inArray(gameplayRevisions.lifecycle, ["default", "selectable"])))
        : Promise.resolve([] as Array<{ challenge: typeof achievementChallenges.$inferSelect; map: typeof maps.$inferSelect; assignment: typeof gameplayRevisionChallengeAssignments.$inferSelect; revision: typeof gameplayRevisions.$inferSelect }>),
      titleChallengeIds.length
        ? db.select({ challenge: titleChallenges, title: titleCatalog }).from(titleChallenges).innerJoin(titleCatalog, eq(titleChallenges.titleKey, titleCatalog.key)).where(and(inArray(titleChallenges.id, titleChallengeIds), inArray(titleChallenges.status, ["scheduled", "active", "sunsetting"]), eq(titleCatalog.lifecycle, "active"), eq(titleCatalog.publicVisibility, 1)))
        : Promise.resolve([] as Array<{ challenge: typeof titleChallenges.$inferSelect; title: typeof titleCatalog.$inferSelect }>),
      loadChallengeMapIds(titleChallengeIds),
    ]);
    const timestamp = now();
    const items: Challenge[] = [];
    items.push(...mapRows.map(({ challenge, map, assignment, revision }) => toPublicMapChallenge(challenge, map, assignment, revision)));
    for (const { challenge, title } of titleRows) {
      const item = toPublicTitleChallenge(challenge, title, timestamp, mapIdsByChallenge);
      if (item && (item.status === "active" || item.status === "sunsetting")) items.push(item);
    }
    return items;
  };
  const loadMapTitleRuleChallenges = async (includeInactive = false, eligibilityAt = now(), includeHiddenTitles = false): Promise<Challenge[]> => {
    const [rows, revisionRows, assignments, compat, exceptions] = await Promise.all([
      db.select({ rule: mapTitleRules, title: titleCatalog }).from(mapTitleRules).innerJoin(titleCatalog, eq(mapTitleRules.titleKey, titleCatalog.key))
        .where(and(includeInactive ? undefined : inArray(mapTitleRules.status, ["active", "sunsetting"]), eq(titleCatalog.lifecycle, "active"), includeHiddenTitles ? undefined : eq(titleCatalog.publicVisibility, 1))),
      db.select({ map: maps, revision: gameplayRevisions }).from(gameplayRevisions)
        .innerJoin(maps, eq(gameplayRevisions.mapId, maps.id))
        .where(and(eq(maps.status, "active"), inArray(gameplayRevisions.lifecycle, ["default", "selectable"]))),
      db.select().from(gameplayRevisionChallengeAssignments).where(eq(gameplayRevisionChallengeAssignments.challengeFamily, "map_title_rule")),
      db.select().from(mapTitleRuleCompat),
      db.select().from(mapTitleRuleExceptions),
    ]);
    const assignmentByRevisionRule = new globalThis.Map(assignments.map((item) => [`${item.gameplayRevisionId}:${item.challengeId}`, item]));
    const compatByRuleMap = new globalThis.Map(compat.map((item) => [`${item.ruleId}:${item.mapId}`, item.legacyChallengeId]));
    const exceptionByRuleMap = new globalThis.Map(exceptions.map((item) => [`${item.ruleId}:${item.mapId}`, item]));
    const timestamp = eligibilityAt;
    const items: Challenge[] = [];
    for (const { rule, title } of rows) {
      if (rule.kind.trim().toLocaleLowerCase() === "pioneer" && rule.defaultScope !== "explicit") continue;
      for (const { map, revision } of revisionRows) {
        const assignment = assignmentByRevisionRule.get(`${revision.id}:${rule.id}`);
        if (!assignment || assignment.mapId !== map.id || assignment.enabled === 0) continue;
        const exception = exceptionByRuleMap.get(`${rule.id}:${map.id}`);
        if (rule.kind.trim().toLocaleLowerCase() === "pioneer" && !pioneerExceptionIsSubmittable(exception?.enabled ?? 0, exception?.startsAt ?? null, exception?.endsAt ?? null, timestamp)) continue;
        const activeException = exception?.enabled === 1 ? exception : null;
        const slot = activeException?.slot ?? assignment.slot ?? rule.slot ?? null;
        items.push({
          challengeId: compatByRuleMap.get(`${rule.id}:${map.id}`) ?? `${map.id}.${rule.kind}`,
          family: "map", gameplayRevisionId: revision.id, type: "map_completion", kind: "map_title_achievement",
          name: title.label, mapId: map.id, mapName: map.name, titleKey: title.key,
          ...(rule.mapVariant ? { mapVariant: rule.mapVariant as "classic" } : {}),
          condition: activeException?.condition ?? assignment.condition ?? rule.condition,
          evidenceRule: activeException?.evidenceRule ?? assignment.evidenceRule ?? rule.evidenceRule,
          submissionMode: (activeException?.submissionMode ?? assignment.submissionMode ?? rule.submissionMode) as "manual" | "automatic",
          mapTitleRule: { ruleId: rule.id, kind: rule.kind, displayKind: rule.displayKind as "fixed" | "map_pioneer" | "map_name_suffix", slot: slot as "pioneer" | "conqueror" | "dominator" | null, dynamic: true },
          gameVersion: rule.introducedVersion,
          status: rule.status as "active" | "sunsetting",
          retiredVersion: rule.retiredVersion ?? undefined,
        });
      }
    }
    return items;
  };
  const loadMapScopedTitleChallenges = async (eligibilityAt = now(), includeHiddenTitles = false): Promise<Challenge[]> => {
    const rows = await db.select({ challenge: titleChallenges, title: titleCatalog, assignment: gameplayRevisionChallengeAssignments, revision: gameplayRevisions, map: maps })
      .from(gameplayRevisionChallengeAssignments)
      .innerJoin(titleChallenges, eq(gameplayRevisionChallengeAssignments.challengeId, titleChallenges.id))
      .innerJoin(titleCatalog, eq(titleChallenges.titleKey, titleCatalog.key))
      .innerJoin(gameplayRevisions, eq(gameplayRevisionChallengeAssignments.gameplayRevisionId, gameplayRevisions.id))
      .innerJoin(maps, eq(gameplayRevisionChallengeAssignments.mapId, maps.id))
      .where(and(
        eq(gameplayRevisionChallengeAssignments.challengeFamily, "title_challenge"),
        eq(gameplayRevisionChallengeAssignments.enabled, 1),
        inArray(titleChallenges.status, ["scheduled", "active", "sunsetting"]),
        eq(titleChallenges.scope, "map"),
        eq(titleCatalog.lifecycle, "active"),
        includeHiddenTitles ? undefined : eq(titleCatalog.publicVisibility, 1),
        eq(maps.status, "active"),
        eq(gameplayRevisions.mapId, gameplayRevisionChallengeAssignments.mapId),
        inArray(gameplayRevisions.lifecycle, ["default", "selectable"]),
      ));
    const compatRows = await db.select({ legacyChallengeId: mapTitleRuleCompat.legacyChallengeId }).from(mapTitleRuleCompat);
    const compatIds = new Set(compatRows.map(({ legacyChallengeId }) => legacyChallengeId));
    return rows.flatMap(({ challenge, title, assignment, revision, map }) => {
      if (compatIds.has(challenge.id)) return [];
      const status = publicTitleChallengeStatus(challenge.status, challenge.startsAt, challenge.endsAt, eligibilityAt, challenge.gameVersion);
      if (!status || (status !== "active" && status !== "sunsetting")) return [];
      const gameVersion = challenge.gameVersion?.trim();
      if (!gameVersion || !title.gameVersion?.trim()) return [];
      const mapVariant = (challenge.mapVariant as "classic" | null) ?? null;
      return [{
        challengeId: challenge.id,
        family: "map" as const,
        gameplayRevisionId: revision.id,
        type: "map_completion" as const,
        kind: "map_title_achievement" as const,
        titleKey: title.key,
        name: title.label,
        mapId: map.id,
        mapName: map.name,
        condition: assignment.condition ?? challenge.condition,
        evidenceRule: assignment.evidenceRule ?? challenge.evidenceRule,
        submissionMode: (assignment.submissionMode ?? challenge.submissionMode) as "manual" | "automatic",
        gameVersion,
        status: status as "active" | "sunsetting",
        retiredVersion: challenge.retiredVersion ?? undefined,
        ...(mapVariant ? { mapVariant } : {}),
      }];
    });
  };

  return {
    enabledMapChallengeAssignment,
    fetchAllPublicChallenges,
    fetchPlayerAutoMatchChallenges,
    loadChallengeMapIds,
    loadMapScopedTitleChallenges,
    loadMapTitleRuleChallenges,
    loadTitleChallengeRevisions,
    mapChallengeQuery,
    publicEventChallenges,
    publicTitleChallengeFields,
    toPublicMapChallenge,
    toPublicTitleChallenge,
    toTitleChallengeBase,
    validateChallengeMapScope,
  };
};
