import { and, desc, eq, isNull, lt, ne, or } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";
import type { AuthContext, PlatformServices } from "@owbastion/domain";
import type { QqGroupAccessRequest, QqGroupAccessResponse, QqGroupMemberLeftRequest, QqGroupRegistrationRequest } from "@owbastion/contracts";
import { auditEvents, bindings, idempotencyKeys, playerAccounts, portalSessions, qqGroupAccess, qqGroupPolicyOutbox } from "./schema";

type QqGroupServices = Pick<PlatformServices,
  | "upsertQqGroupAccess"
  | "registerQqGroup"
  | "reportQqGroupMemberLeft"
  | "listQqGroupAccess"
  | "dispatchPendingQqGroupPolicyEvents"
  | "markQqGroupPolicyEventDelivered"
>;

type QqGroupServicesDependencies = {
  db: ReturnType<typeof drizzle>;
  queue?: Queue;
  now: () => number;
  hashRequest: (input: unknown) => Promise<string>;
  replayOrConflict: <T>(actorId: string, operation: string, key: string, input: unknown) => Promise<T | null>;
};

const AUTO_BAN_REASON = "退群自动封禁";

export const createQqGroupServices = ({ db, queue, now, hashRequest, replayOrConflict }: QqGroupServicesDependencies): QqGroupServices => {
  const dispatchPendingQqGroupPolicyEvents = async () => {
    if (!queue) return;
    const timestamp = now();
    const events = await db.select().from(qqGroupPolicyOutbox)
      .where(and(isNull(qqGroupPolicyOutbox.deliveredAt), or(isNull(qqGroupPolicyOutbox.enqueuedAt), lt(qqGroupPolicyOutbox.enqueuedAt, timestamp - 5 * 60 * 1000))))
      .orderBy(qqGroupPolicyOutbox.createdAt)
      .limit(25);
    for (const event of events) {
      try {
        await queue.send({ version: 1, eventId: event.id });
        await db.update(qqGroupPolicyOutbox).set({ enqueuedAt: timestamp }).where(and(eq(qqGroupPolicyOutbox.id, event.id), isNull(qqGroupPolicyOutbox.deliveredAt)));
      } catch {
        // The outbox remains pending for the scheduled repair pass.
      }
    }
  };

  return {
    dispatchPendingQqGroupPolicyEvents,

    async listQqGroupAccess(_auth: AuthContext): Promise<QqGroupAccessResponse[]> {
      const groups = await db.select().from(qqGroupAccess).orderBy(desc(qqGroupAccess.updatedAt));
      return groups.map((group) => ({ contractVersion: "1", groupOpenId: group.groupOpenId, displayName: group.displayName, environment: group.environment as "production" | "test", status: group.status as "pending" | "active" | "legacy" | "disconnected", bindEnabled: group.bindEnabled === 1, verifyEnabled: group.verifyEnabled === 1, updatedAt: group.updatedAt }));
    },

    async upsertQqGroupAccess(input: QqGroupAccessRequest, auth: AuthContext, idempotencyKey: string) {
      const replay = await replayOrConflict<void>(auth.subject, "qq.group_access.update", idempotencyKey, input);
      if (replay !== null) return;
      const timestamp = now();
      const outboxEventId = crypto.randomUUID();
      const requestHash = await hashRequest(input);
      const idempotency = db.insert(idempotencyKeys).values({ id: `${auth.subject}:qq.group_access.update:${idempotencyKey}`, actorId: auth.subject, operation: "qq.group_access.update", requestHash, responseJson: JSON.stringify({}), createdAt: timestamp });
      const audit = db.insert(auditEvents).values({ id: crypto.randomUUID(), correlationId: crypto.randomUUID(), actorType: auth.actorType, actorId: auth.subject, operation: "qq.group_access.update", entityType: "qq_group_access", entityId: input.groupOpenId, payloadJson: JSON.stringify({ displayName: input.displayName, environment: input.environment, status: input.status, bindEnabled: input.bindEnabled, verifyEnabled: input.verifyEnabled }), createdAt: timestamp });
      const outbox = db.insert(qqGroupPolicyOutbox).values({ id: outboxEventId, createdAt: timestamp });
      const upsert = db.insert(qqGroupAccess).values({ groupOpenId: input.groupOpenId, displayName: input.displayName, environment: input.environment, status: input.status, bindEnabled: input.bindEnabled ? 1 : 0, verifyEnabled: input.verifyEnabled ? 1 : 0, lifecycleOccurredAt: timestamp, createdAt: timestamp, updatedAt: timestamp }).onConflictDoUpdate({ target: qqGroupAccess.groupOpenId, set: { displayName: input.displayName, environment: input.environment, status: input.status, bindEnabled: input.bindEnabled ? 1 : 0, verifyEnabled: input.verifyEnabled ? 1 : 0, lifecycleOccurredAt: timestamp, updatedAt: timestamp } });
      const statements: [any, ...any[]] = [upsert, idempotency, audit, outbox];
      if (input.status === "active") statements.unshift(db.update(qqGroupAccess).set({ status: "legacy", bindEnabled: 0, verifyEnabled: 0, lifecycleOccurredAt: timestamp, updatedAt: timestamp }).where(and(eq(qqGroupAccess.status, "active"), ne(qqGroupAccess.groupOpenId, input.groupOpenId))));
      await db.batch(statements);
      await dispatchPendingQqGroupPolicyEvents();
    },

    async registerQqGroup(input: QqGroupRegistrationRequest, auth: AuthContext, idempotencyKey: string) {
      const replay = await replayOrConflict<void>(auth.subject, "qq.group.register", idempotencyKey, input);
      if (replay !== null) return;
      const timestamp = now();
      const existing = await db.select().from(qqGroupAccess).where(eq(qqGroupAccess.groupOpenId, input.groupOpenId)).get();
      const requestHash = await hashRequest(input);
      const idempotency = db.insert(idempotencyKeys).values({ id: `${auth.subject}:qq.group.register:${idempotencyKey}`, actorId: auth.subject, operation: "qq.group.register", requestHash, responseJson: JSON.stringify({}), createdAt: timestamp });
      const audit = db.insert(auditEvents).values({ id: crypto.randomUUID(), correlationId: crypto.randomUUID(), actorType: auth.actorType, actorId: auth.subject, operation: "qq.group.register", entityType: "qq_group_access", entityId: input.groupOpenId, payloadJson: JSON.stringify({ status: input.status }), createdAt: timestamp });
      const shouldNotify = input.status === "disconnected" && existing?.status === "active" && input.occurredAt > existing.lifecycleOccurredAt;
      const statements: [any, ...any[]] = [idempotency, audit];
      if (!existing) {
        statements.unshift(db.insert(qqGroupAccess).values({ groupOpenId: input.groupOpenId, displayName: "", environment: "production", status: input.status, bindEnabled: 0, verifyEnabled: 0, lifecycleOccurredAt: input.occurredAt, createdAt: timestamp, updatedAt: timestamp }));
      } else if (input.occurredAt > existing.lifecycleOccurredAt) {
        if (input.status === "disconnected") {
          statements.unshift(db.update(qqGroupAccess).set({ status: "disconnected", bindEnabled: 0, verifyEnabled: 0, lifecycleOccurredAt: input.occurredAt, updatedAt: timestamp }).where(eq(qqGroupAccess.groupOpenId, input.groupOpenId)));
        } else if (existing.status === "disconnected") {
          statements.unshift(db.update(qqGroupAccess).set({ status: "pending", lifecycleOccurredAt: input.occurredAt, updatedAt: timestamp }).where(eq(qqGroupAccess.groupOpenId, input.groupOpenId)));
        }
      }
      if (shouldNotify) statements.push(db.insert(qqGroupPolicyOutbox).values({ id: crypto.randomUUID(), createdAt: timestamp }));
      await db.batch(statements);
      if (shouldNotify) await dispatchPendingQqGroupPolicyEvents();
    },

    async reportQqGroupMemberLeft(input: QqGroupMemberLeftRequest, auth: AuthContext, idempotencyKey: string) {
      const replay = await replayOrConflict<void>(auth.subject, "qq.group.member_left", idempotencyKey, input);
      if (replay !== null) return;
      const timestamp = now();
      const group = await db.select({ status: qqGroupAccess.status }).from(qqGroupAccess).where(eq(qqGroupAccess.groupOpenId, input.groupOpenId)).get();
      const binding = group?.status === "active"
        ? await db.select({ playerAccountId: bindings.playerAccountId }).from(bindings).where(and(eq(bindings.provider, "qq"), eq(bindings.memberOpenId, input.memberOpenId), eq(bindings.status, "active"))).get()
        : undefined;
      const player = binding ? await db.select({ status: playerAccounts.status }).from(playerAccounts).where(eq(playerAccounts.id, binding.playerAccountId)).get() : undefined;
      const idempotency = db.insert(idempotencyKeys).values({ id: `${auth.subject}:qq.group.member_left:${idempotencyKey}`, actorId: auth.subject, operation: "qq.group.member_left", requestHash: await hashRequest(input), responseJson: JSON.stringify({}), createdAt: timestamp });
      const statements: [any, ...any[]] = [idempotency];
      if (binding && player?.status === "active") {
        statements.unshift(
          db.update(playerAccounts).set({ status: "banned", bannedAt: timestamp, bannedBy: auth.subject, banReason: AUTO_BAN_REASON, updatedAt: timestamp }).where(eq(playerAccounts.id, binding.playerAccountId)),
          db.delete(portalSessions).where(eq(portalSessions.playerAccountId, binding.playerAccountId)),
          db.insert(auditEvents).values({ id: crypto.randomUUID(), correlationId: crypto.randomUUID(), actorType: auth.actorType, actorId: auth.subject, operation: "admin.player.banned", entityType: "player_account", entityId: binding.playerAccountId, payloadJson: JSON.stringify({ status: "banned", reason: AUTO_BAN_REASON, groupOpenId: input.groupOpenId }), createdAt: timestamp }),
        );
      }
      await db.batch(statements);
    },

    async markQqGroupPolicyEventDelivered(input: { eventId: string }) {
      await db.update(qqGroupPolicyOutbox).set({ deliveredAt: now() }).where(eq(qqGroupPolicyOutbox.id, input.eventId));
    },
  };
};
