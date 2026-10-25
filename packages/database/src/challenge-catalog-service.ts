import { and, eq, inArray, isNull, ne, notExists, or } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";
import { parseChallengeProgressRule } from "@owbastion/domain";
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
import type { PlatformCache } from "./platform-cache";

// Catalog row shared by public and admin readers. Public callers only ever
// produce playable projections ("active" | "sunsetting" with a resolved
// gameVersion); admin callers pass includeInactive/forAdmin and see the stored
// lifecycle plus the definition window instead.
type MapChallengeCatalogRow = Omit<Extract<Challenge, { family: "map" }>, "status" | "gameVersion"> & {
  status: "draft" | "active" | "archived" | "sunsetting";
  gameVersion: string | null;
  startsAt?: number | null;
  endsAt?: number | null;
};

type Dependencies = {
  db: ReturnType<typeof drizzle>;
  now: () => number;
  platformCache: PlatformCache;
  pioneerExceptionIsSubmittable: (enabled: number, startsAt: number | null, endsAt: number | null, timestamp: number) => boolean;
  publicTitleChallengeStatus: (
    status: string,
    startsAt: number | null,
    endsAt: number | null,
    timestamp: number,
    gameVersion?: string | null,
    retiredVersion?: string | null,
  ) => string | null;
};

export const createChallengeCatalogServices = ({ db, now, platformCache, pioneerExceptionIsSubmittable, publicTitleChallengeStatus }: Dependencies) => {
  // Batch-load challenge↔map associations once and group in memory.
  // The association table is small; prefer one full read over per-challenge queries.
  // Use globalThis.Map: the contracts `Map` type shadows the built-in Map constructor.
  const loadChallengeMapIds = async (challengeIds?: string[]): Promise<globalThis.Map<string, string[]>> => {
    const d1InBindSoftLimit = 80;
    const rows = challengeIds === undefined || challengeIds.length > d1InBindSoftLimit
      ? await platformCache.cached("catalog", "challenge-map-ids", () => db.select({ challengeId: achievementChallengeMaps.challengeId, mapId: achievementChallengeMaps.mapId }).from(achievementChallengeMaps))
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
    const status = publicTitleChallengeStatus(challenge.status, challenge.startsAt, challenge.endsAt, timestamp, challenge.gameVersion, challenge.retiredVersion);
    const gameVersion = challenge.gameVersion?.trim();
    if (!status || !gameVersion || !title.gameVersion?.trim()) return null;
    const progressRule = parseChallengeProgressRule(challenge.progressRule);
    return {
      gameVersion,
      status: status as "scheduled" | "active" | "sunsetting",
      startsAt: challenge.startsAt ?? undefined,
      endsAt: challenge.endsAt ?? undefined,
      retiredVersion: challenge.retiredVersion ?? undefined,
      ...(progressRule ? { progressRule } : {}),
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
    gameVersion: revision.gameVersion,
    status: challenge.retiredVersion ? "sunsetting" : "active",
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
      eq(achievementChallenges.status, "active"),
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
      platformCache.cached("catalog", "pub-challenge-map-rows", () => mapChallengeQuery()),
      platformCache.cached("catalog", `pub-challenge-title-rows:${includeHiddenTitles ? "all" : "visible"}`, () => db.select({ challenge: titleChallenges, title: titleCatalog }).from(titleChallenges).innerJoin(titleCatalog, eq(titleChallenges.titleKey, titleCatalog.key)).where(and(eq(titleChallenges.status, "active"), eq(titleCatalog.lifecycle, "active"), includeHiddenTitles ? undefined : eq(titleCatalog.publicVisibility, 1)))),
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

  // Public projections only carry playable rows; stored lifecycle values are
  // visible to admin readers through the includeInactive/forAdmin modes.
  const isPlayableMapRow = (row: MapChallengeCatalogRow): row is Extract<Challenge, { family: "map" }> =>
    (row.status === "active" || row.status === "sunsetting") && row.gameVersion !== null;

  const fetchAllAutoMatchChallenges = async (eligibilityAt = now()): Promise<Challenge[]> => [
    ...(await fetchAllPublicChallenges(eligibilityAt, true)).filter((challenge) => challenge.family !== "achievement" || !challenge.progressRule),
    ...(await loadMapTitleRuleChallenges(false, eligibilityAt, true)).filter(isPlayableMapRow),
    ...(await loadMapScopedTitleChallenges(eligibilityAt, true)).filter(isPlayableMapRow),
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
      platformCache.cached("catalog", `event-map-links:${eventId}`, () => db.select().from(randomEventMapChallenges).where(eq(randomEventMapChallenges.eventId, eventId))),
      platformCache.cached("catalog", `event-title-links:${eventId}`, () => db.select().from(randomEventTitleChallenges).where(eq(randomEventTitleChallenges.eventId, eventId))),
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
          .where(and(inArray(achievementChallenges.id, mapChallengeIds), eq(achievementChallenges.status, "active"), eq(maps.status, "active"), eq(gameplayRevisions.mapId, achievementChallenges.mapId), inArray(gameplayRevisions.lifecycle, ["default", "selectable"])))
        : Promise.resolve([] as Array<{ challenge: typeof achievementChallenges.$inferSelect; map: typeof maps.$inferSelect; assignment: typeof gameplayRevisionChallengeAssignments.$inferSelect; revision: typeof gameplayRevisions.$inferSelect }>),
      titleChallengeIds.length
        ? db.select({ challenge: titleChallenges, title: titleCatalog }).from(titleChallenges).innerJoin(titleCatalog, eq(titleChallenges.titleKey, titleCatalog.key)).where(and(inArray(titleChallenges.id, titleChallengeIds), eq(titleChallenges.status, "active"), eq(titleCatalog.lifecycle, "active"), eq(titleCatalog.publicVisibility, 1)))
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
  const loadMapTitleRuleChallenges = async (includeInactive = false, eligibilityAt = now(), includeHiddenTitles = false, versionSource: "revision" | "definition" = "revision"): Promise<MapChallengeCatalogRow[]> => {
    const { rows, revisionRows, assignments, compat, exceptions } = await platformCache.cached("catalog", `rule-challenge-inputs:${includeInactive ? "all" : "open"}:${includeHiddenTitles ? "all" : "visible"}`, async () => {
      const [rows, revisionRows, assignments, compat, exceptions] = await Promise.all([
        db.select({ rule: mapTitleRules, title: titleCatalog }).from(mapTitleRules).innerJoin(titleCatalog, eq(mapTitleRules.titleKey, titleCatalog.key))
          .where(and(includeInactive ? undefined : eq(mapTitleRules.status, "active"), includeInactive ? undefined : eq(titleCatalog.lifecycle, "active"), includeInactive || includeHiddenTitles ? undefined : eq(titleCatalog.publicVisibility, 1))),
        db.select({ map: maps, revision: gameplayRevisions }).from(gameplayRevisions)
          .innerJoin(maps, eq(gameplayRevisions.mapId, maps.id))
          .where(and(eq(maps.status, "active"), inArray(gameplayRevisions.lifecycle, ["default", "selectable"]))),
        db.select().from(gameplayRevisionChallengeAssignments).where(eq(gameplayRevisionChallengeAssignments.challengeFamily, "map_title_rule")),
        db.select().from(mapTitleRuleCompat),
        db.select().from(mapTitleRuleExceptions),
      ]);
      return { rows, revisionRows, assignments, compat, exceptions };
    });
    const assignmentByRevisionRule = new globalThis.Map(assignments.map((item) => [`${item.gameplayRevisionId}:${item.challengeId}`, item]));
    const compatByRuleMap = new globalThis.Map(compat.map((item) => [`${item.ruleId}:${item.mapId}`, item.legacyChallengeId]));
    const exceptionByRuleMap = new globalThis.Map(exceptions.map((item) => [`${item.ruleId}:${item.mapId}`, item]));
    const timestamp = eligibilityAt;
    const items: MapChallengeCatalogRow[] = [];
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
          gameVersion: versionSource === "definition" ? rule.introducedVersion : revision.gameVersion,
          // Admin listings surface the stored lifecycle; public callers get the
          // availability word derived from the announced retirement version.
          status: includeInactive ? rule.status as "draft" | "active" | "archived" : rule.retiredVersion ? "sunsetting" : "active",
          retiredVersion: rule.retiredVersion ?? undefined,
        });
      }
    }
    return items;
  };
  const loadMapScopedTitleChallenges = async (eligibilityAt = now(), includeHiddenTitles = false, versionSource: "revision" | "definition" = "revision", forAdmin = false): Promise<MapChallengeCatalogRow[]> => {
    const { rows, compatIds } = await platformCache.cached("catalog", `map-scoped-title-rows:${includeHiddenTitles ? "all" : "visible"}:${forAdmin ? "admin" : "public"}`, async () => ({ rows: await db.select({ challenge: titleChallenges, title: titleCatalog, assignment: gameplayRevisionChallengeAssignments, revision: gameplayRevisions, map: maps })
      .from(gameplayRevisionChallengeAssignments)
      .innerJoin(titleChallenges, eq(gameplayRevisionChallengeAssignments.challengeId, titleChallenges.id))
      .innerJoin(titleCatalog, eq(titleChallenges.titleKey, titleCatalog.key))
      .innerJoin(gameplayRevisions, eq(gameplayRevisionChallengeAssignments.gameplayRevisionId, gameplayRevisions.id))
      .innerJoin(maps, eq(gameplayRevisionChallengeAssignments.mapId, maps.id))
      .where(and(
        eq(gameplayRevisionChallengeAssignments.challengeFamily, "title_challenge"),
        eq(gameplayRevisionChallengeAssignments.enabled, 1),
        forAdmin ? undefined : eq(titleChallenges.status, "active"),
        eq(titleChallenges.scope, "map"),
        isNull(titleChallenges.progressRule),
        forAdmin ? undefined : eq(titleCatalog.lifecycle, "active"),
        forAdmin || includeHiddenTitles ? undefined : eq(titleCatalog.publicVisibility, 1),
        eq(maps.status, "active"),
        eq(gameplayRevisions.mapId, gameplayRevisionChallengeAssignments.mapId),
        inArray(gameplayRevisions.lifecycle, ["default", "selectable"]),
      )), compatIds: (await db.select({ legacyChallengeId: mapTitleRuleCompat.legacyChallengeId }).from(mapTitleRuleCompat)).map(({ legacyChallengeId }) => legacyChallengeId) }));
    const compat = new Set(compatIds);
    return rows.flatMap(({ challenge, title, assignment, revision, map }) => {
      if (compat.has(challenge.id)) return [];
      // Admin listings surface the stored lifecycle; public callers get the
      // derived availability word and only see currently open challenges.
      const status = forAdmin
        ? challenge.status
        : publicTitleChallengeStatus(challenge.status, challenge.startsAt, challenge.endsAt, eligibilityAt, challenge.gameVersion, challenge.retiredVersion);
      if (!status || (!forAdmin && status !== "active" && status !== "sunsetting")) return [];
      const gameVersion = challenge.gameVersion?.trim();
      if (!forAdmin && (!gameVersion || !title.gameVersion?.trim())) return [];
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
        gameVersion: versionSource === "definition" ? gameVersion ?? null : revision.gameVersion,
        status: status as MapChallengeCatalogRow["status"],
        retiredVersion: challenge.retiredVersion ?? undefined,
        ...(forAdmin ? { startsAt: challenge.startsAt, endsAt: challenge.endsAt } : {}),
        ...(mapVariant ? { mapVariant } : {}),
      }];
    });
  };

  // Gallery projection: every released, publicly visible title except the
  // developer-reserved series. A title with no open path shows once as ended.
  const listPublicAchievements = async (): Promise<Array<Extract<Challenge, { family: "achievement" }>>> => {
    const rows = await platformCache.cached("catalog", "pub-achievement-gallery-rows", () => db.select({ challenge: titleChallenges, title: titleCatalog })
      .from(titleChallenges)
      .innerJoin(titleCatalog, eq(titleChallenges.titleKey, titleCatalog.key))
      .where(and(ne(titleChallenges.status, "draft"), eq(titleCatalog.lifecycle, "active"), eq(titleCatalog.publicVisibility, 1), ne(titleCatalog.category, "开发保留"))));
    const timestamp = now();
    const byTitle = new globalThis.Map<string, typeof rows>();
    for (const row of rows) {
      if ((row.challenge.scope ?? "global") === "map" && row.challenge.mapVariant) continue;
      byTitle.set(row.title.key, [...(byTitle.get(row.title.key) ?? []), row]);
    }
    return [...byTitle.values()].flatMap((group): Array<Extract<Challenge, { family: "achievement" }>> => {
      const open = group.flatMap(({ challenge, title }) => {
        const fields = publicTitleChallengeFields(challenge, title, timestamp);
        return fields ? [{ ...toTitleChallengeBase(challenge, title), ...fields }] : [];
      });
      if (open.length) return open;
      const released = group.filter(({ challenge, title }) => challenge.gameVersion?.trim() && title.gameVersion?.trim());
      const latest = released.sort((left, right) => (right.challenge.endsAt ?? 0) - (left.challenge.endsAt ?? 0) || left.challenge.id.localeCompare(right.challenge.id))[0];
      return latest ? [{
        ...toTitleChallengeBase(latest.challenge, latest.title),
        gameVersion: latest.challenge.gameVersion!.trim(),
        status: "ended" as const,
        startsAt: latest.challenge.startsAt ?? undefined,
        endsAt: latest.challenge.endsAt ?? undefined,
        retiredVersion: latest.challenge.retiredVersion ?? undefined,
      }] : [];
    }).sort((left, right) => left.category.localeCompare(right.category, "zh-CN") || left.titleName.localeCompare(right.titleName, "zh-CN"));
  };

  return {
    enabledMapChallengeAssignment,
    fetchAllPublicChallenges,
    fetchPlayerAutoMatchChallenges,
    listPublicAchievements,
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
