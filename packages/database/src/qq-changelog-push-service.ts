import { and, eq, isNull, lt, or } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";
import type { PlatformServices } from "@owbastion/domain";
import type { QqChangelogPushItem } from "@owbastion/contracts";
import { qqChangelogPushes } from "./qq-changelog-schema";
import { auditEvents, qqGroupAccess } from "./schema";

type QqChangelogPushServices = Pick<PlatformServices,
  | "requestQqChangelogPush"
  | "listQqChangelogPushes"
  | "dispatchPendingQqChangelogPushes"
  | "loadQqChangelogPushForDelivery"
  | "recordQqChangelogPushResult"
>;

type Dependencies = { db: ReturnType<typeof drizzle>; queue?: Queue; now: () => number };

const REENQUEUE_AFTER_MS = 5 * 60 * 1000;

// One key per "version + group + generation". A retry reuses it; an admin-confirmed resend advances the generation.
const idempotencyKeyFor = (version: string, groupOpenId: string, generation: number) => `changelog:${version}:${groupOpenId}:${generation}`;

const toItem = (row: typeof qqChangelogPushes.$inferSelect): QqChangelogPushItem => ({
  version: row.version,
  groupOpenId: row.groupOpenId,
  status: row.status as QqChangelogPushItem["status"],
  retryable: row.retryable === null ? null : row.retryable === 1,
  errorCode: row.errorCode,
  updatedAt: row.updatedAt,
});

export const createQqChangelogPushServices = ({ db, queue, now }: Dependencies): QqChangelogPushServices => {
  const dispatchPendingQqChangelogPushes = async () => {
    if (!queue) return;
    const timestamp = now();
    const rows = await db.select().from(qqChangelogPushes)
      .where(and(eq(qqChangelogPushes.status, "pending"), or(isNull(qqChangelogPushes.enqueuedAt), lt(qqChangelogPushes.enqueuedAt, timestamp - REENQUEUE_AFTER_MS))))
      .orderBy(qqChangelogPushes.createdAt)
      .limit(25);
    for (const row of rows) {
      try {
        await queue.send({ version: 1, changelogPush: { version: row.version, groupOpenId: row.groupOpenId, idempotencyKey: row.idempotencyKey } });
        await db.update(qqChangelogPushes).set({ enqueuedAt: timestamp }).where(and(eq(qqChangelogPushes.version, row.version), eq(qqChangelogPushes.groupOpenId, row.groupOpenId), eq(qqChangelogPushes.status, "pending")));
      } catch {
        // The row stays pending for the scheduled repair pass.
      }
    }
  };

  return {
    dispatchPendingQqChangelogPushes,

    async listQqChangelogPushes(input) {
      const rows = input.version
        ? await db.select().from(qqChangelogPushes).where(eq(qqChangelogPushes.version, input.version))
        : await db.select().from(qqChangelogPushes);
      return rows.map(toItem);
    },

    async requestQqChangelogPush(input, auth) {
      const groups = await db.select({ groupOpenId: qqGroupAccess.groupOpenId, status: qqGroupAccess.status }).from(qqGroupAccess);
      const known = new Map(groups.map((group) => [group.groupOpenId, group.status]));
      if (input.groupOpenIds.some((id) => !known.has(id) || known.get(id) === "disconnected")) throw new Error("QQ_CHANGELOG_GROUP_NOT_PUSHABLE");
      const existing = await db.select().from(qqChangelogPushes).where(eq(qqChangelogPushes.version, input.version));
      const byGroup = new Map(existing.map((row) => [row.groupOpenId, row]));
      if (!input.confirmResend && input.groupOpenIds.some((id) => byGroup.get(id)?.status === "sent")) throw new Error("QQ_CHANGELOG_ALREADY_SENT");

      const timestamp = now();
      const statements: any[] = [];
      for (const groupOpenId of input.groupOpenIds) {
        const row = byGroup.get(groupOpenId);
        // A pending push is already in flight; it is not queued twice.
        if (row?.status === "pending") continue;
        if (!row) {
          statements.push(db.insert(qqChangelogPushes).values({ version: input.version, groupOpenId, generation: 1, idempotencyKey: idempotencyKeyFor(input.version, groupOpenId, 1), markdown: input.markdown, status: "pending", requestedBy: auth.subject, createdAt: timestamp, updatedAt: timestamp }));
          continue;
        }
        const generation = row.status === "sent" ? row.generation + 1 : row.generation;
        statements.push(db.update(qqChangelogPushes)
          .set({ generation, idempotencyKey: idempotencyKeyFor(input.version, groupOpenId, generation), markdown: input.markdown, status: "pending", retryable: null, errorCode: null, requestedBy: auth.subject, updatedAt: timestamp, enqueuedAt: null })
          .where(and(eq(qqChangelogPushes.version, input.version), eq(qqChangelogPushes.groupOpenId, groupOpenId), eq(qqChangelogPushes.generation, row.generation), eq(qqChangelogPushes.status, row.status))));
      }
      statements.push(db.insert(auditEvents).values({ id: crypto.randomUUID(), correlationId: crypto.randomUUID(), actorType: auth.actorType, actorId: auth.subject, operation: "qq.changelog.push", entityType: "qq_changelog_push", entityId: input.version, payloadJson: JSON.stringify({ groupOpenIds: input.groupOpenIds, confirmResend: input.confirmResend }), createdAt: timestamp }));
      await db.batch(statements as [any, ...any[]]);
      await dispatchPendingQqChangelogPushes();
      const rows = await db.select().from(qqChangelogPushes).where(eq(qqChangelogPushes.version, input.version));
      return rows.filter((row) => input.groupOpenIds.includes(row.groupOpenId)).map(toItem);
    },

    async loadQqChangelogPushForDelivery(input) {
      const row = await db.select().from(qqChangelogPushes).where(and(eq(qqChangelogPushes.version, input.version), eq(qqChangelogPushes.groupOpenId, input.groupOpenId), eq(qqChangelogPushes.idempotencyKey, input.idempotencyKey), eq(qqChangelogPushes.status, "pending"))).get();
      return row ? { contractVersion: "1", version: row.version, groupOpenId: row.groupOpenId, idempotencyKey: row.idempotencyKey, markdown: row.markdown } : null;
    },

    async recordQqChangelogPushResult(input) {
      const failed = input.result.status === "failed" ? input.result : null;
      await db.update(qqChangelogPushes)
        .set({ status: failed ? "failed" : "sent", retryable: failed ? (failed.retryable ? 1 : 0) : null, errorCode: failed?.errorCode ?? null, updatedAt: now() })
        .where(and(eq(qqChangelogPushes.version, input.version), eq(qqChangelogPushes.groupOpenId, input.groupOpenId), eq(qqChangelogPushes.idempotencyKey, input.idempotencyKey), eq(qqChangelogPushes.status, "pending")));
    },
  };
};
