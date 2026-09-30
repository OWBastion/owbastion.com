import { and, count, desc, eq, inArray, like, ne, or } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";
import { alias } from "drizzle-orm/sqlite-core";
import type { AuthContext, PlatformServices } from "@owbastion/domain";
import type { AdminPlayerDetail, PlayerSubmissionStatus, VerifiedRunDifficulty } from "@owbastion/contracts";
import {
  bindings,
  challengeCompletions,
  challenges,
  gameplayRevisions,
  maps,
  playerAccounts,
  playerEquippedTitles,
  playerTitleGrants,
  portalSessions,
  submissions,
  titleCatalog,
  verifiedRuns,
} from "./schema";

type AdminPlayerServices = Pick<PlatformServices,
  | "listAdminPlayers"
  | "getAdminPlayer"
  | "setAdminPlayerStatus"
  | "updateAdminPlayerIdentity"
  | "removeAdminBinding"
>;

type RecentSubmissionDetails = Pick<AdminPlayerDetail["recentSubmissions"][number], "challenge" | "verifiedRunOutcome">;

type AdminPlayerServicesDependencies = {
  db: ReturnType<typeof drizzle>;
  now: () => number;
  normalizePlayerName: (name: string) => string;
  playerSubmissionStatus: (status: string) => PlayerSubmissionStatus;
  replayOrConflict: <T>(actorId: string, operation: string, key: string, input: unknown) => Promise<T | null>;
  recordIdempotency: (actorId: string, operation: string, key: string, input: unknown, response: unknown) => Promise<void>;
  recordAudit: (auth: AuthContext, operation: string, entityType: string, entityId: string, payload: unknown) => Promise<void>;
  loadRecentSubmissionDetails: (rows: Array<typeof submissions.$inferSelect>) => Promise<Map<string, RecentSubmissionDetails>>;
};

export const createAdminPlayerServices = ({
  db,
  now,
  normalizePlayerName,
  playerSubmissionStatus,
  replayOrConflict,
  recordIdempotency,
  recordAudit,
  loadRecentSubmissionDetails,
}: AdminPlayerServicesDependencies): AdminPlayerServices => ({
  async listAdminPlayers(input) {
    const conditions = [];
    if (input.status) conditions.push(eq(playerAccounts.status, input.status));
    if (input.query) {
      const query = `%${input.query}%`;
      const matchingBindings = await db.select({ playerAccountId: bindings.playerAccountId }).from(bindings).where(and(eq(bindings.status, "active"), or(like(bindings.groupOpenId, query), like(bindings.memberOpenId, query))));
      conditions.push(or(like(playerAccounts.playerId, query), like(playerAccounts.playerName, query), like(playerAccounts.normalizedPlayerName, query), ...(matchingBindings.length ? [inArray(playerAccounts.id, matchingBindings.map((binding) => binding.playerAccountId))] : []))!);
    }
    const condition = conditions.length ? and(...conditions) : undefined;
    const [accounts, [{ total }]] = await Promise.all([
      db.select().from(playerAccounts).where(condition).orderBy(desc(playerAccounts.updatedAt)).limit(input.pageSize + 1).offset((input.page - 1) * input.pageSize),
      db.select({ total: count() }).from(playerAccounts).where(condition),
    ]);
    const hasMore = accounts.length > input.pageSize;
    const items = accounts.slice(0, input.pageSize);
    return {
      contractVersion: "1" as const,
      items: await Promise.all(items.map(async (account) => ({
        playerAccountId: account.id,
        playerId: account.playerId,
        playerName: account.playerName,
        status: account.status as "active" | "banned",
        bindingCount: (await db.select().from(bindings).where(and(eq(bindings.playerAccountId, account.id), eq(bindings.status, "active")))).length,
        updatedAt: account.updatedAt,
      }))),
      page: input.page,
      pageSize: input.pageSize,
      total,
      hasMore,
    };
  },

  async getAdminPlayer(input) {
    const account = await db.select().from(playerAccounts).where(eq(playerAccounts.id, input.playerAccountId)).get();
    if (!account) throw new Error("PLAYER_NOT_FOUND");
    const playerBindings = await db.select().from(bindings).where(and(eq(bindings.playerAccountId, account.id), eq(bindings.status, "active"))).orderBy(desc(bindings.createdAt));
    const recentSubmissions = await db.select().from(submissions).where(eq(submissions.playerAccountId, account.id)).orderBy(desc(submissions.createdAt)).limit(10);
    const recentSubmissionDetails = await loadRecentSubmissionDetails(recentSubmissions);
    const completionChallengeMap = alias(maps, "admin_player_completion_challenge_map");
    const completionRevisionMap = alias(maps, "admin_player_completion_revision_map");
    const [recentCompletionRows, activeVerifiedRunCountRows, recentVerifiedRunRows] = await Promise.all([
      db.select({ completion: challengeCompletions, challenge: challenges, title: titleCatalog, challengeMapName: completionChallengeMap.name, revisionMapName: completionRevisionMap.name, gameVersion: gameplayRevisions.gameVersion })
        .from(challengeCompletions)
        .innerJoin(challenges, eq(challenges.id, challengeCompletions.challengeId))
        .innerJoin(titleCatalog, eq(titleCatalog.key, challenges.titleKey))
        .leftJoin(gameplayRevisions, eq(gameplayRevisions.id, challengeCompletions.gameplayRevisionId))
        .leftJoin(completionChallengeMap, eq(completionChallengeMap.id, challenges.mapId))
        .leftJoin(completionRevisionMap, eq(completionRevisionMap.id, gameplayRevisions.mapId))
        .where(eq(challengeCompletions.playerAccountId, account.id))
        .orderBy(desc(challengeCompletions.completedAt), desc(challengeCompletions.id))
        .limit(10),
      db.select({ total: count() }).from(verifiedRuns)
        .innerJoin(gameplayRevisions, eq(gameplayRevisions.id, verifiedRuns.gameplayRevisionId))
        .where(and(eq(verifiedRuns.playerAccountId, account.id), eq(verifiedRuns.status, "active"), inArray(gameplayRevisions.lifecycle, ["default", "selectable"]))),
      db.select({ run: verifiedRuns, mapName: maps.name, gameVersion: gameplayRevisions.gameVersion })
        .from(verifiedRuns)
        .innerJoin(maps, eq(maps.id, verifiedRuns.mapId))
        .innerJoin(gameplayRevisions, eq(gameplayRevisions.id, verifiedRuns.gameplayRevisionId))
        .where(and(eq(verifiedRuns.playerAccountId, account.id), eq(verifiedRuns.status, "active"), inArray(gameplayRevisions.lifecycle, ["default", "selectable"])))
        .orderBy(desc(verifiedRuns.acceptedAt), desc(verifiedRuns.id))
        .limit(5),
    ]);
    const titleGrants = await db.select({ grant: playerTitleGrants, title: titleCatalog, mapName: maps.name, equipped: playerEquippedTitles.grantId, revisionMapId: gameplayRevisions.mapId, revisionLifecycle: gameplayRevisions.lifecycle })
      .from(playerTitleGrants).innerJoin(titleCatalog, eq(playerTitleGrants.titleKey, titleCatalog.key)).leftJoin(playerEquippedTitles, eq(playerEquippedTitles.grantId, playerTitleGrants.id)).leftJoin(maps, eq(playerTitleGrants.mapId, maps.id)).leftJoin(gameplayRevisions, eq(playerTitleGrants.gameplayRevisionId, gameplayRevisions.id))
      .where(and(eq(playerTitleGrants.playerAccountId, account.id), or(eq(playerTitleGrants.status, "active"), and(eq(playerTitleGrants.status, "revoked"), eq(playerTitleGrants.revocationType, "administrator"))))).orderBy(desc(playerTitleGrants.grantedAt));
    return {
      contractVersion: "1" as const,
      playerAccountId: account.id,
      playerId: account.playerId,
      playerName: account.playerName,
      status: account.status as "active" | "banned",
      bindingCount: playerBindings.length,
      updatedAt: account.updatedAt,
      bindings: playerBindings.map((binding) => ({ bindingId: binding.id, provider: "qq" as const, groupOpenId: binding.groupOpenId, memberOpenId: binding.memberOpenId, createdAt: binding.createdAt })),
      recentSubmissions: recentSubmissions.map((submission) => {
        const details = recentSubmissionDetails.get(submission.id);
        return {
          submissionId: submission.id,
          status: playerSubmissionStatus(submission.status),
          resubmissionRequired: submission.status === "resubmission_required",
          mapName: submission.mapName,
          challengeId: submission.challengeId ?? undefined,
          difficulty: submission.difficulty ?? undefined,
          reason: submission.reviewReason ?? undefined,
          challenge: details?.challenge ?? null,
          ...(details?.verifiedRunOutcome ? { verifiedRunOutcome: details.verifiedRunOutcome } : {}),
          createdAt: submission.createdAt,
          updatedAt: submission.updatedAt,
        };
      }),
      titleGrants: titleGrants.map(({ grant, title, mapName, equipped, revisionMapId, revisionLifecycle }) => {
        const equipable = grant.status === "active" && title.gameVersion !== null && title.scope === "global" && (
          grant.mapId === null && grant.gameplayRevisionId === null
          || grant.mapId === revisionMapId && ["default", "selectable"].includes(revisionLifecycle ?? "")
        );
        return { grantId: grant.id, titleKey: title.key, label: title.label, icon: title.icon as never, iconUrl: title.iconUrl, category: title.category, condition: title.condition, scope: grant.mapId ? "map" as const : "global" as const, mapName: mapName ?? undefined, slot: grant.slot as "pioneer" | "conqueror" | "dominator" | undefined, grantedAt: grant.grantedAt, status: grant.status as "active" | "revoked", revocationType: grant.revocationType as "administrator" | "evidence" | null, sourceType: grant.sourceType as "historical" | "submission" | "manual" | "automatic", grantedBy: grant.grantedBy, equipped: Boolean(equipped) && equipable, equipable };
      }),
      recentCompletions: recentCompletionRows.map(({ completion, challenge, title, challengeMapName, revisionMapName, gameVersion }) => ({
        completionId: completion.id,
        challengeId: challenge.id,
        titleKey: title.key,
        titleName: title.label,
        mapName: challengeMapName ?? revisionMapName ?? null,
        gameplayRevisionId: completion.gameplayRevisionId,
        gameVersion: gameVersion ?? null,
        status: completion.status as "active" | "invalidated",
        sourceType: completion.sourceType,
        completedAt: completion.completedAt,
      })),
      progression: {
        activeVerifiedRunCount: Number(activeVerifiedRunCountRows[0]?.total ?? 0),
        recentVerifiedRuns: recentVerifiedRunRows.map(({ run, mapName, gameVersion }) => ({
          runId: run.id,
          mapName,
          gameplayRevisionId: run.gameplayRevisionId,
          gameVersion,
          difficulty: run.difficulty as VerifiedRunDifficulty,
          awardedXp: run.awardedXp,
          acceptedAt: run.acceptedAt,
        })),
      },
    };
  },

  async setAdminPlayerStatus(input, auth, idempotencyKey) {
    const replay = await replayOrConflict<Record<string, never>>(auth.subject, "admin.player.status", idempotencyKey, input);
    if (replay) return;
    const account = await db.select().from(playerAccounts).where(eq(playerAccounts.id, input.playerAccountId)).get();
    if (!account) throw new Error("PLAYER_NOT_FOUND");
    const timestamp = now();
    await db.update(playerAccounts).set({ status: input.status, bannedAt: input.status === "banned" ? timestamp : null, bannedBy: input.status === "banned" ? auth.subject : null, banReason: input.status === "banned" ? input.reason ?? null : null, updatedAt: timestamp }).where(eq(playerAccounts.id, input.playerAccountId));
    if (input.status === "banned") {
      await db.delete(portalSessions).where(eq(portalSessions.playerAccountId, input.playerAccountId));
    }
    await recordIdempotency(auth.subject, "admin.player.status", idempotencyKey, input, {});
    await recordAudit(auth, `admin.player.${input.status}`, "player_account", input.playerAccountId, { status: input.status, reason: input.reason ?? null });
  },

  async updateAdminPlayerIdentity(input, auth, idempotencyKey) {
    const replay = await replayOrConflict<Record<string, never>>(auth.subject, "admin.player.identity", idempotencyKey, input);
    if (replay) return;
    const account = await db.select().from(playerAccounts).where(eq(playerAccounts.id, input.playerAccountId)).get();
    if (!account) throw new Error("PLAYER_NOT_FOUND");
    const playerName = input.playerName.trim();
    const normalizedPlayerName = normalizePlayerName(playerName);
    const conflict = await db.select({ id: playerAccounts.id }).from(playerAccounts).where(and(eq(playerAccounts.normalizedPlayerName, normalizedPlayerName), eq(playerAccounts.playerId, account.playerId), ne(playerAccounts.id, account.id))).get();
    if (conflict) throw new Error("PLAYER_BATTLETAG_CONFLICT");
    const timestamp = now();
    await db.update(playerAccounts).set({ playerName, normalizedPlayerName, updatedAt: timestamp }).where(eq(playerAccounts.id, input.playerAccountId));
    await recordIdempotency(auth.subject, "admin.player.identity", idempotencyKey, input, {});
    await recordAudit(auth, "admin.player.identity.update", "player_account", input.playerAccountId, { previousPlayerName: account.playerName, playerName, playerId: account.playerId });
  },

  async removeAdminBinding(input, auth, idempotencyKey) {
    const replay = await replayOrConflict<Record<string, never>>(auth.subject, "admin.binding.remove", idempotencyKey, input);
    if (replay) return;
    const binding = await db.select().from(bindings).where(eq(bindings.id, input.bindingId)).get();
    if (!binding) throw new Error("BINDING_NOT_FOUND");
    await db.update(bindings).set({ status: "revoked", revokedAt: now(), revokedBy: auth.subject }).where(eq(bindings.id, input.bindingId));
    await recordIdempotency(auth.subject, "admin.binding.remove", idempotencyKey, input, {});
    await recordAudit(auth, "admin.binding.remove", "binding", input.bindingId, { playerAccountId: binding.playerAccountId });
  },
});
