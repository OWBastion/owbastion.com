import { and, asc, count, eq, inArray, ne } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";
import type { AuthContext, PlatformServices } from "@owbastion/domain";
import { validatePlayerHandle } from "@owbastion/domain";
import type { PlayerHandleStateResponse } from "@owbastion/contracts";
import { playerAccounts, playerHandles } from "./schema";
import { hashRequest, resolvePortalSession } from "./portal-session";

type PlayerHandleServices = Pick<PlatformServices,
  | "getCurrentPlayerHandle"
  | "requestCurrentPlayerHandle"
  | "withdrawCurrentPlayerHandleRequest"
  | "listAdminPlayerHandles"
  | "approveAdminPlayerHandleRequest"
  | "rejectAdminPlayerHandleRequest"
  | "clearAdminPlayerHandle"
>;

type Dependencies = {
  database: D1Database;
  db: ReturnType<typeof drizzle>;
  now: () => number;
  replayOrConflict: <T>(actorId: string, operation: string, key: string, input: unknown) => Promise<T | null>;
};

const isUniqueViolation = (error: unknown, column: string) => error instanceof Error && error.message.includes("UNIQUE constraint failed") && error.message.includes(column);

// Player handles (#438). Every write commits its row change, idempotency record,
// and audit event in one batch; the partial unique indexes on `player_handles`
// are the concurrency-safe authority for "one holder per normalized handle".
export const createPlayerHandleServices = ({ database, db, now, replayOrConflict }: Dependencies): PlayerHandleServices => {
  const idempotencyStatement = async (actorId: string, operation: string, key: string, input: unknown, response: unknown, timestamp: number, guard?: { sql: string; params: unknown[] }) => {
    const values = [`${actorId}:${operation}:${key}`, actorId, operation, await hashRequest(input), JSON.stringify(response), timestamp];
    return guard
      ? database.prepare(`INSERT INTO idempotency_keys (id, actor_id, operation, request_hash, response_json, created_at) SELECT ?, ?, ?, ?, ?, ? WHERE ${guard.sql}`).bind(...values, ...guard.params)
      : database.prepare("INSERT INTO idempotency_keys (id, actor_id, operation, request_hash, response_json, created_at) VALUES (?, ?, ?, ?, ?, ?)").bind(...values);
  };
  const auditStatement = (actorType: string, actorId: string, operation: string, entityId: string, payload: unknown, timestamp: number, guard?: { sql: string; params: unknown[] }) => {
    const values = [crypto.randomUUID(), crypto.randomUUID(), actorType, actorId, operation, "player_handles", entityId, JSON.stringify(payload), timestamp];
    return guard
      ? database.prepare(`INSERT INTO audit_events (id, correlation_id, actor_type, actor_id, operation, entity_type, entity_id, payload_json, created_at) SELECT ?, ?, ?, ?, ?, ?, ?, ?, ? WHERE ${guard.sql}`).bind(...values, ...guard.params)
      : database.prepare("INSERT INTO audit_events (id, correlation_id, actor_type, actor_id, operation, entity_type, entity_id, payload_json, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)").bind(...values);
  };

  const stateFor = async (playerAccountId: string): Promise<PlayerHandleStateResponse> => {
    const rows = await db.select().from(playerHandles).where(eq(playerHandles.playerAccountId, playerAccountId));
    const active = rows.find((row) => row.status === "active");
    const pending = rows.find((row) => row.status === "pending");
    const rejected = rows.find((row) => row.status === "rejected");
    return {
      contractVersion: "1",
      handle: active?.handle ?? null,
      pending: pending ? { requestId: pending.id, handle: pending.handle, requestedAt: pending.requestedAt } : null,
      rejected: rejected ? { handle: rejected.handle, decidedAt: rejected.decidedAt ?? rejected.requestedAt } : null,
    };
  };

  const currentPlayer = async (sessionToken: string) => {
    const access = await resolvePortalSession(db, sessionToken);
    if (!access) throw new Error("UNAUTHENTICATED");
    return access.player;
  };

  // A concurrent retry of the same Idempotency-Key loses on the idempotency row;
  // it then replays the winner's recorded response.
  const replayAfterRace = async <T>(error: unknown, actorId: string, operation: string, key: string, input: unknown): Promise<T> => {
    if (isUniqueViolation(error, "idempotency_keys.id")) {
      const replay = await replayOrConflict<T>(actorId, operation, key, input);
      if (replay) return replay;
    }
    throw error;
  };

  return {
    async getCurrentPlayerHandle(input) {
      const access = await resolvePortalSession(db, input.sessionToken);
      return access ? stateFor(access.player.id) : null;
    },

    async requestCurrentPlayerHandle(input, idempotencyKey) {
      const operation = "player.handle.request";
      const player = await currentPlayer(input.sessionToken);
      const validated = validatePlayerHandle(input.handle);
      if ("error" in validated) throw new Error(validated.error);
      const { handle } = validated;
      const request = { handle };
      const replay = await replayOrConflict<PlayerHandleStateResponse>(player.id, operation, idempotencyKey, request);
      if (replay) return replay;
      const holder = await db.select({ playerAccountId: playerHandles.playerAccountId, status: playerHandles.status }).from(playerHandles)
        .where(and(eq(playerHandles.handle, handle), ne(playerHandles.status, "rejected"))).get();
      if (holder?.playerAccountId === player.id && holder.status === "active") throw new Error("HANDLE_UNCHANGED");
      if (holder && holder.playerAccountId !== player.id) throw new Error("HANDLE_TAKEN");
      const timestamp = now();
      const requestId = crypto.randomUUID();
      const pending = { requestId, handle, requestedAt: timestamp };
      const current = await stateFor(player.id);
      const response: PlayerHandleStateResponse = { ...current, pending, rejected: null };
      try {
        await database.batch([
          // A new request replaces the Player's earlier pending or rejected one.
          database.prepare("DELETE FROM player_handles WHERE player_account_id = ? AND status IN ('pending', 'rejected')").bind(player.id),
          database.prepare("INSERT INTO player_handles (id, player_account_id, handle, status, requested_at) VALUES (?, ?, ?, 'pending', ?)").bind(requestId, player.id, handle, timestamp),
          await idempotencyStatement(player.id, operation, idempotencyKey, request, response, timestamp),
          auditStatement("user", player.id, operation, requestId, request, timestamp),
        ]);
      } catch (error) {
        if (isUniqueViolation(error, "player_handles.handle")) throw new Error("HANDLE_TAKEN");
        return replayAfterRace(error, player.id, operation, idempotencyKey, request);
      }
      return response;
    },

    async withdrawCurrentPlayerHandleRequest(input, idempotencyKey) {
      const operation = "player.handle.withdraw";
      const player = await currentPlayer(input.sessionToken);
      const request = {};
      const replay = await replayOrConflict<PlayerHandleStateResponse>(player.id, operation, idempotencyKey, request);
      if (replay) return replay;
      const pending = await db.select({ id: playerHandles.id, handle: playerHandles.handle }).from(playerHandles)
        .where(and(eq(playerHandles.playerAccountId, player.id), eq(playerHandles.status, "pending"))).get();
      if (!pending) throw new Error("HANDLE_REQUEST_NOT_FOUND");
      const timestamp = now();
      const response: PlayerHandleStateResponse = { ...(await stateFor(player.id)), pending: null };
      try {
        await database.batch([
          database.prepare("DELETE FROM player_handles WHERE id = ? AND status = 'pending'").bind(pending.id),
          await idempotencyStatement(player.id, operation, idempotencyKey, request, response, timestamp),
          auditStatement("user", player.id, operation, pending.id, { handle: pending.handle }, timestamp),
        ]);
      } catch (error) {
        return replayAfterRace(error, player.id, operation, idempotencyKey, request);
      }
      return response;
    },

    async listAdminPlayerHandles(input) {
      const rows = await db.select({
        handleId: playerHandles.id,
        playerAccountId: playerHandles.playerAccountId,
        playerName: playerAccounts.playerName,
        handle: playerHandles.handle,
        requestedAt: playerHandles.requestedAt,
      }).from(playerHandles)
        .innerJoin(playerAccounts, eq(playerAccounts.id, playerHandles.playerAccountId))
        .where(eq(playerHandles.status, input.status))
        .orderBy(asc(playerHandles.requestedAt), asc(playerHandles.id))
        .limit(input.pageSize)
        .offset((input.page - 1) * input.pageSize);
      const [{ total }] = await db.select({ total: count() }).from(playerHandles).where(eq(playerHandles.status, input.status));
      const activeByPlayer = new Map<string, string>();
      if (input.status === "pending" && rows.length) {
        const activeRows = await db.select({ playerAccountId: playerHandles.playerAccountId, handle: playerHandles.handle }).from(playerHandles)
          .where(and(eq(playerHandles.status, "active"), inArray(playerHandles.playerAccountId, rows.map((row) => row.playerAccountId))));
        for (const row of activeRows) activeByPlayer.set(row.playerAccountId, row.handle);
      }
      return {
        contractVersion: "1" as const,
        status: input.status,
        items: rows.map((row) => ({ ...row, currentHandle: activeByPlayer.get(row.playerAccountId) ?? null })),
        page: input.page,
        pageSize: input.pageSize,
        total,
        hasMore: input.page * input.pageSize < total,
      };
    },

    async approveAdminPlayerHandleRequest(input, auth, idempotencyKey) {
      await decide("admin.player.handle.approve", "active", input.handleId, auth, idempotencyKey);
    },

    async rejectAdminPlayerHandleRequest(input, auth, idempotencyKey) {
      await decide("admin.player.handle.reject", "rejected", input.handleId, auth, idempotencyKey);
    },

    async clearAdminPlayerHandle(input, auth, idempotencyKey) {
      const operation = "admin.player.handle.clear";
      const request = { playerAccountId: input.playerAccountId };
      const replay = await replayOrConflict<Record<string, never>>(auth.subject, operation, idempotencyKey, request);
      if (replay) return;
      const active = await db.select({ id: playerHandles.id, handle: playerHandles.handle }).from(playerHandles)
        .where(and(eq(playerHandles.playerAccountId, input.playerAccountId), eq(playerHandles.status, "active"))).get();
      if (!active) throw new Error("HANDLE_NOT_FOUND");
      const timestamp = now();
      try {
        await database.batch([
          database.prepare("DELETE FROM player_handles WHERE id = ? AND status = 'active'").bind(active.id),
          await idempotencyStatement(auth.subject, operation, idempotencyKey, request, {}, timestamp),
          auditStatement(auth.actorType, auth.subject, operation, active.id, { playerAccountId: input.playerAccountId, handle: active.handle }, timestamp),
        ]);
      } catch (error) {
        await replayAfterRace(error, auth.subject, operation, idempotencyKey, request);
      }
    },
  };

  // Approve activates the request and releases the Player's previous handle in
  // the same batch; reject keeps the current handle. Guards make a request that
  // was withdrawn or replaced in the meantime a no-op that records nothing.
  async function decide(operation: string, outcome: "active" | "rejected", requestId: string, auth: AuthContext, idempotencyKey: string) {
    const request = { requestId };
    const replay = await replayOrConflict<Record<string, never>>(auth.subject, operation, idempotencyKey, request);
    if (replay) return;
    const pending = await db.select({ id: playerHandles.id, playerAccountId: playerHandles.playerAccountId, handle: playerHandles.handle }).from(playerHandles)
      .where(and(eq(playerHandles.id, requestId), eq(playerHandles.status, "pending"))).get();
    if (!pending) throw new Error("HANDLE_REQUEST_NOT_FOUND");
    const timestamp = now();
    const decided = { sql: "EXISTS (SELECT 1 FROM player_handles WHERE id = ? AND status = ? AND decided_at = ? AND decided_by = ?)", params: [requestId, outcome, timestamp, auth.subject] };
    let results: Array<{ meta: { changes: number } }>;
    try {
      results = await database.batch([
        ...(outcome === "active"
          ? [database.prepare("DELETE FROM player_handles WHERE status = 'active' AND player_account_id = (SELECT player_account_id FROM player_handles WHERE id = ? AND status = 'pending')").bind(requestId)]
          : []),
        database.prepare("UPDATE player_handles SET status = ?, decided_at = ?, decided_by = ? WHERE id = ? AND status = 'pending'").bind(outcome, timestamp, auth.subject, requestId),
        await idempotencyStatement(auth.subject, operation, idempotencyKey, request, {}, timestamp, decided),
        auditStatement(auth.actorType, auth.subject, operation, requestId, { playerAccountId: pending.playerAccountId, handle: pending.handle }, timestamp, decided),
      ]) as Array<{ meta: { changes: number } }>;
    } catch (error) {
      await replayAfterRace(error, auth.subject, operation, idempotencyKey, request);
      return;
    }
    if (results[outcome === "active" ? 1 : 0]!.meta.changes === 0) throw new Error("HANDLE_REQUEST_NOT_FOUND");
  }
};
