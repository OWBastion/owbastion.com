import { and, eq, inArray, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";
import type { PlatformServices } from "@owbastion/domain";
import { leaderboardPlayerKey, leaderboardRuleVersion, projectLeaderboardEntry, rankLeaderboardRows } from "@owbastion/domain";
import type { LeaderboardBoard, LeaderboardBoardStanding, LeaderboardEntry, LeaderboardEntryTitle, LeaderboardPlayerMapTitle } from "@owbastion/contracts";
import { gameplayRevisions, maps, playerAccounts, playerEquippedTitles, playerTitleGrants, titleCatalog, verifiedRuns } from "./schema";
import { resolvePortalSession } from "./portal-session";

type LeaderboardServices = Pick<PlatformServices,
  | "getPublicLeaderboard"
  | "getPublicLeaderboardPlayer"
  | "getCurrentPlayerLeaderboardRank"
>;

type BoardRow = { playerAccountId: string; score: number; reachedAt: number };

// Achievement-board eligibility: owned Titles count unless they are map
// Titles, developer-reserved, or hidden from public surfaces.
const achievementGrantFilter = and(
  eq(playerTitleGrants.status, "active"),
  eq(titleCatalog.scope, "global"),
  sql`${titleCatalog.category} != '开发保留'`,
  eq(titleCatalog.publicVisibility, 1),
);

const titleView = (title: { key: string; label: string; icon: string; iconUrl: string | null }): LeaderboardEntryTitle => ({
  titleKey: title.key,
  label: title.label,
  icon: title.icon as LeaderboardEntryTitle["icon"],
  iconUrl: title.iconUrl ?? undefined,
});

export const createLeaderboardServices = (db: ReturnType<typeof drizzle>): LeaderboardServices => {
  const masteryRows = async (mapId?: string): Promise<BoardRow[]> => {
    const conditions = [eq(verifiedRuns.status, "active")];
    if (mapId) {
      const revision = await db.select({ id: gameplayRevisions.id }).from(gameplayRevisions)
        .where(and(eq(gameplayRevisions.mapId, mapId), eq(gameplayRevisions.lifecycle, "default"))).get();
      if (!revision) return [];
      conditions.push(eq(verifiedRuns.mapId, mapId), eq(verifiedRuns.gameplayRevisionId, revision.id));
    }
    return db.select({
      playerAccountId: verifiedRuns.playerAccountId,
      score: sql<number>`sum(${verifiedRuns.awardedXp})`,
      reachedAt: sql<number>`max(${verifiedRuns.acceptedAt})`,
    }).from(verifiedRuns).where(and(...conditions)).groupBy(verifiedRuns.playerAccountId);
  };

  const achievementRows = async (): Promise<BoardRow[]> =>
    db.select({
      playerAccountId: playerTitleGrants.playerAccountId,
      score: sql<number>`count(distinct ${playerTitleGrants.titleKey})`,
      reachedAt: sql<number>`max(${playerTitleGrants.grantedAt})`,
    }).from(playerTitleGrants)
      .innerJoin(titleCatalog, eq(titleCatalog.key, playerTitleGrants.titleKey))
      .where(achievementGrantFilter)
      .groupBy(playerTitleGrants.playerAccountId);

  const boardRows = (board: LeaderboardBoard, mapId?: string) =>
    board === "mastery" ? masteryRows(mapId) : achievementRows();

  const headlineStandings = (rows: Array<BoardRow & { rank: number }>) =>
    new Map(rows.map((row) => [row.playerAccountId, { rank: row.rank, score: row.score } satisfies LeaderboardBoardStanding]));

  const loadEquippedTitles = async (accountIds: string[]) => {
    if (accountIds.length === 0) return new Map<string, LeaderboardEntryTitle>();
    const rows = await db.select({
      playerAccountId: playerEquippedTitles.playerAccountId,
      grantId: playerEquippedTitles.grantId,
      equippedAt: playerEquippedTitles.equippedAt,
      key: titleCatalog.key,
      label: titleCatalog.label,
      icon: titleCatalog.icon,
      iconUrl: titleCatalog.iconUrl,
    }).from(playerEquippedTitles)
      .innerJoin(playerTitleGrants, eq(playerTitleGrants.id, playerEquippedTitles.grantId))
      .innerJoin(titleCatalog, eq(titleCatalog.key, playerTitleGrants.titleKey))
      .where(and(
        inArray(playerEquippedTitles.playerAccountId, accountIds),
        eq(playerTitleGrants.status, "active"),
        sql`${titleCatalog.category} != '开发保留'`,
        eq(titleCatalog.publicVisibility, 1),
      ));
    const equipped = new Map<string, LeaderboardEntryTitle>();
    const seen = new Set<string>();
    for (const row of [...rows].sort((a, b) => a.equippedAt - b.equippedAt || a.grantId.localeCompare(b.grantId))) {
      if (seen.has(row.playerAccountId)) continue;
      seen.add(row.playerAccountId);
      equipped.set(row.playerAccountId, titleView(row));
    }
    return equipped;
  };

  const headlineBoardsForAnonymous = async (pageBoard: { board: LeaderboardBoard; mapId?: string; rows: Array<BoardRow & { rank: number }> }) => {
    const mastery = pageBoard.board === "mastery" && !pageBoard.mapId ? pageBoard.rows : rankLeaderboardRows(await masteryRows());
    const achievement = pageBoard.board === "achievement" ? pageBoard.rows : rankLeaderboardRows(await achievementRows());
    return { mastery: headlineStandings(mastery), achievement: headlineStandings(achievement) };
  };

  return {
    async getPublicLeaderboard(input) {
      if (input.mapId) {
        if (input.board !== "mastery") return null;
        const map = await db.select({ id: maps.id }).from(maps).where(eq(maps.id, input.mapId)).get();
        if (!map) return null;
      }
      const ranked = rankLeaderboardRows(await boardRows(input.board, input.mapId));
      const total = ranked.length;
      const slice = ranked.slice((input.page - 1) * input.pageSize, input.page * input.pageSize);
      const accountIds = slice.map((row) => row.playerAccountId);
      const accounts = accountIds.length === 0 ? [] : await db.select({
        id: playerAccounts.id,
        playerName: playerAccounts.playerName,
        publicProfile: playerAccounts.publicProfile,
      }).from(playerAccounts).where(inArray(playerAccounts.id, accountIds));
      const accountById = new Map(accounts.map((account) => [account.id, account]));
      const publicIds = slice.filter((row) => accountById.get(row.playerAccountId)?.publicProfile === 1).map((row) => row.playerAccountId);
      const equipped = await loadEquippedTitles(publicIds);
      const anonymous = slice.filter((row) => accountById.get(row.playerAccountId)?.publicProfile !== 1);
      const boards = anonymous.length > 0
        ? await headlineBoardsForAnonymous({ board: input.board, mapId: input.mapId, rows: ranked })
        : null;
      const items: LeaderboardEntry[] = await Promise.all(slice.map(async (row) => {
        const account = accountById.get(row.playerAccountId);
        const standingFor = (standings: Map<string, LeaderboardBoardStanding> | undefined) => standings?.get(row.playerAccountId) ?? null;
        return projectLeaderboardEntry({
          rank: row.rank,
          score: row.score,
          reachedAt: row.reachedAt,
          publicProfile: account?.publicProfile === 1,
          identity: {
            playerKey: await leaderboardPlayerKey(row.playerAccountId),
            displayName: account?.playerName ?? "",
            equippedTitle: equipped.get(row.playerAccountId) ?? null,
          },
          boards: {
            mastery: standingFor(boards?.mastery),
            achievement: standingFor(boards?.achievement),
          },
        });
      }));
      return {
        contractVersion: "1" as const,
        board: input.board,
        ...(input.mapId ? { mapId: input.mapId } : {}),
        ruleVersion: leaderboardRuleVersion,
        items,
        page: input.page,
        pageSize: input.pageSize,
        total,
        hasMore: input.page * input.pageSize < total,
      };
    },

    async getPublicLeaderboardPlayer(input) {
      const accounts = await db.select({
        id: playerAccounts.id,
        playerName: playerAccounts.playerName,
        publicProfile: playerAccounts.publicProfile,
      }).from(playerAccounts);
      let account: (typeof accounts)[number] | undefined;
      for (const candidate of accounts) {
        if (await leaderboardPlayerKey(candidate.id) === input.playerKey) { account = candidate; break; }
      }
      if (!account) return null;
      if (account.publicProfile !== 1) {
        return { contractVersion: "1" as const, publicProfile: false, player: null, boards: null, perMapXp: null, titles: null };
      }
      const [mastery, achievement, perMapRows, mapTitleRows, generalTitleRows, equipped] = await Promise.all([
        masteryRows().then(rankLeaderboardRows),
        achievementRows().then(rankLeaderboardRows),
        db.select({
          mapId: verifiedRuns.mapId,
          mapName: maps.name,
          xp: sql<number>`sum(${verifiedRuns.awardedXp})`,
          runCount: sql<number>`count(*)`,
        }).from(verifiedRuns)
          .innerJoin(gameplayRevisions, and(eq(gameplayRevisions.id, verifiedRuns.gameplayRevisionId), eq(gameplayRevisions.lifecycle, "default")))
          .innerJoin(maps, eq(maps.id, verifiedRuns.mapId))
          .where(and(eq(verifiedRuns.playerAccountId, account.id), eq(verifiedRuns.status, "active")))
          .groupBy(verifiedRuns.mapId, maps.name),
        db.select({ key: titleCatalog.key, label: titleCatalog.label, icon: titleCatalog.icon, iconUrl: titleCatalog.iconUrl, mapId: playerTitleGrants.mapId, mapName: maps.name })
          .from(playerTitleGrants)
          .innerJoin(titleCatalog, eq(titleCatalog.key, playerTitleGrants.titleKey))
          .innerJoin(maps, eq(maps.id, playerTitleGrants.mapId))
          .where(and(
            eq(playerTitleGrants.playerAccountId, account.id),
            eq(playerTitleGrants.status, "active"),
            eq(titleCatalog.scope, "map"),
            sql`${titleCatalog.category} != '开发保留'`,
            eq(titleCatalog.publicVisibility, 1),
          )),
        db.select({ key: titleCatalog.key, label: titleCatalog.label, icon: titleCatalog.icon, iconUrl: titleCatalog.iconUrl })
          .from(playerTitleGrants)
          .innerJoin(titleCatalog, eq(titleCatalog.key, playerTitleGrants.titleKey))
          .where(and(
            eq(playerTitleGrants.playerAccountId, account.id),
            achievementGrantFilter,
          )),
        loadEquippedTitles([account.id]),
      ]);
      const standingOf = (rows: Array<BoardRow & { rank: number }>) => {
        const row = rows.find((entry) => entry.playerAccountId === account!.id);
        return row ? { rank: row.rank, score: row.score } : null;
      };
      const mapTitles: LeaderboardPlayerMapTitle[] = mapTitleRows.map((row) => ({ ...titleView(row), mapId: row.mapId!, mapName: row.mapName }));
      return {
        contractVersion: "1" as const,
        publicProfile: true,
        player: { displayName: account.playerName, equippedTitle: equipped.get(account.id) ?? null },
        boards: { mastery: standingOf(mastery), achievement: standingOf(achievement) },
        perMapXp: perMapRows
          .sort((a, b) => b.xp - a.xp || a.mapId.localeCompare(b.mapId))
          .map((row) => ({ mapId: row.mapId, mapName: row.mapName, xp: row.xp, runCount: row.runCount })),
        titles: {
          map: mapTitles.sort((a, b) => a.mapName.localeCompare(b.mapName) || a.titleKey.localeCompare(b.titleKey)),
          general: generalTitleRows.map(titleView).sort((a, b) => a.titleKey.localeCompare(b.titleKey)),
        },
      };
    },

    async getCurrentPlayerLeaderboardRank(input) {
      const current = await resolvePortalSession(db, input.sessionToken);
      if (!current) return null;
      if (input.mapId) {
        if (input.board !== "mastery") throw new Error("MAP_NOT_FOUND");
        const map = await db.select({ id: maps.id }).from(maps).where(eq(maps.id, input.mapId)).get();
        if (!map) throw new Error("MAP_NOT_FOUND");
      }
      const ranked = rankLeaderboardRows(await boardRows(input.board, input.mapId));
      const index = ranked.findIndex((row) => row.playerAccountId === current.player.id);
      const self = index >= 0 ? ranked[index] : undefined;
      const above = index > 0 ? ranked[index - 1] : undefined;
      return {
        contractVersion: "1" as const,
        board: input.board,
        ...(input.mapId ? { mapId: input.mapId } : {}),
        ruleVersion: leaderboardRuleVersion,
        rank: self?.rank ?? null,
        score: self?.score ?? 0,
        reachedAt: self?.reachedAt ?? null,
        gapToNextRank: self && above ? above.score - self.score : null,
      };
    },
  };
};
