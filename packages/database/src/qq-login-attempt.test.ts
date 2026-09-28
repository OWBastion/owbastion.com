import { DatabaseSync } from "node:sqlite";
import { createHash } from "node:crypto";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createPlatformServices } from "./index";
import type { AuthContext } from "@owbastion/domain";

const hashRequest = (value: unknown) => createHash("sha256").update(JSON.stringify(value)).digest("hex");
const codeAlphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const codeForByte = (byte: number) => codeAlphabet[byte % codeAlphabet.length].repeat(6);

/**
 * D1 shim over node:sqlite. Real transactional semantics matter here: the
 * partial unique index on qq_login_attempts must reject a colliding INSERT
 * the same way SQLite/D1 does, and pruning runs through raw database.batch.
 */
const createD1 = () => {
  const sqlite = new DatabaseSync(":memory:");
  sqlite.exec("PRAGMA foreign_keys = ON;");
  const wrapStatement = (sql: string) => {
    let bound: unknown[] = [];
    const isWrite = /^\s*(INSERT|UPDATE|DELETE|REPLACE)\b/i.test(sql);
    const statement = {
      bind(...params: unknown[]) { bound = params; return statement; },
      async first<T>() { return (sqlite.prepare(sql).get(...bound) as T | undefined) ?? null; },
      async all<T>() {
        const results = sqlite.prepare(sql).all(...bound) as T[];
        const changes = isWrite ? Number((sqlite.prepare("SELECT changes() AS changes").get() as { changes: number }).changes) : 0;
        return { results, success: true, meta: { changes, duration: 0, size_after: 0, rows_read: results.length, rows_written: changes, last_row_id: 0, changed_db: changes > 0 } };
      },
      async run() {
        const result = sqlite.prepare(sql).run(...bound);
        const changes = Number(result.changes ?? 0);
        return { success: true, meta: { changes, duration: 0, size_after: 0, rows_read: 0, rows_written: changes, last_row_id: Number(result.lastInsertRowid ?? 0), changed_db: changes > 0 } };
      },
      async raw<T extends unknown[] = unknown[]>() {
        const prepared = sqlite.prepare(sql);
        prepared.setReturnArrays(true);
        return prepared.all(...bound) as T[];
      },
    };
    return statement;
  };
  const database = {
    prepare(sql: string) { return wrapStatement(sql); },
    async batch(statements: Array<ReturnType<typeof wrapStatement>>) {
      sqlite.exec("BEGIN");
      try {
        const results = [];
        for (const statement of statements) results.push(await statement.all());
        sqlite.exec("COMMIT");
        return results;
      } catch (error) {
        sqlite.exec("ROLLBACK");
        throw error;
      }
    },
    async exec(sql: string) { sqlite.exec(sql); return []; },
    withSession() { return database; },
  } as unknown as D1Database;
  return { database, sqlite };
};

const installSchema = (sqlite: DatabaseSync) => sqlite.exec(`
  CREATE TABLE player_accounts (
    id TEXT PRIMARY KEY NOT NULL, player_id TEXT NOT NULL, player_name TEXT NOT NULL,
    normalized_player_name TEXT NOT NULL, is_admin INTEGER NOT NULL DEFAULT 0,
    status TEXT NOT NULL DEFAULT 'active', banned_at INTEGER, banned_by TEXT, ban_reason TEXT,
    created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL
  );
  CREATE TABLE bindings (
    id TEXT PRIMARY KEY NOT NULL, identity_id TEXT NOT NULL, player_account_id TEXT NOT NULL,
    provider TEXT NOT NULL, group_open_id TEXT NOT NULL, member_open_id TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'active', revoked_at INTEGER, revoked_by TEXT, created_at INTEGER NOT NULL
  );
  CREATE UNIQUE INDEX bindings_provider_member_idx ON bindings(provider, member_open_id);
  CREATE TABLE qq_group_access (
    group_open_id TEXT PRIMARY KEY NOT NULL, display_name TEXT NOT NULL DEFAULT '', environment TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'pending',
    bind_enabled INTEGER NOT NULL DEFAULT 0, verify_enabled INTEGER NOT NULL DEFAULT 0,
    lifecycle_occurred_at INTEGER NOT NULL DEFAULT 0, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL
  );
  CREATE TABLE qq_login_attempts (
    id TEXT PRIMARY KEY NOT NULL, token_hash TEXT NOT NULL, code_hash TEXT NOT NULL, status TEXT NOT NULL,
    purpose TEXT NOT NULL DEFAULT 'login', player_account_id TEXT, target_group_open_id TEXT,
    group_open_id TEXT, member_open_id TEXT, environment TEXT, message_id TEXT,
    session_token_hash TEXT, session_issued_at INTEGER, expires_at INTEGER NOT NULL,
    created_at INTEGER NOT NULL, verified_at INTEGER
  );
  CREATE UNIQUE INDEX qq_login_attempts_token_idx ON qq_login_attempts(token_hash);
  CREATE INDEX qq_login_attempts_expiry_idx ON qq_login_attempts(expires_at, status);
  CREATE UNIQUE INDEX qq_login_attempts_pending_code_idx ON qq_login_attempts(code_hash) WHERE status = 'pending';
  CREATE TABLE binding_claims (
    id TEXT PRIMARY KEY NOT NULL, invite_id TEXT NOT NULL, token_hash TEXT NOT NULL, code_hash TEXT NOT NULL,
    player_name TEXT NOT NULL, normalized_player_name TEXT NOT NULL, player_id TEXT NOT NULL, status TEXT NOT NULL,
    member_open_id TEXT, group_open_id TEXT, message_id TEXT, expires_at INTEGER NOT NULL,
    created_at INTEGER NOT NULL, verified_at INTEGER, decided_at INTEGER, decided_by TEXT, decision_reason TEXT
  );
  CREATE TABLE portal_sessions (
    id TEXT PRIMARY KEY NOT NULL, player_account_id TEXT NOT NULL REFERENCES player_accounts(id),
    token_hash TEXT NOT NULL UNIQUE, passkey_challenge_id TEXT, expires_at INTEGER NOT NULL, created_at INTEGER NOT NULL
  );
  CREATE TABLE idempotency_keys (
    id TEXT PRIMARY KEY NOT NULL, actor_id TEXT NOT NULL, operation TEXT NOT NULL,
    request_hash TEXT NOT NULL, response_json TEXT NOT NULL, created_at INTEGER NOT NULL
  );
  CREATE TABLE audit_events (
    id TEXT PRIMARY KEY NOT NULL, correlation_id TEXT NOT NULL, actor_type TEXT NOT NULL,
    actor_id TEXT NOT NULL, operation TEXT NOT NULL, entity_type TEXT NOT NULL,
    entity_id TEXT NOT NULL, payload_json TEXT NOT NULL, created_at INTEGER NOT NULL
  );
`);

const qqAuth: AuthContext = { actorType: "service", subject: "qqbot", roles: ["channel:write"], provider: "test" };

const seedActiveGroupAndBinding = (sqlite: DatabaseSync, { groupOpenId, memberOpenId, accountId }: { groupOpenId: string; memberOpenId: string; accountId: string }) => {
  sqlite.prepare("INSERT INTO qq_group_access (group_open_id, environment, status, bind_enabled, verify_enabled, created_at, updated_at) VALUES (?, 'test', 'active', 1, 1, 1, 1)").run(groupOpenId);
  sqlite.prepare("INSERT INTO player_accounts (id, player_id, player_name, normalized_player_name, is_admin, status, created_at, updated_at) VALUES (?, '1001', 'Player', 'player', 0, 'active', 1, 1)").run(accountId);
  sqlite.prepare("INSERT INTO bindings (id, identity_id, player_account_id, provider, group_open_id, member_open_id, status, created_at) VALUES ('binding.one', 'identity.one', ?, 'qq', ?, ?, 'active', 1)").run(accountId, groupOpenId, memberOpenId);
};

/** Directly inserts a qq_login_attempts row, bypassing the service so tests can seed a stale duplicate exactly as the migration would find one. */
const insertAttempt = (sqlite: DatabaseSync, row: { id: string; tokenHash: string; codeHash: string; status: string; expiresAt: number; createdAt: number }) => {
  sqlite.prepare("INSERT INTO qq_login_attempts (id, token_hash, code_hash, status, expires_at, created_at) VALUES (?, ?, ?, ?, ?, ?)")
    .run(row.id, row.tokenHash, row.codeHash, row.status, row.expiresAt, row.createdAt);
};

describe("QQ login attempt code hardening (#245)", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("retries with a new code when the random code collides with a live pending attempt", async () => {
    const { database, sqlite } = createD1();
    installSchema(sqlite);
    const now = Date.now();
    // Force the first randomly-drawn code to collide with an existing live attempt.
    insertAttempt(sqlite, { id: "attempt.existing", tokenHash: "token.existing", codeHash: await hashRequest(codeForByte(0)), status: "pending", expiresAt: now + 60_000, createdAt: now });
    let codeDraws = 0;
    vi.spyOn(globalThis.crypto, "getRandomValues").mockImplementation((<T extends ArrayBufferView | null>(array: T) => {
      if (array instanceof Uint8Array && array.length === 6) {
        (array as Uint8Array).fill(codeDraws);
        codeDraws += 1;
      } else if (array instanceof Uint8Array) {
        (array as Uint8Array).fill(0xaa);
      }
      return array;
    }) as typeof globalThis.crypto.getRandomValues);
    const services = createPlatformServices(database);

    const result = await services.createQqLoginAttempt({ contractVersion: "1", provider: "qq" });

    expect(codeDraws).toBe(2); // the colliding draw, then the successful retry
    expect(result.code).toBe(codeForByte(1));
    expect(result.code).not.toBe(codeForByte(0));
    const pendingForCollidingCode = sqlite.prepare("SELECT COUNT(*) AS count FROM qq_login_attempts WHERE code_hash = ? AND status = 'pending'").get(await hashRequest(codeForByte(0))) as { count: number };
    expect(pendingForCollidingCode.count).toBe(1); // only the pre-existing attempt, not a second one with the same code
  });

  it("verifies only the live attempt when an older expired row shares the same code_hash", async () => {
    const { database, sqlite } = createD1();
    installSchema(sqlite);
    seedActiveGroupAndBinding(sqlite, { groupOpenId: "group.one", memberOpenId: "member.one", accountId: "account.one" });
    const now = Date.now();

    // An abandoned attempt that shares a code with a later live attempt, already expired.
    insertAttempt(sqlite, { id: "attempt.stale", tokenHash: "token.stale", codeHash: await hashRequest("SHARED1"), status: "expired", expiresAt: now - 60_000, createdAt: now - 180_000 });
    // The live attempt a real player is currently using.
    insertAttempt(sqlite, { id: "attempt.live", tokenHash: "token.live", codeHash: await hashRequest("SHARED1"), status: "pending", expiresAt: now + 60_000, createdAt: now });

    const services = createPlatformServices(database);
    const result = await services.verifyQqLogin(
      { contractVersion: "1", provider: "qq", code: "SHARED1", groupOpenId: "group.one", memberOpenId: "member.one", messageId: "message.one" },
      qqAuth,
      "idempotency.verify.1",
    );

    expect(result.status).toBe("verified");
    const live = sqlite.prepare("SELECT status FROM qq_login_attempts WHERE id = 'attempt.live'").get() as { status: string };
    expect(live.status).toBe("verified");
    const stale = sqlite.prepare("SELECT status FROM qq_login_attempts WHERE id = 'attempt.stale'").get() as { status: string };
    expect(stale.status).toBe("expired");
  });

  it("rejects a code whose only pending attempt has already expired, and marks it expired", async () => {
    const { database, sqlite } = createD1();
    installSchema(sqlite);
    seedActiveGroupAndBinding(sqlite, { groupOpenId: "group.one", memberOpenId: "member.one", accountId: "account.one" });
    const now = Date.now();
    insertAttempt(sqlite, { id: "attempt.expired", tokenHash: "token.expired", codeHash: await hashRequest("EXPIRE1"), status: "pending", expiresAt: now - 1_000, createdAt: now - 121_000 });

    const services = createPlatformServices(database);
    await expect(services.verifyQqLogin(
      { contractVersion: "1", provider: "qq", code: "EXPIRE1", groupOpenId: "group.one", memberOpenId: "member.one", messageId: "message.one" },
      qqAuth,
      "idempotency.verify.2",
    )).rejects.toThrow("LOGIN_CODE_EXPIRED");

    const row = sqlite.prepare("SELECT status FROM qq_login_attempts WHERE id = 'attempt.expired'").get() as { status: string };
    expect(row.status).toBe("expired");
  });

  it("rejects an unknown code with LOGIN_CODE_INVALID", async () => {
    const { database, sqlite } = createD1();
    installSchema(sqlite);
    seedActiveGroupAndBinding(sqlite, { groupOpenId: "group.one", memberOpenId: "member.one", accountId: "account.one" });
    const services = createPlatformServices(database);

    await expect(services.verifyQqLogin(
      { contractVersion: "1", provider: "qq", code: "NOPE12", groupOpenId: "group.one", memberOpenId: "member.one", messageId: "message.one" },
      qqAuth,
      "idempotency.verify.3",
    )).rejects.toThrow("LOGIN_CODE_INVALID");
  });

  it("prunes long-stale terminal attempts on the login-attempt creation hot path", async () => {
    const { database, sqlite } = createD1();
    installSchema(sqlite);
    const now = Date.now();
    // Far past its own expiry and already terminal: eligible for deletion.
    insertAttempt(sqlite, { id: "attempt.old", tokenHash: "token.old", codeHash: "code.old", status: "expired", expiresAt: now - 20 * 60_000, createdAt: now - 25 * 60_000 });
    // Terminal but only just past expiry: kept, so a client that polls right after expiry still sees "expired".
    insertAttempt(sqlite, { id: "attempt.recent", tokenHash: "token.recent", codeHash: "code.recent", status: "expired", expiresAt: now - 1_000, createdAt: now - 121_000 });
    // Still pending past its own expiry: flipped to expired, not deleted.
    insertAttempt(sqlite, { id: "attempt.pending-past-ttl", tokenHash: "token.pending", codeHash: "code.pending", status: "pending", expiresAt: now - 5_000, createdAt: now - 125_000 });

    const services = createPlatformServices(database);
    await services.createQqLoginAttempt({ contractVersion: "1", provider: "qq" });

    const remainingIds = (sqlite.prepare("SELECT id, status FROM qq_login_attempts ORDER BY id").all() as { id: string; status: string }[]);
    expect(remainingIds.find((row) => row.id === "attempt.old")).toBeUndefined();
    expect(remainingIds.find((row) => row.id === "attempt.recent")?.status).toBe("expired");
    expect(remainingIds.find((row) => row.id === "attempt.pending-past-ttl")?.status).toBe("expired");
  });
});
