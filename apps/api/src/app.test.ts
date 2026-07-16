import { describe, expect, it } from "vitest";
import type { PlatformServices } from "@owbastion/domain";
import { createApp, type RuntimeEnv } from "./app";

const auth = async () => ({ actorType: "service" as const, subject: "qqbot", roles: ["channel:write"], provider: "test" });
const services: PlatformServices = {
  listMaps: async () => [],
  listChallenges: async () => [],
  listTitles: async () => [],
  listCurrentPlayerTitles: async ({ sessionToken }) => sessionToken === "session-token" ? [{ grantId: "00000000-0000-0000-0000-000000000006", titleKey: "PIONEER", label: "开拓者", category: "社区贡献系列", scope: "map", mapName: "萨摩亚", slot: "pioneer", grantedAt: 4 }] : null,
  listHistoricalTitleGrants: async () => [],
  createAdminTitleGrant: async () => {},
  createAdminTitleGrantBulk: async () => ({ contractVersion: "1", grantedCount: 0 }),
  revokeAdminTitleGrant: async () => {},
  listAdminChallenges: async () => ({ contractVersion: "1", items: [] }),
  updateAdminChallenge: async () => { throw new Error("CHALLENGE_NOT_FOUND"); },
  createPlayerUploadSession: async () => ({ contractVersion: "1", submissionId: "00000000-0000-0000-0000-000000000003", uploadId: "00000000-0000-0000-0000-000000000004", uploadUrl: "http://localhost/upload", expiresAt: 1, maxBytes: 10 }),
  uploadEvidence: async () => {},
  completePlayerUpload: async () => ({ submissionId: "00000000-0000-0000-0000-000000000003", status: "ocr_pending" }),
  listAdminSubmissions: async () => ({ contractVersion: "1", items: [], hasMore: false }),
  getAdminSubmission: async () => { throw new Error("SUBMISSION_NOT_FOUND"); },
  getAdminEvidence: async () => ({ body: new ArrayBuffer(0), contentType: "image/png" }),
  reviewSubmission: async () => {},
  processOcrJob: async () => {},
  createBinding: async () => ({ contractVersion: "1", bindingId: "00000000-0000-0000-0000-000000000001", identityId: "00000000-0000-0000-0000-000000000002", provider: "qq", groupOpenId: "group-1", memberOpenId: "member-1", playerName: "Player", playerId: "1234" }),
  createSubmission: async () => ({ contractVersion: "1", submissionId: "00000000-0000-0000-0000-000000000003", status: "evidence_pending", mapName: "Test Map", attachmentIds: ["00000000-0000-0000-0000-000000000004"] }),
  getSubmission: async () => ({ contractVersion: "1", submissionId: "00000000-0000-0000-0000-000000000003", status: "ocr_pending", mapName: "Test Map", createdAt: 1, updatedAt: 1 }),
  createQqLoginAttempt: async () => ({ contractVersion: "1", attemptId: "00000000-0000-0000-0000-000000000005", attemptToken: "a".repeat(64), code: "ABC234", expiresAt: 1 }),
  getQqLoginStatus: async () => ({ contractVersion: "1", status: "pending" }),
  verifyQqLogin: async () => ({ contractVersion: "1", status: "verified", environment: "test" }),
  upsertQqGroupAccess: async () => {},
  listQqGroupAccess: async () => [],
  listAdminPlayers: async () => ({ contractVersion: "1" as const, items: [], page: 1, pageSize: 25, hasMore: false }),
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
  it("reports health without external services", async () => {
    const response = await app.request("http://localhost/health", {}, env);
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ service: "api", status: "ok" });
  });

  it("validates and authenticates binding creation", async () => {
    const response = await app.request("http://localhost/v1/qq/bindings", { method: "POST", headers: { "idempotency-key": "binding-1", "content-type": "application/json" }, body: JSON.stringify({ contractVersion: "1", provider: "qq", groupOpenId: "group-1", memberOpenId: "member-1", playerName: "Player", playerId: "1234" }) }, env);
    expect(response.status).toBe(201);
    expect((await response.json() as { provider: string }).provider).toBe("qq");
  });

  it("rejects requests without an idempotency key", async () => {
    const response = await app.request("http://localhost/v1/qq/bindings", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ contractVersion: "1", provider: "qq", groupOpenId: "group-1", memberOpenId: "member-1", playerName: "Player", playerId: "1234" }) }, env);
    expect(response.status).toBe(422);
    expect((await response.json() as { error: { code: string } }).error.code).toBe("IDEMPOTENCY_KEY_REQUIRED");
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
    expect(await response.json()).toMatchObject({ contractVersion: "1", items: [{ titleKey: "PIONEER", mapName: "萨摩亚" }] });
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
    const adminApp = createApp({
      authenticate: async () => ({ actorType: "user", subject: "admin", roles: ["maintainer"], provider: "test" }),
      services: () => ({
        ...services,
        listAdminChallenges: async ({ family, status }) => ({ contractVersion: "1", items: family === "achievement" && status === "active" ? [{ challengeId: "title.flawless", family: "achievement", type: "title_achievement", kind: "title_achievement", titleKey: "FLAWLESS", titleName: "完美无缺", category: "极限操作系列", categoryOverride: null, condition: "单局跳过英雄次数为 0 且通关。", evidenceRule: "完整截图", gameVersion: "2026.07.15", status: "active", submissionMode: "manual", introducedVersion: "2026.07.15", retiredVersion: null }] : [] }),
        updateAdminChallenge: async (input) => { if (input.family !== "achievement") throw new Error("CHALLENGE_NOT_FOUND"); updates.push(input); return { challengeId: input.challengeId, family: "achievement", type: "title_achievement", kind: "title_achievement", titleKey: "FLAWLESS", titleName: "完美无缺", category: input.categoryOverride ?? "极限操作系列", categoryOverride: input.categoryOverride, condition: input.condition, evidenceRule: input.evidenceRule, gameVersion: "2026.07.15", status: input.status, submissionMode: input.submissionMode, introducedVersion: "2026.07.15", retiredVersion: input.status === "retired" ? input.retiredVersion! : null } as const; },
      }),
    });
    expect((await app.request("http://localhost/v1/admin/achievements", {}, env)).status).toBe(403);
    const anonymousApp = createApp({ authenticate: async () => null, services: () => services });
    expect((await anonymousApp.request("http://localhost/v1/admin/achievements", {}, env)).status).toBe(401);
    const listed = await adminApp.request("http://localhost/v1/admin/achievements?type=title_achievement&status=active", {}, env);
    expect(listed.status).toBe(200);
    expect(await listed.json()).toMatchObject({ items: [{ family: "achievement", categoryOverride: null }] });
    const retirement = { contractVersion: "1", condition: "单局跳过英雄次数为 0 且通关。", evidenceRule: "完整截图", submissionMode: "manual", categoryOverride: "极限操作系列", status: "retired", retiredVersion: "2026.07.16" };
    expect((await adminApp.request("http://localhost/v1/admin/achievements/title.flawless", { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify(retirement) }, env)).status).toBe(422);
    const updated = await adminApp.request("http://localhost/v1/admin/achievements/title.flawless", { method: "PUT", headers: { "content-type": "application/json", "idempotency-key": "achievement-1" }, body: JSON.stringify(retirement) }, env);
    expect(updated.status).toBe(200);
    expect(await updated.json()).toMatchObject({ challengeId: "title.flawless", family: "achievement", status: "retired", retiredVersion: "2026.07.16" });
    expect(updates).toMatchObject([{ challengeId: "title.flawless", status: "retired", retiredVersion: "2026.07.16" }]);
    const invalidRetirement = { ...retirement, retiredVersion: undefined };
    expect((await adminApp.request("http://localhost/v1/admin/achievements/title.flawless", { method: "PUT", headers: { "content-type": "application/json", "idempotency-key": "achievement-2" }, body: JSON.stringify(invalidRetirement) }, env)).status).toBe(422);
  });

  it("protects the player submission catalog", async () => {
    const requestedFamilies: Array<string | undefined> = [];
    const catalogServices: PlatformServices = {
      ...services,
      listMaps: async () => [{ mapId: "map.samoa", mapName: "萨摩亚", gameVersion: "2026.07.15" }],
      listChallenges: async (input) => {
        requestedFamilies.push(input?.family);
        if (input?.family === "achievement") return [{ challengeId: "title.flawless", family: "achievement", type: "title_achievement", kind: "title_achievement", titleKey: "FLAWLESS", titleName: "完美无缺", category: "极限操作系列", condition: "单局跳过英雄次数为 0 且通关。", evidenceRule: "完整截图", gameVersion: "2026.07.15", status: "active", submissionMode: "manual" }];
        return [{ challengeId: "map.samoa.conqueror", family: "map", type: "map_completion", kind: "difficulty_completion", name: "征服者", mapId: "map.samoa", mapName: "萨摩亚", difficulty: "传奇", gameVersion: "2026.07.15" }];
      },
      listTitles: async ({ mapId }) => mapId ? [{ titleKey: "PIONEER", label: "开拓者", category: "社区贡献系列", condition: "地图挑战", availability: "active", scope: "map", displayKind: "map_pioneer", mapId, slot: "pioneer", pioneerPrefixes: ["萨摩亚"], gameVersion: "2026.07.15" }] : [{ titleKey: "ALL_IN_ONE", label: "万象归一", category: "地图精通系列", condition: "获得所有地图征服者头衔", availability: "active", scope: "global", displayKind: "fixed", gameVersion: "2026.07.15" }],
    };
    const catalogApp = createApp({ authenticate: async () => null, services: () => catalogServices });
    expect((await catalogApp.request("http://localhost/v1/maps", {}, env)).status).toBe(401);
    expect((await catalogApp.request("http://localhost/v1/challenges?family=map", {}, env)).status).toBe(401);
    expect((await catalogApp.request("http://localhost/v1/titles", {}, env)).status).toBe(401);

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
    expect(await maps.json()).toEqual({ contractVersion: "1", items: [{ mapId: "map.samoa", mapName: "萨摩亚", gameVersion: "2026.07.15" }] });
    expect(await challenges.json()).toMatchObject({ contractVersion: "1", items: [{ challengeId: "map.samoa.conqueror", mapId: "map.samoa", kind: "difficulty_completion" }] });
    expect(await mapChallenges.json()).toMatchObject({ contractVersion: "1", items: [{ family: "map" }] });
    expect(await achievementChallenges.json()).toMatchObject({ contractVersion: "1", items: [{ challengeId: "title.flawless", titleName: "完美无缺", family: "achievement", submissionMode: "manual" }] });
    expect(requestedFamilies).toEqual([undefined, "map", "achievement"]);
    expect(await titles.json()).toMatchObject({ contractVersion: "1", items: [{ titleKey: "ALL_IN_ONE", scope: "global" }] });
    expect(await mapTitles.json()).toMatchObject({ contractVersion: "1", items: [{ titleKey: "PIONEER", scope: "map", mapId: "map.samoa", pioneerPrefixes: ["萨摩亚"] }] });
  });

  it("serves the public achievement catalog without a player session", async () => {
    const publicApp = createApp({
      authenticate: async () => null,
      services: () => ({
        ...services,
        listChallenges: async (input) => input?.family === "achievement" ? [{ challengeId: "title.flawless", family: "achievement", type: "title_achievement", kind: "title_achievement", titleKey: "FLAWLESS", titleName: "完美无缺", category: "极限操作系列", condition: "单局跳过英雄次数为 0 且通关。", evidenceRule: "完整截图", gameVersion: "2026.07.15", status: "active", submissionMode: "manual" }] : [],
      }),
    });
    const response = await publicApp.request("http://localhost/v1/public/achievements", {}, env);
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ contractVersion: "1", items: [{ challengeId: "title.flawless", family: "achievement", submissionMode: "manual" }] });
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
