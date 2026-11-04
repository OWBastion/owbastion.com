import {
  auditEventsRequiredIdSchema,
  bindingsSchema,
  idempotencyKeysRequiredIdSchema,
  playerAccountsSchema,
  qqGroupAccessSchema,
  qqLoginAttemptsSchema,
} from "../test/schema";
import { createTestD1 } from "../test/d1";
import { DatabaseSync } from "node:sqlite";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createPlatformServices } from "./index";
import { hashRequest } from "./portal-session";
import type { AuthContext } from "@owbastion/domain";

const codeAlphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const codeForByte = (byte: number) => codeAlphabet[byte % codeAlphabet.length].repeat(6);

/**
 * D1 shim over node:sqlite. Real transactional semantics matter here: the
 * partial unique index on qq_login_attempts must reject a colliding INSERT
 * the same way SQLite/D1 does, and pruning runs through raw database.batch.
 */
const createD1 = () => createTestD1({ foreignKeys: true, batchMode: "transactional", reportWriteChangesInAll: true });
const installSchema = (sqlite: DatabaseSync) => sqlite.exec(`
  ${playerAccountsSchema}
  ${bindingsSchema}
  CREATE UNIQUE INDEX bindings_provider_member_idx ON bindings(provider, member_open_id);
  ${qqGroupAccessSchema}
  ${qqLoginAttemptsSchema}
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
  ${idempotencyKeysRequiredIdSchema}
  ${auditEventsRequiredIdSchema}
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

describe("QQ login attempt codes", () => {
  afterEach(() => {
    vi.restoreAllMocks();
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

});
