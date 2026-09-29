import { and, eq, inArray } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";
import type { AuthContext } from "@owbastion/domain";
import { isInheritedConquerorGrant } from "./player-title-service";
import {
  auditEvents,
  bindingClaims,
  bindingInvites,
  bindingInviteHistoricalTitleGrants,
  challengeCompletions,
  challenges,
  historicalTitleGrants,
  playerTitleGrants,
} from "./schema";

type Dependencies = {
  database: D1Database;
  db: ReturnType<typeof drizzle>;
  now: () => number;
  recordAudit: (auth: AuthContext, operation: string, entityType: string, entityId: string, payload: unknown) => Promise<void>;
};

export const createHistoricalTitleMigrationService = ({ database, db, now, recordAudit }: Dependencies) => {
  const performAuthorizedHistoricalTitleMigration = async (input: { inviteId: string; playerAccountId: string; claimId?: string; grantSource?: string; auth: AuthContext; mode: "automatic" | "reviewed" | "retry" }) => {
    const [invite, claim, items] = await Promise.all([
      db.select().from(bindingInvites).where(eq(bindingInvites.id, input.inviteId)).get(),
      input.claimId ? db.select().from(bindingClaims).where(eq(bindingClaims.id, input.claimId)).get() : Promise.resolve(null),
      db.select().from(bindingInviteHistoricalTitleGrants).where(eq(bindingInviteHistoricalTitleGrants.inviteId, input.inviteId)),
    ]);
    if (!invite || (input.claimId && claim?.status !== "approved") || (!input.claimId && !input.grantSource) || invite.revokedAt || !items.length) return;
    const grantSource = input.grantSource ?? `binding:${input.claimId}`;

    type MigrationLookupRow = {
      itemId: string;
      historicalId: string | null;
      historicalTitleKey: string | null;
      historicalMapId: string | null;
      historicalGameplayRevisionId: string | null;
      historicalSlot: string | null;
      existingGrantId: string | null;
      existingPlayerAccountId: string | null;
      existingStatus: string | null;
      existingRevocationType: string | null;
      scopedGrantId: string | null;
      scopedGrantStatus: string | null;
      scopedGrantSourceType: string | null;
      scopedGrantSourceId: string | null;
      scopedGrantRevocationType: string | null;
      scopedGrantSourceTitleKey: string | null;
      scopedGrantSourceMapId: string | null;
      scopedGrantSourceGameplayRevisionId: string | null;
    };
    const lookupRows = (await database.prepare(`
      SELECT
        authorization.id AS itemId,
        historical.id AS historicalId,
        historical.title_key AS historicalTitleKey,
        historical.map_id AS historicalMapId,
        historical.gameplay_revision_id AS historicalGameplayRevisionId,
        historical.slot AS historicalSlot,
        existing.id AS existingGrantId,
        existing.player_account_id AS existingPlayerAccountId,
        existing.status AS existingStatus,
        existing.revocation_type AS existingRevocationType,
        scoped.id AS scopedGrantId,
        scoped.status AS scopedGrantStatus,
        scoped.source_type AS scopedGrantSourceType,
        scoped.source_id AS scopedGrantSourceId,
        scoped.revocation_type AS scopedGrantRevocationType,
        scoped_source.title_key AS scopedGrantSourceTitleKey,
        scoped_source.map_id AS scopedGrantSourceMapId,
        scoped_source.gameplay_revision_id AS scopedGrantSourceGameplayRevisionId
      FROM binding_invite_historical_title_grants AS authorization
      LEFT JOIN historical_title_grants AS historical
        ON historical.id = authorization.historical_title_grant_id
      LEFT JOIN player_title_grants AS existing
        ON existing.source_type = 'historical'
        AND existing.source_id = historical.id
        AND existing.title_key = historical.title_key
      LEFT JOIN player_title_grants AS scoped
        ON scoped.player_account_id = ?
        AND scoped.title_key = historical.title_key
        AND scoped.map_id IS historical.map_id
        AND scoped.gameplay_revision_id IS historical.gameplay_revision_id
      LEFT JOIN historical_title_grants AS scoped_source
        ON scoped.source_type = 'historical'
        AND scoped_source.id = scoped.source_id
      WHERE authorization.invite_id = ?
        AND authorization.status NOT IN ('created', 'reused', 'conflict')
    `).bind(input.playerAccountId, input.inviteId).all<MigrationLookupRow>()).results;
    const lookupRowsByItemId = new Map<string, MigrationLookupRow[]>();
    for (const row of lookupRows) {
      const itemRows = lookupRowsByItemId.get(row.itemId);
      if (itemRows) itemRows.push(row);
      else lookupRowsByItemId.set(row.itemId, [row]);
    }

    const timestamp = now();
    const operations: Array<{ statements: any[]; audit?: { entityId: string; payload: Record<string, unknown> } }> = [];
    for (const item of items) {
      if (["created", "reused", "conflict"].includes(item.status)) continue;
      const statements: any[] = [];
      const itemRows = lookupRowsByItemId.get(item.id) ?? [];
      const lookup = itemRows[0];
      if (!lookup?.historicalId || !lookup.historicalTitleKey) {
        statements.push(db.update(bindingInviteHistoricalTitleGrants).set({ status: "retry_required", lastError: "HISTORICAL_TITLE_GRANT_NOT_FOUND", processedAt: timestamp }).where(eq(bindingInviteHistoricalTitleGrants.id, item.id)));
        operations.push({ statements });
        continue;
      }
      const historical = {
        id: lookup.historicalId,
        titleKey: lookup.historicalTitleKey,
        mapId: lookup.historicalMapId,
        gameplayRevisionId: lookup.historicalGameplayRevisionId,
        slot: lookup.historicalSlot,
      };
      const existingRow = itemRows.find((row) => row.existingGrantId);
      const existing = existingRow?.existingGrantId ? {
        id: existingRow.existingGrantId,
        playerAccountId: existingRow.existingPlayerAccountId,
        status: existingRow.existingStatus,
        revocationType: existingRow.existingRevocationType,
      } : null;
      const scopedGrants = Array.from(new Map(itemRows
        .filter((row) => row.scopedGrantId)
        .map((row) => [row.scopedGrantId!, row])).values());
      const activeIdentityRow = existing ? null : scopedGrants.find((row) => row.scopedGrantStatus === "active");
      const activeIdentity = activeIdentityRow?.scopedGrantId ? {
        id: activeIdentityRow.scopedGrantId,
        sourceType: activeIdentityRow.scopedGrantSourceType,
        sourceId: activeIdentityRow.scopedGrantSourceId,
      } : null;
      const administrativelyRevokedRow = scopedGrants.find((row) => row.scopedGrantStatus === "revoked" && row.scopedGrantRevocationType === "administrator");
      const administrativelyRevoked = administrativelyRevokedRow?.scopedGrantId ? {
        id: administrativelyRevokedRow.scopedGrantId,
        revocationType: administrativelyRevokedRow.scopedGrantRevocationType,
      } : null;
      const inheritedSource = activeIdentityRow?.scopedGrantSourceTitleKey ? {
        titleKey: activeIdentityRow.scopedGrantSourceTitleKey,
        mapId: activeIdentityRow.scopedGrantSourceMapId,
        gameplayRevisionId: activeIdentityRow.scopedGrantSourceGameplayRevisionId,
      } : null;
      const inherited = activeIdentity && isInheritedConquerorGrant(inheritedSource, historical);
      let outcome: "created" | "reused" | "conflict";
      let grantId: string;
      if (existing && existing.playerAccountId !== input.playerAccountId) {
        outcome = "conflict";
        grantId = existing.id;
        statements.push(db.update(bindingInviteHistoricalTitleGrants).set({ status: outcome, playerTitleGrantId: grantId, lastError: "HISTORICAL_TITLE_GRANT_CLAIMED", processedAt: timestamp }).where(eq(bindingInviteHistoricalTitleGrants.id, item.id)));
      } else if (existing?.status === "revoked" || administrativelyRevoked) {
        outcome = "conflict";
        grantId = existing?.id ?? administrativelyRevoked!.id;
        const reason = (existing ?? administrativelyRevoked)!.revocationType === "evidence" ? "TITLE_GRANT_EVIDENCE_INVALIDATED" : "TITLE_GRANT_ADMINISTRATIVELY_REVOKED";
        statements.push(db.update(bindingInviteHistoricalTitleGrants).set({ status: "retry_required", playerTitleGrantId: grantId, lastError: reason, processedAt: timestamp }).where(eq(bindingInviteHistoricalTitleGrants.id, item.id)));
      } else if (existing) {
        outcome = "reused";
        grantId = existing.id;
        statements.push(db.update(bindingInviteHistoricalTitleGrants).set({ status: outcome, playerTitleGrantId: grantId, lastError: null, processedAt: timestamp }).where(eq(bindingInviteHistoricalTitleGrants.id, item.id)));
      } else if (activeIdentity && inherited) {
        outcome = "reused";
        grantId = activeIdentity.id;
        statements.push(db.update(playerTitleGrants).set({ sourceId: historical.id }).where(eq(playerTitleGrants.id, activeIdentity.id)));
        statements.push(db.update(bindingInviteHistoricalTitleGrants).set({ status: outcome, playerTitleGrantId: grantId, lastError: null, processedAt: timestamp }).where(eq(bindingInviteHistoricalTitleGrants.id, item.id)));
      } else if (activeIdentity) {
        outcome = "conflict";
        grantId = activeIdentity.id;
        statements.push(db.update(bindingInviteHistoricalTitleGrants).set({ status: outcome, playerTitleGrantId: grantId, lastError: "HISTORICAL_TITLE_GRANT_CLAIMED", processedAt: timestamp }).where(eq(bindingInviteHistoricalTitleGrants.id, item.id)));
      } else {
        outcome = "created";
        grantId = crypto.randomUUID();
        const manualChallengeId = `manual:${historical.titleKey}`;
        const completionId = `completion:${grantId}`;
        statements.push(db.insert(challenges).values({ id: manualChallengeId, sourceFamily: "manual", sourceId: historical.titleKey, titleKey: historical.titleKey, mapId: null, gameplayRevisionId: null, status: "active", manual: 1, publicCondition: 0, conditionOperator: "and", conditionsJson: "[]", condition: "Maintainer-issued title", startsAt: null, endsAt: null, createdAt: timestamp, updatedAt: timestamp }).onConflictDoNothing());
        statements.push(db.insert(challengeCompletions).values({ id: completionId, playerAccountId: input.playerAccountId, challengeId: manualChallengeId, gameplayRevisionId: historical.gameplayRevisionId, status: "active", sourceType: "manual", sourceId: grantSource, completedAt: timestamp, createdAt: timestamp }));
        statements.push(db.insert(playerTitleGrants).values({ id: grantId, playerAccountId: input.playerAccountId, titleKey: historical.titleKey, mapId: historical.mapId, gameplayRevisionId: historical.gameplayRevisionId, slot: historical.slot, status: "active", sourceType: "historical", sourceId: historical.id, grantedBy: grantSource, grantedAt: timestamp, completionId }));
        statements.push(db.update(bindingInviteHistoricalTitleGrants).set({ status: outcome, playerTitleGrantId: grantId, lastError: null, processedAt: timestamp }).where(eq(bindingInviteHistoricalTitleGrants.id, item.id)));
      }
      operations.push({
        statements,
        audit: { entityId: grantId, payload: { inviteId: input.inviteId, ...(input.claimId ? { claimId: input.claimId } : { grantSource }), historicalTitleGrantId: historical.id, playerAccountId: input.playerAccountId, authorizedBy: item.authorizedBy, outcome, mode: input.mode, ...(inherited ? { previousSourceId: activeIdentity.sourceId, reconciled: true } : {}) } },
      });
    }
    if (!operations.length) return;
    const maxStatementsPerBatch = 80;
    let batchOperations: typeof operations = [];
    let batchStatementCount = 0;
    const flushBatch = async () => {
      if (!batchOperations.length) return;
      const statements = batchOperations.flatMap((operation) => operation.statements);
      const auditStatements = batchOperations.flatMap((operation) => operation.audit ? [db.insert(auditEvents).values({ id: crypto.randomUUID(), correlationId: crypto.randomUUID(), actorType: input.auth.actorType, actorId: input.auth.subject, operation: "binding_invite.historical_migration.item", entityType: "player_title_grant", entityId: operation.audit.entityId, payloadJson: JSON.stringify(operation.audit.payload), createdAt: timestamp })] : []);
      await db.batch([...statements, ...auditStatements] as [any, ...any[]]);
      batchOperations = [];
      batchStatementCount = 0;
    };
    for (const operation of operations) {
      const operationStatementCount = operation.statements.length + Number(Boolean(operation.audit));
      if (batchStatementCount + operationStatementCount > maxStatementsPerBatch) await flushBatch();
      batchOperations.push(operation);
      batchStatementCount += operationStatementCount;
    }
    await flushBatch();
  };

  const migrateAuthorizedHistoricalTitles = async (input: { inviteId: string; playerAccountId: string; claimId?: string; grantSource?: string; auth: AuthContext; mode: "automatic" | "reviewed" | "retry" }) => {
    try {
      await performAuthorizedHistoricalTitleMigration(input);
    } catch {
      try {
        await db.update(bindingInviteHistoricalTitleGrants).set({ status: "retry_required", lastError: "HISTORICAL_TITLE_MIGRATION_FAILED", processedAt: now() }).where(and(eq(bindingInviteHistoricalTitleGrants.inviteId, input.inviteId), inArray(bindingInviteHistoricalTitleGrants.status, ["authorized", "retry_required"])));
        await recordAudit(input.auth, "binding_invite.historical_migration.failed", "binding_invite", input.inviteId, { ...(input.claimId ? { claimId: input.claimId } : { grantSource: input.grantSource }), playerAccountId: input.playerAccountId, mode: input.mode });
      } catch {
        // Binding activation remains successful even if migration recovery state cannot be written.
      }
    }
  };

  return migrateAuthorizedHistoricalTitles;
};
