import { DatabaseSync } from "node:sqlite";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { createPlatformServices } from "./index";
import { resolvePortalSession } from "./portal-session";

const hashRequest = (value: unknown) => createHash("sha256").update(JSON.stringify(value)).digest("hex");
const legacyInviteRetryMigration = readFileSync(new URL("../../../migrations/0087_legacy_passkey_invite_retry_anchor.sql", import.meta.url), "utf8");

const createD1 = (failBatchNumbers: number[] = []) => {
  const sqlite = new DatabaseSync(":memory:");
  let batchNumber = 0;
  sqlite.exec(`
    CREATE TABLE binding_invites (id TEXT PRIMARY KEY, code_hash TEXT NOT NULL UNIQUE, code_ciphertext TEXT, player_name TEXT NOT NULL, normalized_player_name TEXT NOT NULL, player_id TEXT NOT NULL, created_by TEXT NOT NULL, created_at INTEGER NOT NULL, expires_at INTEGER NOT NULL, redeemed_at INTEGER, legacy_passkey_player_account_id TEXT, legacy_passkey_challenge_id TEXT, revoked_at INTEGER, revoked_by TEXT);
    CREATE TABLE historical_title_grants (id TEXT PRIMARY KEY, scope TEXT NOT NULL, map_id TEXT, gameplay_revision_id TEXT, slot TEXT, title_key TEXT NOT NULL, holder_name TEXT NOT NULL, source_version TEXT NOT NULL);
    CREATE TABLE title_catalog (key TEXT PRIMARY KEY, label TEXT NOT NULL, icon TEXT NOT NULL DEFAULT 'award', icon_url TEXT, icon_object_key TEXT, category TEXT NOT NULL DEFAULT '', condition TEXT NOT NULL DEFAULT '', lifecycle TEXT NOT NULL DEFAULT 'active', public_visibility INTEGER NOT NULL DEFAULT 1, availability TEXT NOT NULL DEFAULT 'active', scope TEXT NOT NULL DEFAULT 'global', display_kind TEXT NOT NULL DEFAULT 'fixed', color_json TEXT NOT NULL DEFAULT 'null', game_version TEXT);
    CREATE TABLE player_title_grants (id TEXT PRIMARY KEY, player_account_id TEXT NOT NULL, title_key TEXT NOT NULL, map_id TEXT, gameplay_revision_id TEXT, slot TEXT, status TEXT NOT NULL, source_type TEXT NOT NULL, source_id TEXT NOT NULL, granted_by TEXT NOT NULL, granted_at INTEGER NOT NULL, revoked_by TEXT, revoked_at INTEGER, revoke_reason TEXT, completion_id TEXT, revocation_type TEXT);
    CREATE TABLE challenges (id TEXT PRIMARY KEY, source_family TEXT NOT NULL, source_id TEXT NOT NULL, title_key TEXT NOT NULL, rule_version TEXT NOT NULL DEFAULT 'legacy', map_id TEXT, gameplay_revision_id TEXT, status TEXT NOT NULL, manual INTEGER NOT NULL DEFAULT 0, public_condition INTEGER NOT NULL DEFAULT 1, condition_operator TEXT NOT NULL DEFAULT 'and', conditions_json TEXT NOT NULL DEFAULT '[]', condition TEXT NOT NULL, starts_at INTEGER, ends_at INTEGER, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL);
    CREATE TABLE challenge_completions (id TEXT PRIMARY KEY, player_account_id TEXT NOT NULL, challenge_id TEXT NOT NULL, gameplay_revision_id TEXT, status TEXT NOT NULL DEFAULT 'active', source_type TEXT NOT NULL, source_id TEXT NOT NULL, completed_at INTEGER NOT NULL, invalidated_by TEXT, invalidated_at INTEGER, invalidation_reason TEXT, created_at INTEGER NOT NULL);
    CREATE TABLE player_equipped_titles (grant_id TEXT PRIMARY KEY, player_account_id TEXT NOT NULL, equipped_at INTEGER NOT NULL);
    CREATE TABLE binding_invite_historical_title_grants (id TEXT PRIMARY KEY, invite_id TEXT NOT NULL, historical_title_grant_id TEXT NOT NULL, authorized_by TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'authorized', player_title_grant_id TEXT, last_error TEXT, created_at INTEGER NOT NULL, processed_at INTEGER);
    CREATE TABLE binding_claims (id TEXT PRIMARY KEY, invite_id TEXT NOT NULL, token_hash TEXT NOT NULL, code_hash TEXT NOT NULL UNIQUE, player_name TEXT NOT NULL, normalized_player_name TEXT NOT NULL, player_id TEXT NOT NULL, status TEXT NOT NULL, member_open_id TEXT, group_open_id TEXT, message_id TEXT, expires_at INTEGER NOT NULL, created_at INTEGER NOT NULL, verified_at INTEGER, decided_at INTEGER, decided_by TEXT, decision_reason TEXT);
    CREATE TABLE player_accounts (id TEXT PRIMARY KEY, player_id TEXT NOT NULL, player_name TEXT NOT NULL, normalized_player_name TEXT NOT NULL, is_admin INTEGER NOT NULL DEFAULT 0, status TEXT NOT NULL DEFAULT 'active', banned_at INTEGER, banned_by TEXT, ban_reason TEXT, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL);
    CREATE UNIQUE INDEX player_accounts_battletag_idx ON player_accounts(normalized_player_name, player_id);
    CREATE TABLE portal_sessions (id TEXT PRIMARY KEY, player_account_id TEXT NOT NULL, token_hash TEXT NOT NULL, passkey_challenge_id TEXT, expires_at INTEGER NOT NULL, created_at INTEGER NOT NULL);
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
    async batch(statements: Array<ReturnType<typeof wrap>>) {
      batchNumber += 1;
      if (failBatchNumbers.includes(batchNumber)) throw new Error("D1_TRANSIENT_FAILURE");
      for (const statement of statements) await statement.run();
      return [];
    },
  } as unknown as D1Database;
  return { database, sqlite };
};

const auth = { actorType: "service" as const, subject: "qqbot", roles: ["channel:write"] as const, provider: "test" };

describe("invitation binding flow", () => {
  it("updates an administrator's player name while keeping the numeric ID stable", async () => {
    const { database, sqlite } = createD1();
    const timestamp = Date.now();
    sqlite.prepare("INSERT INTO player_accounts (id, player_id, player_name, normalized_player_name, created_at, updated_at) VALUES ('player.1', '1234', '旧名称', '旧名称', ?, ?)").run(timestamp, timestamp);
    const services = createPlatformServices(database);
    const admin = { actorType: "user" as const, subject: "admin.1", roles: ["maintainer"] as const, provider: "test" };
    const input = { contractVersion: "1" as const, playerAccountId: "player.1", playerName: "新名称" };

    await services.updateAdminPlayerIdentity(input, admin, "identity.1");
    await services.updateAdminPlayerIdentity(input, admin, "identity.1");

    expect(sqlite.prepare("SELECT player_id, player_name, normalized_player_name FROM player_accounts WHERE id = 'player.1'").get()).toEqual({ player_id: "1234", player_name: "新名称", normalized_player_name: "新名称" });
    expect(sqlite.prepare("SELECT COUNT(*) AS count FROM idempotency_keys WHERE operation = 'admin.player.identity'").get()).toEqual({ count: 1 });
    expect(sqlite.prepare("SELECT operation, payload_json FROM audit_events WHERE operation = 'admin.player.identity.update'").get()).toMatchObject({ operation: "admin.player.identity.update" });
  });

  it("migrates only explicitly authorized historical titles after a clean binding", async () => {
    const { database, sqlite } = createD1();
    const now = Date.now();
    sqlite.prepare("INSERT INTO player_accounts (id, player_id, player_name, normalized_player_name, created_at, updated_at) VALUES ('player.1', '1234', 'Player', 'player', ?, ?)").run(now, now);
    sqlite.prepare("INSERT INTO historical_title_grants (id, scope, title_key, holder_name, source_version) VALUES ('hist.1', 'global', 'TITLE', 'Player', 'test')").run();
    sqlite.prepare("INSERT INTO qq_group_access (group_open_id, environment, status, verify_enabled, created_at, updated_at) VALUES ('group.1', 'test', 'active', 1, ?, ?)").run(now, now);
    const services = createPlatformServices(database, undefined, undefined, undefined, undefined, undefined, undefined, "test-encryption-key");
    const invite = await services.createAdminBindingInvite({ contractVersion: "1", playerName: "Player", playerId: "1234", historicalTitleGrantIds: ["hist.1"] }, auth, "invite.1");
    const claim = await services.redeemBindingInvite({ contractVersion: "1", code: invite.code });
    await services.verifyBindingClaim({ contractVersion: "1", provider: "qq", code: claim.code, groupOpenId: "group.1", memberOpenId: "member.1", messageId: "message.1" }, auth, "verify.1");

    expect(sqlite.prepare("SELECT source_id, player_account_id, status FROM player_title_grants").get()).toMatchObject({ source_id: "hist.1", status: "active" });
    expect(sqlite.prepare("SELECT status FROM binding_invite_historical_title_grants").get()).toEqual({ status: "created" });
    expect(sqlite.prepare("SELECT operation FROM audit_events WHERE operation = 'binding_invite.historical_migration.item'").get()).toEqual({ operation: "binding_invite.historical_migration.item" });
    const status = await services.getBindingClaimStatus({ claimId: claim.claimId, claimToken: claim.claimToken });
    expect(status.historicalMigration).toMatchObject({ status: "completed", requestedCount: 1, restoredCount: 1 });
  });

  it("reconciles an inherited conqueror grant during binding migration", async () => {
    const { database, sqlite } = createD1();
    const now = Date.now();
    sqlite.exec("CREATE UNIQUE INDEX player_title_grants_active_identity_idx ON player_title_grants(player_account_id, title_key, COALESCE(map_id, '')) WHERE status = 'active';");
    sqlite.prepare("INSERT INTO historical_title_grants (id, scope, map_id, gameplay_revision_id, slot, title_key, holder_name, source_version) VALUES ('hist.conqueror', 'map', 'map.inherited', 'revision:map.inherited:initial', 'conqueror', 'CONQUEROR', 'Player', 'test'), ('hist.dominator', 'map', 'map.inherited', 'revision:map.inherited:initial', 'dominator', 'DOMINATOR', 'Player', 'test')").run();
    sqlite.prepare("INSERT INTO player_accounts (id, player_id, player_name, normalized_player_name, created_at, updated_at) VALUES ('player.1', '1234', 'Player', 'player', ?, ?)").run(now, now);
    sqlite.prepare("INSERT INTO identities (id, created_at, updated_at) VALUES ('identity.1', ?, ?)").run(now, now);
    sqlite.prepare("INSERT INTO bindings (id, identity_id, player_account_id, provider, group_open_id, member_open_id, created_at) VALUES ('binding.1', 'identity.1', 'player.1', 'qq', 'group.old', 'member.old', ?)").run(now);
    sqlite.prepare("INSERT INTO player_title_grants (id, player_account_id, title_key, map_id, gameplay_revision_id, slot, status, source_type, source_id, granted_by, granted_at) VALUES ('grant.dominator', 'player.1', 'DOMINATOR', 'map.inherited', 'revision:map.inherited:initial', 'dominator', 'active', 'historical', 'hist.dominator', 'admin', ?), ('grant.inherited.conqueror', 'player.1', 'CONQUEROR', 'map.inherited', 'revision:map.inherited:initial', 'conqueror', 'active', 'historical', 'hist.dominator', 'admin', ?)").run(now, now);
    sqlite.prepare("INSERT INTO qq_group_access (group_open_id, environment, status, verify_enabled, created_at, updated_at) VALUES ('group.1', 'test', 'active', 1, ?, ?)").run(now, now);

    const services = createPlatformServices(database, undefined, undefined, undefined, undefined, undefined, undefined, "test-encryption-key");
    const invite = await services.createAdminBindingInvite({ contractVersion: "1", playerName: "Player", playerId: "1234", historicalTitleGrantIds: ["hist.conqueror"] }, auth, "invite.inherited");
    const claim = await services.redeemBindingInvite({ contractVersion: "1", code: invite.code });
    await services.verifyBindingClaim({ contractVersion: "1", provider: "qq", code: claim.code, groupOpenId: "group.1", memberOpenId: "member.new", messageId: "message.inherited" }, auth, "verify.inherited");
    await services.decideAdminBindingClaim({ claimId: claim.claimId, contractVersion: "1", decision: "approved" }, { ...auth, actorType: "user", subject: "admin.1", roles: ["admin"] }, "decision.inherited");

    expect(sqlite.prepare("SELECT source_id FROM player_title_grants WHERE id = 'grant.inherited.conqueror'").get()).toEqual({ source_id: "hist.conqueror" });
    expect(sqlite.prepare("SELECT status FROM binding_invite_historical_title_grants WHERE historical_title_grant_id = 'hist.conqueror'").get()).toEqual({ status: "reused" });
    expect(sqlite.prepare("SELECT payload_json FROM audit_events WHERE operation = 'binding_invite.historical_migration.item' AND entity_id = 'grant.inherited.conqueror'").get()).toMatchObject({ payload_json: expect.stringContaining('"reconciled":true') });
  });

  it("records a conflict for a non-inherited active identity during binding migration", async () => {
    const { database, sqlite } = createD1();
    const now = Date.now();
    sqlite.exec("CREATE UNIQUE INDEX player_title_grants_active_identity_idx ON player_title_grants(player_account_id, title_key, COALESCE(map_id, '')) WHERE status = 'active';");
    sqlite.prepare("INSERT INTO historical_title_grants (id, scope, map_id, gameplay_revision_id, slot, title_key, holder_name, source_version) VALUES ('hist.pending.conqueror', 'map', 'map.manual', 'revision:map.manual:initial', 'conqueror', 'CONQUEROR', 'Player', 'test')").run();
    sqlite.prepare("INSERT INTO player_accounts (id, player_id, player_name, normalized_player_name, created_at, updated_at) VALUES ('player.1', '1234', 'Player', 'player', ?, ?)").run(now, now);
    sqlite.prepare("INSERT INTO identities (id, created_at, updated_at) VALUES ('identity.1', ?, ?)").run(now, now);
    sqlite.prepare("INSERT INTO bindings (id, identity_id, player_account_id, provider, group_open_id, member_open_id, created_at) VALUES ('binding.1', 'identity.1', 'player.1', 'qq', 'group.old', 'member.old', ?)").run(now);
    sqlite.prepare("INSERT INTO player_title_grants (id, player_account_id, title_key, map_id, gameplay_revision_id, slot, status, source_type, source_id, granted_by, granted_at) VALUES ('grant.manual', 'player.1', 'CONQUEROR', 'map.manual', 'revision:map.manual:initial', 'conqueror', 'active', 'manual', 'manual.source', 'admin', ?)").run(now);
    sqlite.prepare("INSERT INTO qq_group_access (group_open_id, environment, status, verify_enabled, created_at, updated_at) VALUES ('group.1', 'test', 'active', 1, ?, ?)").run(now, now);

    const services = createPlatformServices(database, undefined, undefined, undefined, undefined, undefined, undefined, "test-encryption-key");
    const invite = await services.createAdminBindingInvite({ contractVersion: "1", playerName: "Player", playerId: "1234", historicalTitleGrantIds: ["hist.pending.conqueror"] }, auth, "invite.manual");
    const claim = await services.redeemBindingInvite({ contractVersion: "1", code: invite.code });
    await services.verifyBindingClaim({ contractVersion: "1", provider: "qq", code: claim.code, groupOpenId: "group.1", memberOpenId: "member.new", messageId: "message.manual" }, auth, "verify.manual");
    await services.decideAdminBindingClaim({ claimId: claim.claimId, contractVersion: "1", decision: "approved" }, { ...auth, actorType: "user", subject: "admin.1", roles: ["admin"] }, "decision.manual");

    expect(sqlite.prepare("SELECT source_id FROM player_title_grants WHERE id = 'grant.manual'").get()).toEqual({ source_id: "manual.source" });
    expect(sqlite.prepare("SELECT status, last_error FROM binding_invite_historical_title_grants WHERE historical_title_grant_id = 'hist.pending.conqueror'").get()).toEqual({ status: "conflict", last_error: "HISTORICAL_TITLE_GRANT_CLAIMED" });
  });

  it("does not authorize a name-equal historical holder without explicit selection", async () => {
    const { database, sqlite } = createD1();
    const now = Date.now();
    sqlite.prepare("INSERT INTO player_accounts (id, player_id, player_name, normalized_player_name, created_at, updated_at) VALUES ('player.1', '1234', 'Player', 'player', ?, ?)").run(now, now);
    sqlite.prepare("INSERT INTO historical_title_grants (id, scope, title_key, holder_name, source_version) VALUES ('hist.1', 'global', 'TITLE', 'Player', 'test')").run();
    sqlite.prepare("INSERT INTO qq_group_access (group_open_id, environment, status, verify_enabled, created_at, updated_at) VALUES ('group.1', 'test', 'active', 1, ?, ?)").run(now, now);
    const services = createPlatformServices(database, undefined, undefined, undefined, undefined, undefined, undefined, "test-encryption-key");
    const invite = await services.createAdminBindingInvite({ contractVersion: "1", playerName: "Player", playerId: "1234", historicalTitleGrantIds: [] }, auth, "invite.1");
    const claim = await services.redeemBindingInvite({ contractVersion: "1", code: invite.code });
    await services.verifyBindingClaim({ contractVersion: "1", provider: "qq", code: claim.code, groupOpenId: "group.1", memberOpenId: "member.1", messageId: "message.1" }, auth, "verify.1");

    expect(sqlite.prepare("SELECT COUNT(*) AS count FROM binding_invite_historical_title_grants").get()).toEqual({ count: 0 });
    expect(sqlite.prepare("SELECT COUNT(*) AS count FROM player_title_grants").get()).toEqual({ count: 0 });
  });

  it("lists historical title holders for invitations and migration", async () => {
    const { database, sqlite } = createD1();
    sqlite.prepare("INSERT INTO historical_title_grants (id, scope, title_key, holder_name, source_version) VALUES ('hist.1', 'global', 'TITLE_PENDING', 'Player', 'test'), ('hist.2', 'global', 'TITLE_COMPLETED', 'Migrated', 'test')").run();
    sqlite.prepare("INSERT INTO title_catalog (key, label) VALUES ('TITLE_PENDING', '待迁移称号'), ('TITLE_COMPLETED', '已迁移称号')").run();
    sqlite.prepare("INSERT INTO player_title_grants (id, player_account_id, title_key, status, source_type, source_id, granted_by, granted_at) VALUES ('grant.1', 'account.1', 'TITLE_COMPLETED', 'active', 'historical', 'hist.2', 'admin', 1)").run();
    const services = createPlatformServices(database);

    await expect(services.listHistoricalTitleGrants({ filter: "pending", page: 1, pageSize: 50 }, auth)).resolves.toMatchObject({
      holders: [{ holderName: "Player", totalCount: 1, unclaimedCount: 1, status: "pending" }],
      total: 1,
      hasMore: false,
    });
    await expect(services.listHistoricalTitleGrants({ filter: "all", page: 1, pageSize: 50 }, auth)).resolves.toMatchObject({
      holders: [
        { holderName: "Migrated", totalCount: 1, unclaimedCount: 0, status: "completed" },
        { holderName: "Player", totalCount: 1, unclaimedCount: 1, status: "pending" },
      ],
      total: 2,
      hasMore: false,
    });
    await expect(services.listHistoricalTitleGrants({ query: "已迁移称号", filter: "completed", page: 1, pageSize: 50 }, auth)).resolves.toMatchObject({
      holders: [{ holderName: "Migrated", totalCount: 1, unclaimedCount: 0, status: "completed" }],
      total: 1,
      hasMore: false,
    });
  });

  it("runs the same authorized migration after a reviewed binding", async () => {
    const { database, sqlite } = createD1();
    const now = Date.now();
    sqlite.prepare("INSERT INTO historical_title_grants (id, scope, title_key, holder_name, source_version) VALUES ('hist.1', 'map', 'TITLE', 'Player', 'test')").run();
    sqlite.prepare("INSERT INTO player_accounts (id, player_id, player_name, normalized_player_name, created_at, updated_at) VALUES ('player.1', '1234', 'Player', 'player', ?, ?)").run(now, now);
    sqlite.prepare("INSERT INTO identities (id, created_at, updated_at) VALUES ('identity.1', ?, ?)").run(now, now);
    sqlite.prepare("INSERT INTO bindings (id, identity_id, player_account_id, provider, group_open_id, member_open_id, created_at) VALUES ('binding.1', 'identity.1', 'player.1', 'qq', 'group.old', 'member.old', ?)").run(now);
    sqlite.prepare("INSERT INTO qq_group_access (group_open_id, environment, status, verify_enabled, created_at, updated_at) VALUES ('group.1', 'test', 'active', 1, ?, ?)").run(now, now);
    const services = createPlatformServices(database, undefined, undefined, undefined, undefined, undefined, undefined, "test-encryption-key");
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
    sqlite.prepare("INSERT INTO player_accounts (id, player_id, player_name, normalized_player_name, created_at, updated_at) VALUES ('player.1', '1234', 'Player', 'player', ?, ?)").run(now, now);
    sqlite.prepare("INSERT INTO historical_title_grants (id, scope, title_key, holder_name, source_version) VALUES ('hist.1', 'global', 'TITLE', 'Player', 'test')").run();
    sqlite.prepare("INSERT INTO qq_group_access (group_open_id, environment, status, verify_enabled, created_at, updated_at) VALUES ('group.1', 'test', 'active', 1, ?, ?)").run(now, now);
    const services = createPlatformServices(database, undefined, undefined, undefined, undefined, undefined, undefined, "test-encryption-key");
    const invite = await services.createAdminBindingInvite({ contractVersion: "1", playerName: "Player", playerId: "1234", historicalTitleGrantIds: ["hist.1"] }, auth, "invite.1");
    sqlite.prepare("INSERT INTO player_title_grants (id, player_account_id, title_key, status, source_type, source_id, granted_by, granted_at) VALUES ('grant.other', 'other-player', 'TITLE', 'active', 'historical', 'hist.1', 'admin', ?)").run(now);
    const claim = await services.redeemBindingInvite({ contractVersion: "1", code: invite.code });
    await services.verifyBindingClaim({ contractVersion: "1", provider: "qq", code: claim.code, groupOpenId: "group.1", memberOpenId: "member.1", messageId: "message.1" }, auth, "verify.1");

    expect(sqlite.prepare("SELECT player_account_id, status FROM player_title_grants WHERE source_id = 'hist.1'").get()).toEqual({ player_account_id: "other-player", status: "active" });
    expect(sqlite.prepare("SELECT status FROM binding_invite_historical_title_grants").get()).toEqual({ status: "conflict" });
  });

  it("automatically activates an existing account's first binding and exchanges it for a Portal session", async () => {
    const { database, sqlite } = createD1();
    const now = Date.now();
    sqlite.prepare("INSERT INTO player_accounts (id, player_id, player_name, normalized_player_name, created_at, updated_at) VALUES ('player.1', '1234', 'Player', 'player', ?, ?)").run(now, now);
    sqlite.prepare("INSERT INTO binding_invites (id, code_hash, player_name, normalized_player_name, player_id, created_by, created_at, expires_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)").run("invite.1", hashRequest("INVITE123456"), "Player", "player", "1234", "admin", now, now + 60_000);
    sqlite.prepare("INSERT INTO qq_group_access (group_open_id, environment, status, verify_enabled, created_at, updated_at) VALUES ('group.1', 'test', 'active', 1, ?, ?)").run(now, now);
    const services = createPlatformServices(database);
    const claim = await services.redeemBindingInvite({ contractVersion: "1", code: "INVITE123456" });
    expect(claim.expiresAt).toBeGreaterThan(now + 9 * 60 * 1000);
    const result = await services.verifyBindingClaim({ contractVersion: "1", provider: "qq", code: claim.code, groupOpenId: "group.1", memberOpenId: "member.1", messageId: "message.1" }, auth, "verify.1");

    expect(result).toMatchObject({ status: "verified", environment: "test" });
    expect(sqlite.prepare("SELECT status FROM binding_claims").get()).toEqual({ status: "approved" });
    expect(sqlite.prepare("SELECT player_id, player_name FROM player_accounts").get()).toEqual({ player_id: "1234", player_name: "Player" });
    expect(sqlite.prepare("SELECT provider, member_open_id FROM bindings").get()).toEqual({ provider: "qq", member_open_id: "member.1" });
    expect(sqlite.prepare("SELECT operation FROM audit_events WHERE operation = 'qq.binding_claim.auto_activate'").get()).toEqual({ operation: "qq.binding_claim.auto_activate" });

    sqlite.prepare("UPDATE binding_claims SET expires_at = ? WHERE id = ?").run(now - 1, claim.claimId);
    const sessionOne = await services.exchangeBindingClaimSession({ claimId: claim.claimId, claimToken: claim.claimToken });
    const sessionTwo = await services.exchangeBindingClaimSession({ claimId: claim.claimId, claimToken: claim.claimToken });
    expect(sessionTwo.sessionToken).toBe(sessionOne.sessionToken);
    expect(await resolvePortalSession(database, sessionOne.sessionToken)).toMatchObject({ player: { playerId: "1234" } });
    expect(sqlite.prepare("SELECT COUNT(*) AS count FROM portal_sessions").get()).toEqual({ count: 1 });
    expect(sqlite.prepare("SELECT COUNT(*) AS count FROM qq_sessions").get()).toEqual({ count: 0 });
  });

  it("creates the Player Account only after an invited QQ identity is verified", async () => {
    const { database, sqlite } = createD1();
    const now = Date.now();
    sqlite.prepare("INSERT INTO binding_invites (id, code_hash, player_name, normalized_player_name, player_id, created_by, created_at, expires_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)").run("invite.new-player", hashRequest("NEWPLAYER123"), "New Player", "new player", "5678", "admin", now, now + 60_000);
    sqlite.prepare("INSERT INTO qq_group_access (group_open_id, environment, status, verify_enabled, created_at, updated_at) VALUES ('group.1', 'test', 'active', 1, ?, ?)").run(now, now);
    const services = createPlatformServices(database);
    const claim = await services.redeemBindingInvite({ contractVersion: "1", code: "NEWPLAYER123" });
    expect(sqlite.prepare("SELECT COUNT(*) AS count FROM player_accounts").get()).toEqual({ count: 0 });
    await expect(services.exchangeBindingClaimSession({ claimId: claim.claimId, claimToken: claim.claimToken })).rejects.toThrow("BINDING_CLAIM_NOT_COMPLETE");

    await services.verifyBindingClaim({ contractVersion: "1", provider: "qq", code: claim.code, groupOpenId: "group.1", memberOpenId: "member.new", messageId: "message.1" }, auth, "verify.new-player");

    const account = sqlite.prepare("SELECT id, player_id, player_name FROM player_accounts").get() as { id: string; player_id: string; player_name: string };
    expect(account).toMatchObject({ player_id: "5678", player_name: "New Player" });
    expect(sqlite.prepare("SELECT player_account_id, provider, member_open_id FROM bindings").get()).toEqual({ player_account_id: account.id, provider: "qq", member_open_id: "member.new" });
    const session = await services.exchangeBindingClaimSession({ claimId: claim.claimId, claimToken: claim.claimToken });
    expect(await resolvePortalSession(database, session.sessionToken)).toMatchObject({ player: { id: account.id, playerId: "5678" } });
  });

  it("does not exchange an approved claim when its QQ binding is missing or belongs to another group", async () => {
    const { database, sqlite } = createD1();
    const now = Date.now();
    const claimToken = "a".repeat(64);
    sqlite.prepare("INSERT INTO player_accounts (id, player_id, player_name, normalized_player_name, created_at, updated_at) VALUES ('player.1', '1234', 'Player', 'player', ?, ?)").run(now, now);
    sqlite.prepare("INSERT INTO binding_invites (id, code_hash, player_name, normalized_player_name, player_id, created_by, created_at, expires_at, redeemed_at) VALUES ('invite.1', ?, 'Player', 'player', '1234', 'admin', ?, ?, ?)").run(hashRequest("INVITE123456"), now, now + 60_000, now);
    sqlite.prepare("INSERT INTO binding_claims (id, invite_id, token_hash, code_hash, player_name, normalized_player_name, player_id, status, member_open_id, group_open_id, expires_at, created_at) VALUES ('claim.1', 'invite.1', ?, 'code', 'Player', 'player', '1234', 'approved', 'member.1', 'group.expected', ?, ?)").run(hashRequest(claimToken), now + 60_000, now);
    const services = createPlatformServices(database);

    await expect(services.exchangeBindingClaimSession({ claimId: "claim.1", claimToken })).rejects.toThrow("BINDING_CLAIM_NOT_COMPLETE");
    sqlite.prepare("INSERT INTO identities (id, created_at, updated_at) VALUES ('identity.1', ?, ?)").run(now, now);
    sqlite.prepare("INSERT INTO bindings (id, identity_id, player_account_id, provider, group_open_id, member_open_id, status, created_at) VALUES ('binding.1', 'identity.1', 'player.1', 'qq', 'group.other', 'member.1', 'active', ?)").run(now);

    await expect(services.exchangeBindingClaimSession({ claimId: "claim.1", claimToken })).rejects.toThrow("BINDING_CLAIM_NOT_COMPLETE");
    expect(sqlite.prepare("SELECT COUNT(*) AS count FROM portal_sessions").get()).toEqual({ count: 0 });
  });

  it("backfills a retry anchor only for a redeemed invitation with a consumed legacy Passkey registration", () => {
    const sqlite = new DatabaseSync(":memory:");
    sqlite.exec(`
      CREATE TABLE binding_invites (id TEXT PRIMARY KEY, redeemed_at INTEGER);
      CREATE TABLE passkey_challenges (id TEXT PRIMARY KEY, invite_id TEXT, purpose TEXT NOT NULL, player_account_id TEXT, used_at INTEGER, created_at INTEGER NOT NULL);
      INSERT INTO binding_invites VALUES ('invite.legacy', 10), ('invite.unused', NULL), ('invite.login', 10);
      INSERT INTO passkey_challenges VALUES ('challenge.legacy', 'invite.legacy', 'invitation', 'player.legacy', 9, 8);
      INSERT INTO passkey_challenges VALUES ('challenge.unused', 'invite.unused', 'invitation', 'player.unused', 9, 8);
      INSERT INTO passkey_challenges VALUES ('challenge.login', 'invite.login', 'login', 'player.login', 9, 8);
    `);

    sqlite.exec(legacyInviteRetryMigration);

    expect(sqlite.prepare("SELECT legacy_passkey_player_account_id, legacy_passkey_challenge_id FROM binding_invites WHERE id = 'invite.legacy'").get()).toEqual({ legacy_passkey_player_account_id: "player.legacy", legacy_passkey_challenge_id: "challenge.legacy" });
    expect(sqlite.prepare("SELECT legacy_passkey_player_account_id, legacy_passkey_challenge_id FROM binding_invites WHERE id IN ('invite.unused', 'invite.login') ORDER BY id").all()).toEqual([
      { legacy_passkey_player_account_id: null, legacy_passkey_challenge_id: null },
      { legacy_passkey_player_account_id: null, legacy_passkey_challenge_id: null },
    ]);
    sqlite.close();
  });

  it("keeps the verified QQ binding when a large historical migration fails, then retries the remaining titles", async () => {
    const { database, sqlite } = createD1([4]);
    const now = Date.now();
    sqlite.prepare("INSERT INTO binding_invites (id, code_hash, player_name, normalized_player_name, player_id, created_by, created_at, expires_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)").run("invite.bulk", hashRequest("BULKTITLE123"), "Player", "player", "1234", "admin", now, now + 60_000);
    const insertHistorical = sqlite.prepare("INSERT INTO historical_title_grants (id, scope, title_key, holder_name, source_version) VALUES (?, 'global', ?, 'Player', 'test')");
    const insertAuthorization = sqlite.prepare("INSERT INTO binding_invite_historical_title_grants (id, invite_id, historical_title_grant_id, authorized_by, created_at) VALUES (?, 'invite.bulk', ?, 'admin', ?)");
    for (let index = 1; index <= 83; index += 1) {
      const id = `hist.${index}`;
      insertHistorical.run(id, `TITLE_${index}`);
      insertAuthorization.run(`authorization.${index}`, id, now);
    }
    sqlite.prepare("INSERT INTO qq_group_access (group_open_id, environment, status, verify_enabled, created_at, updated_at) VALUES ('group.1', 'test', 'active', 1, ?, ?)").run(now, now);

    const services = createPlatformServices(database);
    const claim = await services.redeemBindingInvite({ contractVersion: "1", code: "BULKTITLE123" });
    await services.verifyBindingClaim({ contractVersion: "1", provider: "qq", code: claim.code, groupOpenId: "group.1", memberOpenId: "member.1", messageId: "message.bulk" }, auth, "verify.bulk");

    expect(sqlite.prepare("SELECT status FROM binding_claims WHERE id = ?").get(claim.claimId)).toEqual({ status: "approved" });
    expect(sqlite.prepare("SELECT COUNT(*) AS count FROM player_accounts").get()).toEqual({ count: 1 });
    expect(sqlite.prepare("SELECT COUNT(*) AS count FROM bindings WHERE status = 'active'").get()).toEqual({ count: 1 });
    expect(sqlite.prepare("SELECT status, COUNT(*) AS count FROM binding_invite_historical_title_grants GROUP BY status ORDER BY status").all()).toEqual([
      { status: "created", count: 16 },
      { status: "retry_required", count: 67 },
    ]);

    await services.retryHistoricalTitleMigration({ contractVersion: "1", inviteId: "invite.bulk" }, { actorType: "user", subject: "admin.1", roles: ["maintainer"], provider: "test" }, "retry.bulk");

    expect(sqlite.prepare("SELECT COUNT(*) AS count FROM binding_invite_historical_title_grants WHERE status = 'created'").get()).toEqual({ count: 83 });
    expect(sqlite.prepare("SELECT COUNT(*) AS count FROM player_title_grants WHERE player_account_id = (SELECT id FROM player_accounts)").get()).toEqual({ count: 83 });
  });

  it("requires a QQ binding before retrying a legacy redeemed invitation's title migration", async () => {
    const { database, sqlite } = createD1();
    const now = Date.now();
    sqlite.prepare("INSERT INTO player_accounts (id, player_id, player_name, normalized_player_name, created_at, updated_at) VALUES ('player.legacy', '1234', 'Renamed Player', 'renamed player', ?, ?)").run(now, now);
    sqlite.prepare("INSERT INTO binding_invites (id, code_hash, player_name, normalized_player_name, player_id, created_by, created_at, expires_at, redeemed_at, legacy_passkey_player_account_id, legacy_passkey_challenge_id) VALUES ('invite.legacy', ?, 'Player', 'player', '1234', 'admin', ?, ?, ?, 'player.legacy', 'challenge.legacy')").run(hashRequest("LEGACY123456"), now, now - 1, now);
    sqlite.prepare("INSERT INTO historical_title_grants (id, scope, title_key, holder_name, source_version) VALUES ('hist.legacy', 'global', 'TITLE_LEGACY', 'Player', 'test')").run();
    sqlite.prepare("INSERT INTO binding_invite_historical_title_grants (id, invite_id, historical_title_grant_id, authorized_by, status, last_error, created_at, processed_at) VALUES ('authorization.legacy', 'invite.legacy', 'hist.legacy', 'admin', 'retry_required', 'HISTORICAL_TITLE_MIGRATION_FAILED', ?, ?)").run(now, now);
    const services = createPlatformServices(database);
    const admin = { actorType: "user" as const, subject: "admin.1", roles: ["maintainer"] as const, provider: "test" };

    await expect(services.retryHistoricalTitleMigration({ contractVersion: "1", inviteId: "invite.legacy" }, admin, "retry.legacy")).rejects.toThrow("HISTORICAL_MIGRATION_NOT_READY");
    expect(sqlite.prepare("SELECT COUNT(*) AS count FROM player_title_grants").get()).toEqual({ count: 0 });

    sqlite.prepare("INSERT INTO identities (id, created_at, updated_at) VALUES ('identity.legacy', ?, ?)").run(now, now);
    sqlite.prepare("INSERT INTO bindings (id, identity_id, player_account_id, provider, group_open_id, member_open_id, status, created_at) VALUES ('binding.legacy', 'identity.legacy', 'player.legacy', 'qq', 'group.1', 'member.legacy', 'active', ?)").run(now);
    await services.retryHistoricalTitleMigration({ contractVersion: "1", inviteId: "invite.legacy" }, admin, "retry.legacy");

    expect(sqlite.prepare("SELECT status FROM binding_invite_historical_title_grants WHERE id = 'authorization.legacy'").get()).toEqual({ status: "created" });
    expect(sqlite.prepare("SELECT source_type, source_id, granted_by FROM player_title_grants WHERE source_id = 'hist.legacy'").get()).toEqual({ source_type: "historical", source_id: "hist.legacy", granted_by: "binding:binding.legacy" });
  });

  it("does not use another player's active QQ binding to retry an approved invitation", async () => {
    const { database, sqlite } = createD1();
    const now = Date.now();
    sqlite.prepare("INSERT INTO player_accounts (id, player_id, player_name, normalized_player_name, created_at, updated_at) VALUES ('player.invited', '1234', 'Player', 'player', ?, ?), ('player.other', '5678', 'Other', 'other', ?, ?)").run(now, now, now, now);
    sqlite.prepare("INSERT INTO binding_invites (id, code_hash, player_name, normalized_player_name, player_id, created_by, created_at, expires_at, redeemed_at) VALUES ('invite.approved', ?, 'Player', 'player', '1234', 'admin', ?, ?, ?)").run(hashRequest("APPROVED12345"), now, now - 1, now);
    sqlite.prepare("INSERT INTO binding_claims (id, invite_id, token_hash, code_hash, player_name, normalized_player_name, player_id, status, member_open_id, group_open_id, expires_at, created_at) VALUES ('claim.approved', 'invite.approved', 'token', 'code', 'Player', 'player', '1234', 'approved', 'member.transferred', 'group.1', ?, ?)").run(now - 1, now);
    sqlite.prepare("INSERT INTO historical_title_grants (id, scope, title_key, holder_name, source_version) VALUES ('hist.approved', 'global', 'TITLE_APPROVED', 'Player', 'test')").run();
    sqlite.prepare("INSERT INTO binding_invite_historical_title_grants (id, invite_id, historical_title_grant_id, authorized_by, status, last_error, created_at, processed_at) VALUES ('authorization.approved', 'invite.approved', 'hist.approved', 'admin', 'retry_required', 'HISTORICAL_TITLE_MIGRATION_FAILED', ?, ?)").run(now, now);
    sqlite.prepare("INSERT INTO identities (id, created_at, updated_at) VALUES ('identity.transferred', ?, ?)").run(now, now);
    sqlite.prepare("INSERT INTO bindings (id, identity_id, player_account_id, provider, group_open_id, member_open_id, status, created_at) VALUES ('binding.transferred', 'identity.transferred', 'player.other', 'qq', 'group.1', 'member.transferred', 'active', ?)").run(now);
    const services = createPlatformServices(database);
    const admin = { actorType: "user" as const, subject: "admin.1", roles: ["maintainer"] as const, provider: "test" };

    await expect(services.retryHistoricalTitleMigration({ contractVersion: "1", inviteId: "invite.approved" }, admin, "retry.approved")).rejects.toThrow("HISTORICAL_MIGRATION_NOT_READY");
    expect(sqlite.prepare("SELECT COUNT(*) AS count FROM player_title_grants").get()).toEqual({ count: 0 });
  });

  it("does not treat a rejected QQ claim as a legacy Passkey redemption", async () => {
    const { database, sqlite } = createD1();
    const now = Date.now();
    sqlite.prepare("INSERT INTO player_accounts (id, player_id, player_name, normalized_player_name, created_at, updated_at) VALUES ('player.rejected', '1234', 'Player', 'player', ?, ?)").run(now, now);
    sqlite.prepare("INSERT INTO binding_invites (id, code_hash, player_name, normalized_player_name, player_id, created_by, created_at, expires_at, redeemed_at) VALUES ('invite.rejected', ?, 'Player', 'player', '1234', 'admin', ?, ?, ?)").run(hashRequest("REJECTED12345"), now, now - 1, now);
    sqlite.prepare("INSERT INTO binding_claims (id, invite_id, token_hash, code_hash, player_name, normalized_player_name, player_id, status, expires_at, created_at) VALUES ('claim.rejected', 'invite.rejected', 'token', 'code', 'Player', 'player', '1234', 'rejected', ?, ?)").run(now - 1, now);
    sqlite.prepare("INSERT INTO historical_title_grants (id, scope, title_key, holder_name, source_version) VALUES ('hist.rejected', 'global', 'TITLE_REJECTED', 'Player', 'test')").run();
    sqlite.prepare("INSERT INTO binding_invite_historical_title_grants (id, invite_id, historical_title_grant_id, authorized_by, status, last_error, created_at, processed_at) VALUES ('authorization.rejected', 'invite.rejected', 'hist.rejected', 'admin', 'retry_required', 'HISTORICAL_TITLE_MIGRATION_FAILED', ?, ?)").run(now, now);
    sqlite.prepare("INSERT INTO identities (id, created_at, updated_at) VALUES ('identity.rejected', ?, ?)").run(now, now);
    sqlite.prepare("INSERT INTO bindings (id, identity_id, player_account_id, provider, group_open_id, member_open_id, status, created_at) VALUES ('binding.rejected', 'identity.rejected', 'player.rejected', 'qq', 'group.1', 'member.existing', 'active', ?)").run(now);
    const services = createPlatformServices(database);
    const admin = { actorType: "user" as const, subject: "admin.1", roles: ["maintainer"] as const, provider: "test" };

    await expect(services.retryHistoricalTitleMigration({ contractVersion: "1", inviteId: "invite.rejected" }, admin, "retry.rejected")).rejects.toThrow("HISTORICAL_MIGRATION_NOT_READY");
    expect(sqlite.prepare("SELECT COUNT(*) AS count FROM player_title_grants").get()).toEqual({ count: 0 });
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
