import { and, desc, eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";
import { leaderboardPlayerKey, normalizePlayerInvitationCode, playerInvitationPeriodRange, validatePlayerInvitationCode } from "@owbastion/domain";
import type { AuthContext, PlatformServices } from "@owbastion/domain";
import type {
  AdminInvitationOverviewResponse,
  PlayerInvitation,
  PlayerInvitationClaimRejectionReason,
  PlayerInvitationClaimStatusResponse,
  PlayerInvitationOverride,
  PlayerInvitationPolicy,
  PlayerInvitationStateResponse,
} from "@owbastion/contracts/player-invitation";
import { createInvitationSupport, guardSql, isUniqueViolation, dayMs, type InvitationRow } from "./player-invitation-support";
import { hashRequest, resolvePortalSession } from "./portal-session";
import { playerInvitationClaims, playerInvitations } from "./player-invitation-schema";
import { playerAccounts } from "./schema";

export type PlayerInvitationServices = Pick<PlatformServices,
  | "getCurrentPlayerInvitations"
  | "listCurrentPlayerInvitationRedemptions"
  | "createCurrentPlayerInvitation"
  | "revokeCurrentPlayerInvitation"
  | "redeemPlayerInvitation"
>;

// The binding claim endpoints serve both invitation kinds; these two hooks are
// all `binding-service` needs from player invitations.
export type PlayerInvitationClaims = {
  confirmationCodeInUse: (codeHash: string) => Promise<boolean>;
  // Null when the claim is not a Player-code claim.
  status: (input: { claimId: string; claimToken: string }) => Promise<PlayerInvitationClaimStatusResponse | null>;
  verifyClaim: (
    input: { code: string; groupOpenId: string; memberOpenId: string; messageId: string },
    auth: AuthContext,
    idempotencyKey: string,
  ) => Promise<{ contractVersion: "1"; status: "verified"; environment: "production" | "test" } | null>;
};

type Dependencies = {
  database: D1Database;
  db: ReturnType<typeof drizzle>;
  now: () => number;
  replayOrConflict: <T>(actorId: string, operation: string, key: string, input: unknown) => Promise<T | null>;
  randomToken: (bytes?: number) => string;
  randomCode: (length: number) => string;
  normalizePlayerName: (name: string) => string;
  claimTtlMs: number;
};

// Expired claims stay this long before the next redemption deletes them.
const staleClaimRetentionMs = 24 * 60 * 60 * 1000;

export const createPlayerInvitationServices = (dependencies: Dependencies): { services: PlayerInvitationServices; claims: PlayerInvitationClaims } => {
  const { database, db, now, replayOrConflict, randomToken, randomCode, normalizePlayerName, claimTtlMs } = dependencies;
  const { batchStatements, audit, one, countOf, replayAfterRace, effectivePolicy, eligibilityOf, periodCounts, usedCount, toInvitation, itemPage } = createInvitationSupport(dependencies);
  const currentPlayer = async (sessionToken: string) => {
    const access = await resolvePortalSession(db, sessionToken);
    if (!access) throw new Error("UNAUTHENTICATED");
    return access.player;
  };

  // True while the inviter may admit another registration right now.
  const inviterBlocked = async (inviter: { id: string; status: string; createdAt: number }, timestamp: number) => {
    const policy = await effectivePolicy(inviter.id);
    if (!policy?.enabled) return true;
    if (!(await eligibilityOf(inviter, policy)).eligible) return true;
    return (await periodCounts(inviter.id, policy, timestamp)).registrations >= policy.maxRegistrationsPerPeriod;
  };

  // Identity checks shared by redemption and QQ verification. Names alone never
  // authorize anything; a historical-holder match only blocks self-registration.
  const registrationBlock = async (normalizedPlayerName: string, rawName: string, playerId: string): Promise<PlayerInvitationClaimRejectionReason | null> => {
    if (await one("SELECT 1 AS found FROM player_accounts WHERE normalized_player_name = ? AND player_id = ?", normalizedPlayerName, playerId)) return "account_exists";
    const legacy = await one(
      `SELECT 1 AS found FROM historical_title_grants hg
       WHERE (hg.holder_name = ? OR lower(trim(hg.holder_name)) = ?)
         AND NOT EXISTS (SELECT 1 FROM player_title_grants g WHERE g.source_type = 'historical' AND g.source_id = hg.id) LIMIT 1`,
      rawName.trim(), normalizedPlayerName,
    );
    if (legacy) return "legacy_candidate";
    const reserved = await one("SELECT 1 AS found FROM binding_invites WHERE normalized_player_name = ? AND player_id = ? AND redeemed_at IS NULL AND revoked_at IS NULL AND expires_at > ?", normalizedPlayerName, playerId, now());
    return reserved ? "legacy_candidate" : null;
  };

  // Why this invitation cannot admit a registration at this moment, or null.
  const invitationBlock = async (invitation: InvitationRow, timestamp: number): Promise<PlayerInvitationClaimRejectionReason | null> => {
    if (invitation.revokedAt !== null || invitation.expiresAt <= timestamp) return "invitation_unavailable";
    if (await usedCount(invitation.id) >= invitation.maxUses) return "code_exhausted";
    const inviter = await db.select().from(playerAccounts).where(eq(playerAccounts.id, invitation.inviterPlayerAccountId)).get();
    const policy = inviter ? await effectivePolicy(inviter.id) : null;
    if (!inviter || !policy?.enabled || !(await eligibilityOf(inviter, policy)).eligible) return "invitation_unavailable";
    return (await periodCounts(inviter.id, policy, timestamp)).registrations >= policy.maxRegistrationsPerPeriod ? "inviter_quota_exhausted" : null;
  };

  const claims: PlayerInvitationClaims = {
    confirmationCodeInUse: async (codeHash) => Boolean(await one("SELECT 1 AS found FROM player_invitation_claims WHERE code_hash = ?", codeHash)),

    async status(input) {
      const claim = await db.select().from(playerInvitationClaims).where(eq(playerInvitationClaims.id, input.claimId)).get();
      if (!claim) return null;
      if (claim.tokenHash !== await hashRequest(input.claimToken)) throw new Error("BINDING_CLAIM_FORBIDDEN");
      const expired = claim.status === "pending_confirmation" && claim.expiresAt <= now();
      if (expired) await db.update(playerInvitationClaims).set({ status: "expired" }).where(eq(playerInvitationClaims.id, claim.id));
      const status = expired ? "expired" : claim.status as PlayerInvitationClaimStatusResponse["status"];
      return {
        contractVersion: "1" as const, status, expiresAt: claim.expiresAt,
        historicalMigration: { status: "not_requested" as const, requestedCount: 0, restoredCount: 0 },
        ...(status === "rejected" && claim.rejectionReason ? { rejectionReason: claim.rejectionReason as PlayerInvitationClaimRejectionReason } : {}),
      };
    },

    async verifyClaim(input, auth, idempotencyKey) {
      const codeHash = await hashRequest(input.code);
      const claim = await db.select().from(playerInvitationClaims).where(eq(playerInvitationClaims.codeHash, codeHash)).get();
      if (!claim) return null;
      const response = { contractVersion: "1" as const, status: "verified" as const };
      if (claim.status !== "pending_confirmation") {
        if (claim.status === "approved" && claim.memberOpenId === input.memberOpenId && claim.groupOpenId === input.groupOpenId) {
          const group = await one<{ environment: "production" | "test" }>("SELECT environment FROM qq_group_access WHERE group_open_id = ?", input.groupOpenId);
          return { ...response, environment: group?.environment ?? "test" };
        }
        throw new Error("BINDING_CLAIM_CODE_INVALID");
      }
      const timestamp = now();
      if (claim.expiresAt <= timestamp) {
        await db.update(playerInvitationClaims).set({ status: "expired" }).where(eq(playerInvitationClaims.id, claim.id));
        throw new Error("BINDING_CLAIM_CODE_INVALID");
      }
      const group = await one<{ environment: "production" | "test" }>("SELECT environment FROM qq_group_access WHERE group_open_id = ? AND status = 'active' AND verify_enabled = 1", input.groupOpenId);
      if (!group) throw new Error("LOGIN_GROUP_NOT_ALLOWED");
      const invitation = await db.select().from(playerInvitations).where(eq(playerInvitations.id, claim.invitationId)).get();
      if (!invitation) throw new Error("BINDING_CLAIM_CODE_INVALID");

      const reject = async (reason: PlayerInvitationClaimRejectionReason): Promise<never> => {
        await db.update(playerInvitationClaims).set({ status: "rejected", rejectionReason: reason, decidedAt: now() })
          .where(and(eq(playerInvitationClaims.id, claim.id), eq(playerInvitationClaims.status, "pending_confirmation")));
        throw new Error("BINDING_CLAIM_CODE_INVALID");
      };
      const evaluate = async () =>
        (await invitationBlock(invitation, timestamp))
        ?? (await registrationBlock(claim.normalizedPlayerName, claim.playerName, claim.playerId))
        ?? (await one("SELECT 1 AS found FROM bindings WHERE provider = 'qq' AND member_open_id = ? AND status = 'active'", input.memberOpenId) ? "qq_conflict" as const : null);

      const blocked = await evaluate();
      if (blocked) return reject(blocked);

      const policy = (await effectivePolicy(invitation.inviterPlayerAccountId))!;
      const range = playerInvitationPeriodRange(policy.period, timestamp);
      const accountId = crypto.randomUUID();
      const accountCreated = guardSql("EXISTS (SELECT 1 FROM player_accounts WHERE id = ?)", accountId);
      const verified = { ...response, environment: group.environment };
      const operation = "qq.binding_claim.verify";
      // One atomic success boundary: the account insert carries every admission
      // check, and each following row exists only when that insert happened.
      const statements = [
        database.prepare(
          `INSERT INTO player_accounts (id, player_id, player_name, normalized_player_name, is_admin, status, leaderboard_key, created_at, updated_at)
           SELECT ?, ?, ?, ?, 0, 'active', ?, ?, ? WHERE
             EXISTS (SELECT 1 FROM player_invitation_claims WHERE id = ? AND status = 'pending_confirmation' AND expires_at > ?)
             AND EXISTS (SELECT 1 FROM player_invitations WHERE id = ? AND revoked_at IS NULL AND expires_at > ?)
             AND (SELECT count(*) FROM player_invitation_redemptions WHERE invitation_id = ?) < ?
             AND (SELECT count(*) FROM player_invitation_redemptions WHERE inviter_player_account_id = ? AND completed_at >= ? AND completed_at < ?) < ?`,
        ).bind(
          accountId, claim.playerId, claim.playerName, claim.normalizedPlayerName, await leaderboardPlayerKey(accountId), timestamp, timestamp,
          claim.id, timestamp, invitation.id, timestamp, invitation.id, invitation.maxUses, invitation.inviterPlayerAccountId, range.start, range.end, policy.maxRegistrationsPerPeriod,
        ),
        database.prepare("UPDATE player_invitation_claims SET status = 'approved', member_open_id = ?, group_open_id = ?, message_id = ?, verified_at = ?, decided_at = ? WHERE id = ? AND status = 'pending_confirmation' AND EXISTS (SELECT 1 FROM player_accounts WHERE id = ?)")
          .bind(input.memberOpenId, input.groupOpenId, input.messageId, timestamp, timestamp, claim.id, accountId),
        database.prepare("INSERT INTO identities (id, created_at, updated_at) SELECT ?, ?, ? WHERE EXISTS (SELECT 1 FROM player_accounts WHERE id = ?)").bind(accountId, timestamp, timestamp, accountId),
        database.prepare("INSERT INTO bindings (id, identity_id, player_account_id, provider, group_open_id, member_open_id, status, created_at) SELECT ?, ?, ?, 'qq', ?, ?, 'active', ? WHERE EXISTS (SELECT 1 FROM player_accounts WHERE id = ?)")
          .bind(crypto.randomUUID(), accountId, accountId, input.groupOpenId, input.memberOpenId, timestamp, accountId),
        database.prepare("INSERT INTO player_invitation_redemptions (id, invitation_id, inviter_player_account_id, invitee_player_account_id, completed_at) SELECT ?, ?, ?, ?, ? WHERE EXISTS (SELECT 1 FROM player_accounts WHERE id = ?)")
          .bind(crypto.randomUUID(), invitation.id, invitation.inviterPlayerAccountId, accountId, timestamp, accountId),
        await batchStatements.idempotency(auth.subject, operation, idempotencyKey, input, verified, timestamp, accountCreated),
        audit(auth.actorType, auth.subject, "player.invitation.redeem", invitation.id, { claimId: claim.id, inviterPlayerAccountId: invitation.inviterPlayerAccountId, inviteePlayerAccountId: accountId }, timestamp, accountCreated),
      ];
      try {
        await database.batch(statements as [D1PreparedStatement, ...D1PreparedStatement[]]);
      } catch (error) {
        // A concurrent registration or binding that the guard cannot see yields a unique violation.
        if (isUniqueViolation(error, "player_accounts.")) return reject("account_exists");
        if (isUniqueViolation(error, "bindings.")) return reject("qq_conflict");
        if (isUniqueViolation(error, "idempotency_keys.id")) {
          const replay = await replayOrConflict<typeof verified>(auth.subject, operation, idempotencyKey, input);
          if (replay) return replay;
        }
        throw error;
      }
      if (!(await one("SELECT 1 AS found FROM player_accounts WHERE id = ?", accountId))) {
        // The guard lost a race for the last slot; report the reason that now applies.
        return reject((await evaluate()) ?? "invitation_unavailable");
      }
      return verified;
    },
  };

  const services: PlayerInvitationServices = {
    async getCurrentPlayerInvitations(input) {
      const access = await resolvePortalSession(db, input.sessionToken);
      if (!access) return null;
      const player = access.player;
      const timestamp = now();
      const policy = await effectivePolicy(player.id);
      const { offset } = itemPage(input.page, input.pageSize);
      const rows = await db.select().from(playerInvitations).where(eq(playerInvitations.inviterPlayerAccountId, player.id))
        .orderBy(desc(playerInvitations.createdAt)).limit(input.pageSize).offset(offset).all();
      const total = await countOf("SELECT count(*) AS total FROM player_invitations WHERE inviter_player_account_id = ?", player.id);
      const blocked = await inviterBlocked(player, timestamp);
      const items = await Promise.all(rows.map(async (row) => toInvitation(row, await usedCount(row.id), blocked, timestamp)));
      const base = { contractVersion: "1" as const, items, page: input.page, pageSize: input.pageSize, total, hasMore: offset + items.length < total };
      if (!policy) return { ...base, policy: null, quota: null, eligibility: null, createBlockedReason: "disabled" };
      const eligibility = await eligibilityOf(player, policy);
      const counts = await periodCounts(player.id, policy, timestamp);
      const createBlockedReason: PlayerInvitationStateResponse["createBlockedReason"] = !policy.enabled ? "disabled"
        : !eligibility.eligible ? "ineligible"
        : counts.codesCreated >= policy.maxCodesCreatedPerPeriod ? "quota_exhausted" : null;
      return {
        ...base,
        policy: { period: policy.period, periodStart: counts.start, periodEnd: counts.end, maxUsesPerCode: policy.maxUsesPerCode, maxValidityDays: policy.maxValidityDays },
        quota: { codesCreated: counts.codesCreated, maxCodesCreated: policy.maxCodesCreatedPerPeriod, registrations: counts.registrations, maxRegistrations: policy.maxRegistrationsPerPeriod },
        eligibility: {
          eligible: eligibility.eligible, mode: policy.eligibilityMode, accountAgeDays: eligibility.accountAgeDays, minAccountAgeDays: policy.minAccountAgeDays,
          approvedSubmissions: eligibility.approvedSubmissions, minApprovedSubmissions: policy.minApprovedSubmissions,
        },
        createBlockedReason,
      };
    },

    async listCurrentPlayerInvitationRedemptions(input) {
      const access = await resolvePortalSession(db, input.sessionToken);
      if (!access) return null;
      const { offset } = itemPage(input.page, input.pageSize);
      const { results } = await database.prepare(
        `SELECT a.player_name, a.player_id, a.public_profile, a.hide_battletag, i.code, r.completed_at
         FROM player_invitation_redemptions r
         JOIN player_accounts a ON a.id = r.invitee_player_account_id
         JOIN player_invitations i ON i.id = r.invitation_id
         WHERE r.inviter_player_account_id = ? ORDER BY r.completed_at DESC, r.id LIMIT ? OFFSET ?`,
      ).bind(access.player.id, input.pageSize, offset).all<{ player_name: string; player_id: string; public_profile: number; hide_battletag: number; code: string; completed_at: number }>();
      const total = await countOf("SELECT count(*) AS total FROM player_invitation_redemptions WHERE inviter_player_account_id = ?", access.player.id);
      const items = results.map((row) => {
        const visible = row.public_profile === 1 && row.hide_battletag === 0;
        return { playerName: visible ? row.player_name : null, playerId: visible ? row.player_id : null, code: row.code, completedAt: row.completed_at };
      });
      return { contractVersion: "1" as const, items, page: input.page, pageSize: input.pageSize, total, hasMore: offset + items.length < total };
    },

    async createCurrentPlayerInvitation(input, idempotencyKey) {
      const operation = "player.invitation.create";
      const player = await currentPlayer(input.sessionToken);
      const validated = validatePlayerInvitationCode(input.code);
      if ("error" in validated) throw new Error(validated.error);
      const request = { code: validated.code, maxUses: input.maxUses, validityDays: input.validityDays };
      const replay = await replayOrConflict<PlayerInvitation>(player.id, operation, idempotencyKey, request);
      if (replay) return replay;
      const policy = await effectivePolicy(player.id);
      if (!policy?.enabled) throw new Error("PLAYER_INVITATION_DISABLED");
      if (!(await eligibilityOf(player, policy)).eligible) throw new Error("PLAYER_INVITATION_NOT_ELIGIBLE");
      if (input.maxUses > policy.maxUsesPerCode || input.validityDays > policy.maxValidityDays) throw new Error("PLAYER_INVITATION_LIMIT_EXCEEDED");
      if (await one("SELECT 1 AS found FROM player_invitations WHERE code = ?", validated.code)) throw new Error("PLAYER_INVITATION_CODE_TAKEN");
      const timestamp = now();
      const range = playerInvitationPeriodRange(policy.period, timestamp);
      const invitationId = crypto.randomUUID();
      const response: PlayerInvitation = {
        invitationId, code: validated.code, status: "available", maxUses: input.maxUses, usedCount: 0, expiresAt: timestamp + input.validityDays * dayMs, createdAt: timestamp, revokedAt: null,
      };
      const created = guardSql("EXISTS (SELECT 1 FROM player_invitations WHERE id = ?)", invitationId);
      try {
        await database.batch([
          // The quota check and the insert are one statement, so concurrent creations cannot both take the last slot.
          database.prepare(
            `INSERT INTO player_invitations (id, code, inviter_player_account_id, max_uses, expires_at, created_at)
             SELECT ?, ?, ?, ?, ?, ? WHERE (SELECT count(*) FROM player_invitations WHERE inviter_player_account_id = ? AND created_at >= ? AND created_at < ?) < ?`,
          ).bind(invitationId, validated.code, player.id, input.maxUses, response.expiresAt, timestamp, player.id, range.start, range.end, policy.maxCodesCreatedPerPeriod),
          await batchStatements.idempotency(player.id, operation, idempotencyKey, request, response, timestamp, created),
          audit("user", player.id, operation, invitationId, request, timestamp, created),
        ]);
      } catch (error) {
        if (isUniqueViolation(error, "player_invitations.code")) throw new Error("PLAYER_INVITATION_CODE_TAKEN");
        return replayAfterRace(error, player.id, operation, idempotencyKey, request);
      }
      if (!(await one("SELECT 1 AS found FROM player_invitations WHERE id = ?", invitationId))) throw new Error("PLAYER_INVITATION_QUOTA_EXHAUSTED");
      return response;
    },

    async revokeCurrentPlayerInvitation(input, idempotencyKey) {
      const operation = "player.invitation.revoke";
      const player = await currentPlayer(input.sessionToken);
      const request = { invitationId: input.invitationId };
      const replay = await replayOrConflict<PlayerInvitation>(player.id, operation, idempotencyKey, request);
      if (replay) return replay;
      const row = await db.select().from(playerInvitations).where(and(eq(playerInvitations.id, input.invitationId), eq(playerInvitations.inviterPlayerAccountId, player.id))).get();
      if (!row) throw new Error("PLAYER_INVITATION_NOT_FOUND");
      const timestamp = now();
      const revoked = row.revokedAt === null ? { ...row, revokedAt: timestamp } : row;
      const response = toInvitation(revoked, await usedCount(row.id), false, timestamp);
      if (row.revokedAt !== null) return response;
      const done = guardSql("EXISTS (SELECT 1 FROM player_invitations WHERE id = ? AND revoked_at = ?)", row.id, timestamp);
      try {
        await database.batch([
          database.prepare("UPDATE player_invitations SET revoked_at = ?, revoked_by = ? WHERE id = ? AND inviter_player_account_id = ? AND revoked_at IS NULL").bind(timestamp, player.id, row.id, player.id),
          await batchStatements.idempotency(player.id, operation, idempotencyKey, request, response, timestamp, done),
          audit("user", player.id, operation, row.id, request, timestamp, done),
        ]);
      } catch (error) {
        return replayAfterRace(error, player.id, operation, idempotencyKey, request);
      }
      return response;
    },

    async redeemPlayerInvitation(input) {
      const code = normalizePlayerInvitationCode(input.code);
      const invitation = await db.select().from(playerInvitations).where(eq(playerInvitations.code, code)).get();
      const timestamp = now();
      if (!invitation || await invitationBlock(invitation, timestamp)) throw new Error("INVITE_INVALID");
      const normalizedPlayerName = normalizePlayerName(input.playerName);
      const blocked = await registrationBlock(normalizedPlayerName, input.playerName, input.playerId);
      if (blocked === "account_exists") throw new Error("PLAYER_INVITATION_ACCOUNT_EXISTS");
      if (blocked) throw new Error("PLAYER_INVITATION_LEGACY_CANDIDATE");
      await database.batch([
        database.prepare("UPDATE player_invitation_claims SET status = 'expired' WHERE status = 'pending_confirmation' AND expires_at <= ?").bind(timestamp),
        database.prepare("DELETE FROM player_invitation_claims WHERE status = 'expired' AND expires_at <= ?").bind(timestamp - staleClaimRetentionMs),
      ]);
      const claimId = crypto.randomUUID();
      const claimToken = randomToken();
      // Confirmation codes are looked up across both claim tables, so they must not repeat.
      let confirmation = randomCode(6);
      let codeHash = await hashRequest(confirmation);
      for (let attempt = 0; attempt < 5 && (await claims.confirmationCodeInUse(codeHash) || await one("SELECT 1 AS found FROM binding_claims WHERE code_hash = ?", codeHash)); attempt += 1) {
        confirmation = randomCode(6);
        codeHash = await hashRequest(confirmation);
      }
      try {
        await db.insert(playerInvitationClaims).values({
          id: claimId, invitationId: invitation.id, tokenHash: await hashRequest(claimToken), codeHash, playerName: input.playerName.trim(), normalizedPlayerName,
          playerId: input.playerId, status: "pending_confirmation", expiresAt: timestamp + claimTtlMs, createdAt: timestamp,
        });
      } catch {
        throw new Error("INVITE_INVALID");
      }
      return { contractVersion: "1" as const, claimId, claimToken, code: confirmation, playerName: input.playerName.trim(), playerId: input.playerId, expiresAt: timestamp + claimTtlMs };
    },
  };

  return { services, claims };
};
