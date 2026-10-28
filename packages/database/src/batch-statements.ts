import { hashRequest } from "./portal-session";

export type StatementGuard = { sql: string; params: unknown[] };

// Idempotency and audit rows that commit in the same D1 batch as the write they
// describe. A guard keeps them from landing when the guarded write did not.
export const createBatchStatements = (database: D1Database) => ({
  idempotency: async (actorId: string, operation: string, key: string, input: unknown, response: unknown, timestamp: number, guard?: StatementGuard) => {
    const values = [`${actorId}:${operation}:${key}`, actorId, operation, await hashRequest(input), JSON.stringify(response), timestamp];
    return guard
      ? database.prepare(`INSERT INTO idempotency_keys (id, actor_id, operation, request_hash, response_json, created_at) SELECT ?, ?, ?, ?, ?, ? WHERE ${guard.sql}`).bind(...values, ...guard.params)
      : database.prepare("INSERT INTO idempotency_keys (id, actor_id, operation, request_hash, response_json, created_at) VALUES (?, ?, ?, ?, ?, ?)").bind(...values);
  },
  audit: (entityType: string) => (actorType: string, actorId: string, operation: string, entityId: string, payload: unknown, timestamp: number, guard?: StatementGuard) => {
    const values = [crypto.randomUUID(), crypto.randomUUID(), actorType, actorId, operation, entityType, entityId, JSON.stringify(payload), timestamp];
    return guard
      ? database.prepare(`INSERT INTO audit_events (id, correlation_id, actor_type, actor_id, operation, entity_type, entity_id, payload_json, created_at) SELECT ?, ?, ?, ?, ?, ?, ?, ?, ? WHERE ${guard.sql}`).bind(...values, ...guard.params)
      : database.prepare("INSERT INTO audit_events (id, correlation_id, actor_type, actor_id, operation, entity_type, entity_id, payload_json, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)").bind(...values);
  },
});
