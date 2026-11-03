import { desc, eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";
import type { AuthContext, PlatformServices } from "@owbastion/domain";
import type { AdminInvitationOverviewResponse } from "@owbastion/contracts/player-invitation";
import { createInvitationSupport, guardSql, overrideFromRow, policyFromRow } from "./player-invitation-support";
import { playerInvitationOverrides, playerInvitationPolicy, playerInvitations } from "./player-invitation-schema";
import { playerAccounts } from "./schema";

export type PlayerInvitationAdminServices = Pick<PlatformServices,
  | "getAdminPlayerInvitationPolicy"
  | "setAdminPlayerInvitationPolicy"
  | "listAdminPlayerInvitationOverrides"
  | "setAdminPlayerInvitationOverride"
  | "clearAdminPlayerInvitationOverride"
  | "listAdminInvitations"
  | "getAdminPlayerInvitation"
  | "revokeAdminPlayerInvitation"
  | "listAdminPlayerInvitationAudit"
>;

type Dependencies = {
  database: D1Database;
  db: ReturnType<typeof drizzle>;
  now: () => number;
  replayOrConflict: <T>(actorId: string, operation: string, key: string, input: unknown) => Promise<T | null>;
};

export const createPlayerInvitationAdminServices = (dependencies: Dependencies): PlayerInvitationAdminServices => {
  const { database, db, now, replayOrConflict } = dependencies;
  const { batchStatements, audit, one, countOf, replayAfterRace, usedCount, toInvitation, itemPage } = createInvitationSupport(dependencies);
  const setPolicyStatements = async (auth: AuthContext, operation: string, entityId: string, key: string, input: unknown, response: unknown, payload: unknown, timestamp: number) => [
    await batchStatements.idempotency(auth.subject, operation, key, input, response, timestamp),
    audit(auth.actorType, auth.subject, operation, entityId, payload, timestamp),
  ];


  return {
    async getAdminPlayerInvitationPolicy() {
      const row = await db.select().from(playerInvitationPolicy).get();
      return { contractVersion: "1" as const, policy: row ? policyFromRow(row) : null, updatedAt: row?.updatedAt ?? null };
    },

    async setAdminPlayerInvitationPolicy(input, auth, idempotencyKey) {
      const operation = "admin.player_invitation.policy.update";
      const replay = await replayOrConflict<Awaited<ReturnType<PlayerInvitationAdminServices["setAdminPlayerInvitationPolicy"]>>>(auth.subject, operation, idempotencyKey, input);
      if (replay) return replay;
      const timestamp = now();
      const p = input.policy;
      const response = { contractVersion: "1" as const, policy: p, updatedAt: timestamp };
      try {
        await database.batch([
          database.prepare(
            `INSERT INTO player_invitation_policy (id, enabled, period, max_registrations_per_period, max_uses_per_code, max_validity_days, min_account_age_days, min_approved_submissions, eligibility_mode, updated_by, updated_at)
             VALUES ('global', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
             ON CONFLICT(id) DO UPDATE SET enabled = excluded.enabled, period = excluded.period,
               max_registrations_per_period = excluded.max_registrations_per_period, max_uses_per_code = excluded.max_uses_per_code, max_validity_days = excluded.max_validity_days,
               min_account_age_days = excluded.min_account_age_days, min_approved_submissions = excluded.min_approved_submissions, eligibility_mode = excluded.eligibility_mode,
               updated_by = excluded.updated_by, updated_at = excluded.updated_at`,
          ).bind(p.enabled ? 1 : 0, p.period, p.maxRegistrationsPerPeriod, p.maxUsesPerCode, p.maxValidityDays, p.minAccountAgeDays, p.minApprovedSubmissions, p.eligibilityMode, auth.subject, timestamp),
          ...await setPolicyStatements(auth, operation, "global", idempotencyKey, input, response, p, timestamp),
        ]);
      } catch (error) {
        return replayAfterRace(error, auth.subject, operation, idempotencyKey, input);
      }
      return response;
    },

    async listAdminPlayerInvitationOverrides(input) {
      const { offset } = itemPage(input.page, input.pageSize);
      const rows = await db.select({ override: playerInvitationOverrides, playerName: playerAccounts.playerName, playerId: playerAccounts.playerId })
        .from(playerInvitationOverrides).innerJoin(playerAccounts, eq(playerAccounts.id, playerInvitationOverrides.playerAccountId))
        .orderBy(desc(playerInvitationOverrides.updatedAt)).limit(input.pageSize).offset(offset).all();
      const total = await countOf("SELECT count(*) AS total FROM player_invitation_overrides");
      const items = rows.map((row) => ({ playerAccountId: row.override.playerAccountId, playerName: row.playerName, playerId: row.playerId, override: overrideFromRow(row.override), updatedAt: row.override.updatedAt }));
      return { contractVersion: "1" as const, items, page: input.page, pageSize: input.pageSize, total, hasMore: offset + items.length < total };
    },

    async setAdminPlayerInvitationOverride(input, auth, idempotencyKey) {
      const operation = "admin.player_invitation.override.set";
      const replay = await replayOrConflict<object>(auth.subject, operation, idempotencyKey, input);
      if (replay) return;
      if (!(await one("SELECT 1 AS found FROM player_accounts WHERE id = ?", input.playerAccountId))) throw new Error("PLAYER_NOT_FOUND");
      const timestamp = now();
      const o = input.override;
      const bool = (value: boolean | null) => value === null ? null : value ? 1 : 0;
      try {
        await database.batch([
          database.prepare(
            `INSERT INTO player_invitation_overrides (player_account_id, enabled, max_registrations_per_period, max_uses_per_code, max_validity_days, min_account_age_days, min_approved_submissions, eligibility_mode, updated_by, updated_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
             ON CONFLICT(player_account_id) DO UPDATE SET enabled = excluded.enabled,
               max_registrations_per_period = excluded.max_registrations_per_period, max_uses_per_code = excluded.max_uses_per_code, max_validity_days = excluded.max_validity_days,
               min_account_age_days = excluded.min_account_age_days, min_approved_submissions = excluded.min_approved_submissions, eligibility_mode = excluded.eligibility_mode,
               updated_by = excluded.updated_by, updated_at = excluded.updated_at`,
          ).bind(input.playerAccountId, bool(o.enabled), o.maxRegistrationsPerPeriod, o.maxUsesPerCode, o.maxValidityDays, o.minAccountAgeDays, o.minApprovedSubmissions, o.eligibilityMode, auth.subject, timestamp),
          ...await setPolicyStatements(auth, operation, input.playerAccountId, idempotencyKey, input, {}, { playerAccountId: input.playerAccountId, override: o }, timestamp),
        ]);
      } catch (error) {
        await replayAfterRace(error, auth.subject, operation, idempotencyKey, input);
      }
    },

    async clearAdminPlayerInvitationOverride(input, auth, idempotencyKey) {
      const operation = "admin.player_invitation.override.clear";
      const replay = await replayOrConflict<object>(auth.subject, operation, idempotencyKey, input);
      if (replay) return;
      const timestamp = now();
      try {
        await database.batch([
          database.prepare("DELETE FROM player_invitation_overrides WHERE player_account_id = ?").bind(input.playerAccountId),
          ...await setPolicyStatements(auth, operation, input.playerAccountId, idempotencyKey, input, {}, input, timestamp),
        ]);
      } catch (error) {
        await replayAfterRace(error, auth.subject, operation, idempotencyKey, input);
      }
    },

    async listAdminInvitations(input) {
      const timestamp = now();
      const source = `
        SELECT 'admin' AS type, id, created_by AS issuer, NULL AS inviter_id,
          CASE WHEN revoked_at IS NOT NULL THEN 'revoked' WHEN redeemed_at IS NOT NULL THEN 'redeemed' WHEN expires_at <= ? THEN 'expired' ELSE 'active' END AS status,
          1 AS max_uses, CASE WHEN redeemed_at IS NOT NULL THEN 1 ELSE 0 END AS used_count, created_at, expires_at
        FROM binding_invites
        UNION ALL
        SELECT 'player', i.id, a.player_name || '#' || a.player_id, i.inviter_player_account_id,
          CASE WHEN i.revoked_at IS NOT NULL THEN 'revoked' WHEN i.expires_at <= ? THEN 'expired'
            WHEN (SELECT count(*) FROM player_invitation_redemptions r WHERE r.invitation_id = i.id) >= i.max_uses THEN 'exhausted' ELSE 'active' END,
          i.max_uses, (SELECT count(*) FROM player_invitation_redemptions r WHERE r.invitation_id = i.id), i.created_at, i.expires_at
        FROM player_invitations i JOIN player_accounts a ON a.id = i.inviter_player_account_id`;
      const filter = `WHERE (? = 'all' OR type = ?) AND (? IS NULL OR status = ?) AND (? IS NULL OR lower(issuer) LIKE ?) AND created_at >= ? AND created_at < ?`;
      const issuer = input.issuer ? `%${input.issuer.toLowerCase().replace(/[\\%_]/g, "\\$&")}%` : null;
      const params = [timestamp, timestamp, input.type, input.type, input.status ?? null, input.status ?? null, issuer, issuer, input.from ?? 0, input.to ?? Number.MAX_SAFE_INTEGER];
      const escapedFilter = filter.replace("LIKE ?", "LIKE ? ESCAPE '\\'");
      const { offset } = itemPage(input.page, input.pageSize);
      const { results } = await database.prepare(`SELECT * FROM (${source}) ${escapedFilter} ORDER BY created_at DESC, id LIMIT ? OFFSET ?`)
        .bind(...params, input.pageSize, offset).all<{ type: "admin" | "player"; id: string; issuer: string; inviter_id: string | null; status: AdminInvitationOverviewResponse["items"][number]["status"]; max_uses: number; used_count: number; created_at: number; expires_at: number }>();
      const total = await countOf(`SELECT count(*) AS total FROM (${source}) ${escapedFilter}`, ...params);
      const items = results.map((row) => ({
        type: row.type, invitationId: row.id, issuer: row.issuer, inviterPlayerAccountId: row.inviter_id, status: row.status,
        maxUses: row.max_uses, usedCount: row.used_count, createdAt: row.created_at, expiresAt: row.expires_at,
      }));
      return { contractVersion: "1" as const, items, page: input.page, pageSize: input.pageSize, total, hasMore: offset + items.length < total };
    },

    async getAdminPlayerInvitation(input) {
      const row = await db.select({ invitation: playerInvitations, playerName: playerAccounts.playerName, playerId: playerAccounts.playerId })
        .from(playerInvitations).innerJoin(playerAccounts, eq(playerAccounts.id, playerInvitations.inviterPlayerAccountId))
        .where(eq(playerInvitations.id, input.invitationId)).get();
      if (!row) throw new Error("PLAYER_INVITATION_NOT_FOUND");
      const timestamp = now();
      const used = await usedCount(row.invitation.id);
      const view = toInvitation(row.invitation, used, false, timestamp);
      const { offset } = itemPage(input.page, input.pageSize);
      const { results } = await database.prepare(
        `SELECT a.id, a.player_name, a.player_id, r.completed_at FROM player_invitation_redemptions r JOIN player_accounts a ON a.id = r.invitee_player_account_id
         WHERE r.invitation_id = ? ORDER BY r.completed_at DESC, r.id LIMIT ? OFFSET ?`,
      ).bind(input.invitationId, input.pageSize, offset).all<{ id: string; player_name: string; player_id: string; completed_at: number }>();
      const redemptions = results.map((r) => ({ inviteePlayerAccountId: r.id, playerName: r.player_name, playerId: r.player_id, completedAt: r.completed_at }));
      return {
        contractVersion: "1" as const,
        invitation: {
          type: "player" as const, invitationId: view.invitationId, code: view.code, issuer: `${row.playerName}#${row.playerId}`, inviterPlayerAccountId: row.invitation.inviterPlayerAccountId,
          status: view.status === "available" ? "active" as const : view.status === "inviter_blocked" ? "active" as const : view.status,
          maxUses: view.maxUses, usedCount: used, createdAt: view.createdAt, expiresAt: view.expiresAt,
        },
        redemptions, page: input.page, pageSize: input.pageSize, total: used, hasMore: offset + redemptions.length < used,
      };
    },

    async revokeAdminPlayerInvitation(input, auth, idempotencyKey) {
      const operation = "admin.player_invitation.revoke";
      const replay = await replayOrConflict<object>(auth.subject, operation, idempotencyKey, input);
      if (replay) return;
      const row = await db.select().from(playerInvitations).where(eq(playerInvitations.id, input.invitationId)).get();
      if (!row) throw new Error("PLAYER_INVITATION_NOT_FOUND");
      if (row.revokedAt !== null) return;
      const timestamp = now();
      const done = guardSql("EXISTS (SELECT 1 FROM player_invitations WHERE id = ? AND revoked_at = ?)", row.id, timestamp);
      try {
        await database.batch([
          database.prepare("UPDATE player_invitations SET revoked_at = ?, revoked_by = ? WHERE id = ? AND revoked_at IS NULL").bind(timestamp, auth.subject, row.id),
          await batchStatements.idempotency(auth.subject, operation, idempotencyKey, input, {}, timestamp, done),
          audit(auth.actorType, auth.subject, operation, row.id, { inviterPlayerAccountId: row.inviterPlayerAccountId }, timestamp, done),
        ]);
      } catch (error) {
        await replayAfterRace(error, auth.subject, operation, idempotencyKey, input);
      }
    },

    async listAdminPlayerInvitationAudit(input) {
      const where = "WHERE operation LIKE 'player.invitation.%' OR operation LIKE 'admin.player_invitation.%'";
      const { offset } = itemPage(input.page, input.pageSize);
      const { results } = await database.prepare(`SELECT id, operation, actor_id, entity_id, payload_json, created_at FROM audit_events ${where} ORDER BY created_at DESC, id LIMIT ? OFFSET ?`)
        .bind(input.pageSize, offset).all<{ id: string; operation: string; actor_id: string; entity_id: string; payload_json: string; created_at: number }>();
      const total = await countOf(`SELECT count(*) AS total FROM audit_events ${where}`);
      const items = results.map((row) => ({ auditId: row.id, operation: row.operation, actorId: row.actor_id, entityId: row.entity_id, payload: JSON.parse(row.payload_json) as unknown, createdAt: row.created_at }));
      return { contractVersion: "1" as const, items, page: input.page, pageSize: input.pageSize, total, hasMore: offset + items.length < total };
    },
  };
};
