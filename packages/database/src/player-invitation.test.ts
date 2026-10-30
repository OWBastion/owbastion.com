import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { createTestD1 } from "../test/d1";
import { bindingsSchema, playerAccountsSchema, playerInvitationsSchema, qqGroupAccessSchema, submissionsSchema } from "../test/schema";
import { createPlatformServices } from "./index";

const hash = (value: unknown) => createHash("sha256").update(JSON.stringify(value)).digest("hex");
const admin = { actorType: "user", subject: "admin.one", scopes: [] } as never;
const qqbot = { actorType: "service", subject: "qqbot", roles: ["channel:write"], provider: "test" } as never;
const policy = { enabled: true, period: "week", maxRegistrationsPerPeriod: 5, maxUsesPerCode: 5, maxValidityDays: 30, minAccountAgeDays: 0, minApprovedSubmissions: 0, eligibilityMode: "any" } as const;
const day = 24 * 60 * 60 * 1000;

const fixture = async (overridePolicy: Partial<typeof policy> | null = {}) => {
  const { sqlite, database } = createTestD1({ foreignKeys: true, batchMode: "immediate" });
  sqlite.exec(playerAccountsSchema);
  sqlite.exec(`CREATE UNIQUE INDEX player_accounts_battletag_idx ON player_accounts(normalized_player_name, player_id);`);
  sqlite.exec(bindingsSchema);
  sqlite.exec(`CREATE UNIQUE INDEX bindings_active_provider_member_idx ON bindings(provider, member_open_id) WHERE status = 'active';`);
  sqlite.exec(qqGroupAccessSchema);
  sqlite.exec(submissionsSchema);
  sqlite.exec(`
    CREATE TABLE portal_sessions (id TEXT PRIMARY KEY, player_account_id TEXT NOT NULL, token_hash TEXT NOT NULL, passkey_challenge_id TEXT, expires_at INTEGER NOT NULL, created_at INTEGER NOT NULL DEFAULT 0);
    CREATE TABLE identities (id TEXT PRIMARY KEY, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL);
    CREATE TABLE idempotency_keys (id TEXT PRIMARY KEY, actor_id TEXT NOT NULL, operation TEXT NOT NULL, request_hash TEXT NOT NULL, response_json TEXT NOT NULL, created_at INTEGER NOT NULL);
    CREATE TABLE audit_events (id TEXT PRIMARY KEY, correlation_id TEXT NOT NULL, actor_type TEXT NOT NULL, actor_id TEXT NOT NULL, operation TEXT NOT NULL, entity_type TEXT NOT NULL, entity_id TEXT NOT NULL, payload_json TEXT NOT NULL, created_at INTEGER NOT NULL);
    CREATE TABLE binding_invites (id TEXT PRIMARY KEY, code_hash TEXT NOT NULL UNIQUE, code_ciphertext TEXT, player_name TEXT NOT NULL, normalized_player_name TEXT NOT NULL, player_id TEXT NOT NULL, created_by TEXT NOT NULL, created_at INTEGER NOT NULL, expires_at INTEGER NOT NULL, redeemed_at INTEGER, legacy_passkey_player_account_id TEXT, legacy_passkey_challenge_id TEXT, revoked_at INTEGER, revoked_by TEXT);
    CREATE TABLE binding_claims (id TEXT PRIMARY KEY, invite_id TEXT NOT NULL, token_hash TEXT NOT NULL, code_hash TEXT NOT NULL UNIQUE, player_name TEXT NOT NULL, normalized_player_name TEXT NOT NULL, player_id TEXT NOT NULL, status TEXT NOT NULL, member_open_id TEXT, group_open_id TEXT, message_id TEXT, expires_at INTEGER NOT NULL, created_at INTEGER NOT NULL, verified_at INTEGER, decided_at INTEGER, decided_by TEXT, decision_reason TEXT);
    CREATE TABLE historical_title_grants (id TEXT PRIMARY KEY, scope TEXT, map_id TEXT, gameplay_revision_id TEXT, slot TEXT, title_key TEXT, holder_name TEXT NOT NULL, source_version TEXT);
    CREATE TABLE player_title_grants (id TEXT PRIMARY KEY, player_account_id TEXT, title_key TEXT, status TEXT, source_type TEXT NOT NULL, source_id TEXT);
  `);
  sqlite.exec(playerInvitationsSchema);
  const now = Date.now();
  sqlite.prepare("INSERT INTO qq_group_access (group_open_id, environment, status, verify_enabled, created_at, updated_at) VALUES ('group.1', 'test', 'active', 1, ?, ?)").run(now, now);
  const addPlayer = (id: string, name: string, playerId: string, createdAt = now, qq = true) => {
    sqlite.prepare("INSERT INTO player_accounts (id, player_id, player_name, normalized_player_name, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)").run(id, playerId, name, name.toLowerCase(), createdAt, createdAt);
    sqlite.prepare("INSERT INTO portal_sessions (id, player_account_id, token_hash, expires_at) VALUES (?, ?, ?, ?)").run(`session.${id}`, id, hash(`token.${id}`), now + 600_000);
    if (qq) sqlite.prepare("INSERT INTO bindings (id, identity_id, player_account_id, provider, group_open_id, member_open_id, status, created_at) VALUES (?, ?, ?, 'qq', 'group.1', ?, 'active', ?)").run(`binding.${id}`, `identity.${id}`, id, `member.${id}`, now);
  };
  addPlayer("alice", "Alice", "1111");
  const services = createPlatformServices(database);
  if (overridePolicy) await services.setAdminPlayerInvitationPolicy({ policy: { ...policy, ...overridePolicy } }, admin, "policy-1");
  const token = (id: string) => `token.${id}`;
  const create = (code: string, extra: { maxUses?: number; validityDays?: number } = {}, key = `create-${code}`, who = "alice") =>
    services.createCurrentPlayerInvitation({ sessionToken: token(who), code, maxUses: extra.maxUses ?? 2, validityDays: extra.validityDays ?? 7 }, key);
  const redeem = (code: string, playerName: string, playerId: string) => services.redeemPlayerInvitation({ contractVersion: "1", code, playerName, playerId });
  const verify = (confirmation: string, member: string, key = `verify-${confirmation}-${member}`) =>
    services.verifyBindingClaim({ contractVersion: "1", provider: "qq", code: confirmation, groupOpenId: "group.1", memberOpenId: member, messageId: `message.${member}` }, qqbot, key);
  const register = async (code: string, playerName: string, playerId: string, member: string) => {
    const claim = await redeem(code, playerName, playerId);
    await verify(claim.code, member);
    return claim;
  };
  const count = (table: string) => (sqlite.prepare(`SELECT count(*) AS total FROM ${table}`).get() as { total: number }).total;
  return { sqlite, services, addPlayer, token, create, redeem, verify, register, count, now };
};

describe("player invitation codes", () => {
  it("stays disabled until a maintainer saves a policy", async () => {
    const { services, create } = await fixture(null);
    await expect(services.getAdminPlayerInvitationPolicy(admin)).resolves.toMatchObject({ policy: null });
    await expect(create("friends")).rejects.toThrow("PLAYER_INVITATION_DISABLED");
    await expect(services.getCurrentPlayerInvitations({ sessionToken: "token.alice", page: 1, pageSize: 20 })).resolves.toMatchObject({ createBlockedReason: "disabled", policy: null });
  });

  it("creates a normalized code, replays the idempotent request, and rejects reuse of a code or a bad request", async () => {
    const { services, create, count } = await fixture();
    const first = await create("fun-2026", { maxUses: 3, validityDays: 10 });
    expect(first).toMatchObject({ code: "FUN-2026", status: "available", maxUses: 3, usedCount: 0 });
    await expect(create("fun-2026", { maxUses: 3, validityDays: 10 })).resolves.toEqual(first);
    await expect(create("FUN-2026", {}, "another-key")).rejects.toThrow("PLAYER_INVITATION_CODE_TAKEN");
    await expect(create("ab")).rejects.toThrow("PLAYER_INVITATION_CODE_INVALID");
    await expect(create("admin-me")).rejects.toThrow("PLAYER_INVITATION_CODE_RESERVED");
    await expect(create("big-code", { maxUses: 6 })).rejects.toThrow("PLAYER_INVITATION_LIMIT_EXCEEDED");
    await expect(create("long-code", { validityDays: 31 })).rejects.toThrow("PLAYER_INVITATION_LIMIT_EXCEEDED");
    await expect(services.createCurrentPlayerInvitation({ sessionToken: "token.nobody", code: "ghost", maxUses: 1, validityDays: 1 }, "k")).rejects.toThrow("UNAUTHENTICATED");
    expect(count("player_invitations")).toBe(1);
  });

  it("stops creating codes once the period's registrations reach the limit", async () => {
    const { sqlite, services, create, register } = await fixture({ maxRegistrationsPerPeriod: 1 });
    await create("code-a", { maxUses: 2 });
    await register("code-a", "P1", "8001", "member.1");
    await expect(create("code-b")).rejects.toThrow("PLAYER_INVITATION_QUOTA_EXHAUSTED");
    await expect(services.getCurrentPlayerInvitations({ sessionToken: "token.alice", page: 1, pageSize: 20 })).resolves.toMatchObject({ createBlockedReason: "quota_exhausted", quota: { registrations: 1, maxRegistrations: 1 } });
    sqlite.prepare("UPDATE player_invitation_redemptions SET completed_at = 1").run();
    await expect(create("code-b")).resolves.toMatchObject({ code: "CODE-B" });
  });

  it("applies the eligibility mode of the inviter's effective policy", async () => {
    const { sqlite, services, create, addPlayer, now } = await fixture({ minAccountAgeDays: 30, minApprovedSubmissions: 1, eligibilityMode: "any" });
    await expect(create("young")).rejects.toThrow("PLAYER_INVITATION_NOT_ELIGIBLE");
    sqlite.prepare("INSERT INTO submissions (id, player_account_id, status, challenge_type, map_name, source_provider, source_conversation_id, source_message_id, created_at, updated_at) VALUES ('s1', 'alice', 'approved', 'x', 'm', 'qq', 'c', 'm', 1, 1)").run();
    await expect(create("proven")).resolves.toMatchObject({ code: "PROVEN" });
    await services.setAdminPlayerInvitationPolicy({ policy: { ...policy, minAccountAgeDays: 30, minApprovedSubmissions: 1, eligibilityMode: "all" } }, admin, "policy-all");
    await expect(create("both")).rejects.toThrow("PLAYER_INVITATION_NOT_ELIGIBLE");
    addPlayer("old-bob", "Bob", "2222", now - 40 * day);
    sqlite.prepare("INSERT INTO submissions (id, player_account_id, status, challenge_type, map_name, source_provider, source_conversation_id, source_message_id, created_at, updated_at) VALUES ('s2', 'old-bob', 'approved', 'x', 'm', 'qq', 'c', 'm', 1, 1)").run();
    await expect(create("bob-code", {}, "k", "old-bob")).resolves.toMatchObject({ code: "BOB-CODE" });
  });

  it("lets a per-player override disable one inviter or raise their limits without touching others", async () => {
    const { services, create, register, addPlayer } = await fixture({ maxRegistrationsPerPeriod: 1 });
    addPlayer("carol", "Carol", "3333");
    await services.setAdminPlayerInvitationOverride({ playerAccountId: "alice", override: { enabled: null, maxRegistrationsPerPeriod: 2, maxUsesPerCode: null, maxValidityDays: null, minAccountAgeDays: null, minApprovedSubmissions: null, eligibilityMode: null } }, admin, "ov-1");
    await create("one-a", { maxUses: 3 });
    await register("one-a", "P1", "8001", "member.1");
    await expect(create("one-b")).resolves.toMatchObject({ code: "ONE-B" });
    await register("one-a", "P2", "8002", "member.2");
    await expect(create("one-c")).rejects.toThrow("PLAYER_INVITATION_QUOTA_EXHAUSTED");
    await create("carol-a", {}, "k1", "carol");
    await register("carol-a", "P3", "8003", "member.3");
    await expect(create("carol-b", {}, "k2", "carol")).rejects.toThrow("PLAYER_INVITATION_QUOTA_EXHAUSTED");
    await services.setAdminPlayerInvitationOverride({ playerAccountId: "alice", override: { enabled: false, maxRegistrationsPerPeriod: null, maxUsesPerCode: null, maxValidityDays: null, minAccountAgeDays: null, minApprovedSubmissions: null, eligibilityMode: null } }, admin, "ov-2");
    await expect(create("one-d")).rejects.toThrow("PLAYER_INVITATION_DISABLED");
    await services.clearAdminPlayerInvitationOverride({ playerAccountId: "alice" }, admin, "ov-3");
    await expect(services.listAdminPlayerInvitationOverrides({ page: 1, pageSize: 10 }, admin)).resolves.toMatchObject({ total: 0 });
  });
});

describe("registering with a player code", () => {
  it("creates the account, binding, referral, and a session exactly once", async () => {
    const { sqlite, services, create, redeem, verify, count } = await fixture();
    await create("welcome", { maxUses: 2 });
    const claim = await redeem("welcome", "Newbie", "4444");
    await expect(services.getBindingClaimStatus({ claimId: claim.claimId, claimToken: claim.claimToken })).resolves.toMatchObject({ status: "pending_confirmation" });
    const first = await verify(claim.code, "member.new");
    expect(first).toMatchObject({ status: "verified", environment: "test" });
    await expect(verify(claim.code, "member.new", "retry-with-new-key")).resolves.toEqual(first);
    await expect(verify(claim.code, "member.new")).resolves.toEqual(first);

    expect(count("player_accounts")).toBe(2);
    expect(sqlite.prepare("SELECT count(*) AS n FROM bindings WHERE member_open_id = 'member.new' AND status = 'active'").get()).toEqual({ n: 1 });
    expect(sqlite.prepare("SELECT inviter_player_account_id, count(*) AS n FROM player_invitation_redemptions").get()).toMatchObject({ inviter_player_account_id: "alice", n: 1 });
    expect(sqlite.prepare("SELECT count(*) AS n FROM audit_events WHERE operation = 'player.invitation.redeem'").get()).toEqual({ n: 1 });
    await expect(services.getBindingClaimStatus({ claimId: claim.claimId, claimToken: claim.claimToken })).resolves.toMatchObject({ status: "approved" });
    await expect(services.exchangeBindingClaimSession({ claimId: claim.claimId, claimToken: claim.claimToken })).resolves.toMatchObject({ status: "authenticated" });
    await expect(services.exchangeBindingClaimSession({ claimId: claim.claimId, claimToken: "wrong" })).rejects.toThrow("BINDING_CLAIM_FORBIDDEN");

    await expect(services.getCurrentPlayerInvitations({ sessionToken: "token.alice", page: 1, pageSize: 20 })).resolves.toMatchObject({
      quota: { registrations: 1 }, items: [{ code: "WELCOME", usedCount: 1, status: "available" }],
    });
    await expect(services.listCurrentPlayerInvitationRedemptions({ sessionToken: "token.alice", page: 1, pageSize: 20 })).resolves.toMatchObject({ total: 1, items: [{ playerName: "Newbie", playerId: "4444", code: "WELCOME" }] });
    sqlite.prepare("UPDATE player_accounts SET hide_battletag = 1 WHERE player_id = '4444'").run();
    await expect(services.listCurrentPlayerInvitationRedemptions({ sessionToken: "token.alice", page: 1, pageSize: 20 })).resolves.toMatchObject({ items: [{ playerName: null, playerId: null }] });
  });

  it("keeps the confirmation code of a claim from another player's session or code", async () => {
    const { services, create, redeem } = await fixture();
    await create("shared", { maxUses: 2 });
    const one = await redeem("shared", "One", "5001");
    const two = await redeem("shared", "Two", "5002");
    expect(one.code).not.toBe(two.code);
    await expect(services.getBindingClaimStatus({ claimId: one.claimId, claimToken: two.claimToken })).rejects.toThrow("BINDING_CLAIM_FORBIDDEN");
  });

  it("refuses registered BattleTags, unclaimed historical holders, and admin-reserved BattleTags, but not claimed history", async () => {
    const { sqlite, create, redeem, now } = await fixture();
    await create("gate", { maxUses: 5 });
    await expect(redeem("gate", "alice", "1111")).rejects.toThrow("PLAYER_INVITATION_ACCOUNT_EXISTS");
    sqlite.prepare("INSERT INTO historical_title_grants (id, holder_name) VALUES ('h1', 'Legend'), ('h2', 'Claimed')").run();
    sqlite.prepare("INSERT INTO player_title_grants (id, player_account_id, status, source_type, source_id) VALUES ('g2', 'alice', 'active', 'historical', 'h2')").run();
    await expect(redeem("gate", "legend", "6001")).rejects.toThrow("PLAYER_INVITATION_LEGACY_CANDIDATE");
    await expect(redeem("gate", "Claimed", "6002")).resolves.toMatchObject({ playerName: "Claimed" });
    sqlite.prepare("INSERT INTO binding_invites (id, code_hash, player_name, normalized_player_name, player_id, created_by, created_at, expires_at) VALUES ('i1', 'x', 'Reserved', 'reserved', '6003', 'admin', ?, ?)").run(now, now + day);
    await expect(redeem("gate", "Reserved", "6003")).rejects.toThrow("PLAYER_INVITATION_LEGACY_CANDIDATE");
  });

  it("admits at most one account for the last code slot and rejects the other claim with a reason", async () => {
    const { services, create, redeem, verify, count } = await fixture();
    await create("last", { maxUses: 1 });
    const a = await redeem("last", "Ann", "7001");
    const b = await redeem("last", "Ben", "7002");
    const results = await Promise.allSettled([verify(a.code, "member.a"), verify(b.code, "member.b")]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect(count("player_accounts")).toBe(2);
    expect(count("player_invitation_redemptions")).toBe(1);
    const statuses = await Promise.all([a, b].map((c) => services.getBindingClaimStatus({ claimId: c.claimId, claimToken: c.claimToken })));
    expect(statuses.map((s) => s.status).sort()).toEqual(["approved", "rejected"]);
    expect(statuses.find((s) => s.status === "rejected")).toMatchObject({ rejectionReason: "code_exhausted" });
    await expect(redeem("last", "Cy", "7003")).rejects.toThrow("INVITE_INVALID");
  });

  it("counts registrations against the inviter across all codes and resets with a new period", async () => {
    const { sqlite, services, create, register, redeem } = await fixture({ maxRegistrationsPerPeriod: 2 });
    await create("code-1", { maxUses: 5 });
    await create("code-2", { maxUses: 5 });
    await register("code-1", "P1", "8001", "member.1");
    await register("code-2", "P2", "8002", "member.2");
    await expect(redeem("code-1", "P3", "8003")).rejects.toThrow("INVITE_INVALID");
    await expect(services.getCurrentPlayerInvitations({ sessionToken: "token.alice", page: 1, pageSize: 20 })).resolves.toMatchObject({ items: expect.arrayContaining([expect.objectContaining({ status: "inviter_blocked" })]) });
    sqlite.prepare("UPDATE player_invitation_redemptions SET completed_at = 1").run();
    await expect(redeem("code-1", "P3", "8003")).resolves.toMatchObject({ playerName: "P3" });
  });

  it("rejects a pending claim when the code is revoked, the policy changes, or the inviter is disabled", async () => {
    const { services, create, redeem, verify, count } = await fixture();
    const revokedCode = await create("revoke-me", { maxUses: 3 });
    const policyCode = await create("policy-me", { maxUses: 3 });
    const pendingRevoked = await redeem("revoke-me", "R1", "9001");
    const pendingPolicy = await redeem("policy-me", "R2", "9002");
    await services.revokeAdminPlayerInvitation({ invitationId: revokedCode.invitationId }, admin, "admin-revoke");
    await expect(verify(pendingRevoked.code, "member.r1")).rejects.toThrow("BINDING_CLAIM_CODE_INVALID");
    await expect(services.getBindingClaimStatus({ claimId: pendingRevoked.claimId, claimToken: pendingRevoked.claimToken })).resolves.toMatchObject({ status: "rejected", rejectionReason: "invitation_unavailable" });
    await services.setAdminPlayerInvitationPolicy({ policy: { ...policy, enabled: false } }, admin, "off");
    await expect(verify(pendingPolicy.code, "member.r2")).rejects.toThrow("BINDING_CLAIM_CODE_INVALID");
    expect(count("player_accounts")).toBe(1);
    expect(policyCode.invitationId).toBeDefined();
  });

  it("rolls back everything and reports a QQ conflict when the member is already bound", async () => {
    const { sqlite, services, create, redeem, verify, count } = await fixture();
    await create("conflict", { maxUses: 3 });
    const claim = await redeem("conflict", "Dup", "9101");
    await expect(verify(claim.code, "member.alice")).rejects.toThrow("BINDING_CLAIM_CODE_INVALID");
    await expect(services.getBindingClaimStatus({ claimId: claim.claimId, claimToken: claim.claimToken })).resolves.toMatchObject({ status: "rejected", rejectionReason: "qq_conflict" });
    expect(count("player_accounts")).toBe(1);
    expect(count("player_invitation_redemptions")).toBe(0);
    expect(sqlite.prepare("SELECT count(*) AS n FROM identities").get()).toEqual({ n: 0 });
  });

  it("does not let an expired claim or code admit anyone", async () => {
    const { sqlite, create, redeem, verify } = await fixture();
    await create("short", { maxUses: 2 });
    const claim = await redeem("short", "Late", "9201");
    sqlite.prepare("UPDATE player_invitation_claims SET expires_at = 1").run();
    await expect(verify(claim.code, "member.late")).rejects.toThrow("BINDING_CLAIM_CODE_INVALID");
    sqlite.prepare("UPDATE player_invitations SET expires_at = 1").run();
    await expect(redeem("short", "Later", "9202")).rejects.toThrow("INVITE_INVALID");
  });
});

describe("maintainer views", () => {
  it("lists both invitation types with filters, details redemptions, and audits policy changes", async () => {
    const { sqlite, services, create, register, now } = await fixture();
    sqlite.prepare("INSERT INTO binding_invites (id, code_hash, player_name, normalized_player_name, player_id, created_by, created_at, expires_at) VALUES ('11111111-1111-4111-8111-111111111111', 'h', 'Target', 'target', '1', 'admin.one', ?, ?)").run(now, now + day);
    const code = await create("overview", { maxUses: 2 });
    await register("overview", "Guest", "9301", "member.guest");
    const all = await services.listAdminInvitations({ type: "all", page: 1, pageSize: 20 }, admin);
    expect(all.items.map((item) => item.type).sort()).toEqual(["admin", "player"]);
    await expect(services.listAdminInvitations({ type: "player", issuer: "ali", page: 1, pageSize: 20 }, admin)).resolves.toMatchObject({ total: 1, items: [{ usedCount: 1, status: "active" }] });
    await expect(services.listAdminInvitations({ type: "admin", status: "revoked", page: 1, pageSize: 20 }, admin)).resolves.toMatchObject({ total: 0 });
    await expect(services.getAdminPlayerInvitation({ invitationId: code.invitationId, page: 1, pageSize: 20 }, admin)).resolves.toMatchObject({ invitation: { code: "OVERVIEW" }, total: 1, redemptions: [{ playerName: "Guest", playerId: "9301" }] });
    await services.revokeAdminPlayerInvitation({ invitationId: code.invitationId }, admin, "r1");
    await services.revokeAdminPlayerInvitation({ invitationId: code.invitationId }, admin, "r2");
    const audit = await services.listAdminPlayerInvitationAudit({ page: 1, pageSize: 50 }, admin);
    expect(audit.items.map((item) => item.operation)).toEqual(expect.arrayContaining(["admin.player_invitation.policy.update", "player.invitation.create", "player.invitation.redeem", "admin.player_invitation.revoke"]));
  });
});
