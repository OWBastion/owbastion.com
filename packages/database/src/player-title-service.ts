import { and, asc, count, desc, eq, inArray, isNotNull, isNull, like, ne, or, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";
import type { AuthContext, PlatformServices } from "@owbastion/domain";
import type { AdminManualTitleGrantRequest, AdminManualTitleGrantTarget, AdminManualTitleGrantResponse, AdminManualTitleGrantBatchResponse } from "@owbastion/contracts";
import { auditEvents, challengeCompletions, challenges, gameplayRevisions, historicalTitleGrants, idempotencyKeys, maps, playerAccounts, playerEquippedTitles, playerTitleEntitlements, playerTitleGrants, titleCatalog } from "./schema";
import type { resolvePortalSession } from "./portal-session";

export type ManualTitleGrantResolution = {
  title: { key: string; label: string; scope: string; lifecycle: string };
  mapId: string | null;
  gameplayRevisionId: string | null;
  slot: string | null;
  manualChallengeId: string;
};

type Dependencies = {
  now: () => number;
  hashRequest: (value: unknown) => Promise<string>;
  replayOrConflict: <T>(actorId: string, operation: string, key: string, input: unknown) => Promise<T | null>;
  getCurrentPortalPlayer: (sessionToken: string) => ReturnType<typeof resolvePortalSession>;
  findEquipableGrantIds: (playerAccountId: string, grantIds: string[]) => Promise<Array<{ id: string; titleKey: string }>>;
  isInheritedConquerorGrant: (
    source: { titleKey: string; mapId: string | null; gameplayRevisionId: string | null } | null | undefined,
    historical: { titleKey: string; mapId: string | null; gameplayRevisionId: string | null },
  ) => boolean;
  resolveManualTitleGrantTarget: (input: Pick<AdminManualTitleGrantRequest, "titleKey" | "mapId" | "gameplayRevisionId">) => Promise<ManualTitleGrantResolution>;
};

type PlayerTitleServices = Pick<PlatformServices,
  | "listCurrentPlayerTitles"
  | "replaceCurrentPlayerEquippedTitles"
  | "replaceAdminPlayerEquippedTitles"
  | "listHistoricalTitleGrants"
  | "getHistoricalTitleHolder"
  | "createAdminTitleGrant"
  | "createAdminManualTitleGrant"
  | "createAdminManualTitleGrantBatch"
  | "createAdminTitleGrantBulk"
  | "revokeAdminTitleGrant"
  | "restoreAdminTitleGrant"
>;

export const createPlayerTitleServices = (
  database: D1Database,
  db: ReturnType<typeof drizzle>,
  dependencies: Dependencies,
): PlayerTitleServices => {
  const {
    now,
    hashRequest,
    replayOrConflict,
    getCurrentPortalPlayer,
    findEquipableGrantIds,
    isInheritedConquerorGrant,
    resolveManualTitleGrantTarget,
  } = dependencies;

  return {
    async listCurrentPlayerTitles(input) {
      const current = await getCurrentPortalPlayer(input.sessionToken);
      if (!current) return null;
      const rows = await db.select({ grant: playerTitleGrants, title: titleCatalog, mapName: maps.name, revisionMapId: gameplayRevisions.mapId, equipped: playerEquippedTitles.grantId }).from(playerTitleGrants)
        .innerJoin(titleCatalog, eq(playerTitleGrants.titleKey, titleCatalog.key))
        .leftJoin(playerEquippedTitles, eq(playerEquippedTitles.grantId, playerTitleGrants.id))
        .leftJoin(maps, eq(playerTitleGrants.mapId, maps.id))
        .leftJoin(gameplayRevisions, eq(playerTitleGrants.gameplayRevisionId, gameplayRevisions.id))
        .where(and(
          eq(playerTitleGrants.playerAccountId, current.player.id),
          eq(playerTitleGrants.status, "active"),
          or(
            and(
              eq(titleCatalog.scope, "global"),
              isNotNull(titleCatalog.gameVersion),
              or(
                and(isNull(playerTitleGrants.mapId), isNull(playerTitleGrants.gameplayRevisionId)),
                and(eq(playerTitleGrants.mapId, gameplayRevisions.mapId), inArray(gameplayRevisions.lifecycle, ["default", "selectable"])),
              ),
            ),
            and(eq(titleCatalog.scope, "map"), isNotNull(titleCatalog.gameVersion), eq(playerTitleGrants.mapId, gameplayRevisions.mapId), inArray(gameplayRevisions.lifecycle, ["default", "selectable"])),
          ),
        )).orderBy(desc(playerTitleGrants.grantedAt));
      const entitlement = await db.select({ allTitles: playerTitleEntitlements.allTitles }).from(playerTitleEntitlements).where(eq(playerTitleEntitlements.playerAccountId, current.player.id)).get();
      return { items: rows.map(({ grant, title, mapName, revisionMapId, equipped }) => ({ grantId: grant.id, titleKey: title.key, label: title.label, icon: title.icon, iconUrl: title.iconUrl, category: title.category, condition: title.condition, scope: grant.mapId ? "map" as const : "global" as const, mapId: grant.mapId ?? undefined, gameplayRevisionId: grant.gameplayRevisionId ?? undefined, mapName: mapName ?? undefined, slot: grant.slot as "pioneer" | "conqueror" | "dominator" | undefined, grantedAt: grant.grantedAt, equipped: title.scope === "global" && Boolean(equipped) && (grant.mapId === null && grant.gameplayRevisionId === null || grant.mapId === revisionMapId) })), allTitles: entitlement?.allTitles === 1 };
    },

    async replaceCurrentPlayerEquippedTitles(input, idempotencyKey) {
      const operation = "player.title.equipped.replace";
      const current = await getCurrentPortalPlayer(input.sessionToken);
      if (!current) throw new Error("UNAUTHENTICATED");
      const request = { grantIds: input.grantIds };
      const replay = await replayOrConflict<{ contractVersion: "1"; grantIds: string[] }>(current.player.id, operation, idempotencyKey, request);
      if (replay) return replay;
      if (input.grantIds.length > 10 || new Set(input.grantIds).size !== input.grantIds.length) throw new Error("EQUIPPED_TITLE_LIMIT_EXCEEDED");
      const grants = await findEquipableGrantIds(current.player.id, input.grantIds);
      if (grants.length !== input.grantIds.length) throw new Error("EQUIPPED_TITLE_GRANT_INVALID");
      const timestamp = now(); const response = { contractVersion: "1" as const, grantIds: [...input.grantIds] };
      await database.batch([
        database.prepare("DELETE FROM player_equipped_titles WHERE player_account_id = ?").bind(current.player.id),
        ...response.grantIds.map((grantId) => database.prepare("INSERT INTO player_equipped_titles (grant_id, player_account_id, equipped_at) VALUES (?, ?, ?)").bind(grantId, current.player.id, timestamp)),
        database.prepare("INSERT INTO idempotency_keys (id, actor_id, operation, request_hash, response_json, created_at) VALUES (?, ?, ?, ?, ?, ?)").bind(`${current.player.id}:${operation}:${idempotencyKey}`, current.player.id, operation, await hashRequest(request), JSON.stringify(response), timestamp),
        database.prepare("INSERT INTO audit_events (id, correlation_id, actor_type, actor_id, operation, entity_type, entity_id, payload_json, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)").bind(crypto.randomUUID(), crypto.randomUUID(), "user", current.player.id, operation, "player_equipped_titles", current.player.id, JSON.stringify(request), timestamp),
      ]);
      return response;
    },

    async replaceAdminPlayerEquippedTitles(input, auth, idempotencyKey) {
      const operation = "admin.player.title.equipped.replace";
      const request = { playerAccountId: input.playerAccountId, grantIds: input.grantIds };
      const replay = await replayOrConflict<{ contractVersion: "1"; grantIds: string[] }>(auth.subject, operation, idempotencyKey, request);
      if (replay) return replay;
      const account = await db.select({ id: playerAccounts.id }).from(playerAccounts).where(eq(playerAccounts.id, input.playerAccountId)).get();
      if (!account) throw new Error("PLAYER_NOT_FOUND");
      if (input.grantIds.length > 10 || new Set(input.grantIds).size !== input.grantIds.length) throw new Error("EQUIPPED_TITLE_LIMIT_EXCEEDED");
      const grants = await findEquipableGrantIds(account.id, input.grantIds);
      if (grants.length !== input.grantIds.length) throw new Error("EQUIPPED_TITLE_GRANT_INVALID");
      const timestamp = now();
      const response = { contractVersion: "1" as const, grantIds: [...input.grantIds] };
      await database.batch([
        database.prepare("DELETE FROM player_equipped_titles WHERE player_account_id = ?").bind(account.id),
        ...response.grantIds.map((grantId) => database.prepare("INSERT INTO player_equipped_titles (grant_id, player_account_id, equipped_at) VALUES (?, ?, ?)").bind(grantId, account.id, timestamp)),
        database.prepare("INSERT INTO idempotency_keys (id, actor_id, operation, request_hash, response_json, created_at) VALUES (?, ?, ?, ?, ?, ?)").bind(`${auth.subject}:${operation}:${idempotencyKey}`, auth.subject, operation, await hashRequest(request), JSON.stringify(response), timestamp),
        database.prepare("INSERT INTO audit_events (id, correlation_id, actor_type, actor_id, operation, entity_type, entity_id, payload_json, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)").bind(crypto.randomUUID(), crypto.randomUUID(), auth.actorType, auth.subject, operation, "player_equipped_titles", account.id, JSON.stringify({ grantIds: input.grantIds, recovery: true }), timestamp),
      ]);
      return response;
    },

    async listHistoricalTitleGrants(input) {
      const filter = input.filter ?? "all";
      const safePage = Math.max(1, input.page);
      const safePageSize = Math.min(50, Math.max(1, input.pageSize));
      const query = input.query?.trim() ? `%${input.query.trim()}%` : undefined;
      const historicalGrantStats = async () => {
        const [row] = await db.select({
          pendingHolderCount: sql<number>`count(distinct case when ${playerTitleGrants.id} is null then ${historicalTitleGrants.holderName} end)`,
          unclaimedGrantCount: sql<number>`sum(case when ${playerTitleGrants.id} is null then 1 else 0 end)`,
          migratedGrantCount: sql<number>`sum(case when ${playerTitleGrants.id} is not null then 1 else 0 end)`,
        }).from(historicalTitleGrants)
          .leftJoin(playerTitleGrants, and(eq(playerTitleGrants.sourceType, "historical"), eq(playerTitleGrants.sourceId, historicalTitleGrants.id), eq(playerTitleGrants.titleKey, historicalTitleGrants.titleKey)));
        return {
          pendingHolderCount: Number(row?.pendingHolderCount ?? 0),
          unclaimedGrantCount: Number(row?.unclaimedGrantCount ?? 0),
          migratedGrantCount: Number(row?.migratedGrantCount ?? 0),
        };
      };

      let matchingHolderNames: string[] | null = null;
      if (query) {
        const matched = await db.selectDistinct({ holderName: historicalTitleGrants.holderName })
          .from(historicalTitleGrants)
          .innerJoin(titleCatalog, eq(historicalTitleGrants.titleKey, titleCatalog.key))
          .where(or(like(historicalTitleGrants.holderName, query), like(titleCatalog.label, query)));
        matchingHolderNames = matched.map((row) => row.holderName);
        if (!matchingHolderNames.length) {
          return {
            contractVersion: "1" as const,
            holders: [],
            page: safePage,
            pageSize: safePageSize,
            total: 0,
            hasMore: false,
            filter,
            stats: await historicalGrantStats(),
          };
        }
      }

      const holderScope = matchingHolderNames ? inArray(historicalTitleGrants.holderName, matchingHolderNames) : undefined;
      const totalCountExpr = sql<number>`count(*)`;
      const unclaimedCountExpr = sql<number>`sum(case when ${playerTitleGrants.id} is null then 1 else 0 end)`;
      const havingClause = filter === "pending"
        ? sql`${unclaimedCountExpr} > 0`
        : filter === "completed"
          ? sql`${unclaimedCountExpr} = 0`
          : undefined;

      const aggregated = db.select({
        holderName: historicalTitleGrants.holderName,
        totalCount: totalCountExpr.as("total_count"),
        unclaimedCount: unclaimedCountExpr.as("unclaimed_count"),
      }).from(historicalTitleGrants)
        .leftJoin(playerTitleGrants, and(eq(playerTitleGrants.sourceType, "historical"), eq(playerTitleGrants.sourceId, historicalTitleGrants.id), eq(playerTitleGrants.titleKey, historicalTitleGrants.titleKey)))
        .where(holderScope)
        .groupBy(historicalTitleGrants.holderName)
        .having(havingClause)
        .as("historical_holder_summary");

      const [[{ total }], pageRows, stats] = await Promise.all([
        db.select({ total: count() }).from(aggregated),
        db.select({
          holderName: aggregated.holderName,
          totalCount: aggregated.totalCount,
          unclaimedCount: aggregated.unclaimedCount,
        }).from(aggregated)
          .orderBy(asc(aggregated.holderName))
          .limit(safePageSize)
          .offset((safePage - 1) * safePageSize),
        historicalGrantStats(),
      ]);

      return {
        contractVersion: "1" as const,
        holders: pageRows.map((row) => {
          const totalCount = Number(row.totalCount);
          const unclaimedCount = Number(row.unclaimedCount);
          return {
            holderName: row.holderName,
            totalCount,
            unclaimedCount,
            status: unclaimedCount > 0 ? "pending" as const : "completed" as const,
          };
        }),
        page: safePage,
        pageSize: safePageSize,
        total: Number(total),
        hasMore: safePage * safePageSize < Number(total),
        filter,
        stats,
      };
    },

    async getHistoricalTitleHolder(input) {
      const holderName = input.holderName.trim();
      if (!holderName) throw new Error("HISTORICAL_HOLDER_NOT_FOUND");
      const grantStatus = input.grantStatus ?? "all";
      const safePage = Math.max(1, input.page);
      const safePageSize = Math.min(100, Math.max(1, input.pageSize));

      const [totals] = await db.select({
        totalCount: sql<number>`count(*)`,
        unclaimedCount: sql<number>`sum(case when ${playerTitleGrants.id} is null then 1 else 0 end)`,
      }).from(historicalTitleGrants)
        .leftJoin(playerTitleGrants, and(eq(playerTitleGrants.sourceType, "historical"), eq(playerTitleGrants.sourceId, historicalTitleGrants.id), eq(playerTitleGrants.titleKey, historicalTitleGrants.titleKey)))
        .where(eq(historicalTitleGrants.holderName, holderName));
      const totalCount = Number(totals?.totalCount ?? 0);
      if (!totalCount) throw new Error("HISTORICAL_HOLDER_NOT_FOUND");
      const unclaimedCount = Number(totals?.unclaimedCount ?? 0);
      const holder = {
        holderName,
        totalCount,
        unclaimedCount,
        status: unclaimedCount > 0 ? "pending" as const : "completed" as const,
      };

      const statusCondition = grantStatus === "unclaimed"
        ? isNull(playerTitleGrants.id)
        : grantStatus === "active"
          ? eq(playerTitleGrants.status, "active")
          : grantStatus === "revoked"
            ? eq(playerTitleGrants.status, "revoked")
            : undefined;

      const itemWhere = and(eq(historicalTitleGrants.holderName, holderName), statusCondition);
      const [[{ filteredTotal }], rows] = await Promise.all([
        db.select({ filteredTotal: count() }).from(historicalTitleGrants)
          .leftJoin(playerTitleGrants, and(eq(playerTitleGrants.sourceType, "historical"), eq(playerTitleGrants.sourceId, historicalTitleGrants.id), eq(playerTitleGrants.titleKey, historicalTitleGrants.titleKey)))
          .where(itemWhere),
        db.select({ historical: historicalTitleGrants, grant: playerTitleGrants, title: titleCatalog, mapName: maps.name, player: playerAccounts }).from(historicalTitleGrants)
          .innerJoin(titleCatalog, eq(historicalTitleGrants.titleKey, titleCatalog.key))
          .leftJoin(maps, eq(historicalTitleGrants.mapId, maps.id))
          .leftJoin(playerTitleGrants, and(eq(playerTitleGrants.sourceType, "historical"), eq(playerTitleGrants.sourceId, historicalTitleGrants.id), eq(playerTitleGrants.titleKey, historicalTitleGrants.titleKey)))
          .leftJoin(playerAccounts, eq(playerTitleGrants.playerAccountId, playerAccounts.id))
          .where(itemWhere)
          .orderBy(asc(titleCatalog.category), asc(titleCatalog.label))
          .limit(safePageSize)
          .offset((safePage - 1) * safePageSize),
      ]);

      const items = rows.map(({ historical, grant, title, mapName, player }) => ({
        grantId: grant?.id ?? historical.id,
        titleKey: title.key,
        label: title.label,
        icon: title.icon,
        iconUrl: title.iconUrl,
        category: title.category,
        condition: title.condition,
        scope: historical.scope as "global" | "map",
        mapName: mapName ?? undefined,
        slot: historical.slot as "pioneer" | "conqueror" | "dominator" | undefined,
        grantedAt: grant?.grantedAt ?? 0,
        holderName: historical.holderName,
        playerAccountId: grant?.playerAccountId,
        playerName: player?.playerName,
        playerId: player?.playerId,
        status: (grant ? grant.status as "active" | "revoked" : "unclaimed") as "unclaimed" | "active" | "revoked",
        revokeReason: grant?.revokeReason ?? undefined,
      }));
      const total = Number(filteredTotal);
      return {
        contractVersion: "1" as const,
        holder,
        items,
        page: safePage,
        pageSize: safePageSize,
        total,
        hasMore: safePage * safePageSize < total,
        grantStatus,
      };
    },


    async createAdminTitleGrant(input, auth, idempotencyKey) {
      const replay = await replayOrConflict<Record<string, never>>(auth.subject, "admin.title.grant", idempotencyKey, input); if (replay) return;
      const historical = await db.select().from(historicalTitleGrants).where(eq(historicalTitleGrants.id, input.historicalTitleGrantId)).get();
      const player = await db.select().from(playerAccounts).where(eq(playerAccounts.id, input.playerAccountId)).get();
      if (!historical) throw new Error("HISTORICAL_TITLE_GRANT_NOT_FOUND"); if (!player) throw new Error("PLAYER_NOT_FOUND");
      const existing = await db.select().from(playerTitleGrants).where(and(eq(playerTitleGrants.sourceType, "historical"), eq(playerTitleGrants.sourceId, historical.id), eq(playerTitleGrants.titleKey, historical.titleKey))).get(); if (existing?.status === "active") throw new Error("HISTORICAL_TITLE_GRANT_CLAIMED");
      if (existing && existing.playerAccountId !== player.id) throw new Error("HISTORICAL_TITLE_GRANT_CLAIMED");
      const administrativelyRevoked = await db.select({ id: playerTitleGrants.id }).from(playerTitleGrants).where(and(
        eq(playerTitleGrants.playerAccountId, player.id),
        eq(playerTitleGrants.titleKey, historical.titleKey),
        eq(playerTitleGrants.status, "revoked"),
        eq(playerTitleGrants.revocationType, "administrator"),
        historical.mapId ? eq(playerTitleGrants.mapId, historical.mapId) : isNull(playerTitleGrants.mapId),
        historical.gameplayRevisionId ? eq(playerTitleGrants.gameplayRevisionId, historical.gameplayRevisionId) : isNull(playerTitleGrants.gameplayRevisionId),
      )).get();
      if (existing?.revocationType === "administrator" || administrativelyRevoked) throw new Error("TITLE_GRANT_ADMINISTRATIVELY_REVOKED");
      if (existing?.revocationType === "evidence") throw new Error("TITLE_GRANT_EVIDENCE_INVALIDATED");
      const activeIdentity = existing ? null : await db.select().from(playerTitleGrants).where(and(
        eq(playerTitleGrants.playerAccountId, player.id),
        eq(playerTitleGrants.titleKey, historical.titleKey),
        eq(playerTitleGrants.status, "active"),
        historical.mapId ? eq(playerTitleGrants.mapId, historical.mapId) : isNull(playerTitleGrants.mapId),
        historical.gameplayRevisionId ? eq(playerTitleGrants.gameplayRevisionId, historical.gameplayRevisionId) : isNull(playerTitleGrants.gameplayRevisionId),
      )).get();
      const inheritedSource = activeIdentity?.sourceType === "historical"
        ? await db.select({ titleKey: historicalTitleGrants.titleKey, mapId: historicalTitleGrants.mapId, gameplayRevisionId: historicalTitleGrants.gameplayRevisionId }).from(historicalTitleGrants).where(eq(historicalTitleGrants.id, activeIdentity.sourceId)).get()
        : null;
      const inherited = activeIdentity && isInheritedConquerorGrant(inheritedSource, historical);
      if (activeIdentity && !inherited) throw new Error("HISTORICAL_TITLE_GRANT_CLAIMED");
      const timestamp = now();
      const grantId = inherited ? activeIdentity.id : existing?.id ?? crypto.randomUUID();
      const manualChallengeId = `manual:${historical.titleKey}`;
      const completion = await db.select().from(challengeCompletions).where(and(
        eq(challengeCompletions.playerAccountId, player.id),
        eq(challengeCompletions.challengeId, manualChallengeId),
        historical.gameplayRevisionId ? eq(challengeCompletions.gameplayRevisionId, historical.gameplayRevisionId) : isNull(challengeCompletions.gameplayRevisionId),
      )).get();
      if (completion?.status === "invalidated") throw new Error("TITLE_GRANT_EVIDENCE_INVALIDATED");
      const completionId = existing?.completionId ?? activeIdentity?.completionId ?? completion?.id ?? `completion:${grantId}`;
      const completionSourceId = `historical:${auth.subject}:${idempotencyKey}`;
      const createsCompletion = !completion && !existing?.completionId && !activeIdentity?.completionId;
      const statements: D1PreparedStatement[] = [
        database.prepare("INSERT OR IGNORE INTO challenges (id, source_family, source_id, title_key, status, manual, public_condition, condition_operator, conditions_json, condition, created_at, updated_at) VALUES (?, 'manual', ?, ?, 'active', 1, 0, 'and', '[]', 'Maintainer-issued title', ?, ?)").bind(manualChallengeId, historical.titleKey, historical.titleKey, timestamp, timestamp),
      ];
      if (createsCompletion) {
        statements.push(database.prepare("INSERT INTO challenge_completions (id, player_account_id, challenge_id, gameplay_revision_id, status, source_type, source_id, completed_at, created_at) VALUES (?, ?, ?, ?, 'active', 'manual', ?, ?, ?)").bind(completionId, player.id, manualChallengeId, historical.gameplayRevisionId, completionSourceId, timestamp, timestamp));
      }
      if (inherited) {
        statements.push(database.prepare("UPDATE player_title_grants SET source_id = ?, completion_id = ? WHERE id = ?").bind(historical.id, completionId, grantId));
      } else if (existing) {
        statements.push(database.prepare("UPDATE player_title_grants SET player_account_id = ?, status = 'active', granted_by = ?, granted_at = ?, revoked_by = NULL, revoked_at = NULL, revoke_reason = NULL, revocation_type = NULL, completion_id = ? WHERE id = ?").bind(player.id, auth.subject, timestamp, completionId, grantId));
      } else {
        statements.push(database.prepare("INSERT INTO player_title_grants (id, player_account_id, title_key, map_id, gameplay_revision_id, slot, status, source_type, source_id, granted_by, granted_at, completion_id) VALUES (?, ?, ?, ?, ?, ?, 'active', 'historical', ?, ?, ?, ?)").bind(grantId, player.id, historical.titleKey, historical.mapId, historical.gameplayRevisionId, historical.slot, historical.id, auth.subject, timestamp, completionId));
      }
      statements.push(
        database.prepare("INSERT INTO idempotency_keys (id, actor_id, operation, request_hash, response_json, created_at) VALUES (?, ?, 'admin.title.grant', ?, '{}', ?)").bind(`${auth.subject}:admin.title.grant:${idempotencyKey}`, auth.subject, await hashRequest(input), timestamp),
        database.prepare("INSERT INTO audit_events (id, correlation_id, actor_type, actor_id, operation, entity_type, entity_id, payload_json, created_at) VALUES (?, ?, ?, ?, 'admin.title.grant', 'player_title_grant', ?, ?, ?)").bind(crypto.randomUUID(), crypto.randomUUID(), auth.actorType, auth.subject, grantId, JSON.stringify({ playerAccountId: player.id, historicalTitleGrantId: historical.id, completionId, ...(inherited ? { previousSourceId: activeIdentity.sourceId, reconciled: true } : {}) }), timestamp),
      );
      if (createsCompletion) statements.push(database.prepare("INSERT INTO audit_events (id, correlation_id, actor_type, actor_id, operation, entity_type, entity_id, payload_json, created_at) VALUES (?, ?, ?, ?, 'challenge.completion.manual', 'challenge_completion', ?, ?, ?)").bind(crypto.randomUUID(), crypto.randomUUID(), auth.actorType, auth.subject, completionId, JSON.stringify({ playerAccountId: player.id, challengeId: manualChallengeId, titleKey: historical.titleKey, mapId: historical.mapId, gameplayRevisionId: historical.gameplayRevisionId, grantId, historicalTitleGrantId: historical.id }), timestamp));
      await database.batch(statements);
    },

    async createAdminManualTitleGrant(input, auth, idempotencyKey): Promise<AdminManualTitleGrantResponse> {
      const replay = await replayOrConflict<AdminManualTitleGrantResponse>(auth.subject, "admin.title.grant.manual", idempotencyKey, input);
      if (replay) return replay;
      const player = await db.select({ id: playerAccounts.id }).from(playerAccounts).where(eq(playerAccounts.id, input.playerAccountId)).get();
      if (!player) throw new Error("PLAYER_NOT_FOUND");
      const resolved = await resolveManualTitleGrantTarget(input);
      const existing = await db.select({ id: playerTitleGrants.id }).from(playerTitleGrants).where(and(eq(playerTitleGrants.playerAccountId, player.id), eq(playerTitleGrants.titleKey, resolved.title.key), eq(playerTitleGrants.status, "active"), resolved.mapId ? eq(playerTitleGrants.mapId, resolved.mapId) : isNull(playerTitleGrants.mapId), resolved.gameplayRevisionId ? eq(playerTitleGrants.gameplayRevisionId, resolved.gameplayRevisionId) : isNull(playerTitleGrants.gameplayRevisionId))).get();
      const administrativelyRevoked = await db.select({ id: playerTitleGrants.id }).from(playerTitleGrants).where(and(eq(playerTitleGrants.playerAccountId, player.id), eq(playerTitleGrants.titleKey, resolved.title.key), eq(playerTitleGrants.status, "revoked"), eq(playerTitleGrants.revocationType, "administrator"), resolved.mapId ? eq(playerTitleGrants.mapId, resolved.mapId) : isNull(playerTitleGrants.mapId), resolved.gameplayRevisionId ? eq(playerTitleGrants.gameplayRevisionId, resolved.gameplayRevisionId) : isNull(playerTitleGrants.gameplayRevisionId))).get();
      if (administrativelyRevoked) throw new Error("TITLE_GRANT_ADMINISTRATIVELY_REVOKED");
      const grantId = existing?.id ?? crypto.randomUUID();
      const completionId = `completion:${grantId}`;
      const response: AdminManualTitleGrantResponse = { contractVersion: "1", grantId, titleKey: resolved.title.key, titleName: resolved.title.label, mapId: resolved.mapId, slot: resolved.slot as "pioneer" | "conqueror" | "dominator" | null, alreadyOwned: Boolean(existing) };
      const timestamp = now();
      const sourceId = `manual:${auth.subject}:${idempotencyKey}`;
      await database.batch([
        database.prepare("INSERT OR IGNORE INTO challenges (id, source_family, source_id, title_key, status, manual, public_condition, condition_operator, conditions_json, condition, created_at, updated_at) VALUES (?, 'manual', ?, ?, 'active', 1, 0, 'and', '[]', 'Maintainer-issued title', ?, ?)").bind(resolved.manualChallengeId, resolved.title.key, resolved.title.key, timestamp, timestamp),
        database.prepare("INSERT OR IGNORE INTO challenge_completions (id, player_account_id, challenge_id, gameplay_revision_id, status, source_type, source_id, completed_at, created_at) SELECT ?, ?, ?, ?, 'active', 'manual', ?, ?, ? WHERE NOT EXISTS (SELECT 1 FROM player_title_grants WHERE player_account_id = ? AND title_key = ? AND status = 'active' AND (map_id = ? OR (map_id IS NULL AND ? IS NULL)) AND (gameplay_revision_id = ? OR (gameplay_revision_id IS NULL AND ? IS NULL)))").bind(completionId, player.id, resolved.manualChallengeId, resolved.gameplayRevisionId, sourceId, timestamp, timestamp, player.id, resolved.title.key, resolved.mapId, resolved.mapId, resolved.gameplayRevisionId, resolved.gameplayRevisionId),
        database.prepare("INSERT OR IGNORE INTO player_title_grants (id, player_account_id, title_key, map_id, gameplay_revision_id, slot, status, source_type, source_id, granted_by, granted_at, completion_id) VALUES (?, ?, ?, ?, ?, ?, 'active', 'manual', ?, ?, ?, (SELECT id FROM challenge_completions WHERE player_account_id = ? AND challenge_id = ? AND status = 'active' AND (gameplay_revision_id = ? OR (gameplay_revision_id IS NULL AND ? IS NULL))))").bind(grantId, player.id, resolved.title.key, resolved.mapId, resolved.gameplayRevisionId, resolved.slot, sourceId, auth.subject, timestamp, player.id, resolved.manualChallengeId, resolved.gameplayRevisionId, resolved.gameplayRevisionId),
        database.prepare("INSERT INTO idempotency_keys (id, actor_id, operation, request_hash, response_json, created_at) VALUES (?, ?, 'admin.title.grant.manual', ?, ?, ?)").bind(`${auth.subject}:admin.title.grant.manual:${idempotencyKey}`, auth.subject, await hashRequest(input), JSON.stringify(response), timestamp),
        database.prepare("INSERT INTO audit_events (id, correlation_id, actor_type, actor_id, operation, entity_type, entity_id, payload_json, created_at) SELECT ?, ?, ?, ?, 'challenge.completion.manual', 'challenge_completion', id, ?, ? FROM challenge_completions WHERE id = ?").bind(crypto.randomUUID(), crypto.randomUUID(), auth.actorType, auth.subject, JSON.stringify({ playerAccountId: player.id, challengeId: resolved.manualChallengeId, titleKey: resolved.title.key, mapId: resolved.mapId, gameplayRevisionId: resolved.gameplayRevisionId, grantId }), timestamp, completionId),
        database.prepare("INSERT INTO audit_events (id, correlation_id, actor_type, actor_id, operation, entity_type, entity_id, payload_json, created_at) VALUES (?, ?, ?, ?, 'admin.title.grant.manual', 'player_title_grant', ?, ?, ?)").bind(crypto.randomUUID(), crypto.randomUUID(), auth.actorType, auth.subject, grantId, JSON.stringify({ playerAccountId: player.id, titleKey: resolved.title.key, mapId: resolved.mapId, gameplayRevisionId: resolved.gameplayRevisionId, slot: resolved.slot, alreadyOwned: Boolean(existing), reason: input.reason ?? null }), timestamp),
      ]);
      return response;
    },

    async createAdminManualTitleGrantBatch(input, auth, idempotencyKey): Promise<AdminManualTitleGrantBatchResponse> {
      const operation = "admin.title.grant.manual.batch";
      const replay = await replayOrConflict<AdminManualTitleGrantBatchResponse>(auth.subject, operation, idempotencyKey, input);
      if (replay) return replay;
      const playerAccountIds = [...new Set(input.playerAccountIds.map((id) => id.trim()))];
      const targetInputs = [...new Map(input.targets.map((target) => {
        const normalized = { titleKey: target.titleKey.trim(), mapId: target.mapId?.trim(), gameplayRevisionId: target.gameplayRevisionId?.trim() } satisfies AdminManualTitleGrantTarget;
        return [`${normalized.titleKey}:${normalized.mapId ?? ""}:${normalized.gameplayRevisionId ?? ""}`, normalized] as const;
      })).values()];
      if (playerAccountIds.length * targetInputs.length > 500) throw new Error("MANUAL_TITLE_GRANT_BATCH_TOO_LARGE");

      const playerRows = [] as Array<{ id: string }>;
      for (let offset = 0; offset < playerAccountIds.length; offset += 80) {
        playerRows.push(...await db.select({ id: playerAccounts.id }).from(playerAccounts).where(inArray(playerAccounts.id, playerAccountIds.slice(offset, offset + 80))));
      }
      const playersById = new Map(playerRows.map((player) => [player.id, player]));
      if (playerRows.length !== playerAccountIds.length) throw new Error("PLAYER_NOT_FOUND");

      const resolvedTargets = [] as Array<ManualTitleGrantResolution>;
      const resolvedTargetKeys = new Set<string>();
      for (const target of targetInputs) {
        const resolved = await resolveManualTitleGrantTarget(target);
        const key = `${resolved.title.key}:${resolved.mapId ?? ""}:${resolved.gameplayRevisionId ?? ""}`;
        if (!resolvedTargetKeys.has(key)) {
          resolvedTargetKeys.add(key);
          resolvedTargets.push(resolved);
        }
      }
      if (playerAccountIds.length * resolvedTargets.length > 500) throw new Error("MANUAL_TITLE_GRANT_BATCH_TOO_LARGE");

      const existingGrants = [] as Array<{ id: string; playerAccountId: string; titleKey: string; mapId: string | null; gameplayRevisionId: string | null }>;
      const revokedGrants = [] as Array<{ id: string; playerAccountId: string; titleKey: string; mapId: string | null; gameplayRevisionId: string | null }>;
      for (let offset = 0; offset < playerAccountIds.length; offset += 80) {
        existingGrants.push(...await db.select({ id: playerTitleGrants.id, playerAccountId: playerTitleGrants.playerAccountId, titleKey: playerTitleGrants.titleKey, mapId: playerTitleGrants.mapId, gameplayRevisionId: playerTitleGrants.gameplayRevisionId })
          .from(playerTitleGrants).where(and(inArray(playerTitleGrants.playerAccountId, playerAccountIds.slice(offset, offset + 80)), eq(playerTitleGrants.status, "active"))));
        revokedGrants.push(...await db.select({ id: playerTitleGrants.id, playerAccountId: playerTitleGrants.playerAccountId, titleKey: playerTitleGrants.titleKey, mapId: playerTitleGrants.mapId, gameplayRevisionId: playerTitleGrants.gameplayRevisionId })
          .from(playerTitleGrants).where(and(inArray(playerTitleGrants.playerAccountId, playerAccountIds.slice(offset, offset + 80)), eq(playerTitleGrants.status, "revoked"), eq(playerTitleGrants.revocationType, "administrator"))));
      }
      const existingByCell = new Map(existingGrants.map((grant) => [`${grant.playerAccountId}:${grant.titleKey}:${grant.mapId ?? ""}:${grant.gameplayRevisionId ?? ""}`, grant]));
      const revokedByCell = new Set(revokedGrants.map((grant) => `${grant.playerAccountId}:${grant.titleKey}:${grant.mapId ?? ""}:${grant.gameplayRevisionId ?? ""}`));
      const batchId = crypto.randomUUID();
      const items: AdminManualTitleGrantBatchResponse["items"] = [];
      const created = [] as Array<{ item: AdminManualTitleGrantBatchResponse["items"][number]; sourceId: string; slot: string | null; challengeId: string; completionId: string }>;
      for (const playerAccountId of playerAccountIds) {
        if (!playersById.has(playerAccountId)) throw new Error("PLAYER_NOT_FOUND");
        for (const [targetIndex, target] of resolvedTargets.entries()) {
          const cellKey = `${playerAccountId}:${target.title.key}:${target.mapId ?? ""}:${target.gameplayRevisionId ?? ""}`;
          if (revokedByCell.has(cellKey)) throw new Error("TITLE_GRANT_ADMINISTRATIVELY_REVOKED");
          const existing = existingByCell.get(cellKey);
          const item = { playerAccountId, titleKey: target.title.key, mapId: target.mapId, gameplayRevisionId: target.gameplayRevisionId, grantId: existing?.id ?? crypto.randomUUID(), status: existing ? "already_owned" as const : "created" as const };
          items.push(item);
          if (!existing) created.push({ item, slot: target.slot, sourceId: `manual-batch:${batchId}:${playerAccountId}:${targetIndex}`, challengeId: target.manualChallengeId, completionId: `completion:${item.grantId}` });
        }
      }
      const createdCount = created.length;
      const alreadyOwnedCount = items.length - createdCount;
      const response: AdminManualTitleGrantBatchResponse = { contractVersion: "1", batchId, playerCount: playerAccountIds.length, targetCount: resolvedTargets.length, requestedCount: items.length, createdCount, alreadyOwnedCount, items };
      const timestamp = now();
      const statements = [
        ...resolvedTargets.map((target) => database.prepare("INSERT OR IGNORE INTO challenges (id, source_family, source_id, title_key, status, manual, public_condition, condition_operator, conditions_json, condition, created_at, updated_at) VALUES (?, 'manual', ?, ?, 'active', 1, 0, 'and', '[]', 'Maintainer-issued title', ?, ?)").bind(target.manualChallengeId, target.title.key, target.title.key, timestamp, timestamp)),
        ...created.map(({ item, sourceId, challengeId, completionId }) => database.prepare("INSERT INTO challenge_completions (id, player_account_id, challenge_id, gameplay_revision_id, status, source_type, source_id, completed_at, created_at) VALUES (?, ?, ?, ?, 'active', 'manual', ?, ?, ?)").bind(completionId, item.playerAccountId, challengeId, item.gameplayRevisionId, sourceId, timestamp, timestamp)),
        ...created.map(({ item, sourceId, slot, challengeId }) => database.prepare("INSERT INTO player_title_grants (id, player_account_id, title_key, map_id, gameplay_revision_id, slot, status, source_type, source_id, granted_by, granted_at, completion_id) VALUES (?, ?, ?, ?, ?, ?, 'active', 'manual', ?, ?, ?, (SELECT id FROM challenge_completions WHERE player_account_id = ? AND challenge_id = ? AND status = 'active' AND (gameplay_revision_id = ? OR (gameplay_revision_id IS NULL AND ? IS NULL))))").bind(item.grantId, item.playerAccountId, item.titleKey, item.mapId, item.gameplayRevisionId, slot, sourceId, auth.subject, timestamp, item.playerAccountId, challengeId, item.gameplayRevisionId, item.gameplayRevisionId)),
        ...created.map(({ item, challengeId, completionId }) => database.prepare("INSERT INTO audit_events (id, correlation_id, actor_type, actor_id, operation, entity_type, entity_id, payload_json, created_at) VALUES (?, ?, ?, ?, 'challenge.completion.manual.batch', 'challenge_completion', ?, ?, ?)").bind(crypto.randomUUID(), batchId, auth.actorType, auth.subject, completionId, JSON.stringify({ batchId, challengeId, playerAccountId: item.playerAccountId, titleKey: item.titleKey, mapId: item.mapId, gameplayRevisionId: item.gameplayRevisionId, grantId: item.grantId }), timestamp)),
        ...created.map(({ item }) => database.prepare("INSERT INTO audit_events (id, correlation_id, actor_type, actor_id, operation, entity_type, entity_id, payload_json, created_at) VALUES (?, ?, ?, ?, 'admin.title.grant.manual.batch.item', 'player_title_grant', ?, ?, ?)").bind(crypto.randomUUID(), batchId, auth.actorType, auth.subject, item.grantId, JSON.stringify({ batchId, playerAccountId: item.playerAccountId, titleKey: item.titleKey, mapId: item.mapId, gameplayRevisionId: item.gameplayRevisionId, status: item.status, reason: input.reason ?? null }), timestamp)),
        database.prepare("INSERT INTO audit_events (id, correlation_id, actor_type, actor_id, operation, entity_type, entity_id, payload_json, created_at) VALUES (?, ?, ?, ?, 'admin.title.grant.manual.batch', 'title_grant_batch', ?, ?, ?)").bind(crypto.randomUUID(), batchId, auth.actorType, auth.subject, batchId, JSON.stringify({ batchId, playerCount: response.playerCount, targetCount: response.targetCount, requestedCount: response.requestedCount, createdCount, alreadyOwnedCount, items: items.map(({ playerAccountId, titleKey, mapId, gameplayRevisionId, grantId, status }) => ({ playerAccountId, titleKey, mapId, gameplayRevisionId, grantId, status })), reason: input.reason ?? null }), timestamp),
        database.prepare("INSERT INTO idempotency_keys (id, actor_id, operation, request_hash, response_json, created_at) VALUES (?, ?, ?, ?, ?, ?)").bind(`${auth.subject}:${operation}:${idempotencyKey}`, auth.subject, operation, await hashRequest(input), JSON.stringify(response), timestamp),
      ];
      await database.batch(statements);
      return response;
    },

    async createAdminTitleGrantBulk(input, auth, idempotencyKey) {
      const replay = await replayOrConflict<{ contractVersion: "1"; grantedCount: number; skippedClaimedCount: number }>(auth.subject, "admin.title.grant.bulk", idempotencyKey, input);
      if (replay) return replay;
      const player = await db.select().from(playerAccounts).where(eq(playerAccounts.id, input.playerAccountId)).get();
      if (!player) throw new Error("PLAYER_NOT_FOUND");
      const holderRows = await db.select({ id: historicalTitleGrants.id, titleKey: historicalTitleGrants.titleKey, mapId: historicalTitleGrants.mapId, gameplayRevisionId: historicalTitleGrants.gameplayRevisionId, slot: historicalTitleGrants.slot, grantId: playerTitleGrants.id }).from(historicalTitleGrants)
        .leftJoin(playerTitleGrants, and(eq(playerTitleGrants.sourceType, "historical"), eq(playerTitleGrants.sourceId, historicalTitleGrants.id), eq(playerTitleGrants.titleKey, historicalTitleGrants.titleKey)))
        .where(eq(historicalTitleGrants.holderName, input.holderName));
      const activePlayerGrants = await db.select({ id: playerTitleGrants.id, titleKey: playerTitleGrants.titleKey, mapId: playerTitleGrants.mapId, gameplayRevisionId: playerTitleGrants.gameplayRevisionId, sourceType: playerTitleGrants.sourceType, sourceId: playerTitleGrants.sourceId }).from(playerTitleGrants)
        .where(and(eq(playerTitleGrants.playerAccountId, player.id), eq(playerTitleGrants.status, "active")));
      const administrativelyRevokedGrants = await db.select({ titleKey: playerTitleGrants.titleKey, mapId: playerTitleGrants.mapId, gameplayRevisionId: playerTitleGrants.gameplayRevisionId }).from(playerTitleGrants)
        .where(and(eq(playerTitleGrants.playerAccountId, player.id), eq(playerTitleGrants.status, "revoked"), eq(playerTitleGrants.revocationType, "administrator")));
      const activeByIdentity = new Map(activePlayerGrants.map((grant) => [`${grant.titleKey}:${grant.mapId ?? ""}:${grant.gameplayRevisionId ?? ""}`, grant]));
      const administrativelyRevokedByIdentity = new Set(administrativelyRevokedGrants.map((grant) => `${grant.titleKey}:${grant.mapId ?? ""}:${grant.gameplayRevisionId ?? ""}`));
      const historicalById = new Map(holderRows.map((row) => [row.id, row]));
      const unclaimed: typeof holderRows = [];
      const reconciled: Array<{ historical: typeof holderRows[number]; existing: typeof activePlayerGrants[number] }> = [];
      let skippedClaimedCount = 0;
      for (const row of holderRows) {
        if (administrativelyRevokedByIdentity.has(`${row.titleKey}:${row.mapId ?? ""}:${row.gameplayRevisionId ?? ""}`)) throw new Error("TITLE_GRANT_ADMINISTRATIVELY_REVOKED");
        if (row.grantId) {
          skippedClaimedCount += 1;
          continue;
        }
        const existing = activeByIdentity.get(`${row.titleKey}:${row.mapId ?? ""}:${row.gameplayRevisionId ?? ""}`);
        const inheritedFromDominator = existing && isInheritedConquerorGrant(historicalById.get(existing.sourceId), row);
        if (inheritedFromDominator) reconciled.push({ historical: row, existing });
        else if (existing) skippedClaimedCount += 1;
        else unclaimed.push(row);
      }
      const timestamp = now();
      const grantPriority = (titleKey: string) => titleKey === "CONQUEROR" ? 0 : titleKey === "DOMINATOR" ? 1 : 2;
      const grants = [...unclaimed].sort((left, right) => grantPriority(left.titleKey) - grantPriority(right.titleKey)).map((historical) => {
        const id = crypto.randomUUID();
        return { id, completionId: `completion:${id}`, challengeId: `manual:${historical.titleKey}`, historical };
      });
      const response = { contractVersion: "1" as const, grantedCount: grants.length + reconciled.length, skippedClaimedCount };
      const statements = [
        ...[...new Set(grants.map(({ historical }) => historical.titleKey))].map((titleKey) => db.insert(challenges).values({ id: `manual:${titleKey}`, sourceFamily: "manual", sourceId: titleKey, titleKey, mapId: null, gameplayRevisionId: null, status: "active", manual: 1, publicCondition: 0, conditionOperator: "and", conditionsJson: "[]", condition: "Maintainer-issued title", startsAt: null, endsAt: null, createdAt: timestamp, updatedAt: timestamp }).onConflictDoNothing()),
        ...grants.map((grant) => db.insert(challengeCompletions).values({ id: grant.completionId, playerAccountId: player.id, challengeId: grant.challengeId, gameplayRevisionId: grant.historical.gameplayRevisionId, status: "active", sourceType: "manual", sourceId: `historical-batch:${grant.id}`, completedAt: timestamp, createdAt: timestamp })),
        ...reconciled.map(({ historical, existing }) => db.update(playerTitleGrants).set({ sourceId: historical.id }).where(eq(playerTitleGrants.id, existing.id))),
        ...grants.map((grant) => db.insert(playerTitleGrants).values({ id: grant.id, playerAccountId: player.id, titleKey: grant.historical.titleKey, mapId: grant.historical.mapId, gameplayRevisionId: grant.historical.gameplayRevisionId, slot: grant.historical.slot, status: "active", sourceType: "historical", sourceId: grant.historical.id, grantedBy: auth.subject, grantedAt: timestamp, completionId: grant.completionId })),
        ...reconciled.map(({ historical, existing }) => db.insert(auditEvents).values({ id: crypto.randomUUID(), correlationId: crypto.randomUUID(), actorType: auth.actorType, actorId: auth.subject, operation: "admin.title.grant.bulk", entityType: "player_title_grant", entityId: existing.id, payloadJson: JSON.stringify({ playerAccountId: player.id, historicalTitleGrantId: historical.id, previousSourceId: existing.sourceId, reconciled: true }), createdAt: timestamp })),
        ...grants.map((grant) => db.insert(auditEvents).values({ id: crypto.randomUUID(), correlationId: crypto.randomUUID(), actorType: auth.actorType, actorId: auth.subject, operation: "challenge.completion.manual", entityType: "challenge_completion", entityId: grant.completionId, payloadJson: JSON.stringify({ playerAccountId: player.id, challengeId: grant.challengeId, titleKey: grant.historical.titleKey, mapId: grant.historical.mapId, gameplayRevisionId: grant.historical.gameplayRevisionId, grantId: grant.id, historicalTitleGrantId: grant.historical.id }), createdAt: timestamp })),
        ...grants.map((grant) => db.insert(auditEvents).values({ id: crypto.randomUUID(), correlationId: crypto.randomUUID(), actorType: auth.actorType, actorId: auth.subject, operation: "admin.title.grant.bulk", entityType: "player_title_grant", entityId: grant.id, payloadJson: JSON.stringify({ playerAccountId: player.id, historicalTitleGrantId: grant.historical.id, holderName: input.holderName }), createdAt: timestamp })),
        db.insert(idempotencyKeys).values({ id: `${auth.subject}:admin.title.grant.bulk:${idempotencyKey}`, actorId: auth.subject, operation: "admin.title.grant.bulk", requestHash: await hashRequest(input), responseJson: JSON.stringify(response), createdAt: timestamp }),
      ];
      if (statements.length === 1) {
        await db.batch(statements as [typeof statements[number]]);
      } else {
        await db.batch(statements as [typeof statements[number], ...typeof statements]);
      }
      return response;
    },

    async revokeAdminTitleGrant(input, auth, idempotencyKey) {
      const operation = "admin.title.revoke";
      const replay = await replayOrConflict<Record<string, never>>(auth.subject, operation, idempotencyKey, input); if (replay) return;
      const grant = await db.select().from(playerTitleGrants).where(eq(playerTitleGrants.id, input.grantId)).get(); if (!grant) throw new Error("TITLE_GRANT_NOT_FOUND");
      if (grant.status !== "active") throw new Error("TITLE_GRANT_NOT_ACTIVE");
      const timestamp = now();
      await database.batch([
        database.prepare("UPDATE player_title_grants SET status = 'revoked', revocation_type = 'administrator', revoked_by = ?, revoked_at = ?, revoke_reason = ? WHERE id = ? AND status = 'active'").bind(auth.subject, timestamp, input.reason ?? null, grant.id),
        database.prepare("INSERT INTO idempotency_keys (id, actor_id, operation, request_hash, response_json, created_at) SELECT ?, ?, ?, ?, ?, ? WHERE changes() = 1").bind(`${auth.subject}:${operation}:${idempotencyKey}`, auth.subject, operation, await hashRequest(input), JSON.stringify({}), timestamp),
        database.prepare("INSERT INTO audit_events (id, correlation_id, actor_type, actor_id, operation, entity_type, entity_id, payload_json, created_at) SELECT ?, ?, ?, ?, ?, 'player_title_grant', ?, ?, ? WHERE changes() = 1").bind(crypto.randomUUID(), crypto.randomUUID(), auth.actorType, auth.subject, operation, grant.id, JSON.stringify({ reason: input.reason ?? null }), timestamp),
      ]);
      const concurrentReplay = await replayOrConflict<Record<string, never>>(auth.subject, operation, idempotencyKey, input);
      if (concurrentReplay) return;
      throw new Error("TITLE_GRANT_NOT_ACTIVE");
    },

    async restoreAdminTitleGrant(input, auth, idempotencyKey) {
      const operation = "admin.title.restore";
      const replay = await replayOrConflict<Record<string, never>>(auth.subject, operation, idempotencyKey, input);
      if (replay) return;
      const grant = await db.select().from(playerTitleGrants).where(eq(playerTitleGrants.id, input.grantId)).get();
      if (!grant) throw new Error("TITLE_GRANT_NOT_FOUND");
      if (grant.status !== "revoked" || grant.revocationType !== "administrator") throw new Error("TITLE_GRANT_NOT_ADMINISTRATIVELY_REVOKED");
      const existing = await db.select({ id: playerTitleGrants.id }).from(playerTitleGrants).where(and(
        eq(playerTitleGrants.playerAccountId, grant.playerAccountId),
        eq(playerTitleGrants.titleKey, grant.titleKey),
        eq(playerTitleGrants.status, "active"),
        ne(playerTitleGrants.id, grant.id),
        grant.mapId ? eq(playerTitleGrants.mapId, grant.mapId) : isNull(playerTitleGrants.mapId),
        grant.gameplayRevisionId ? eq(playerTitleGrants.gameplayRevisionId, grant.gameplayRevisionId) : isNull(playerTitleGrants.gameplayRevisionId),
      )).get();
      if (existing) throw new Error("TITLE_ALREADY_OWNED");
      const timestamp = now();
      await database.batch([
        database.prepare("UPDATE player_title_grants SET status = 'active', revocation_type = NULL, revoked_by = NULL, revoked_at = NULL, revoke_reason = NULL WHERE id = ? AND status = 'revoked' AND revocation_type = 'administrator'").bind(grant.id),
        database.prepare("INSERT INTO idempotency_keys (id, actor_id, operation, request_hash, response_json, created_at) SELECT ?, ?, ?, ?, ?, ? WHERE changes() = 1").bind(`${auth.subject}:${operation}:${idempotencyKey}`, auth.subject, operation, await hashRequest(input), JSON.stringify({}), timestamp),
        database.prepare("INSERT INTO audit_events (id, correlation_id, actor_type, actor_id, operation, entity_type, entity_id, payload_json, created_at) SELECT ?, ?, ?, ?, ?, 'player_title_grant', ?, ?, ? WHERE EXISTS (SELECT 1 FROM player_title_grants WHERE id = ? AND status = 'active')").bind(crypto.randomUUID(), crypto.randomUUID(), auth.actorType, auth.subject, operation, grant.id, JSON.stringify({ reason: input.reason ?? null, completionId: grant.completionId }), timestamp, grant.id),
      ]);
      const restored = await db.select({ id: playerTitleGrants.id }).from(playerTitleGrants).where(and(eq(playerTitleGrants.id, grant.id), eq(playerTitleGrants.status, "active"))).get();
      if (!restored) throw new Error("TITLE_GRANT_NOT_ADMINISTRATIVELY_REVOKED");
    },

  };
};
