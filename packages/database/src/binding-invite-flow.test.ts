import { DatabaseSync } from "node:sqlite";
import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { createPlatformServices } from "./index";

const hashRequest = (value: unknown) => createHash("sha256").update(JSON.stringify(value)).digest("hex");

const createD1 = () => {
  const sqlite = new DatabaseSync(":memory:");
  sqlite.exec(`
    CREATE TABLE binding_invites (id TEXT PRIMARY KEY, code_hash TEXT NOT NULL UNIQUE, code_ciphertext TEXT, player_name TEXT NOT NULL, normalized_player_name TEXT NOT NULL, player_id TEXT NOT NULL, created_by TEXT NOT NULL, created_at INTEGER NOT NULL, expires_at INTEGER NOT NULL, redeemed_at INTEGER, revoked_at INTEGER, revoked_by TEXT);
    CREATE TABLE historical_title_grants (id TEXT PRIMARY KEY, scope TEXT NOT NULL, map_id TEXT, slot TEXT, title_key TEXT NOT NULL, holder_name TEXT NOT NULL, source_version TEXT NOT NULL);
    CREATE TABLE player_title_grants (id TEXT PRIMARY KEY, player_account_id TEXT NOT NULL, title_key TEXT NOT NULL, map_id TEXT, slot TEXT, status TEXT NOT NULL, source_type TEXT NOT NULL, source_id TEXT NOT NULL, granted_by TEXT NOT NULL, granted_at INTEGER NOT NULL, revoked_by TEXT, revoked_at INTEGER, revoke_reason TEXT);
    CREATE TABLE binding_invite_historical_title_grants (id TEXT PRIMARY KEY, invite_id TEXT NOT NULL, historical_title_grant_id TEXT NOT NULL, authorized_by TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'authorized', player_title_grant_id TEXT, last_error TEXT, created_at INTEGER NOT NULL, processed_at INTEGER);
    CREATE TABLE binding_claims (id TEXT PRIMARY KEY, invite_id TEXT NOT NULL, token_hash TEXT NOT NULL, code_hash TEXT NOT NULL UNIQUE, player_name TEXT NOT NULL, normalized_player_name TEXT NOT NULL, player_id TEXT NOT NULL, status TEXT NOT NULL, member_open_id TEXT, group_open_id TEXT, message_id TEXT, expires_at INTEGER NOT NULL, created_at INTEGER NOT NULL, verified_at INTEGER, decided_at INTEGER, decided_by TEXT, decision_reason TEXT);
    CREATE TABLE player_accounts (id TEXT PRIMARY KEY, player_id TEXT NOT NULL, player_name TEXT NOT NULL, normalized_player_name TEXT NOT NULL, is_admin INTEGER NOT NULL DEFAULT 0, status TEXT NOT NULL DEFAULT 'active', banned_at INTEGER, banned_by TEXT, ban_reason TEXT, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL);
    CREATE TABLE identities (id TEXT PRIMARY KEY, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL);
    CREATE TABLE bindings (id TEXT PRIMARY KEY, identity_id TEXT NOT NULL, player_account_id TEXT NOT NULL, provider TEXT NOT NULL, group_open_id TEXT NOT NULL, member_open_id TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'active', revoked_at INTEGER, revoked_by TEXT, created_at INTEGER NOT NULL);
    CREATE TABLE qq_group_access (group_open_id TEXT PRIMARY KEY, display_name TEXT NOT NULL DEFAULT '', environment TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'pending', bind_enabled INTEGER NOT NULL DEFAULT 0, verify_enabled INTEGER NOT NULL DEFAULT 0, lifecycle_occurred_at INTEGER NOT NULL DEFAULT 0, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL);
    CREATE TABLE idempotency_keys (id TEXT PRIMARY KEY, actor_id TEXT NOT NULL, operation TEXT NOT NULL, request_hash TEXT NOT NULL, response_json TEXT NOT NULL, created_at INTEGER NOT NULL);
    CREATE TABLE audit_events (id TEXT PRIMARY KEY, correlation_id TEXT NOT NULL, actor_type TEXT NOT NULL, actor_id TEXT NOT NULL, operation TEXT NOT NULL, entity_type TEXT NOT NULL, entity_id TEXT NOT NULL, payload_json TEXT NOT NULL, created_at INTEGER NOT NULL);
    CREATE TABLE qq_sessions (id TEXT PRIMARY KEY, attempt_id TEXT NOT NULL, group_open_id TEXT NOT NULL, member_open_id TEXT NOT NULL, environment TEXT NOT NULL, token_hash TEXT NOT NULL, expires_at INTEGER NOT NULL, created_at INTEGER NOT NULL);
  `);
  const wrap = (sql: string) => {
    let bound: unknown[] = [];
    const statement = {
      bind(...params: unknown[]) { bound = params; return statement; },
      async first<T>() { return (sqlite.prepare(sql).get(...bound) as T | undefined) ?? null; },
      async all<T>() { const results = sqlite.prepare(sql).all(...bound) as T[]; return { results, success: true, meta: {} }; },
      async run() { sqlite.prepare(sql).run(...bound); return { success: true, meta: {} }; },
      async raw<T extends unknown[] = unknown[]>() { const statement = sqlite.prepare(sql); statement.setReturnArrays(true); return statement.all(...bound) as T[]; },
    };
    return statement;
  };
  const database = {
    prepare(sql: string) { return wrap(sql); },
    async batch(statements: Array<ReturnType<typeof wrap>>) { for (const statement of statements) await statement.run(); return []; },
  } as unknown as D1Database;
  return { database, sqlite };
};

const auth = { actorType: "service" as const, subject: "qqbot", roles: ["channel:write"] as const, provider: "test" };

describe("invitation binding flow", () => {
  it("migrates only explicitly authorized historical titles after a clean binding", async () => {
    const { database, sqlite } = createD1();
    const now = Date.now();
    sqlite.prepare("INSERT INTO historical_title_grants (id, scope, title_key, holder_name, source_version) VALUES ('hist.1', 'global', 'TITLE', 'Player', 'test')").run();
    sqlite.prepare("INSERT INTO qq_group_access (group_open_id, environment, status, verify_enabled, created_at, updated_at) VALUES ('group.1', 'test', 'active', 1, ?, ?)").run(now, now);
    const services = createPlatformServices(database, undefined, undefined, undefined, undefined, undefined, undefined, undefined, "test-encryption-key");
    const invite = await services.createAdminBindingInvite({ contractVersion: "1", playerName: "Player", playerId: "1234", historicalTitleGrantIds: ["hist.1"] }, auth, "invite.1");
    const claim = await services.redeemBindingInvite({ contractVersion: "1", code: invite.code });
    await services.verifyBindingClaim({ contractVersion: "1", provider: "qq", code: claim.code, groupOpenId: "group.1", memberOpenId: "member.1", messageId: "message.1" }, auth, "verify.1");

    expect(sqlite.prepare("SELECT source_id, player_account_id, status FROM player_title_grants").get()).toMatchObject({ source_id: "hist.1", status: "active" });
    expect(sqlite.prepare("SELECT status FROM binding_invite_historical_title_grants").get()).toEqual({ status: "created" });
    expect(sqlite.prepare("SELECT operation FROM audit_events WHERE operation = 'binding_invite.historical_migration.item'").get()).toEqual({ operation: "binding_invite.historical_migration.item" });
    const status = await services.getBindingClaimStatus({ claimId: claim.claimId, claimToken: claim.claimToken });
    expect(status.historicalMigration).toMatchObject({ status: "completed", requestedCount: 1, restoredCount: 1 });
  });

  it("does not authorize a name-equal historical holder without explicit selection", async () => {
    const { database, sqlite } = createD1();
    const now = Date.now();
    sqlite.prepare("INSERT INTO historical_title_grants (id, scope, title_key, holder_name, source_version) VALUES ('hist.1', 'global', 'TITLE', 'Player', 'test')").run();
    sqlite.prepare("INSERT INTO qq_group_access (group_open_id, environment, status, verify_enabled, created_at, updated_at) VALUES ('group.1', 'test', 'active', 1, ?, ?)").run(now, now);
    const services = createPlatformServices(database, undefined, undefined, undefined, undefined, undefined, undefined, undefined, "test-encryption-key");
    const invite = await services.createAdminBindingInvite({ contractVersion: "1", playerName: "Player", playerId: "1234", historicalTitleGrantIds: [] }, auth, "invite.1");
    const claim = await services.redeemBindingInvite({ contractVersion: "1", code: invite.code });
    await services.verifyBindingClaim({ contractVersion: "1", provider: "qq", code: claim.code, groupOpenId: "group.1", memberOpenId: "member.1", messageId: "message.1" }, auth, "verify.1");

    expect(sqlite.prepare("SELECT COUNT(*) AS count FROM binding_invite_historical_title_grants").get()).toEqual({ count: 0 });
    expect(sqlite.prepare("SELECT COUNT(*) AS count FROM player_title_grants").get()).toEqual({ count: 0 });
  });

  it("runs the same authorized migration after a reviewed binding", async () => {
    const { database, sqlite } = createD1();
    const now = Date.now();
    sqlite.prepare("INSERT INTO historical_title_grants (id, scope, title_key, holder_name, source_version) VALUES ('hist.1', 'map', 'TITLE', 'Player', 'test')").run();
    sqlite.prepare("INSERT INTO player_accounts (id, player_id, player_name, normalized_player_name, created_at, updated_at) VALUES ('player.1', '1234', 'Player', 'player', ?, ?)").run(now, now);
    sqlite.prepare("INSERT INTO identities (id, created_at, updated_at) VALUES ('identity.1', ?, ?)").run(now, now);
    sqlite.prepare("INSERT INTO bindings (id, identity_id, player_account_id, provider, group_open_id, member_open_id, created_at) VALUES ('binding.1', 'identity.1', 'player.1', 'qq', 'group.old', 'member.old', ?)").run(now);
    sqlite.prepare("INSERT INTO qq_group_access (group_open_id, environment, status, verify_enabled, created_at, updated_at) VALUES ('group.1', 'test', 'active', 1, ?, ?)").run(now, now);
    const services = createPlatformServices(database, undefined, undefined, undefined, undefined, undefined, undefined, undefined, "test-encryption-key");
    const invite = await services.createAdminBindingInvite({ contractVersion: "1", playerName: "Player", playerId: "1234", historicalTitleGrantIds: ["hist.1"] }, auth, "invite.1");
    const claim = await services.redeemBindingInvite({ contractVersion: "1", code: invite.code });
    await services.verifyBindingClaim({ contractVersion: "1", provider: "qq", code: claim.code, groupOpenId: "group.1", memberOpenId: "member.new", messageId: "message.1" }, auth, "verify.1");
    await services.decideAdminBindingClaim({ claimId: claim.claimId, contractVersion: "1", decision: "approved" }, { ...auth, actorType: "user", subject: "admin.1", roles: ["admin"] }, "decision.1");

    expect(sqlite.prepare("SELECT source_id, player_account_id, status FROM player_title_grants").get()).toMatchObject({ source_id: "hist.1", player_account_id: "player.1", status: "active" });
    expect(sqlite.prepare("SELECT status FROM binding_claims").get()).toEqual({ status: "approved" });
  });

  it("records a conflict without reassigning an already migrated historical title", async () => {
    const { database, sqlite } = createD1();
    const now = Date.now();
    sqlite.prepare("INSERT INTO historical_title_grants (id, scope, title_key, holder_name, source_version) VALUES ('hist.1', 'global', 'TITLE', 'Player', 'test')").run();
    sqlite.prepare("INSERT INTO qq_group_access (group_open_id, environment, status, verify_enabled, created_at, updated_at) VALUES ('group.1', 'test', 'active', 1, ?, ?)").run(now, now);
    const services = createPlatformServices(database, undefined, undefined, undefined, undefined, undefined, undefined, undefined, "test-encryption-key");
    const invite = await services.createAdminBindingInvite({ contractVersion: "1", playerName: "Player", playerId: "1234", historicalTitleGrantIds: ["hist.1"] }, auth, "invite.1");
    sqlite.prepare("INSERT INTO player_title_grants (id, player_account_id, title_key, status, source_type, source_id, granted_by, granted_at) VALUES ('grant.other', 'other-player', 'TITLE', 'active', 'historical', 'hist.1', 'admin', ?)").run(now);
    const claim = await services.redeemBindingInvite({ contractVersion: "1", code: invite.code });
    await services.verifyBindingClaim({ contractVersion: "1", provider: "qq", code: claim.code, groupOpenId: "group.1", memberOpenId: "member.1", messageId: "message.1" }, auth, "verify.1");

    expect(sqlite.prepare("SELECT player_account_id, status FROM player_title_grants WHERE source_id = 'hist.1'").get()).toEqual({ player_account_id: "other-player", status: "active" });
    expect(sqlite.prepare("SELECT status FROM binding_invite_historical_title_grants").get()).toEqual({ status: "conflict" });
  });

  it("automatically activates a clean first binding and records the decision", async () => {
    const { database, sqlite } = createD1();
    const now = Date.now();
    sqlite.prepare("INSERT INTO binding_invites (id, code_hash, player_name, normalized_player_name, player_id, created_by, created_at, expires_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)").run("invite.1", hashRequest("INVITE123456"), "Player", "player", "1234", "admin", now, now + 60_000);
    sqlite.prepare("INSERT INTO qq_group_access (group_open_id, environment, status, verify_enabled, created_at, updated_at) VALUES ('group.1', 'test', 'active', 1, ?, ?)").run(now, now);
    const services = createPlatformServices(database);
    const claim = await services.redeemBindingInvite({ contractVersion: "1", code: "INVITE123456" });
    const result = await services.verifyBindingClaim({ contractVersion: "1", provider: "qq", code: claim.code, groupOpenId: "group.1", memberOpenId: "member.1", messageId: "message.1" }, auth, "verify.1");

    expect(result).toMatchObject({ status: "verified", environment: "test" });
    expect(sqlite.prepare("SELECT status FROM binding_claims").get()).toEqual({ status: "approved" });
    expect(sqlite.prepare("SELECT player_id, player_name FROM player_accounts").get()).toEqual({ player_id: "1234", player_name: "Player" });
    expect(sqlite.prepare("SELECT provider, member_open_id FROM bindings").get()).toEqual({ provider: "qq", member_open_id: "member.1" });
    expect(sqlite.prepare("SELECT operation FROM audit_events WHERE operation = 'qq.binding_claim.auto_activate'").get()).toEqual({ operation: "qq.binding_claim.auto_activate" });

    const sessionOne = await services.exchangeBindingClaimSession({ claimId: claim.claimId, claimToken: claim.claimToken });
    const sessionTwo = await services.exchangeBindingClaimSession({ claimId: claim.claimId, claimToken: claim.claimToken });
    expect(sessionTwo.sessionToken).toBe(sessionOne.sessionToken);
    expect(sqlite.prepare("SELECT COUNT(*) AS count FROM qq_sessions").get()).toEqual({ count: 1 });
  });

  it("routes an existing account binding to review instead of replacing it", async () => {
    const { database, sqlite } = createD1();
    const now = Date.now();
    sqlite.prepare("INSERT INTO player_accounts (id, player_id, player_name, normalized_player_name, created_at, updated_at) VALUES ('player.1', '1234', 'Player', 'player', ?, ?)").run(now, now);
    sqlite.prepare("INSERT INTO identities (id, created_at, updated_at) VALUES ('identity.1', ?, ?)").run(now, now);
    sqlite.prepare("INSERT INTO bindings (id, identity_id, player_account_id, provider, group_open_id, member_open_id, created_at) VALUES ('binding.1', 'identity.1', 'player.1', 'qq', 'group.old', 'member.old', ?)").run(now);
    sqlite.prepare("INSERT INTO binding_invites (id, code_hash, player_name, normalized_player_name, player_id, created_by, created_at, expires_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)").run("invite.1", hashRequest("INVITE123456"), "Player", "player", "1234", "admin", now, now + 60_000);
    sqlite.prepare("INSERT INTO qq_group_access (group_open_id, environment, status, verify_enabled, created_at, updated_at) VALUES ('group.1', 'test', 'active', 1, ?, ?)").run(now, now);
    const services = createPlatformServices(database);
    const claim = await services.redeemBindingInvite({ contractVersion: "1", code: "INVITE123456" });
    await services.verifyBindingClaim({ contractVersion: "1", provider: "qq", code: claim.code, groupOpenId: "group.1", memberOpenId: "member.new", messageId: "message.1" }, auth, "verify.1");

    expect(sqlite.prepare("SELECT status FROM binding_claims").get()).toEqual({ status: "pending_review" });
    expect(sqlite.prepare("SELECT COUNT(*) AS count FROM bindings WHERE status = 'active'").get()).toEqual({ count: 1 });
  });
});
