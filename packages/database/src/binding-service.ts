import { and, desc, eq, inArray, isNull, lte, or } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";
import type { AuthContext, PlatformServices } from "@owbastion/domain";
import { createHistoricalTitleMigrationService } from "./historical-title-migration-service";
import {
  auditEvents,
  bindingClaims,
  bindingInvites,
  bindingInviteHistoricalTitleGrants,
  bindings,
  historicalTitleGrants,
  identities,
  idempotencyKeys,
  playerAccounts,
  playerTitleGrants,
  portalSessions,
  qqGroupAccess,
} from "./schema";

type BindingServices = Pick<PlatformServices,
  | "createAdminBindingInvite"
  | "createAdminBindingInviteBatch"
  | "listAdminBindingInvites"
  | "retryHistoricalTitleMigration"
  | "getAdminBindingInviteCode"
  | "listAdminBindings"
  | "revokeAdminBindingInvite"
  | "redeemBindingInvite"
  | "getBindingClaimStatus"
  | "exchangeBindingClaimSession"
  | "verifyBindingClaim"
  | "listAdminBindingClaims"
  | "decideAdminBindingClaim"
>;

type HistoricalMigrationItem = { status: string };
const summarizeHistoricalMigration = (rows: HistoricalMigrationItem[], invite: { revokedAt: number | null; expiresAt: number }, claimStatus: string | undefined, timestamp: number, completedLegacyRedemption = false) => {
  const completedCount = rows.filter((row) => row.status === "created" || row.status === "reused").length;
  const conflictCount = rows.filter((row) => row.status === "conflict").length;
  const retryCount = rows.filter((row) => row.status === "retry_required").length;
  let status: "not_requested" | "authorized" | "completed" | "partial" | "retry_required" | "cancelled" = "not_requested";
  if (rows.length > 0) {
    const cancelled = Boolean(invite.revokedAt) || (!completedLegacyRedemption && claimStatus !== "approved" && (invite.expiresAt <= timestamp || ["rejected", "expired"].includes(claimStatus ?? "")));
    if (cancelled) status = "cancelled";
    else if (retryCount > 0) status = "retry_required";
    else if (completedCount === rows.length) status = "completed";
    else if (conflictCount > 0 || completedCount > 0) status = "partial";
    else status = "authorized";
  }
  return { status, requestedCount: rows.length, completedCount, conflictCount, retryCount };
};

const toPublicHistoricalMigration = (summary: ReturnType<typeof summarizeHistoricalMigration>) => ({
  status: summary.status === "authorized" ? "pending" as const : summary.status,
  requestedCount: summary.requestedCount,
  restoredCount: summary.completedCount,
});
const bindingClaimTtlMs = 10 * 60 * 1000;
const bindingClaimSessionBootstrapTtlMs = 5 * 60 * 1000;
const inviteTtlMs = 7 * 24 * 60 * 60 * 1000;

type BindingServicesDependencies = {
  database: D1Database;
  db: ReturnType<typeof drizzle>;
  now: () => number;
  hashRequest: (value: unknown) => Promise<string>;
  randomToken: (bytes?: number) => string;
  randomCode: (length: number) => string;
  replayOrConflict: <T>(actorId: string, operation: string, key: string, input: unknown) => Promise<T | null>;
  recordIdempotency: (actorId: string, operation: string, key: string, input: unknown, response: unknown) => Promise<void>;
  recordAudit: (auth: AuthContext, operation: string, entityType: string, entityId: string, payload: unknown) => Promise<void>;
  normalizePlayerName: (name: string) => string;
  encryptBindingInviteCode: (code: string, secret?: string) => Promise<string>;
  decryptBindingInviteCode: (value: string, secret?: string) => Promise<string>;
  bindingInviteCodeEncryptionKey?: string;
  sessionTtlMs: number;
  pruneExpiredPortalSessions: (timestamp: number) => Promise<void>;
  pruneExpiredBindingClaims: (timestamp: number) => Promise<void>;
};

export const createBindingServices = (dependencies: BindingServicesDependencies): BindingServices => {
  const {
    database,
    db,
    now,
    hashRequest,
    randomToken,
    randomCode,
    replayOrConflict,
    recordIdempotency,
    recordAudit,
    normalizePlayerName,
    encryptBindingInviteCode,
    decryptBindingInviteCode,
    bindingInviteCodeEncryptionKey,
    sessionTtlMs,
    pruneExpiredPortalSessions,
    pruneExpiredBindingClaims,
  } = dependencies;

  const migrateAuthorizedHistoricalTitles = createHistoricalTitleMigrationService({ database, db, now, recordAudit });

  return {
    async createAdminBindingInvite(input, auth, idempotencyKey) {
      const replay = await replayOrConflict<ReturnType<PlatformServices["createAdminBindingInvite"]> extends Promise<infer T> ? T : never>(auth.subject, "admin.binding_invite.create", idempotencyKey, input);
      if (replay) return replay;
      const historicalIds = input.historicalTitleGrantIds ?? [];
      const historicalRows = historicalIds.length ? await db.select({ id: historicalTitleGrants.id, grantId: playerTitleGrants.id }).from(historicalTitleGrants).leftJoin(playerTitleGrants, and(eq(playerTitleGrants.sourceType, "historical"), eq(playerTitleGrants.sourceId, historicalTitleGrants.id), eq(playerTitleGrants.titleKey, historicalTitleGrants.titleKey))).where(inArray(historicalTitleGrants.id, historicalIds)) : [];
      if (historicalRows.length !== historicalIds.length || historicalRows.some((row) => row.grantId)) throw new Error("HISTORICAL_TITLE_GRANT_NOT_AVAILABLE");
      const timestamp = now(); const code = randomCode(12); const inviteId = crypto.randomUUID();
      const response = { contractVersion: "1" as const, inviteId, code, playerName: input.playerName, playerId: input.playerId, expiresAt: timestamp + inviteTtlMs, historicalMigration: { status: historicalIds.length ? "authorized" as const : "not_requested" as const, requestedCount: historicalIds.length, completedCount: 0, conflictCount: 0, retryCount: 0 } };
      await db.batch([
        db.insert(bindingInvites).values({ id: inviteId, codeHash: await hashRequest(code), codeCiphertext: await encryptBindingInviteCode(code, bindingInviteCodeEncryptionKey), playerName: input.playerName, normalizedPlayerName: normalizePlayerName(input.playerName), playerId: input.playerId, createdBy: auth.subject, createdAt: timestamp, expiresAt: response.expiresAt }),
        ...historicalIds.map((historicalTitleGrantId) => db.insert(bindingInviteHistoricalTitleGrants).values({ id: crypto.randomUUID(), inviteId, historicalTitleGrantId, authorizedBy: auth.subject, status: "authorized", createdAt: timestamp })),
        db.insert(idempotencyKeys).values({ id: `${auth.subject}:admin.binding_invite.create:${idempotencyKey}`, actorId: auth.subject, operation: "admin.binding_invite.create", requestHash: await hashRequest(input), responseJson: JSON.stringify(response), createdAt: timestamp }),
        db.insert(auditEvents).values({ id: crypto.randomUUID(), correlationId: crypto.randomUUID(), actorType: auth.actorType, actorId: auth.subject, operation: "admin.binding_invite.create", entityType: "binding_invite", entityId: inviteId, payloadJson: JSON.stringify({ playerId: input.playerId, historicalTitleGrantIds: historicalIds, historicalTitleGrantCount: historicalIds.length }), createdAt: timestamp }),
      ] as [any, ...any[]]);
      return response;
    },

    async createAdminBindingInviteBatch(input, auth, idempotencyKey) {
      const operation = "admin.binding_invite.batch_create";
      const replay = await replayOrConflict<ReturnType<PlatformServices["createAdminBindingInviteBatch"]> extends Promise<infer T> ? T : never>(auth.subject, operation, idempotencyKey, input);
      if (replay) return replay;
      const timestamp = now();
      const codes = new Set<string>();
      while (codes.size < input.invitations.length) codes.add(randomCode(12));
      const prepared = await Promise.all(input.invitations.map(async (invitation, index) => {
        const code = [...codes][index]!;
        const inviteId = crypto.randomUUID();
        const historicalIds = invitation.historicalTitleGrantIds ?? [];
        const historicalRows = historicalIds.length ? await db.select({ id: historicalTitleGrants.id, grantId: playerTitleGrants.id }).from(historicalTitleGrants).leftJoin(playerTitleGrants, and(eq(playerTitleGrants.sourceType, "historical"), eq(playerTitleGrants.sourceId, historicalTitleGrants.id), eq(playerTitleGrants.titleKey, historicalTitleGrants.titleKey))).where(inArray(historicalTitleGrants.id, historicalIds)) : [];
        if (historicalRows.length !== historicalIds.length || historicalRows.some((row) => row.grantId)) throw new Error("HISTORICAL_TITLE_GRANT_NOT_AVAILABLE");
        return {
          invite: { id: inviteId, codeHash: await hashRequest(code), codeCiphertext: await encryptBindingInviteCode(code, bindingInviteCodeEncryptionKey), playerName: invitation.playerName, normalizedPlayerName: normalizePlayerName(invitation.playerName), playerId: invitation.playerId, createdBy: auth.subject, createdAt: timestamp, expiresAt: timestamp + inviteTtlMs },
          historicalIds,
          response: { contractVersion: "1" as const, inviteId, code, playerName: invitation.playerName, playerId: invitation.playerId, expiresAt: timestamp + inviteTtlMs, historicalMigration: { status: historicalIds.length ? "authorized" as const : "not_requested" as const, requestedCount: historicalIds.length, completedCount: 0, conflictCount: 0, retryCount: 0 } },
        };
      }));
      const response = { contractVersion: "1" as const, items: prepared.map(({ response }) => response) };
      await db.batch([
        ...prepared.map(({ invite }) => db.insert(bindingInvites).values(invite)),
        ...prepared.flatMap(({ invite, historicalIds }) => historicalIds.map((historicalTitleGrantId) => db.insert(bindingInviteHistoricalTitleGrants).values({ id: crypto.randomUUID(), inviteId: invite.id, historicalTitleGrantId, authorizedBy: auth.subject, status: "authorized", createdAt: timestamp }))),
        db.insert(idempotencyKeys).values({ id: `${auth.subject}:${operation}:${idempotencyKey}`, actorId: auth.subject, operation, requestHash: await hashRequest(input), responseJson: JSON.stringify(response), createdAt: timestamp }),
        ...prepared.map(({ response: invite, historicalIds }) => db.insert(auditEvents).values({ id: crypto.randomUUID(), correlationId: crypto.randomUUID(), actorType: auth.actorType, actorId: auth.subject, operation, entityType: "binding_invite", entityId: invite.inviteId, payloadJson: JSON.stringify({ playerId: invite.playerId, historicalTitleGrantIds: historicalIds, historicalTitleGrantCount: historicalIds.length }), createdAt: timestamp })),
      ] as [any, ...any[]]);
      return response;
    },

    async listAdminBindingInvites() {
      const timestamp = now();
      const rows = await db.select().from(bindingInvites).orderBy(desc(bindingInvites.createdAt)).limit(100);
      const migrationRows = await db.select().from(bindingInviteHistoricalTitleGrants);
      const claims = await db.select({ inviteId: bindingClaims.inviteId, status: bindingClaims.status }).from(bindingClaims);
      return {
        contractVersion: "1" as const,
        items: rows.map((invite) => {
          const claim = claims.find((candidate) => candidate.inviteId === invite.id);
          return {
            inviteId: invite.id,
            playerName: invite.playerName,
            playerId: invite.playerId,
            status: (invite.revokedAt ? "revoked" : invite.redeemedAt ? "redeemed" : invite.expiresAt <= timestamp ? "expired" : "active") as "active" | "redeemed" | "expired" | "revoked",
            codeAvailable: Boolean(invite.codeCiphertext),
            createdAt: invite.createdAt,
            expiresAt: invite.expiresAt,
            ...(invite.redeemedAt ? { redeemedAt: invite.redeemedAt } : {}),
            historicalMigration: summarizeHistoricalMigration(migrationRows.filter((row) => row.inviteId === invite.id), invite, claim?.status, timestamp, Boolean(invite.redeemedAt && !claim)),
          };
        }),
      };
    },

    async retryHistoricalTitleMigration(input, auth, idempotencyKey) {
      const operation = "admin.binding_invite.historical_migration.retry";
      const replay = await replayOrConflict(auth.subject, operation, idempotencyKey, input);
      if (replay) return;
      const invite = await db.select().from(bindingInvites).where(eq(bindingInvites.id, input.inviteId)).get();
      const claims = await db.select().from(bindingClaims).where(eq(bindingClaims.inviteId, input.inviteId)).orderBy(desc(bindingClaims.createdAt));
      const claim = claims.find((item) => item.status === "approved");
      if (!invite || invite.revokedAt) throw new Error("HISTORICAL_MIGRATION_NOT_READY");
      const invitedAccount = await db.select().from(playerAccounts).where(and(eq(playerAccounts.normalizedPlayerName, invite.normalizedPlayerName), eq(playerAccounts.playerId, invite.playerId), eq(playerAccounts.status, "active"))).get();
      if (claim) {
        if (!claim.memberOpenId || !claim.groupOpenId || !invitedAccount) throw new Error("HISTORICAL_MIGRATION_NOT_READY");
        const binding = await db.select().from(bindings).where(and(eq(bindings.provider, "qq"), eq(bindings.groupOpenId, claim.groupOpenId), eq(bindings.memberOpenId, claim.memberOpenId), eq(bindings.playerAccountId, invitedAccount.id), eq(bindings.status, "active"))).get();
        if (!binding) throw new Error("HISTORICAL_MIGRATION_NOT_READY");
        await migrateAuthorizedHistoricalTitles({ inviteId: invite.id, playerAccountId: invitedAccount.id, claimId: claim.id, auth, mode: "retry" });
        await recordIdempotency(auth.subject, operation, idempotencyKey, input, {});
        await recordAudit(auth, operation, "binding_invite", invite.id, { claimId: claim.id, playerAccountId: invitedAccount.id });
        return;
      }
      const legacyRedemption = claims.length === 0 && invite.redeemedAt
        ? invite.legacyPasskeyPlayerAccountId
          ? await db.select().from(playerAccounts).where(and(eq(playerAccounts.id, invite.legacyPasskeyPlayerAccountId), eq(playerAccounts.playerId, invite.playerId), eq(playerAccounts.status, "active"))).get()
          : invitedAccount
        : null;
      const activeBinding = legacyRedemption
        ? await db.select().from(bindings).where(and(eq(bindings.provider, "qq"), eq(bindings.playerAccountId, legacyRedemption.id), eq(bindings.status, "active"))).get()
        : null;
      if (!legacyRedemption || !activeBinding) throw new Error("HISTORICAL_MIGRATION_NOT_READY");
      const grantSource = `binding:${activeBinding.id}`;
      await migrateAuthorizedHistoricalTitles({ inviteId: invite.id, playerAccountId: legacyRedemption.id, grantSource, auth, mode: "retry" });
      await recordIdempotency(auth.subject, operation, idempotencyKey, input, {});
      await recordAudit(auth, operation, "binding_invite", invite.id, { playerAccountId: legacyRedemption.id, bindingId: activeBinding.id, grantSource, ...(invite.legacyPasskeyChallengeId ? { legacyPasskeyChallengeId: invite.legacyPasskeyChallengeId } : {}) });
    },

    async getAdminBindingInviteCode(input, auth) {
      const invite = await db.select().from(bindingInvites).where(eq(bindingInvites.id, input.inviteId)).get();
      if (!invite || !invite.codeCiphertext || invite.revokedAt || invite.redeemedAt || invite.expiresAt <= now()) throw new Error("BINDING_INVITE_CODE_UNAVAILABLE");
      const code = await decryptBindingInviteCode(invite.codeCiphertext, bindingInviteCodeEncryptionKey);
      await recordAudit(auth, "admin.binding_invite.reveal", "binding_invite", invite.id, {});
      return { contractVersion: "1" as const, inviteId: invite.id, code };
    },

    async listAdminBindings() {
      const rows = await db.select({ binding: bindings, account: playerAccounts })
        .from(bindings)
        .innerJoin(playerAccounts, eq(bindings.playerAccountId, playerAccounts.id))
        .where(eq(bindings.status, "active"))
        .orderBy(desc(bindings.createdAt));
      return {
        contractVersion: "1" as const,
        items: rows.map(({ binding, account }) => ({ bindingId: binding.id, playerName: account.playerName, playerId: account.playerId, groupOpenId: binding.groupOpenId, memberOpenId: binding.memberOpenId, createdAt: binding.createdAt })),
      };
    },

    async revokeAdminBindingInvite(input, auth, idempotencyKey) {
      const operation = "admin.binding_invite.revoke";
      const replay = await replayOrConflict(auth.subject, operation, idempotencyKey, input);
      if (replay) return;
      const invite = await db.select().from(bindingInvites).where(eq(bindingInvites.id, input.inviteId)).get();
      if (!invite || invite.revokedAt || invite.redeemedAt || invite.expiresAt <= now()) throw new Error("BINDING_INVITE_NOT_REVOCABLE");
      const timestamp = now();
      await db.update(bindingInvites).set({ revokedAt: timestamp, revokedBy: auth.subject }).where(eq(bindingInvites.id, invite.id));
      await recordIdempotency(auth.subject, operation, idempotencyKey, input, {});
      await recordAudit(auth, operation, "binding_invite", invite.id, { reason: input.reason ?? null });
    },

    async redeemBindingInvite(input) {
      const invite = await db.select().from(bindingInvites).where(eq(bindingInvites.codeHash, await hashRequest(input.code))).get();
      if (!invite || invite.expiresAt <= now() || invite.redeemedAt || invite.revokedAt) throw new Error("INVITE_INVALID");
      const timestamp = now();
      await pruneExpiredBindingClaims(timestamp);
      const pending = await db.select().from(bindingClaims).where(and(eq(bindingClaims.inviteId, invite.id), eq(bindingClaims.status, "pending_confirmation"))).get();
      if (pending) throw new Error("INVITE_INVALID");
      const claimId = crypto.randomUUID(); const claimToken = randomToken(); const code = randomCode(6);
      const insertStmt = db.insert(bindingClaims).values({ id: claimId, inviteId: invite.id, tokenHash: await hashRequest(claimToken), codeHash: await hashRequest(code), playerName: invite.playerName, normalizedPlayerName: invite.normalizedPlayerName, playerId: invite.playerId, status: "pending_confirmation", expiresAt: timestamp + bindingClaimTtlMs, createdAt: timestamp });
      try {
        await db.batch([insertStmt]);
      } catch {
        throw new Error("INVITE_INVALID");
      }
      return { contractVersion: "1" as const, claimId, claimToken, code, playerName: invite.playerName, playerId: invite.playerId, expiresAt: timestamp + bindingClaimTtlMs };
    },

    async getBindingClaimStatus(input) {
      const claim = await db.select().from(bindingClaims).where(eq(bindingClaims.id, input.claimId)).get();
      if (!claim) throw new Error("BINDING_CLAIM_NOT_FOUND");
      if (claim.tokenHash !== await hashRequest(input.claimToken)) throw new Error("BINDING_CLAIM_FORBIDDEN");
      const invite = await db.select().from(bindingInvites).where(eq(bindingInvites.id, claim.inviteId)).get();
      const migration = invite ? toPublicHistoricalMigration(summarizeHistoricalMigration(await db.select().from(bindingInviteHistoricalTitleGrants).where(eq(bindingInviteHistoricalTitleGrants.inviteId, invite.id)), invite, claim.status, now())) : { status: "not_requested" as const, requestedCount: 0, restoredCount: 0 };
      if (claim.status === "pending_confirmation" && claim.expiresAt <= now()) {
        await db.update(bindingClaims).set({ status: "expired" }).where(eq(bindingClaims.id, claim.id));
        return { contractVersion: "1" as const, status: "expired" as const, expiresAt: claim.expiresAt, historicalMigration: { ...migration, status: "cancelled" as const } };
      }
      return { contractVersion: "1" as const, status: claim.status as "pending_confirmation" | "pending_review" | "approved" | "rejected" | "expired", expiresAt: claim.expiresAt, historicalMigration: claim.status === "rejected" || claim.status === "expired" ? { ...migration, status: "cancelled" as const } : migration };
    },

    async exchangeBindingClaimSession(input) {
      const claim = await db.select().from(bindingClaims).where(eq(bindingClaims.id, input.claimId)).get();
      if (!claim) throw new Error("BINDING_CLAIM_NOT_FOUND");
      if (claim.tokenHash !== await hashRequest(input.claimToken)) throw new Error("BINDING_CLAIM_FORBIDDEN");
      const timestamp = now();
      if (claim.status !== "approved" || !claim.memberOpenId || !claim.groupOpenId || claim.decidedAt === null || claim.decidedAt + bindingClaimSessionBootstrapTtlMs <= timestamp) throw new Error("BINDING_CLAIM_NOT_COMPLETE");
      const account = await db.select().from(playerAccounts).where(and(eq(playerAccounts.normalizedPlayerName, claim.normalizedPlayerName), eq(playerAccounts.playerId, claim.playerId), eq(playerAccounts.status, "active"))).get();
      if (!account) throw new Error("BINDING_CLAIM_NOT_COMPLETE");
      const binding = await db.select().from(bindings).where(and(eq(bindings.provider, "qq"), eq(bindings.groupOpenId, claim.groupOpenId), eq(bindings.memberOpenId, claim.memberOpenId), eq(bindings.playerAccountId, account.id), eq(bindings.status, "active"))).get();
      if (!binding) throw new Error("BINDING_CLAIM_NOT_COMPLETE");
      const sessionToken = await hashRequest({ purpose: "binding-claim-session", claimToken: input.claimToken });
      const sessionId = `binding-claim:${claim.id}`;
      await pruneExpiredPortalSessions(timestamp);
      await db.insert(portalSessions).values({ id: sessionId, playerAccountId: account.id, tokenHash: await hashRequest(sessionToken), passkeyChallengeId: null, expiresAt: timestamp + sessionTtlMs, createdAt: timestamp }).onConflictDoNothing();
      const existing = await db.select().from(portalSessions).where(eq(portalSessions.id, sessionId)).get();
      if (!existing || existing.playerAccountId !== account.id || existing.tokenHash !== await hashRequest(sessionToken)) throw new Error("BINDING_CLAIM_NOT_COMPLETE");
      if (existing.expiresAt <= timestamp) {
        await db.update(portalSessions).set({ expiresAt: timestamp + sessionTtlMs }).where(eq(portalSessions.id, sessionId));
      }
      return { contractVersion: "1" as const, status: "authenticated" as const, sessionToken };
    },

    async verifyBindingClaim(input, auth, idempotencyKey) {
      const replay = await replayOrConflict<ReturnType<PlatformServices["verifyBindingClaim"]> extends Promise<infer T> ? T : never>(auth.subject, "qq.binding_claim.verify", idempotencyKey, input); if (replay) return replay;
      const claim = await db.select().from(bindingClaims).where(eq(bindingClaims.codeHash, await hashRequest(input.code))).get();
      if (!claim) throw new Error("BINDING_CLAIM_CODE_INVALID");
      const response = { contractVersion: "1" as const, status: "verified" as const, environment: "test" as const };
      if (claim.status !== "pending_confirmation") {
        if (["pending_review", "approved"].includes(claim.status) && claim.memberOpenId === input.memberOpenId && claim.groupOpenId === input.groupOpenId) return response;
        throw new Error("BINDING_CLAIM_CODE_INVALID");
      }
      if (claim.expiresAt <= now()) {
        await db.update(bindingClaims).set({ status: "expired" }).where(eq(bindingClaims.id, claim.id));
        throw new Error("BINDING_CLAIM_CODE_INVALID");
      }
      const group = await db.select().from(qqGroupAccess).where(and(eq(qqGroupAccess.groupOpenId, input.groupOpenId), eq(qqGroupAccess.status, "active"), eq(qqGroupAccess.verifyEnabled, 1))).get();
      if (!group) throw new Error("LOGIN_GROUP_NOT_ALLOWED");
      const invite = await db.select().from(bindingInvites).where(eq(bindingInvites.id, claim.inviteId)).get();
      if (!invite || invite.redeemedAt || invite.revokedAt || invite.expiresAt <= now()) throw new Error("INVITE_INVALID");
      const timestamp = now();
      const verifiedResponse = { ...response, environment: group.environment as "production" | "test" };

      const idempotencyStatement = db.insert(idempotencyKeys).values({
        id: `${auth.subject}:qq.binding_claim.verify:${idempotencyKey}`,
        actorId: auth.subject,
        operation: "qq.binding_claim.verify",
        requestHash: await hashRequest(input),
        responseJson: JSON.stringify(verifiedResponse),
        createdAt: timestamp,
      });

      const auditStatement = db.insert(auditEvents).values({
        id: crypto.randomUUID(),
        correlationId: crypto.randomUUID(),
        actorType: auth.actorType,
        actorId: auth.subject,
        operation: "qq.binding_claim.verify",
        entityType: "binding_claim",
        entityId: claim.id,
        payloadJson: JSON.stringify({ inviteId: invite.id, groupOpenId: input.groupOpenId, memberOpenId: input.memberOpenId }),
        createdAt: timestamp,
      });

      const account = await db.select().from(playerAccounts).where(and(eq(playerAccounts.normalizedPlayerName, claim.normalizedPlayerName), eq(playerAccounts.playerId, claim.playerId))).get();
      if (account && account.status !== "active") throw new Error("PLAYER_BANNED");
      const targetBinding = account ? await db.select().from(bindings).where(and(eq(bindings.playerAccountId, account.id), eq(bindings.status, "active"))).get() : null;
      const memberBindings = await db.select().from(bindings).where(and(eq(bindings.provider, "qq"), eq(bindings.memberOpenId, input.memberOpenId), eq(bindings.status, "active")));
      const cleanFirstBinding = !targetBinding && memberBindings.length === 0;

      if (cleanFirstBinding) {
        const playerAccount = account ?? { id: crypto.randomUUID(), playerId: claim.playerId, playerName: claim.playerName, normalizedPlayerName: claim.normalizedPlayerName, isAdmin: 0, status: "active" as const, bannedAt: null, bannedBy: null, banReason: null, createdAt: timestamp, updatedAt: timestamp };
        const identityId = crypto.randomUUID();
        const bindingId = crypto.randomUUID();
        const statements: [any, ...any[]] = [
          db.update(bindingClaims).set({ status: "approved", memberOpenId: input.memberOpenId, groupOpenId: input.groupOpenId, messageId: input.messageId, verifiedAt: timestamp, decidedAt: timestamp, decidedBy: auth.subject }).where(and(eq(bindingClaims.id, claim.id), eq(bindingClaims.status, "pending_confirmation"))),
          db.update(bindingInvites).set({ redeemedAt: timestamp }).where(and(eq(bindingInvites.id, invite.id), isNull(bindingInvites.redeemedAt))),
          db.insert(identities).values({ id: identityId, createdAt: timestamp, updatedAt: timestamp }),
          db.insert(bindings).values({ id: bindingId, identityId, playerAccountId: playerAccount.id, provider: "qq", groupOpenId: input.groupOpenId, memberOpenId: input.memberOpenId, status: "active", createdAt: timestamp }),
          idempotencyStatement,
          db.insert(auditEvents).values({ id: crypto.randomUUID(), correlationId: crypto.randomUUID(), actorType: auth.actorType, actorId: auth.subject, operation: "qq.binding_claim.auto_activate", entityType: "binding_claim", entityId: claim.id, payloadJson: JSON.stringify({ inviteId: invite.id, playerAccountId: playerAccount.id, groupOpenId: input.groupOpenId, memberOpenId: input.memberOpenId, operationType: "initial_binding", bindingId }), createdAt: timestamp }),
        ];
        if (!account) statements.unshift(db.insert(playerAccounts).values(playerAccount));
        await db.batch(statements);
        await migrateAuthorizedHistoricalTitles({ inviteId: invite.id, playerAccountId: playerAccount.id, claimId: claim.id, auth, mode: "automatic" });
        return verifiedResponse;
      }

      await db.batch([
        db.update(bindingClaims).set({ status: "pending_review", memberOpenId: input.memberOpenId, groupOpenId: input.groupOpenId, messageId: input.messageId, verifiedAt: timestamp }).where(and(eq(bindingClaims.id, claim.id), eq(bindingClaims.status, "pending_confirmation"))),
        db.update(bindingInvites).set({ redeemedAt: timestamp }).where(and(eq(bindingInvites.id, invite.id), isNull(bindingInvites.redeemedAt))),
        idempotencyStatement,
        auditStatement,
      ]);

      return verifiedResponse;
    },

    async listAdminBindingClaims() {
      const timestamp = now();
      const rows = await db.select({ claim: bindingClaims, invite: bindingInvites, account: playerAccounts }).from(bindingClaims).innerJoin(bindingInvites, eq(bindingClaims.inviteId, bindingInvites.id)).leftJoin(playerAccounts, and(eq(playerAccounts.normalizedPlayerName, bindingClaims.normalizedPlayerName), eq(playerAccounts.playerId, bindingClaims.playerId))).orderBy(desc(bindingClaims.createdAt));
      const expiredIds = rows.filter(({ claim }) => claim.status === "pending_confirmation" && claim.expiresAt <= timestamp).map(({ claim }) => claim.id);
      if (expiredIds.length > 0) {
        await db.update(bindingClaims).set({ status: "expired" }).where(and(eq(bindingClaims.status, "pending_confirmation"), lte(bindingClaims.expiresAt, timestamp)));
      }

      const activeBindings = await db
        .select({ binding: bindings, account: playerAccounts })
        .from(bindings)
        .leftJoin(playerAccounts, eq(bindings.playerAccountId, playerAccounts.id))
        .where(eq(bindings.status, "active"));

      const items = rows.map(({ claim, invite, account }) => {
        const status = (claim.status === "pending_confirmation" && claim.expiresAt <= timestamp ? "expired" : claim.status) as "pending_confirmation" | "pending_review" | "approved" | "rejected" | "expired";

        const targetBindingRow = account ? activeBindings.find((b) => b.binding.playerAccountId === account.id) : undefined;
        const targetAccountBinding = targetBindingRow
          ? { bindingId: targetBindingRow.binding.id, memberOpenId: targetBindingRow.binding.memberOpenId, ...(targetBindingRow.binding.groupOpenId ? { groupOpenId: targetBindingRow.binding.groupOpenId } : {}) }
          : undefined;

        const qqBindingRows = claim.memberOpenId ? activeBindings.filter((b) => b.binding.memberOpenId === claim.memberOpenId) : [];
        const qqBoundAccounts = qqBindingRows
          .filter((b): b is typeof b & { account: NonNullable<typeof b.account> } => b.account !== null)
          .map((b) => ({ playerAccountId: b.account.id, playerName: b.account.playerName, playerId: b.account.playerId }));

        const revokingBindingMap = new Map<string, typeof activeBindings[number]>();
        if (targetBindingRow) {
          revokingBindingMap.set(targetBindingRow.binding.id, targetBindingRow);
        }
        for (const b of qqBindingRows) {
          revokingBindingMap.set(b.binding.id, b);
        }
        const revokingBindings = Array.from(revokingBindingMap.values());
        const revokingBindingCount = revokingBindings.length;

        const hasTargetBinding = Boolean(targetAccountBinding && targetAccountBinding.memberOpenId !== claim.memberOpenId);
        const hasQqBinding = Boolean(claim.memberOpenId && qqBoundAccounts.some((acc) => acc.playerAccountId !== account?.id));

        let operationType: "initial_binding" | "rebind_account" | "qq_transfer" | "conflict" = "initial_binding";
        if (hasTargetBinding && hasQqBinding) {
          operationType = "conflict";
        } else if (hasTargetBinding) {
          operationType = "rebind_account";
        } else if (hasQqBinding) {
          operationType = "qq_transfer";
        }

        return {
          claimId: claim.id,
          playerName: claim.playerName,
          playerId: claim.playerId,
          status,
          createdAt: claim.createdAt,
          ...(claim.memberOpenId ? { memberOpenId: claim.memberOpenId } : {}),
          ...(claim.groupOpenId ? { groupOpenId: claim.groupOpenId } : {}),
          invitedBy: invite.createdBy,
          ...(account ? { affectedPlayerAccountId: account.id } : {}),
          ...(targetAccountBinding ? { targetAccountBinding } : {}),
          ...(qqBoundAccounts.length > 0 ? { qqBoundAccounts } : {}),
          revokingBindingCount,
          operationType,
        };
      });

      return { contractVersion: "1" as const, items };
    },

    async decideAdminBindingClaim(input, auth, idempotencyKey) {
      const replay = await replayOrConflict(auth.subject, "admin.binding_claim.decide", idempotencyKey, input); if (replay) return;
      const claim = await db.select().from(bindingClaims).where(eq(bindingClaims.id, input.claimId)).get();
      if (!claim || claim.status !== "pending_review" || !claim.memberOpenId || !claim.groupOpenId) throw new Error("BINDING_CLAIM_NOT_REVIEWABLE");
      const invite = await db.select().from(bindingInvites).where(eq(bindingInvites.id, claim.inviteId)).get();
      if (!invite || invite.revokedAt || invite.expiresAt <= now()) throw new Error("BINDING_CLAIM_NOT_REVIEWABLE");
      const timestamp = now();
      const requestHash = await hashRequest(input);
      const idempotencyStatement = db.insert(idempotencyKeys).values({
        id: `${auth.subject}:admin.binding_claim.decide:${idempotencyKey}`,
        actorId: auth.subject,
        operation: "admin.binding_claim.decide",
        requestHash,
        responseJson: JSON.stringify({}),
        createdAt: timestamp,
      });
      const auditStatement = db.insert(auditEvents).values({
        id: crypto.randomUUID(),
        correlationId: crypto.randomUUID(),
        actorType: auth.actorType,
        actorId: auth.subject,
        operation: `admin.binding_claim.${input.decision}`,
        entityType: "binding_claim",
        entityId: claim.id,
        payloadJson: JSON.stringify({ reason: input.reason ?? null }),
        createdAt: timestamp,
      });

      if (input.decision === "rejected") {
        await db.batch([
          db.update(bindingClaims).set({ status: "rejected", decidedAt: timestamp, decidedBy: auth.subject, decisionReason: input.reason ?? null }).where(and(eq(bindingClaims.id, claim.id), eq(bindingClaims.status, "pending_review"))),
          idempotencyStatement,
          auditStatement,
        ]);
      } else {
        const existingAccount = await db.select().from(playerAccounts).where(and(eq(playerAccounts.normalizedPlayerName, claim.normalizedPlayerName), eq(playerAccounts.playerId, claim.playerId))).get();
        if (existingAccount && existingAccount.status !== "active") throw new Error("PLAYER_BANNED");
        const account = existingAccount ?? { id: crypto.randomUUID(), playerId: claim.playerId, playerName: claim.playerName, normalizedPlayerName: claim.normalizedPlayerName, isAdmin: 0, status: "active" as const, bannedAt: null, bannedBy: null, banReason: null, createdAt: timestamp, updatedAt: timestamp };
        const old = await db.select().from(bindings).where(and(eq(bindings.status, "active"), or(eq(bindings.playerAccountId, account.id), eq(bindings.memberOpenId, claim.memberOpenId))));
        const identityId = crypto.randomUUID();
        const bindingId = crypto.randomUUID();

        const statements: any[] = [
          ...(!existingAccount ? [db.insert(playerAccounts).values(account)] : []),
          db.update(bindingClaims).set({ status: "approved", decidedAt: timestamp, decidedBy: auth.subject, decisionReason: input.reason ?? null }).where(and(eq(bindingClaims.id, claim.id), eq(bindingClaims.status, "pending_review"))),
        ];

        if (old.length > 0) {
          statements.push(
            db.update(bindings).set({ status: "revoked", revokedAt: timestamp, revokedBy: auth.subject }).where(or(...old.map((binding) => eq(bindings.id, binding.id)))),
          );
        }

        statements.push(
          db.insert(identities).values({ id: identityId, createdAt: timestamp, updatedAt: timestamp }),
          db.insert(bindings).values({ id: bindingId, identityId, playerAccountId: account.id, provider: "qq", groupOpenId: claim.groupOpenId, memberOpenId: claim.memberOpenId, status: "active", createdAt: timestamp }),
          idempotencyStatement,
          auditStatement,
        );

        await db.batch(statements as [typeof statements[number], ...typeof statements]);
        await migrateAuthorizedHistoricalTitles({ inviteId: invite.id, playerAccountId: account.id, claimId: claim.id, auth, mode: "reviewed" });
      }
    }
  };
};
