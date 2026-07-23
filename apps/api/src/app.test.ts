import { describe, expect, it } from "vitest";
import type { PlatformServices } from "@owbastion/domain";
import { createApp, type RuntimeEnv } from "./app";

const auth = async () => ({ actorType: "service" as const, subject: "qqbot", roles: ["channel:write"], provider: "test" });
const services: PlatformServices = {
  listRandomEvents: async () => [],
  getRandomEvent: async () => null,
  createAdminRandomEvent: async () => { throw new Error("CHALLENGE_NOT_FOUND"); },
  updateAdminRandomEvent: async () => { throw new Error("EVENT_NOT_FOUND"); },
  archiveAdminRandomEvent: async () => { throw new Error("EVENT_NOT_FOUND"); },
  previewAdminRandomEventImport: async () => ({ sourceHash: "hash", validRowCount: 0, errors: [], rows: [] }),
  importAdminRandomEvents: async () => ({ importedCount: 0 }),
  listMaps: async () => [],
  updateAdminMapMetadata: async () => { throw new Error("MAP_NOT_FOUND"); },
  listChallenges: async () => [],
  listTitles: async () => [],
  uploadAdminTitleIcon: async () => ({ iconUrl: "https://api.example.com/v1/public/achievement-icons/TEST" }),
  getPublicTitleIcon: async () => null,
  listCurrentPlayerTitles: async ({ sessionToken }) => sessionToken === "session-token" ? [{ grantId: "00000000-0000-0000-0000-000000000006", titleKey: "PIONEER", label: "开拓者", icon: "trophy", category: "社区贡献系列", condition: "完成萨摩亚地狱难度。", scope: "map", mapName: "萨摩亚", slot: "pioneer", grantedAt: 4 }] : null,
  listHistoricalTitleGrants: async () => [],
  createAdminTitleGrant: async () => {},
  createAdminTitleGrantBulk: async () => ({ contractVersion: "1", grantedCount: 0 }),
  revokeAdminTitleGrant: async () => {},
  listAdminChallenges: async () => ({ contractVersion: "1", items: [] }),
  updateAdminChallenge: async () => { throw new Error("CHALLENGE_NOT_FOUND"); },
  updateAdminCatalogTitle: async () => {},
  createPlayerUploadSession: async () => ({ contractVersion: "1", submissionId: "00000000-0000-0000-0000-000000000003", uploadId: "00000000-0000-0000-0000-000000000004", uploadUrl: "http://localhost/upload", expiresAt: 1, maxBytes: 10 }),
  uploadEvidence: async () => {},
  completePlayerUpload: async () => ({ submissionId: "00000000-0000-0000-0000-000000000003", status: "ocr_pending" }),
  listAdminSubmissions: async () => ({ contractVersion: "1", items: [], page: 1, pageSize: 50, total: 0, hasMore: false }),
  getAdminSubmission: async () => { throw new Error("SUBMISSION_NOT_FOUND"); },
  getAdminEvidence: async () => ({ body: new ArrayBuffer(0), contentType: "image/png" }),
  getPlayerSubmission: async () => ({ contractVersion: "1", submissionId: "00000000-0000-0000-0000-000000000003", status: "ready_for_review", mapName: "Test Map", createdAt: 1, updatedAt: 2, ocr: { mapName: "Test Map", difficulty: "困难", playerName: "Player", challengeCompleted: true } }),
  getPlayerEvidence: async () => ({ body: new Uint8Array([1, 2, 3]).buffer, contentType: "image/png" }),
  reviewSubmission: async () => {},
  processOcrJob: async () => {},
  markOcrJobFailed: async () => {},
  createBinding: async () => { throw new Error("INVITE_REQUIRED"); },
  createAdminBindingInvite: async () => ({ contractVersion: "1", inviteId: "00000000-0000-0000-0000-000000000007", code: "ABCDEFGHIJKL", playerName: "Player", playerId: "1234", expiresAt: 1 }),
  createAdminBindingInviteBatch: async () => ({ contractVersion: "1", items: [{ contractVersion: "1", inviteId: "00000000-0000-0000-0000-000000000007", code: "ABCDEFGHIJKL", playerName: "Player", playerId: "1234", expiresAt: 1 }] }),
  listAdminBindingInvites: async () => ({ contractVersion: "1", items: [{ inviteId: "00000000-0000-0000-0000-000000000007", playerName: "Player", playerId: "1234", status: "active" as const, codeAvailable: true, createdAt: 1, expiresAt: 2 }] }),
  getAdminBindingInviteCode: async () => ({ contractVersion: "1", inviteId: "00000000-0000-0000-0000-000000000007", code: "ABCDEFGHIJKL" }),
  revokeAdminBindingInvite: async () => {},
  redeemBindingInvite: async () => ({ contractVersion: "1", claimId: "00000000-0000-0000-0000-000000000008", claimToken: "a".repeat(64), code: "ABC234", expiresAt: 1 }),
  getBindingClaimStatus: async () => ({ contractVersion: "1", status: "pending_confirmation", expiresAt: 1 }),
  verifyBindingClaim: async () => ({ contractVersion: "1", status: "verified", environment: "test" }),
  listAdminBindingClaims: async () => ({ contractVersion: "1", items: [] }),
  decideAdminBindingClaim: async () => {},
  createSubmission: async () => ({ contractVersion: "1", submissionId: "00000000-0000-0000-0000-000000000003", status: "evidence_pending", mapName: "Test Map", attachmentIds: ["00000000-0000-0000-0000-000000000004"] }),
  getSubmission: async () => ({ contractVersion: "1", submissionId: "00000000-0000-0000-0000-000000000003", status: "ocr_pending", mapName: "Test Map", createdAt: 1, updatedAt: 1 }),
  createQqLoginAttempt: async () => ({ contractVersion: "1", attemptId: "00000000-0000-0000-0000-000000000005", attemptToken: "a".repeat(64), code: "ABC234", expiresAt: 1 }),
  getQqLoginStatus: async () => ({ contractVersion: "1", status: "pending" }),
  verifyQqLogin: async () => ({ contractVersion: "1", status: "verified", environment: "test" }),
  upsertQqGroupAccess: async () => {},
  registerQqGroup: async () => {},
  listQqGroupAccess: async () => [],
  dispatchPendingQqGroupPolicyEvents: async () => {},
  markQqGroupPolicyEventDelivered: async () => {},
  listAdminPlayers: async () => ({ contractVersion: "1" as const, items: [], page: 1, pageSize: 25, total: 0, hasMore: false }),
  getAdminPlayer: async () => { throw new Error("PLAYER_NOT_FOUND"); },
  setAdminPlayerStatus: async () => {},
  removeAdminBinding: async () => {},
  getCurrentPlayer: async ({ sessionToken }) => sessionToken === "session-token" ? {
    contractVersion: "1",
    player: { playerId: "1234", playerName: "Player", bindingStatus: "bound", isAdmin: false },
    recentSubmissions: [{ submissionId: "00000000-0000-0000-0000-000000000003", status: "ocr_pending", mapName: "Test Map", createdAt: 2, updatedAt: 3 }],
  } : null,
  logoutPortalSession: async () => {},
  listLocalDevAccounts: async () => [],
  createLocalDevSession: async () => ({ sessionToken: "local-session-token" }),
};

const app = createApp({
  authenticate: auth,
  services: () => services,
});

const env = {} as RuntimeEnv;

describe("API", () => {
  it("lists public random events without development records", async () => {
    const eventApp = createApp({ authenticate: auth, services: () => ({ ...services, listRandomEvents: async () => [{ eventId: "event.test", name: "稳住", category: "增益", rarity: "R", description: "测试事件", durationSeconds: 60, cooldownSeconds: null, weight: 1, appearanceProbability: .1, categoryProbability: .4, groupTotalWeight: 1, groupSize: 1, failureProbability: null, guaranteeProbability: null, globalAppearanceProbability: .1, gameVersion: "5.0", effectTags: ["护盾"], releaseStatus: "implemented", archived: false, challenges: [] }] }) });
    const response = await eventApp.request("http://localhost/v1/events", {}, env);
    expect(response.status).toBe(200);
    expect((await response.json() as { items: Array<{ name: string }> }).items[0]?.name).toBe("稳住");
  });
  it("requires a maintainer and an idempotency key for event imports", async () => {
    const request = { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ contractVersion: "1", fileName: "events.csv", csv: "名称" }) };
    expect((await app.request("http://localhost/v1/admin/events/imports", request, env)).status).toBe(403);
    const maintainerApp = createApp({ authenticate: async () => ({ actorType: "user" as const, subject: "admin", roles: ["maintainer"], provider: "test" }), services: () => services });
    expect((await maintainerApp.request("http://localhost/v1/admin/events/imports", request, env)).status).toBe(422);
  });
  it("reports health without external services", async () => {
    const response = await app.request("http://localhost/health", {}, env);
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ service: "api", status: "ok" });
  });

  it("rejects the legacy binding endpoint in favor of invitations", async () => {
    const response = await app.request("http://localhost/v1/qq/bindings", { method: "POST", headers: { "idempotency-key": "binding-1", "content-type": "application/json" }, body: JSON.stringify({ contractVersion: "1", provider: "qq", groupOpenId: "group-1", memberOpenId: "member-1", playerName: "Player", playerId: "1234" }) }, env);
    expect(response.status).toBe(422);
    expect((await response.json() as { error: { code: string } }).error.code).toBe("INVITE_REQUIRED");
  });

  it("creates a public invitation claim without a player session", async () => {
    const response = await app.request("http://localhost/v1/public/binding-invites/redeem", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ contractVersion: "1", code: "ABCDEFGHIJKL", playerName: "Player", playerId: "1234" }) }, env);
    expect(response.status).toBe(201);
    expect(await response.json()).toMatchObject({ claimId: "00000000-0000-0000-0000-000000000008", code: "ABC234" });
  });

  it("limits invitation creation and claim decisions to maintainers", async () => {
    const body = JSON.stringify({ contractVersion: "1", playerName: "Player", playerId: "1234" });
    expect((await app.request("http://localhost/v1/admin/binding-invites", { method: "POST", headers: { "content-type": "application/json", "idempotency-key": "invite-1" }, body }, env)).status).toBe(403);
    const adminApp = createApp({ authenticate: async () => ({ actorType: "user" as const, subject: "admin", roles: ["maintainer"], provider: "test" }), services: () => services });
    expect((await adminApp.request("http://localhost/v1/admin/binding-invites", { method: "POST", headers: { "content-type": "application/json", "idempotency-key": "invite-1" }, body }, env)).status).toBe(201);
    expect((await adminApp.request("http://localhost/v1/admin/binding-claims/00000000-0000-0000-0000-000000000008/decision", { method: "POST", headers: { "content-type": "application/json", "idempotency-key": "claim-1" }, body: JSON.stringify({ contractVersion: "1", decision: "approved" }) }, env)).status).toBe(204);
  });

  it("lists issued invitation status only for maintainers", async () => {
    expect((await app.request("http://localhost/v1/admin/binding-invites", {}, env)).status).toBe(403);
    const adminApp = createApp({ authenticate: async () => ({ actorType: "user" as const, subject: "admin", roles: ["maintainer"], provider: "test" }), services: () => services });
    const response = await adminApp.request("http://localhost/v1/admin/binding-invites", {}, env);
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ items: [{ playerName: "Player", status: "active" }] });
  });

  it("lists binding claims only for maintainers", async () => {
    expect((await app.request("http://localhost/v1/admin/binding-claims", {}, env)).status).toBe(403);
    const adminApp = createApp({ authenticate: async () => ({ actorType: "user" as const, subject: "admin", roles: ["maintainer"], provider: "test" }), services: () => ({ ...services, listAdminBindingClaims: async () => ({ contractVersion: "1", items: [{ claimId: "c1", playerName: "Player", playerId: "1234", status: "expired" as const, createdAt: 1, invitedBy: "admin" }] }) }) });
    const response = await adminApp.request("http://localhost/v1/admin/binding-claims", {}, env);
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ items: [{ claimId: "c1", status: "expired" }] });
  });

  it("returns an active invitation code only to maintainers", async () => {
    const path = "http://localhost/v1/admin/binding-invites/00000000-0000-0000-0000-000000000007/code";
    expect((await app.request(path, {}, env)).status).toBe(403);
    const adminApp = createApp({ authenticate: async () => ({ actorType: "user" as const, subject: "admin", roles: ["maintainer"], provider: "test" }), services: () => services });
    const response = await adminApp.request(path, {}, env);
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ code: "ABCDEFGHIJKL" });
  });

  it("revokes unused invitations only for maintainers", async () => {
    const body = JSON.stringify({ contractVersion: "1" });
    const path = "http://localhost/v1/admin/binding-invites/00000000-0000-0000-0000-000000000007/revoke";
    expect((await app.request(path, { method: "POST", headers: { "content-type": "application/json", "idempotency-key": "revoke-1" }, body }, env)).status).toBe(403);
    const revoked: Array<{ inviteId: string; reason?: string }> = [];
    const adminApp = createApp({ authenticate: async () => ({ actorType: "user" as const, subject: "admin", roles: ["maintainer"], provider: "test" }), services: () => ({ ...services, revokeAdminBindingInvite: async (input) => { revoked.push(input); } }) });
    expect((await adminApp.request(path, { method: "POST", headers: { "content-type": "application/json", "idempotency-key": "revoke-1" }, body }, env)).status).toBe(204);
    expect(revoked).toEqual([{ inviteId: "00000000-0000-0000-0000-000000000007", contractVersion: "1" }]);
  });

  it("creates a batch of binding invitations for maintainers", async () => {
    const body = JSON.stringify({ contractVersion: "1", invitations: [{ playerName: "Player", playerId: "1234" }, { playerName: "Another", playerId: "5678" }] });
    expect((await app.request("http://localhost/v1/admin/binding-invites/batch", { method: "POST", headers: { "content-type": "application/json", "idempotency-key": "batch-invite-1" }, body }, env)).status).toBe(403);
    const adminApp = createApp({ authenticate: async () => ({ actorType: "user" as const, subject: "admin", roles: ["maintainer"], provider: "test" }), services: () => services });
    const response = await adminApp.request("http://localhost/v1/admin/binding-invites/batch", { method: "POST", headers: { "content-type": "application/json", "idempotency-key": "batch-invite-1" }, body }, env);
    expect(response.status).toBe(201);
    expect(await response.json()).toMatchObject({ items: [{ code: "ABCDEFGHIJKL" }] });
    const duplicate = JSON.stringify({ contractVersion: "1", invitations: [{ playerName: "Player", playerId: "1234" }, { playerName: "player", playerId: "1234" }] });
    expect((await adminApp.request("http://localhost/v1/admin/binding-invites/batch", { method: "POST", headers: { "content-type": "application/json", "idempotency-key": "batch-invite-duplicate" }, body: duplicate }, env)).status).toBe(422);
  });

  it("reuses the existing QQ verification endpoint for invitation confirmation", async () => {
    const body = JSON.stringify({ contractVersion: "1", provider: "qq", code: "ABC234", groupOpenId: "group-1", memberOpenId: "member-1", messageId: "message-1" });
    const claimApp = createApp({ authenticate: auth, services: () => ({ ...services, verifyQqLogin: async () => { throw new Error("LOGIN_CODE_INVALID"); } }) });
    expect((await claimApp.request("http://localhost/v1/qq/auth/verify", { method: "POST", headers: { "content-type": "application/json" }, body }, env)).status).toBe(422);
    const response = await claimApp.request("http://localhost/v1/qq/auth/verify", { method: "POST", headers: { "content-type": "application/json", "idempotency-key": "claim-verify-1" }, body }, env);
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ status: "verified", environment: "test" });
  });

  it("returns a claim status only with the claim token", async () => {
    const path = "http://localhost/v1/public/binding-claims/00000000-0000-0000-0000-000000000008";
    expect((await app.request(path, {}, env)).status).toBe(422);
    const response = await app.request(path, { headers: { "x-claim-token": "a".repeat(64) } }, env);
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ contractVersion: "1", status: "pending_confirmation", expiresAt: 1 });
  });

  it("rejects requests without an idempotency key", async () => {
    const response = await app.request("http://localhost/v1/qq/bindings", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ contractVersion: "1", provider: "qq", groupOpenId: "group-1", memberOpenId: "member-1", playerName: "Player", playerId: "1234" }) }, env);
    expect(response.status).toBe(422);
    expect((await response.json() as { error: { code: string } }).error.code).toBe("IDEMPOTENCY_KEY_REQUIRED");
  });

  it("does not let an older QQBot bypass invitations through group policy", async () => {
    const restrictedApp = createApp({ authenticate: auth, services: () => ({ ...services, createBinding: async () => { throw new Error("BINDING_GROUP_NOT_ALLOWED"); } }) });
    const response = await restrictedApp.request("http://localhost/v1/qq/bindings", { method: "POST", headers: { "idempotency-key": "binding-1", "content-type": "application/json" }, body: JSON.stringify({ contractVersion: "1", provider: "qq", groupOpenId: "group-1", memberOpenId: "member-1", playerName: "Player", playerId: "1234" }) }, env);
    expect(response.status).toBe(422);
    expect((await response.json() as { error: { code: string } }).error.code).toBe("INVITE_REQUIRED");
  });

  it("requires idempotency for QQ group lifecycle registration", async () => {
    const registrations: Array<{ input: unknown; key: string }> = [];
    const lifecycleApp = createApp({ authenticate: auth, services: () => ({ ...services, registerQqGroup: async (input, _auth, key) => { registrations.push({ input, key }); } }) });
    const body = JSON.stringify({ contractVersion: "1", groupOpenId: "group-1", status: "pending", occurredAt: 1 });
    expect((await lifecycleApp.request("http://localhost/v1/qq/groups", { method: "POST", headers: { "content-type": "application/json" }, body }, env)).status).toBe(422);
    expect((await lifecycleApp.request("http://localhost/v1/qq/groups", { method: "POST", headers: { "content-type": "application/json", "idempotency-key": "group-event-1" }, body }, env)).status).toBe(204);
    expect(registrations).toEqual([{ input: { contractVersion: "1", groupOpenId: "group-1", status: "pending", occurredAt: 1 }, key: "group-event-1" }]);
  });

  it("requires idempotency for administrator group configuration", async () => {
    const updates: Array<{ input: unknown; key: string }> = [];
    const adminApp = createApp({ authenticate: async () => ({ actorType: "user" as const, subject: "admin", roles: ["maintainer"], provider: "test" }), services: () => ({ ...services, upsertQqGroupAccess: async (input, _auth, key) => { updates.push({ input, key }); } }) });
    const body = JSON.stringify({ contractVersion: "1", displayName: "主群", environment: "production", status: "active", bindEnabled: true, verifyEnabled: true });
    expect((await adminApp.request("http://localhost/v1/admin/qq/groups/group-1", { method: "PUT", headers: { "content-type": "application/json" }, body }, env)).status).toBe(422);
    expect((await adminApp.request("http://localhost/v1/admin/qq/groups/group-1", { method: "PUT", headers: { "content-type": "application/json", "idempotency-key": "group-update-1" }, body }, env)).status).toBe(204);
    expect(updates).toEqual([{ input: { contractVersion: "1", groupOpenId: "group-1", displayName: "主群", environment: "production", status: "active", bindEnabled: true, verifyEnabled: true }, key: "group-update-1" }]);
  });

  it("returns only public submission status fields", async () => {
    const response = await app.request("http://localhost/v1/submissions/00000000-0000-0000-0000-000000000003");
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ contractVersion: "1", submissionId: "00000000-0000-0000-0000-000000000003", status: "ocr_pending", mapName: "Test Map", createdAt: 1, updatedAt: 1 });
  });

  it("creates and polls a browser login attempt", async () => {
    const create = await app.request("http://localhost/v1/auth/qq/login-attempt", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ contractVersion: "1", provider: "qq" }) }, env);
    expect(create.status).toBe(201);
    const payload = await create.json() as { attemptId: string; attemptToken: string };
    const status = await app.request(`http://localhost/v1/auth/qq/login-attempt/${payload.attemptId}`, { headers: { "x-login-attempt-token": payload.attemptToken } }, env);
    expect(status.status).toBe(200);
    expect(await status.json()).toMatchObject({ contractVersion: "1", status: "pending" });
  });

  it("sets a secure cookie only over HTTPS", async () => {
    const verifiedApp = createApp({
      authenticate: auth,
      services: () => ({ ...services, getQqLoginStatus: async () => ({ contractVersion: "1", status: "verified", environment: "production", sessionToken: "a".repeat(64) }) }),
    });
    const response = await verifiedApp.request("https://api.owbastion.com/v1/auth/qq/login-attempt/00000000-0000-0000-0000-000000000005", { headers: { "x-login-attempt-token": "a".repeat(64) } }, env);
    expect(response.headers.get("set-cookie")).toContain("Secure");
    expect(response.headers.get("access-control-allow-origin")).toBe("https://owbastion.com");
  });

  it("requires a valid portal session and returns only player-facing fields", async () => {
    const unauthenticated = await app.request("http://localhost/v1/me", {}, env);
    expect(unauthenticated.status).toBe(401);

    const response = await app.request("http://localhost/v1/me", { headers: { cookie: "owb_session=session-token" } }, env);
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      contractVersion: "1",
      player: { playerId: "1234", playerName: "Player", bindingStatus: "bound", isAdmin: false },
      recentSubmissions: [{ submissionId: "00000000-0000-0000-0000-000000000003", status: "ocr_pending", mapName: "Test Map", createdAt: 2, updatedAt: 3 }],
    });
  });

  it("returns only the signed-in player's active title grants", async () => {
    expect((await app.request("http://localhost/v1/me/titles", {}, env)).status).toBe(401);
    const response = await app.request("http://localhost/v1/me/titles", { headers: { cookie: "owb_session=session-token" } }, env);
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ contractVersion: "1", items: [{ titleKey: "PIONEER", mapName: "萨摩亚", condition: "完成萨摩亚地狱难度。" }] });
  });

  it("returns a signed-in player's private submission detail and evidence", async () => {
    expect((await app.request("http://localhost/v1/me/submissions/00000000-0000-0000-0000-000000000003", {}, env)).status).toBe(401);

    const detail = await app.request("http://localhost/v1/me/submissions/00000000-0000-0000-0000-000000000003", { headers: { cookie: "owb_session=session-token" } }, env);
    expect(detail.status).toBe(200);
    expect(await detail.json()).toMatchObject({ status: "ready_for_review", ocr: { mapName: "Test Map", difficulty: "困难", playerName: "Player", challengeCompleted: true } });

    const evidence = await app.request("http://localhost/v1/me/submissions/00000000-0000-0000-0000-000000000003/evidence", { headers: { cookie: "owb_session=session-token" } }, env);
    expect(evidence.status).toBe(200);
    expect(evidence.headers.get("content-type")).toBe("image/png");
    expect(evidence.headers.get("cache-control")).toBe("private, no-store");
    expect(new Uint8Array(await evidence.arrayBuffer())).toEqual(new Uint8Array([1, 2, 3]));
  });

  it("does not reveal another player's submission", async () => {
    const privateApp = createApp({
      authenticate: auth,
      services: () => ({ ...services, getPlayerSubmission: async () => { throw new Error("SUBMISSION_NOT_FOUND"); }, getPlayerEvidence: async () => { throw new Error("SUBMISSION_NOT_FOUND"); } }),
    });
    const response = await privateApp.request("http://localhost/v1/me/submissions/00000000-0000-0000-0000-000000000003", { headers: { cookie: "owb_session=session-token" } }, env);
    expect(response.status).toBe(404);
    expect((await response.json() as { error: { code: string } }).error.code).toBe("SUBMISSION_NOT_FOUND");
  });

  it("limits historical title migration to maintainers and requires idempotency", async () => {
    const createAdminTitleGrant = async () => {};
    const adminApp = createApp({ authenticate: async () => ({ actorType: "user", subject: "admin", roles: ["maintainer"], provider: "test" }), services: () => ({ ...services, createAdminTitleGrant }) });
    const body = JSON.stringify({ contractVersion: "1", playerAccountId: "11111111-1111-4111-8111-111111111111", historicalTitleGrantId: "22222222-2222-4222-8222-222222222222" });
    expect((await adminApp.request("http://localhost/v1/admin/title-grants", { method: "POST", headers: { "content-type": "application/json" }, body }, env)).status).toBe(422);
    expect((await adminApp.request("http://localhost/v1/admin/title-grants", { method: "POST", headers: { "content-type": "application/json", "idempotency-key": "title-grant-1" }, body }, env)).status).toBe(204);
  });

  it("bulk-links every unclaimed title held by one exact historical player name", async () => {
    const requests: Array<{ holderName: string; playerAccountId: string; idempotencyKey: string }> = [];
    const responses = new Map<string, { contractVersion: "1"; grantedCount: number }>();
    const adminApp = createApp({
      authenticate: async () => ({ actorType: "user", subject: "admin", roles: ["maintainer"], provider: "test" }),
      services: () => ({ ...services, createAdminTitleGrantBulk: async (input, _auth, idempotencyKey) => {
        const existing = responses.get(idempotencyKey);
        if (existing) {
          const request = requests.find((value) => value.idempotencyKey === idempotencyKey)!;
          if (request.holderName !== input.holderName || request.playerAccountId !== input.playerAccountId) throw new Error("IDEMPOTENCY_CONFLICT");
          return existing;
        }
        requests.push({ ...input, idempotencyKey });
        const response = { contractVersion: "1" as const, grantedCount: input.holderName === "Cold" ? 42 : 0 };
        responses.set(idempotencyKey, response);
        return response;
      } }),
    });
    const body = JSON.stringify({ contractVersion: "1", holderName: "Cold", playerAccountId: "11111111-1111-4111-8111-111111111111" });
    expect((await adminApp.request("http://localhost/v1/admin/title-grants/bulk", { method: "POST", headers: { "content-type": "application/json" }, body }, env)).status).toBe(422);
    expect((await app.request("http://localhost/v1/admin/title-grants/bulk", { method: "POST", headers: { "content-type": "application/json", "idempotency-key": "bulk-1" }, body }, env)).status).toBe(403);
    const first = await adminApp.request("http://localhost/v1/admin/title-grants/bulk", { method: "POST", headers: { "content-type": "application/json", "idempotency-key": "bulk-1" }, body }, env);
    expect(first.status).toBe(200);
    expect(await first.json()).toEqual({ contractVersion: "1", grantedCount: 42 });
    const replay = await adminApp.request("http://localhost/v1/admin/title-grants/bulk", { method: "POST", headers: { "content-type": "application/json", "idempotency-key": "bulk-1" }, body }, env);
    expect(await replay.json()).toEqual({ contractVersion: "1", grantedCount: 42 });
    const conflict = await adminApp.request("http://localhost/v1/admin/title-grants/bulk", { method: "POST", headers: { "content-type": "application/json", "idempotency-key": "bulk-1" }, body: JSON.stringify({ contractVersion: "1", holderName: "Boo", playerAccountId: "11111111-1111-4111-8111-111111111111" }) }, env);
    expect(conflict.status).toBe(409);
    expect(requests).toEqual([{ contractVersion: "1", holderName: "Cold", playerAccountId: "11111111-1111-4111-8111-111111111111", idempotencyKey: "bulk-1" }]);
  });

  it("limits achievement management to maintainers and validates lifecycle updates", async () => {
    const updates: unknown[] = [];
    const catalogUpdates: unknown[] = [];
    const adminApp = createApp({
      authenticate: async () => ({ actorType: "user", subject: "admin", roles: ["maintainer"], provider: "test" }),
      services: () => ({
        ...services,
        listAdminChallenges: async ({ family, status }) => ({ contractVersion: "1", items: family === "achievement" && status === "active" ? [{ challengeId: "title.flawless", family: "achievement", type: "title_achievement", kind: "title_achievement", titleKey: "FLAWLESS", titleName: "完美无缺", icon: "zap", category: "极限操作系列", categoryOverride: null, condition: "单局跳过英雄次数为 0 且通关。", evidenceRule: "完整截图", gameVersion: "2026.07.15", status: "active", submissionMode: "manual", introducedVersion: "2026.07.15", retiredVersion: null }] : family === undefined ? [{ challengeId: "title.INTERNAL", family: "title_catalog", type: "title_catalog", titleKey: "INTERNAL", titleName: "内部称号", icon: "wrench", category: "开发保留", condition: "开发/管理用途。", availability: "active", scope: "global", displayKind: "fixed", status: "active", gameVersion: "2026.07.15", hasChallenge: false }] : [] }),
        updateAdminChallenge: async (input) => { if (input.family !== "achievement") throw new Error("CHALLENGE_NOT_FOUND"); updates.push(input); return { challengeId: input.challengeId, family: "achievement", type: "title_achievement", kind: "title_achievement", titleKey: "FLAWLESS", titleName: "完美无缺", icon: "zap", category: input.categoryOverride ?? "极限操作系列", categoryOverride: input.categoryOverride, condition: input.condition, evidenceRule: input.evidenceRule, gameVersion: "2026.07.15", status: input.status, submissionMode: input.submissionMode, introducedVersion: "2026.07.15", retiredVersion: input.status === "sunsetting" ? input.retiredVersion! : null } as const; },
        updateAdminCatalogTitle: async (input) => { catalogUpdates.push(input); },
      }),
    });
    expect((await app.request("http://localhost/v1/admin/achievements", {}, env)).status).toBe(403);
    const anonymousApp = createApp({ authenticate: async () => null, services: () => services });
    expect((await anonymousApp.request("http://localhost/v1/admin/achievements", {}, env)).status).toBe(401);
    const listed = await adminApp.request("http://localhost/v1/admin/achievements?type=title_achievement&status=active", {}, env);
    expect(listed.status).toBe(200);
    expect(await listed.json()).toMatchObject({ items: [{ family: "achievement", categoryOverride: null }] });
    const retirement = { contractVersion: "1", condition: "单局跳过英雄次数为 0 且通关。", evidenceRule: "完整截图", submissionMode: "manual", categoryOverride: "极限操作系列", status: "retired" };
    expect((await adminApp.request("http://localhost/v1/admin/achievements/title.flawless", { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify(retirement) }, env)).status).toBe(422);
    const updated = await adminApp.request("http://localhost/v1/admin/achievements/title.flawless", { method: "PUT", headers: { "content-type": "application/json", "idempotency-key": "achievement-1" }, body: JSON.stringify(retirement) }, env);
    expect(updated.status).toBe(200);
    expect(await updated.json()).toMatchObject({ challengeId: "title.flawless", family: "achievement", status: "retired", retiredVersion: null });
    expect(updates).toMatchObject([{ challengeId: "title.flawless", status: "retired" }]);
    const catalog = await adminApp.request("http://localhost/v1/admin/achievements", {}, env);
    expect(await catalog.json()).toMatchObject({ items: [{ family: "title_catalog", titleKey: "INTERNAL", hasChallenge: false }] });
    const titleStatus = await adminApp.request("http://localhost/v1/admin/titles/INTERNAL", { method: "PUT", headers: { "content-type": "application/json", "idempotency-key": "title-catalog-1" }, body: JSON.stringify({ contractVersion: "1", status: "retired" }) }, env);
    expect(titleStatus.status).toBe(204);
    expect(catalogUpdates).toMatchObject([{ titleKey: "INTERNAL", status: "retired" }]);
  });

  it("accepts a maintainer achievement icon upload as multipart data", async () => {
    const uploads: Array<{ titleKey: string; contentType: string; byteSize: number }> = [];
    const adminApp = createApp({
      authenticate: async () => ({ actorType: "user", subject: "admin", roles: ["maintainer"], provider: "test" }),
      services: () => ({
        ...services,
        uploadAdminTitleIcon: async (input) => { uploads.push({ titleKey: input.titleKey, contentType: input.contentType, byteSize: input.body.byteLength }); return { iconUrl: "https://api.example.com/v1/public/achievement-icons/FLAWLESS" }; },
      }),
    });
    const form = new FormData();
    form.append("file", new File([new Uint8Array([1, 2, 3])], "icon.png", { type: "image/png" }));
    const response = await adminApp.request("http://localhost/v1/admin/titles/FLAWLESS/icon", { method: "POST", body: form }, env);
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ iconUrl: "https://api.example.com/v1/public/achievement-icons/FLAWLESS" });
    expect(uploads).toEqual([{ titleKey: "FLAWLESS", contentType: "image/png", byteSize: 3 }]);
  });

  it("publishes map catalogs while protecting player-only catalogs", async () => {
    const requestedFamilies: Array<string | undefined> = [];
    const catalogServices: PlatformServices = {
      ...services,
      listMaps: async () => [{ mapId: "map.samoa", mapName: "萨摩亚", gameVersion: "2026.07.15", difficultyRating: "T3", mechanics: ["动态掩体"], coverUrl: null, backgroundUrl: null }],
        listChallenges: async (input) => {
        requestedFamilies.push(input?.family);
        if (input?.family === "achievement") return [{ challengeId: "title.flawless", family: "achievement", type: "title_achievement", kind: "title_achievement", titleKey: "FLAWLESS", titleName: "完美无缺", icon: "zap", category: "极限操作系列", condition: "单局跳过英雄次数为 0 且通关。", evidenceRule: "完整截图", gameVersion: "2026.07.15", status: "active", submissionMode: "manual" }];
        return [{ challengeId: "map.samoa.conqueror", family: "map", type: "map_completion", kind: "difficulty_completion", name: "征服者", mapId: "map.samoa", mapName: "萨摩亚", difficulty: "传奇", gameVersion: "2026.07.15", status: "active" }];
      },
      listTitles: async ({ mapId }) => mapId ? [{ titleKey: "PIONEER", label: "开拓者", icon: "trophy", category: "社区贡献系列", condition: "地图挑战", availability: "active", scope: "map", displayKind: "map_pioneer", mapId, slot: "pioneer", pioneerPrefixes: ["萨摩亚"], gameVersion: "2026.07.15" }] : [{ titleKey: "ALL_IN_ONE", label: "万象归一", icon: "trophy", category: "地图精通系列", condition: "获得所有地图征服者头衔", availability: "active", scope: "global", displayKind: "fixed", gameVersion: "2026.07.15" }],
    };
    const catalogApp = createApp({ authenticate: async () => null, services: () => catalogServices });
    expect((await catalogApp.request("http://localhost/v1/maps", {}, env)).status).toBe(200);
    expect((await catalogApp.request("http://localhost/v1/challenges?family=map", {}, env)).status).toBe(200);
    expect((await catalogApp.request("http://localhost/v1/titles", {}, env)).status).toBe(401);

    const adminCatalogApp = createApp({
      authenticate: async () => ({ actorType: "user", subject: "admin", roles: ["maintainer"], provider: "test" }),
      services: () => ({ ...catalogServices, updateAdminMapMetadata: async (input) => ({ mapId: input.mapId, mapName: "萨摩亚", gameVersion: "2026.07.15", difficultyRating: input.difficultyRating, mechanics: input.mechanics, coverUrl: input.coverUrl, backgroundUrl: input.backgroundUrl }) }),
    });
    expect((await adminCatalogApp.request("http://localhost/v1/admin/maps", {}, env)).status).toBe(200);
    expect((await adminCatalogApp.request("http://localhost/v1/admin/maps/map.samoa/metadata", { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify({ contractVersion: "1", difficultyRating: "T3", mechanics: ["动态掩体"] }) }, env)).status).toBe(422);
    const metadataUpdate = await adminCatalogApp.request("http://localhost/v1/admin/maps/map.samoa/metadata", { method: "PUT", headers: { "content-type": "application/json", "idempotency-key": "map-metadata-1" }, body: JSON.stringify({ contractVersion: "1", difficultyRating: "T3", mechanics: ["动态掩体"], coverUrl: null, backgroundUrl: null }) }, env);
    expect(metadataUpdate.status).toBe(200);
    expect(await metadataUpdate.json()).toMatchObject({ mapId: "map.samoa", difficultyRating: "T3", mechanics: ["动态掩体"] });

    const playerCatalogApp = createApp({ authenticate: async () => null, services: () => catalogServices });
    const maps = await playerCatalogApp.request("http://localhost/v1/maps", { headers: { cookie: "owb_session=session-token" } }, env);
    const challenges = await playerCatalogApp.request("http://localhost/v1/challenges", { headers: { cookie: "owb_session=session-token" } }, env);
    const mapChallenges = await playerCatalogApp.request("http://localhost/v1/challenges?family=map", { headers: { cookie: "owb_session=session-token" } }, env);
    const achievementChallenges = await playerCatalogApp.request("http://localhost/v1/challenges?family=achievement", { headers: { cookie: "owb_session=session-token" } }, env);
    const invalidFamily = await playerCatalogApp.request("http://localhost/v1/challenges?family=other", { headers: { cookie: "owb_session=session-token" } }, env);
    const titles = await playerCatalogApp.request("http://localhost/v1/titles", { headers: { cookie: "owb_session=session-token" } }, env);
    const mapTitles = await playerCatalogApp.request("http://localhost/v1/titles?mapId=map.samoa", { headers: { cookie: "owb_session=session-token" } }, env);
    expect(maps.status).toBe(200);
    expect(challenges.status).toBe(200);
    expect(mapChallenges.status).toBe(200);
    expect(achievementChallenges.status).toBe(200);
    expect(invalidFamily.status).toBe(422);
    expect(titles.status).toBe(200);
    expect(mapTitles.status).toBe(200);
    expect(await maps.json()).toEqual({ contractVersion: "1", items: [{ mapId: "map.samoa", mapName: "萨摩亚", gameVersion: "2026.07.15", difficultyRating: "T3", mechanics: ["动态掩体"], coverUrl: null, backgroundUrl: null }] });
    expect(await challenges.json()).toMatchObject({ contractVersion: "1", items: [{ challengeId: "map.samoa.conqueror", mapId: "map.samoa", kind: "difficulty_completion" }] });
    expect(await mapChallenges.json()).toMatchObject({ contractVersion: "1", items: [{ family: "map" }] });
    expect(await achievementChallenges.json()).toMatchObject({ contractVersion: "1", items: [{ challengeId: "title.flawless", titleName: "完美无缺", family: "achievement", submissionMode: "manual" }] });
    expect(requestedFamilies).toEqual(["map", undefined, "map", "achievement"]);
    expect(await titles.json()).toMatchObject({ contractVersion: "1", items: [{ titleKey: "ALL_IN_ONE", scope: "global" }] });
    expect(await mapTitles.json()).toMatchObject({ contractVersion: "1", items: [{ titleKey: "PIONEER", scope: "map", mapId: "map.samoa", pioneerPrefixes: ["萨摩亚"] }] });
  });

  it("serves the public achievement catalog without a player session", async () => {
    const publicApp = createApp({
      authenticate: async () => null,
      services: () => ({
        ...services,
        listChallenges: async (input) => input?.family === "achievement" ? [{ challengeId: "title.flawless", family: "achievement", type: "title_achievement", kind: "title_achievement", titleKey: "FLAWLESS", titleName: "完美无缺", icon: "zap", category: "极限操作系列", condition: "单局跳过英雄次数为 0 且通关。", evidenceRule: "完整截图", gameVersion: "2026.07.15", status: "sunsetting", retiredVersion: "26.0713.1", submissionMode: "manual" }] : [],
      }),
    });
    const response = await publicApp.request("http://localhost/v1/public/achievements", {}, env);
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ contractVersion: "1", items: [{ challengeId: "title.flawless", family: "achievement", status: "sunsetting", retiredVersion: "26.0713.1", submissionMode: "manual" }] });
  });

  it("rejects screenshot uploads for automatically granted titles", async () => {
    const automaticApp = createApp({
      authenticate: async () => null,
      services: () => ({ ...services, createPlayerUploadSession: async () => { throw new Error("CHALLENGE_AUTOMATIC"); } }),
    });
    const response = await automaticApp.request("http://localhost/v1/player/uploads/session", {
      method: "POST",
      headers: { cookie: "owb_session=session-token", "content-type": "application/json" },
      body: JSON.stringify({ contractVersion: "1", challengeId: "title.SKY", contentType: "image/png", byteSize: 1, sha256: "a".repeat(64) }),
    }, env);
    expect(response.status).toBe(422);
    expect(await response.json()).toMatchObject({ error: { code: "CHALLENGE_AUTOMATIC", message: "该称号由系统自动发放，无需提交截图。" } });
  });

  it("rejects screenshot uploads for retired title challenges", async () => {
    const retiredApp = createApp({
      authenticate: async () => null,
      services: () => ({ ...services, createPlayerUploadSession: async () => { throw new Error("CHALLENGE_NOT_FOUND"); } }),
    });
    const response = await retiredApp.request("http://localhost/v1/player/uploads/session", {
      method: "POST",
      headers: { cookie: "owb_session=session-token", "content-type": "application/json" },
      body: JSON.stringify({ contractVersion: "1", challengeId: "title.CHALLENGER_LEGEND", contentType: "image/png", byteSize: 1, sha256: "a".repeat(64) }),
    }, env);
    expect(response.status).toBe(422);
    expect(await response.json()).toMatchObject({ error: { code: "CHALLENGE_NOT_FOUND" } });
  });

  it("maps upload ownership failures to an invalid upload session", async () => {
    const ownershipApp = createApp({
      authenticate: async () => null,
      services: () => ({
        ...services,
        uploadEvidence: async () => { throw new Error("UPLOAD_SESSION_INVALID"); },
        completePlayerUpload: async () => { throw new Error("UPLOAD_SESSION_INVALID"); },
      }),
    });
    const upload = await ownershipApp.request("http://localhost/v1/uploads/00000000-0000-0000-0000-000000000004", {
      method: "PUT",
      headers: { cookie: "owb_session=session-token", "content-type": "image/png" },
      body: "evidence",
    }, env);
    const complete = await ownershipApp.request("http://localhost/v1/player/uploads/00000000-0000-0000-0000-000000000004/complete", {
      method: "POST",
      headers: { cookie: "owb_session=session-token" },
    }, env);
    expect(upload.status).toBe(422);
    expect(complete.status).toBe(422);
    expect((await upload.json() as { error: { code: string } }).error.code).toBe("UPLOAD_SESSION_INVALID");
    expect((await complete.json() as { error: { code: string } }).error.code).toBe("UPLOAD_SESSION_INVALID");
  });

  it("allows the Portal to preflight direct upload URLs", async () => {
    const response = await app.request("http://localhost/v1/uploads/00000000-0000-0000-0000-000000000004", {
      method: "OPTIONS",
      headers: {
        origin: "https://owbastion.com",
        "access-control-request-method": "PUT",
        "access-control-request-headers": "content-type",
      },
    }, env);
    expect(response.status).toBe(204);
    expect(response.headers.get("access-control-allow-origin")).toBe("https://owbastion.com");
    expect(response.headers.get("access-control-allow-methods")).toContain("PUT");
    expect(response.headers.get("access-control-allow-headers")).toContain("content-type");
  });

  it("clears the portal session on logout", async () => {
    const loggedOut: string[] = [];
    const logoutApp = createApp({ authenticate: auth, services: () => ({ ...services, logoutPortalSession: async ({ sessionToken }) => { loggedOut.push(sessionToken); } }) });
    const response = await logoutApp.request("http://localhost/v1/auth/logout", { method: "POST", headers: { cookie: "owb_session=session-token" } }, env);
    expect(response.status).toBe(204);
    expect(loggedOut).toEqual(["session-token"]);
    expect(response.headers.get("set-cookie")).toContain("Max-Age=0");
  });

  it("requires a service idempotency key for QQ login verification", async () => {
    const response = await app.request("http://localhost/v1/qq/auth/verify", { method: "POST", headers: { authorization: "Bearer service", "content-type": "application/json" }, body: JSON.stringify({ contractVersion: "1", provider: "qq", code: "ABC234", groupOpenId: "group-1", memberOpenId: "member-1", messageId: "message-1" }) }, env);
    expect(response.status).toBe(422);
    expect((await response.json() as { error: { code: string } }).error.code).toBe("IDEMPOTENCY_KEY_REQUIRED");
  });

  it("protects administrative player data with the platform session", async () => {
    const adminServices: PlatformServices = { ...services, getCurrentPlayer: async ({ sessionToken }) => sessionToken === "admin-session" ? { contractVersion: "1", player: { playerId: "1234", playerName: "Player", bindingStatus: "bound", isAdmin: true }, recentSubmissions: [] } : null };
    const adminApp = createApp({ authenticate: async () => null, services: () => adminServices });
    const denied = await adminApp.request("http://localhost/v1/admin/player-accounts", {}, env);
    expect(denied.status).toBe(401);
    const allowed = await adminApp.request("http://localhost/v1/admin/player-accounts", { headers: { cookie: "owb_session=admin-session" } }, env);
    expect(allowed.status).toBe(200);
    expect(await allowed.json()).toMatchObject({ contractVersion: "1", items: [], page: 1 });
  });

  it("pages administrative lists and accepts a comma-separated submission status filter", async () => {
    const requests: Array<{ statuses?: string[]; page: number; pageSize: number }> = [];
    const adminServices: PlatformServices = {
      ...services,
      listAdminSubmissions: async (input) => {
        requests.push(input);
        return { contractVersion: "1", items: [], page: input.page, pageSize: input.pageSize, total: 27, hasMore: true };
      },
    };
    const adminApp = createApp({
      authenticate: async () => ({ actorType: "user", subject: "admin", roles: ["maintainer"], provider: "test" }),
      services: () => adminServices,
    });
    const paged = await adminApp.request("http://localhost/v1/admin/submissions?status=ready_for_review,ocr_review_required&page=2&pageSize=20", {}, env);
    expect(paged.status).toBe(200);
    expect(await paged.json()).toMatchObject({ page: 2, pageSize: 20, total: 27, hasMore: true });
    expect(requests).toEqual([{ statuses: ["ready_for_review", "ocr_review_required"], page: 2, pageSize: 20 }]);
    expect((await adminApp.request("http://localhost/v1/admin/submissions?status=unknown", {}, env)).status).toBe(422);
  });

  it("keeps local development login disabled unless explicitly enabled", async () => {
    const localServices: PlatformServices = {
      ...services,
      listLocalDevAccounts: async () => [{ accountId: "local-player-account", playerId: "local-player", playerName: "Local Player", isAdmin: false }],
      createLocalDevSession: async () => ({ sessionToken: "local-session" }),
      getCurrentPlayer: async ({ sessionToken }) => sessionToken === "local-session" ? { contractVersion: "1", player: { playerId: "local-player", playerName: "Local Player", bindingStatus: "bound", isAdmin: false }, recentSubmissions: [] } : null,
    };
    const localApp = createApp({ authenticate: async () => null, services: () => localServices });
    expect((await localApp.request("http://localhost/v1/__local/accounts", {}, env)).status).toBe(404);

    const localEnv = { ...env, LOCAL_DEV_AUTH: "true" };
    const accounts = await localApp.request("http://localhost/v1/__local/accounts", { headers: { origin: "http://0.0.0.0:3000" } }, localEnv);
    expect(accounts.status).toBe(200);
    expect(accounts.headers.get("access-control-allow-origin")).toBe("http://0.0.0.0:3000");
    const login = await localApp.request("http://localhost/v1/__local/login", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ accountId: "local-player-account" }) }, localEnv);
    expect(login.status).toBe(200);
    expect(login.headers.get("set-cookie")).toContain("owb_session=local-session");
    const denied = await localApp.request("http://localhost/v1/admin/player-accounts", { headers: { cookie: "owb_session=local-session" } }, localEnv);
    expect(denied.status).toBe(403);
  });
});
