import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";
import { playerInvitationPeriodRange } from "@owbastion/domain";
import type { PlayerInvitation, PlayerInvitationOverride, PlayerInvitationPolicy } from "@owbastion/contracts/player-invitation";
import { createBatchStatements } from "./batch-statements";
import { playerInvitationOverrides, playerInvitationPolicy, playerInvitations } from "./player-invitation-schema";

export type EffectivePolicy = PlayerInvitationPolicy;
export type InvitationRow = typeof playerInvitations.$inferSelect;

export const dayMs = 24 * 60 * 60 * 1000;
export const isUniqueViolation = (error: unknown, column: string) => error instanceof Error && error.message.includes("UNIQUE constraint failed") && error.message.includes(column);

export const policyFromRow = (row: typeof playerInvitationPolicy.$inferSelect): PlayerInvitationPolicy => ({
  enabled: row.enabled === 1,
  period: row.period as PlayerInvitationPolicy["period"],
  maxCodesCreatedPerPeriod: row.maxCodesCreatedPerPeriod,
  maxRegistrationsPerPeriod: row.maxRegistrationsPerPeriod,
  maxUsesPerCode: row.maxUsesPerCode,
  maxValidityDays: row.maxValidityDays,
  minAccountAgeDays: row.minAccountAgeDays,
  minApprovedSubmissions: row.minApprovedSubmissions,
  eligibilityMode: row.eligibilityMode as PlayerInvitationPolicy["eligibilityMode"],
});

export const overrideFromRow = (row: typeof playerInvitationOverrides.$inferSelect): PlayerInvitationOverride => ({
  enabled: row.enabled === null ? null : row.enabled === 1,
  maxCodesCreatedPerPeriod: row.maxCodesCreatedPerPeriod,
  maxRegistrationsPerPeriod: row.maxRegistrationsPerPeriod,
  maxUsesPerCode: row.maxUsesPerCode,
  maxValidityDays: row.maxValidityDays,
  minAccountAgeDays: row.minAccountAgeDays,
  minApprovedSubmissions: row.minApprovedSubmissions,
  eligibilityMode: row.eligibilityMode as PlayerInvitationOverride["eligibilityMode"],
});

export const mergePolicy = (global: PlayerInvitationPolicy, override: PlayerInvitationOverride | null): EffectivePolicy => ({
  period: global.period,
  enabled: override?.enabled ?? global.enabled,
  maxCodesCreatedPerPeriod: override?.maxCodesCreatedPerPeriod ?? global.maxCodesCreatedPerPeriod,
  maxRegistrationsPerPeriod: override?.maxRegistrationsPerPeriod ?? global.maxRegistrationsPerPeriod,
  maxUsesPerCode: override?.maxUsesPerCode ?? global.maxUsesPerCode,
  maxValidityDays: override?.maxValidityDays ?? global.maxValidityDays,
  minAccountAgeDays: override?.minAccountAgeDays ?? global.minAccountAgeDays,
  minApprovedSubmissions: override?.minApprovedSubmissions ?? global.minApprovedSubmissions,
  eligibilityMode: override?.eligibilityMode ?? global.eligibilityMode,
});

export const meetsEligibility = (policy: EffectivePolicy, accountAgeDays: number, approvedSubmissions: number) => {
  const checks = [
    ...(policy.minAccountAgeDays > 0 ? [accountAgeDays >= policy.minAccountAgeDays] : []),
    ...(policy.minApprovedSubmissions > 0 ? [approvedSubmissions >= policy.minApprovedSubmissions] : []),
  ];
  if (checks.length === 0) return true;
  return policy.eligibilityMode === "any" ? checks.some(Boolean) : checks.every(Boolean);
};

export const guardSql = (sql: string, ...params: unknown[]) => ({ sql, params });


type SupportDependencies = {
  database: D1Database;
  db: ReturnType<typeof drizzle>;
  now: () => number;
  replayOrConflict: <T>(actorId: string, operation: string, key: string, input: unknown) => Promise<T | null>;
};

// Policy resolution, quota counting, and batch helpers shared by the player and admin invitation services.
export const createInvitationSupport = ({ database, db, now, replayOrConflict }: SupportDependencies) => {
  const batchStatements = createBatchStatements(database);
  const audit = batchStatements.audit("player_invitation");

  const one = async <T>(sql: string, ...params: unknown[]) => (await database.prepare(sql).bind(...params).first<T>()) ?? null;
  const countOf = async (sql: string, ...params: unknown[]) => (await one<{ total: number }>(sql, ...params))?.total ?? 0;


  const replayAfterRace = async <T>(error: unknown, actorId: string, operation: string, key: string, input: unknown): Promise<T> => {
    if (isUniqueViolation(error, "idempotency_keys.id")) {
      const replay = await replayOrConflict<T>(actorId, operation, key, input);
      if (replay) return replay;
    }
    throw error;
  };


  const loadGlobalPolicy = async () => {
    const row = await db.select().from(playerInvitationPolicy).get();
    return row ? policyFromRow(row) : null;
  };

  const loadOverride = async (playerAccountId: string) => {
    const row = await db.select().from(playerInvitationOverrides).where(eq(playerInvitationOverrides.playerAccountId, playerAccountId)).get();
    return row ? overrideFromRow(row) : null;
  };

  const effectivePolicy = async (playerAccountId: string) => {
    const global = await loadGlobalPolicy();
    return global ? mergePolicy(global, await loadOverride(playerAccountId)) : null;
  };


  const hasActiveQqBinding = async (playerAccountId: string) =>
    Boolean(await one("SELECT 1 AS found FROM bindings WHERE player_account_id = ? AND provider = 'qq' AND status = 'active' LIMIT 1", playerAccountId));

  const eligibilityOf = async (player: { id: string; status: string; createdAt: number }, policy: EffectivePolicy) => {
    const accountAgeDays = Math.max(0, Math.floor((now() - player.createdAt) / dayMs));
    const approvedSubmissions = policy.minApprovedSubmissions > 0
      ? await countOf("SELECT count(*) AS total FROM submissions WHERE player_account_id = ? AND status = 'approved'", player.id)
      : 0;
    const eligible = player.status === "active" && meetsEligibility(policy, accountAgeDays, approvedSubmissions) && await hasActiveQqBinding(player.id);
    return { eligible, accountAgeDays, approvedSubmissions };
  };

  const periodCounts = async (playerAccountId: string, policy: EffectivePolicy, timestamp: number) => {
    const range = playerInvitationPeriodRange(policy.period, timestamp);
    return {
      ...range,
      codesCreated: await countOf("SELECT count(*) AS total FROM player_invitations WHERE inviter_player_account_id = ? AND created_at >= ? AND created_at < ?", playerAccountId, range.start, range.end),
      registrations: await countOf("SELECT count(*) AS total FROM player_invitation_redemptions WHERE inviter_player_account_id = ? AND completed_at >= ? AND completed_at < ?", playerAccountId, range.start, range.end),
    };
  };

  const usedCount = (invitationId: string) => countOf("SELECT count(*) AS total FROM player_invitation_redemptions WHERE invitation_id = ?", invitationId);

  const toInvitation = (row: InvitationRow, used: number, blocked: boolean, timestamp: number): PlayerInvitation => ({
    invitationId: row.id,
    code: row.code,
    status: row.revokedAt !== null ? "revoked" : row.expiresAt <= timestamp ? "expired" : used >= row.maxUses ? "exhausted" : blocked ? "inviter_blocked" : "available",
    maxUses: row.maxUses,
    usedCount: used,
    expiresAt: row.expiresAt,
    createdAt: row.createdAt,
    revokedAt: row.revokedAt,
  });

  const itemPage = (page: number, pageSize: number) => ({ page, pageSize, offset: (page - 1) * pageSize });

  return { batchStatements, audit, one, countOf, replayAfterRace, loadGlobalPolicy, effectivePolicy, hasActiveQqBinding, eligibilityOf, periodCounts, usedCount, toInvitation, itemPage };
};
