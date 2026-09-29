import { and, eq, inArray, isNotNull, isNull, ne, or } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";
import type {
  AgentSearchResult,
  AgentTitle,
  Challenge,
  Title,
} from "@owbastion/contracts";
import type {
  AgentAchievementQuery,
  AgentEventQuery,
  AgentMapQuery,
  AgentMapTitleHolderQuery,
  AgentPlayerTitleGrantQuery,
  AgentSearchQuery,
  AgentTitleQuery,
  PlatformServices,
} from "@owbastion/domain";
import type { paginate } from "./page-result";
import { loadAgentMapProjectionsFast as projectAgentMaps } from "./agent-map-projection";
import {
  gameplayRevisions,
  mapTitleRewards,
  maps,
  playerAccounts,
  playerEquippedTitles,
  playerTitleEntitlements,
  playerTitleGrants,
  titleCatalog,
  titleChallenges,
} from "./schema";

type AgentServices = Pick<PlatformServices,
  | "listAgentEvents"
  | "getAgentEvent"
  | "listAgentMaps"
  | "getAgentMap"
  | "listAgentAchievements"
  | "getAgentAchievement"
  | "listAgentTitles"
  | "listAgentPlayerTitleGrants"
  | "listAgentMapTitleHolders"
  | "getAgentTitle"
  | "searchAgentContent"
>;

type Dependencies = {
  database: D1Database;
  now: () => number;
  paginate: typeof paginate;
  suspendedEventVersions: () => Promise<Set<string>>;
  listGlobalAgentTitles: () => Promise<AgentTitle[]>;
  loadChallengeMapIds: (challengeIds?: string[]) => Promise<globalThis.Map<string, string[]>>;
  toAgentTitle: (row: typeof titleCatalog.$inferSelect) => AgentTitle;
  toPublicTitleChallenge: (
    challenge: typeof titleChallenges.$inferSelect,
    title: typeof titleCatalog.$inferSelect,
    timestamp: number,
    mapIdsByChallenge: globalThis.Map<string, string[]>,
  ) => Extract<Challenge, { family: "achievement" }> | null;
  titleChallengeIsSubmittable: (status: string, startsAt: number | null, endsAt: number | null, timestamp: number, gameVersion?: string | null) => boolean;
};

export const createAgentServices = (db: ReturnType<typeof drizzle>, dependencies: Dependencies): AgentServices => {
  const {
    database,
    now,
    paginate,
    suspendedEventVersions,
    listGlobalAgentTitles,
    loadChallengeMapIds,
    toAgentTitle,
    toPublicTitleChallenge,
    titleChallengeIsSubmittable,
  } = dependencies;
  const loadAgentMapProjectionsFast = (input: { mapId?: string }) => projectAgentMaps(database, input, now);
  const asMapAgentTitle = (
    title: typeof titleCatalog.$inferSelect,
    mapId: string,
    gameVersion: string,
    details?: Pick<AgentTitle, "slot" | "pioneerPrefixes">,
  ): AgentTitle => ({
    ...toAgentTitle(title),
    scope: "map",
    mapId,
    ...details,
    gameVersion,
  });

  return {
    async listAgentEvents(this: PlatformServices, input: AgentEventQuery) {
      const [events, suspendedVersions] = await Promise.all([this.listRandomEvents({ category: input.category, rarity: input.rarity, status: input.status }), suspendedEventVersions()]);
      const query = input.query?.toLocaleLowerCase();
      const available = events.filter((event) => !suspendedVersions.has(event.gameVersion));
      const filtered = query ? available.filter((event) => [event.name, event.description, ...event.effectTags].some((value) => value.toLocaleLowerCase().includes(query))) : available;
      return paginate(filtered, input.page, input.pageSize);
    },
    async getAgentEvent(this: PlatformServices, input) {
      const event = await this.getRandomEvent({ eventId: input.eventId, status: input.status });
      if (!event || (await suspendedEventVersions()).has(event.gameVersion)) return null;
      return event;
    },
    async listAgentMaps(input: AgentMapQuery) {
      const maps = await loadAgentMapProjectionsFast({});
      const query = input.query?.toLocaleLowerCase();
      const mechanic = input.mechanic?.toLocaleLowerCase();
      const filtered = maps.filter((map) => (!query || map.mapName.toLocaleLowerCase().includes(query)) && (!mechanic || map.mechanics.some((value) => value.toLocaleLowerCase() === mechanic)));
      return paginate(filtered, input.page, input.pageSize);
    },
    async getAgentMap(input) {
      return (await loadAgentMapProjectionsFast({ mapId: input.mapId }))[0] ?? null;
    },
    async listAgentAchievements(this: PlatformServices, input: AgentAchievementQuery) {
      const allChallenges = await this.listChallenges();
      const projectableRevisionIds = new Set((await loadAgentMapProjectionsFast({})).flatMap((map) => map.gameplayRevisions.map((revision) => revision.gameplayRevisionId)));
      const challenges = allChallenges.filter((challenge) => challenge.family === "achievement" || challenge.family === "map" && projectableRevisionIds.has(challenge.gameplayRevisionId));
      const query = input.query?.toLocaleLowerCase();
      const filtered = challenges.filter((challenge) => {
        const values = challenge.family === "achievement"
          ? [challenge.titleName, challenge.category, challenge.condition, challenge.evidenceRule]
          : [challenge.name, challenge.mapName, challenge.condition ?? "", challenge.evidenceRule ?? ""];
        return (!query || values.some((value) => value.toLocaleLowerCase().includes(query)))
          && (!input.status || challenge.status === input.status)
          && (!input.mapId || (challenge.family === "map" ? challenge.mapId === input.mapId : challenge.scope !== "map" || !challenge.mapIds?.length || challenge.mapIds.includes(input.mapId)));
      });
      return paginate(filtered, input.page, input.pageSize);
    },
    async getAgentAchievement(this: PlatformServices, input) {
      const row = await db.select({ challenge: titleChallenges, title: titleCatalog })
        .from(titleChallenges)
        .innerJoin(titleCatalog, eq(titleChallenges.titleKey, titleCatalog.key))
        .where(and(
          eq(titleChallenges.id, input.challengeId),
          inArray(titleChallenges.status, ["scheduled", "active", "sunsetting"]),
          eq(titleCatalog.scope, "global"),
          eq(titleCatalog.lifecycle, "active"),
          eq(titleCatalog.publicVisibility, 1),
        ))
        .get();
      if (row) {
        const mapIdsByChallenge = (row.challenge.scope ?? "global") === "map"
          ? await loadChallengeMapIds([row.challenge.id])
          : new globalThis.Map<string, string[]>();
        return toPublicTitleChallenge(row.challenge, row.title, now(), mapIdsByChallenge);
      }
      const allChallenges = await this.listChallenges();
      const projectableRevisionIds = new Set((await loadAgentMapProjectionsFast({})).flatMap((map) => map.gameplayRevisions.map((revision) => revision.gameplayRevisionId)));
      const mapMatches = allChallenges.filter((challenge): challenge is Extract<Challenge, { family: "map" }> => challenge.family === "map"
        && challenge.challengeId === input.challengeId
        && projectableRevisionIds.has(challenge.gameplayRevisionId)
        && (!input.mapId || challenge.mapId === input.mapId)
        && (!input.gameplayRevisionId || challenge.gameplayRevisionId === input.gameplayRevisionId));
      if (mapMatches.length) return mapMatches.length === 1 ? mapMatches[0] : null;
      return null;
    },
    async listAgentTitles(this: PlatformServices, input: AgentTitleQuery) {
      const globalTitles = await listGlobalAgentTitles();
      const mapTitles = input.mapId
        ? (await this.listTitles({ mapId: input.mapId })).filter((title) => title.scope === "map")
        : [];
      const titles = globalTitles.concat(mapTitles);
      const query = input.query?.toLocaleLowerCase();
      const filtered = titles.filter((title) => (!query || [title.label, title.category, title.condition].some((value) => value.toLocaleLowerCase().includes(query))) && (!input.category || title.category === input.category) && (!input.scope || title.scope === input.scope) && (!input.mapId || title.scope === "global" || title.mapId === input.mapId));
      return paginate(filtered, input.page, input.pageSize);
    },
    async listAgentPlayerTitleGrants(input: AgentPlayerTitleGrantQuery) {
      const rows = await db.select({ playerId: playerAccounts.playerId, playerName: playerAccounts.playerName, titleKey: playerTitleGrants.titleKey, equipped: playerEquippedTitles.grantId, allTitles: playerTitleEntitlements.allTitles })
        .from(playerAccounts)
        .leftJoin(playerTitleEntitlements, eq(playerTitleEntitlements.playerAccountId, playerAccounts.id))
        .leftJoin(playerTitleGrants, and(eq(playerTitleGrants.playerAccountId, playerAccounts.id), eq(playerTitleGrants.status, "active"), isNull(playerTitleGrants.mapId), isNull(playerTitleGrants.gameplayRevisionId)))
        .leftJoin(playerEquippedTitles, eq(playerEquippedTitles.grantId, playerTitleGrants.id))
        .leftJoin(titleCatalog, and(eq(playerTitleGrants.titleKey, titleCatalog.key), eq(titleCatalog.scope, "global"), isNotNull(titleCatalog.gameVersion)))
        .where(or(eq(playerTitleEntitlements.allTitles, 1), and(isNotNull(playerEquippedTitles.grantId), isNotNull(titleCatalog.key))))
        .orderBy(playerAccounts.playerId, playerTitleGrants.titleKey);
      const grouped = new Map<string, { playerId: string; playerName: string; titleKeys: string[]; allTitles: boolean }>();
      for (const row of rows) {
        const current = grouped.get(row.playerId) ?? { playerId: row.playerId, playerName: row.playerName, titleKeys: [], allTitles: row.allTitles === 1 };
        if (row.equipped && row.titleKey && !current.allTitles && !current.titleKeys.includes(row.titleKey)) current.titleKeys.push(row.titleKey);
        grouped.set(row.playerId, current);
      }
      return paginate([...grouped.values()], input.page, input.pageSize);
    },
    async listAgentMapTitleHolders(this: PlatformServices, input: AgentMapTitleHolderQuery) {
      const map = await this.getAgentMap({ mapId: input.mapId });
      const projectableRevisionIds = map?.gameplayRevisions.map((revision) => revision.gameplayRevisionId) ?? [];
      if (!map) throw new Error("AGENT_MAP_NOT_FOUND");
      if (!projectableRevisionIds.length) throw new Error("AGENT_MAP_TITLE_PROJECTION_UNAVAILABLE");
      const rows = await db.select({ mapId: playerTitleGrants.mapId, gameplayRevisionId: playerTitleGrants.gameplayRevisionId, titleKey: playerTitleGrants.titleKey, slot: playerTitleGrants.slot, playerId: playerAccounts.playerId, playerName: playerAccounts.playerName })
        .from(playerTitleGrants)
        .innerJoin(playerAccounts, eq(playerTitleGrants.playerAccountId, playerAccounts.id))
        .innerJoin(gameplayRevisions, and(eq(playerTitleGrants.gameplayRevisionId, gameplayRevisions.id), eq(gameplayRevisions.mapId, input.mapId), inArray(gameplayRevisions.lifecycle, ["default", "selectable"])))
        .innerJoin(titleCatalog, and(eq(playerTitleGrants.titleKey, titleCatalog.key), ne(titleCatalog.lifecycle, "draft"), eq(titleCatalog.publicVisibility, 1), eq(titleCatalog.scope, "map"), isNotNull(titleCatalog.gameVersion)))
        .where(and(eq(playerTitleGrants.status, "active"), eq(playerTitleGrants.mapId, input.mapId), inArray(playerTitleGrants.gameplayRevisionId, projectableRevisionIds)))
        .orderBy(playerTitleGrants.gameplayRevisionId, playerTitleGrants.slot, playerAccounts.playerId, playerTitleGrants.titleKey);
      return paginate(rows.map((row) => ({ mapId: row.mapId!, gameplayRevisionId: row.gameplayRevisionId!, titleKey: row.titleKey, slot: row.slot as "pioneer" | "conqueror" | "dominator" | null, slotSemantics: row.slot ? "named" as const : "none" as const, playerId: row.playerId, playerName: row.playerName })), input.page, input.pageSize);
    },
    async getAgentTitle(input) {
      const title = await db.select().from(titleCatalog).where(eq(titleCatalog.key, input.titleKey)).get();
      if (title?.scope === "global") return toAgentTitle(title);
      const titleGameVersion = title?.gameVersion?.trim();
      if (!title || title.lifecycle === "draft" || title.publicVisibility !== 1 || !titleGameVersion) return null;
      const reward = await db.select({ title: titleCatalog, reward: mapTitleRewards })
        .from(mapTitleRewards)
        .innerJoin(titleCatalog, eq(mapTitleRewards.titleKey, titleCatalog.key))
        .innerJoin(maps, and(eq(maps.id, mapTitleRewards.mapId), eq(maps.status, "active")))
        .where(eq(mapTitleRewards.titleKey, input.titleKey))
        .orderBy(mapTitleRewards.mapId, mapTitleRewards.slot)
        .get();
      if (reward) {
        return asMapAgentTitle(reward.title, reward.reward.mapId, titleGameVersion, {
          slot: reward.reward.slot as Title["slot"],
          pioneerPrefixes: JSON.parse(reward.reward.pioneerPrefixesJson) as string[],
        });
      }
      const custom = await db.select({ title: titleCatalog, challenge: titleChallenges })
        .from(titleChallenges)
        .innerJoin(titleCatalog, eq(titleChallenges.titleKey, titleCatalog.key))
        .where(and(
          eq(titleChallenges.titleKey, input.titleKey),
          eq(titleChallenges.scope, "map"),
          eq(titleCatalog.scope, "map"),
          eq(titleCatalog.lifecycle, "active"),
        ))
        .get();
      if (!custom || !titleChallengeIsSubmittable(custom.challenge.status, custom.challenge.startsAt, custom.challenge.endsAt, now(), custom.challenge.gameVersion)) return null;
      const targets = await loadChallengeMapIds([custom.challenge.id]);
      const targetIds = targets.get(custom.challenge.id) ?? [];
      const mapRow = targetIds.length
        ? await db.select({ id: maps.id }).from(maps).where(and(eq(maps.status, "active"), inArray(maps.id, targetIds))).orderBy(maps.id).get()
        : await db.select({ id: maps.id }).from(maps).where(eq(maps.status, "active")).orderBy(maps.id).get();
      return mapRow ? asMapAgentTitle(custom.title, mapRow.id, titleGameVersion) : null;
    },
    async searchAgentContent(this: PlatformServices, input: AgentSearchQuery) {
      const query = input.query.toLocaleLowerCase();
      const [events, suspendedVersions, maps, achievements, titles] = await Promise.all([this.listRandomEvents({ status: input.status }), suspendedEventVersions(), this.listMaps(), this.listChallenges({ family: "achievement" }), listGlobalAgentTitles()]);
      const results: AgentSearchResult[] = [];
      if (!input.kind || input.kind === "event") results.push(...events.filter((event) => !suspendedVersions.has(event.gameVersion) && [event.name, event.description, ...event.effectTags].some((value) => value.toLocaleLowerCase().includes(query))).map((event) => ({ kind: "event" as const, id: event.eventId, name: event.name, summary: event.description })));
      if (!input.kind || input.kind === "map") results.push(...maps.filter((map) => [map.mapName, ...map.mechanics].some((value) => value.toLocaleLowerCase().includes(query))).map((map) => ({ kind: "map" as const, id: map.mapId, name: map.mapName, summary: map.mechanics.join("、") || `游戏版本 ${map.gameVersion}` })));
      if (!input.kind || input.kind === "achievement") results.push(...achievements.filter((challenge): challenge is Extract<Challenge, { family: "achievement" }> => challenge.family === "achievement" && [challenge.titleName, challenge.category, challenge.condition, challenge.evidenceRule].some((value) => value.toLocaleLowerCase().includes(query))).map((challenge) => ({ kind: "achievement" as const, id: challenge.challengeId, name: challenge.titleName, summary: challenge.condition })));
      if (!input.kind || input.kind === "title") results.push(...titles.filter((title) => [title.label, title.category, title.condition].some((value) => value.toLocaleLowerCase().includes(query))).map((title) => ({ kind: "title" as const, id: title.titleKey, name: title.label, summary: title.condition })));
      return paginate(results, input.page, input.pageSize);
    },
  };
};
