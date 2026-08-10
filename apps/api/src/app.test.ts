import { afterEach, describe, expect, it, vi } from "vitest";
import type { PlatformServices } from "@owbastion/domain";
import { createApp, type RuntimeEnv } from "./app";

const auth = async () => ({ actorType: "service" as const, subject: "qqbot", roles: ["channel:write"], provider: "test" });
const services: PlatformServices = {
  recordVerifiedMasteryRun: async () => { throw new Error("MASTERY_RUN_NOT_IMPLEMENTED"); },
  invalidateVerifiedMasteryRun: async () => { throw new Error("MASTERY_RUN_NOT_IMPLEMENTED"); },
  restoreVerifiedMasteryRun: async () => { throw new Error("MASTERY_RUN_NOT_IMPLEMENTED"); },
  rebuildMasteryProfiles: async () => [],
  listAdminMasteryRuns: async ({ page, pageSize }) => ({ contractVersion: "1", items: [], page, pageSize, total: 0, hasMore: false }),
  getAdminMasteryRun: async () => { throw new Error("MASTERY_RUN_NOT_FOUND"); },
  transitionAdminMasteryRun: async () => { throw new Error("MASTERY_RUN_NOT_FOUND"); },
  resolveAdminMasteryRunConflict: async () => { throw new Error("MASTERY_RUN_NOT_FOUND"); },
  getCurrentPlayerMastery: async ({ sessionToken, page, pageSize }) => sessionToken === "session-token" ? { contractVersion: "1" as const, profiles: [], runs: [], page, pageSize, total: 0, hasMore: false } : null,
  listAgentEvents: async () => ({ contractVersion: "1", items: [], page: 1, pageSize: 20, total: 0, hasMore: false }),
  getAgentEvent: async () => null,
  listAgentMaps: async () => ({ contractVersion: "1", items: [], page: 1, pageSize: 20, total: 0, hasMore: false }),
  getAgentMap: async () => null,
  listAgentAchievements: async () => ({ contractVersion: "1", items: [], page: 1, pageSize: 20, total: 0, hasMore: false }),
  getAgentAchievement: async () => null,
  listAgentTitles: async () => ({ contractVersion: "1", items: [], page: 1, pageSize: 20, total: 0, hasMore: false }),
  listAgentPlayerTitleGrants: async () => ({ contractVersion: "1", items: [], page: 1, pageSize: 20, total: 0, hasMore: false }),
  listAgentMapTitleHolders: async () => ({ contractVersion: "1", items: [], page: 1, pageSize: 20, total: 0, hasMore: false }),
  getAgentTitle: async () => null,
  searchAgentContent: async () => ({ contractVersion: "1", items: [], page: 1, pageSize: 20, total: 0, hasMore: false }),
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
  listHistoricalTitleGrants: async () => ({ contractVersion: "1", holders: [], page: 1, pageSize: 20, total: 0, hasMore: false, filter: "all", stats: { pendingHolderCount: 0, unclaimedGrantCount: 0, migratedGrantCount: 0 } }),
  getHistoricalTitleHolder: async () => ({ contractVersion: "1", holder: { holderName: "Cold", totalCount: 0, unclaimedCount: 0, status: "completed" }, items: [], page: 1, pageSize: 50, total: 0, hasMore: false, grantStatus: "all" }),
  createAdminTitleGrant: async () => {},
  createAdminTitleGrantBulk: async () => ({ contractVersion: "1", grantedCount: 0, skippedClaimedCount: 0 }),
  revokeAdminTitleGrant: async () => {},
  createAdminManualTitleGrant: async () => ({ contractVersion: "1", grantId: "00000000-0000-4000-8000-000000000009", titleKey: "PIONEER", titleName: "开拓者", mapId: null, slot: null, alreadyOwned: false }),
  listAdminChallenges: async () => ({ contractVersion: "1", items: [] }),
  createAdminAchievement: async () => { throw new Error("TITLE_KEY_CONFLICT"); },
  updateAdminChallenge: async () => { throw new Error("CHALLENGE_NOT_FOUND"); },
  updateAdminCatalogTitle: async () => {},
  listAdminMapTitleRules: async () => ({ contractVersion: "1", items: [] }),
  createAdminMapTitleRule: async () => { throw new Error("MAP_TITLE_NOT_FOUND"); },
  updateAdminMapTitleRule: async () => { throw new Error("MAP_TITLE_RULE_NOT_FOUND"); },
  listAdminMapTitleInheritance: async () => ({ contractVersion: "1", items: [] }),
  upsertAdminMapTitleRuleException: async () => {},
  createPlayerUploadSession: async () => ({ contractVersion: "1", submissionId: "00000000-0000-0000-0000-000000000003", uploadId: "00000000-0000-0000-0000-000000000004", uploadUrl: "http://localhost/upload", expiresAt: 1, maxBytes: 10 }),
  uploadEvidence: async () => {},
  completePlayerUpload: async () => ({ submissionId: "00000000-0000-0000-0000-000000000003", status: "ocr_pending" }),
  confirmPlayerSubmissionChallenge: async () => ({ contractVersion: "1", submissionId: "00000000-0000-0000-0000-000000000003", status: "ready_for_review", mapName: "Test Map", createdAt: 1, updatedAt: 2 }),
  listAdminSubmissions: async () => ({ contractVersion: "1", items: [], page: 1, pageSize: 50, total: 0, hasMore: false }),
  getAdminSubmission: async () => { throw new Error("SUBMISSION_NOT_FOUND"); },
  getAdminEvidence: async () => ({ body: new ArrayBuffer(0), contentType: "image/png" }),
  selectAdminSubmissionChallenge: async ({ submissionId, challengeId }) => ({ contractVersion: "1", submissionId, status: "ready_for_review", challengeId }),
  requestAdminOcr: async ({ submissionId }) => ({ contractVersion: "1", submissionId, status: "ocr_pending" }),
  resolveAdminSubmissionSpotCheck: async ({ submissionId, decision }) => ({ contractVersion: "1", submissionId, status: decision, grantId: null, masteryRunId: null }),
  getPlayerSubmission: async () => ({ contractVersion: "1", submissionId: "00000000-0000-0000-0000-000000000003", status: "ready_for_review", mapName: "Test Map", createdAt: 1, updatedAt: 2, ocr: { mapName: "Test Map", difficulty: "困难", playerName: "Player", challengeCompleted: true } }),
  getPlayerEvidence: async () => ({ body: new Uint8Array([1, 2, 3]).buffer, contentType: "image/png" }),
  reviewSubmission: async () => ({ contractVersion: "1", submissionId: "00000000-0000-4000-8000-000000000000", decision: "rejected", grant: null }),
  processOcrJob: async () => {},
  markOcrJobFailed: async () => {},
  requestManualReview: async () => {},
  createBinding: async () => { throw new Error("INVITE_REQUIRED"); },
  createAdminBindingInvite: async () => ({ contractVersion: "1", inviteId: "00000000-0000-0000-0000-000000000007", code: "ABCDEFGHIJKL", playerName: "Player", playerId: "1234", expiresAt: 1, historicalMigration: { status: "not_requested" as const, requestedCount: 0, completedCount: 0, conflictCount: 0, retryCount: 0 } }),
  createAdminBindingInviteBatch: async () => ({ contractVersion: "1", items: [{ contractVersion: "1", inviteId: "00000000-0000-0000-0000-000000000007", code: "ABCDEFGHIJKL", playerName: "Player", playerId: "1234", expiresAt: 1, historicalMigration: { status: "not_requested" as const, requestedCount: 0, completedCount: 0, conflictCount: 0, retryCount: 0 } }] }),
  listAdminBindingInvites: async () => ({ contractVersion: "1", items: [{ inviteId: "00000000-0000-0000-0000-000000000007", playerName: "Player", playerId: "1234", status: "active" as const, codeAvailable: true, createdAt: 1, expiresAt: 2, historicalMigration: { status: "not_requested" as const, requestedCount: 0, completedCount: 0, conflictCount: 0, retryCount: 0 } }] }),
  getAdminBindingInviteCode: async () => ({ contractVersion: "1", inviteId: "00000000-0000-0000-0000-000000000007", code: "ABCDEFGHIJKL" }),
  listAdminBindings: async () => ({ contractVersion: "1", items: [] }),
  revokeAdminBindingInvite: async () => {},
  redeemBindingInvite: async () => ({ contractVersion: "1", claimId: "00000000-0000-0000-0000-000000000008", claimToken: "a".repeat(64), code: "ABC234", playerName: "Player", playerId: "1234", expiresAt: 1 }),
  getBindingClaimStatus: async () => ({ contractVersion: "1", status: "pending_confirmation", expiresAt: 1, historicalMigration: { status: "not_requested" as const, requestedCount: 0, restoredCount: 0 } }),
  exchangeBindingClaimSession: async () => ({ contractVersion: "1", status: "authenticated", sessionToken: "a".repeat(64) }),
  verifyBindingClaim: async () => ({ contractVersion: "1", status: "verified", environment: "test" }),
  listAdminBindingClaims: async () => ({ contractVersion: "1", items: [] }),
  decideAdminBindingClaim: async () => {},
  retryHistoricalTitleMigration: async () => {},
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
  updateAdminPlayerIdentity: async () => {},
  removeAdminBinding: async () => {},
  listAdminReviews: async ({ page, pageSize }) => ({ contractVersion: "1", items: [], page, pageSize, total: 0, hasMore: false }),
  getAdminReview: async () => { throw new Error("REVIEW_NOT_FOUND"); },
  getReviewSummary: async () => { throw new Error("REVIEW_NOT_IMPLEMENTED"); },
  getReviewSummaries: async () => [],
  listPublicReviewComments: async ({ targetType, targetId, page, pageSize }) => ({ targetType, targetId, items: [], page, pageSize, total: 0, hasMore: false }),
  getPlayerReview: async () => { throw new Error("REVIEW_NOT_IMPLEMENTED"); },
  upsertReview: async () => { throw new Error("REVIEW_NOT_IMPLEMENTED"); },
  withdrawReview: async () => { throw new Error("REVIEW_NOT_IMPLEMENTED"); },
  hideReviewComment: async () => { throw new Error("REVIEW_NOT_IMPLEMENTED"); },
  restoreReviewComment: async () => { throw new Error("REVIEW_NOT_IMPLEMENTED"); },
  invalidateReview: async () => { throw new Error("REVIEW_NOT_IMPLEMENTED"); },
  restoreReview: async () => { throw new Error("REVIEW_NOT_IMPLEMENTED"); },
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

class FakeCache {
  private readonly entries = new Map<string, Response>();
  matchCalls = 0;
  putCalls = 0;
  failRead = false;
  failWrite = false;
  expireNextRead = false;

  async match(request: Request) {
    this.matchCalls += 1;
    if (this.failRead) throw new Error("cache read failed");
    if (this.expireNextRead) {
      this.expireNextRead = false;
      return undefined;
    }
    return this.entries.get(request.url)?.clone();
  }

  async put(request: Request, response: Response) {
    this.putCalls += 1;
    if (this.failWrite) throw new Error("cache write failed");
    this.entries.set(request.url, response.clone());
  }
}

afterEach(() => vi.unstubAllGlobals());

describe("API", () => {
  it("exposes platform player and map title grant Agents endpoints", async () => {
    const agentApp = createApp({ authenticate: auth, services: () => ({
      ...services,
      listAgentPlayerTitleGrants: async () => ({ contractVersion: "1" as const, items: [{ playerId: "1234", playerName: "Player", titleKeys: ["TITLE"], allTitles: false }], page: 1, pageSize: 20, total: 1, hasMore: false }),
      getAgentMap: async ({ mapId }) => mapId === "map.test" ? { mapId, mapName: "测试地图", gameVersion: "2026.07.15", difficultyRating: null, mechanics: [], coverUrl: null, backgroundUrl: null } : null,
      listAgentMapTitleHolders: async () => ({ contractVersion: "1" as const, items: [{ mapId: "map.test", titleKey: "PIONEER", slot: "pioneer" as const, slotSemantics: "named" as const, playerId: "1234", playerName: "Player" }], page: 1, pageSize: 20, total: 1, hasMore: false }),
    }) });
    const players = await agentApp.request("http://localhost/v1/agents/player-title-grants?page=1&pageSize=20", {}, env);
    const holders = await agentApp.request("http://localhost/v1/agents/map-title-holders?mapId=map.test&page=1&pageSize=20", {}, env);
    expect(players.status).toBe(200);
    expect(holders.status).toBe(200);
    expect((await players.json() as { items: Array<{ playerId?: string; playerName: string }> }).items[0]).toEqual({ playerName: "Player", titleKeys: ["TITLE"], allTitles: false });
    expect((await holders.json() as { items: Array<{ playerId?: string; mapId: string; titleKey: string; slot: string; slotSemantics: string; playerName: string }> }).items[0]).toEqual({ mapId: "map.test", titleKey: "PIONEER", slot: "pioneer", slotSemantics: "named", playerName: "Player" });
  });

  it("returns player IDs only with the Bastion build token", async () => {
    const agentApp = createApp({ authenticate: auth, services: () => ({
      ...services,
      listAgentPlayerTitleGrants: async () => ({ contractVersion: "1" as const, items: [{ playerId: "1234", playerName: "Player", titleKeys: ["TITLE"], allTitles: false }], page: 1, pageSize: 20, total: 1, hasMore: false }),
    }) });
    const response = await agentApp.request("http://localhost/v1/agents/player-title-grants?page=1&pageSize=20", { headers: { authorization: "Bearer bastion-token" } }, { ...env, BASTION_BUILD_TOKEN: "bastion-token" });
    expect(response.status).toBe(200);
    expect((await response.json() as { items: Array<{ playerId?: string }> }).items[0].playerId).toBe("1234");
    expect(response.headers.get("Cache-Control")).toBe("private, no-store");
  });

  it("can disable public Agents HTTP caching without changing catalog data", async () => {
    const response = await app.request("http://localhost/v1/agents/maps?page=1&pageSize=20", {}, { ...env, PUBLIC_HTTP_CACHE_ENABLED: "false" });
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ contractVersion: "1", items: [] });
    expect(response.headers.get("Cache-Control")).toBe("private, no-store");
  });

  it("lists public random events without development records", async () => {
    const eventApp = createApp({ authenticate: auth, services: () => ({ ...services, listRandomEvents: async () => [{ eventId: "event.test", name: "稳住", category: "增益", rarity: "R", description: "测试事件", durationSeconds: 60, cooldownSeconds: .32, weight: 1, gameVersion: "5.0", effectTags: ["护盾"], effectAnnotations: [], releaseStatus: "implemented", archived: false, challenges: [] }] }) });
    const response = await eventApp.request("http://localhost/v1/events", {}, env);
    expect(response.status).toBe(200);
    expect((await response.json() as { items: Array<{ name: string }> }).items[0]?.name).toBe("稳住");
    expect(response.headers.get("cache-control")).toBe("public, max-age=60, s-maxage=60");
  });

  it("serves the second public catalog request from Cache API without calling the service", async () => {
    const cache = new FakeCache();
    vi.stubGlobal("caches", { default: cache });
    let calls = 0;
    const cacheApp = createApp({ authenticate: auth, services: () => ({ ...services, listMaps: async () => { calls += 1; return [{ mapId: "map.test", mapName: "测试地图", gameVersion: "2026.07.15", difficultyRating: null, mechanics: [], coverUrl: null, backgroundUrl: null }]; } }) });
    const log = vi.spyOn(console, "log").mockImplementation(() => undefined);

    const first = await cacheApp.request("http://localhost/v1/maps", { headers: { origin: "http://localhost:3000" } }, { ...env, LOCAL_DEV_AUTH: "true" });
    const second = await cacheApp.request("http://localhost/v1/maps", { headers: { origin: "http://127.0.0.1:3000" } }, { ...env, LOCAL_DEV_AUTH: "true" });
    const cacheStatuses = log.mock.calls.map(([entry]) => JSON.parse(String(entry)) as Record<string, unknown>).filter((entry) => entry.event === "public_cache").map((entry) => entry.status);
    log.mockRestore();

    expect(first.status).toBe(200);
    expect(second.status).toBe(200);
    expect((await second.json() as { items: unknown[] }).items).toHaveLength(1);
    expect(calls).toBe(1);
    expect(cache.matchCalls).toBe(2);
    expect(cache.putCalls).toBe(1);
    expect(cacheStatuses).toEqual(["MISS", "HIT"]);
    expect(first.headers.get("access-control-allow-origin")).toBe("http://localhost:3000");
    expect(second.headers.get("access-control-allow-origin")).toBe("http://127.0.0.1:3000");
  });

  it("canonicalizes equivalent public Agents pagination queries", async () => {
    const cache = new FakeCache();
    vi.stubGlobal("caches", { default: cache });
    let calls = 0;
    const cacheApp = createApp({ authenticate: auth, services: () => ({ ...services, listAgentMaps: async () => { calls += 1; return { contractVersion: "1" as const, items: [], page: 1, pageSize: 20, total: 0, hasMore: false }; } }) });

    await cacheApp.request("http://localhost/v1/agents/maps?pageSize=20&page=1", {}, env);
    await cacheApp.request("http://localhost/v1/agents/maps?page=1&pageSize=20", {}, env);

    expect(calls).toBe(1);
    expect(cache.putCalls).toBe(1);
  });

  it("bypasses Cache API for filtered, credentialed, cookie, and admin requests", async () => {
    const cache = new FakeCache();
    vi.stubGlobal("caches", { default: cache });
    const cacheApp = createApp({ authenticate: async () => null, services: () => services });

    expect((await cacheApp.request("http://localhost/v1/events?category=%E5%A2%9E%E7%9B%8A", {}, env)).status).toBe(200);
    expect((await cacheApp.request("http://localhost/v1/agents/maps", { headers: { authorization: "Bearer build-token" } }, { ...env, BASTION_BUILD_TOKEN: "build-token" })).status).toBe(200);
    const cookieResponse = await cacheApp.request("http://localhost/v1/maps", { headers: { cookie: "session=private" } }, env);
    expect(cookieResponse.status).toBe(200);
    expect(cookieResponse.headers.get("cache-control")).toBe("private, no-store");
    expect((await cacheApp.request("http://localhost/v1/admin/events", {}, env)).status).toBe(401);

    expect(cache.matchCalls).toBe(0);
    expect(cache.putCalls).toBe(0);
  });

  it("falls back to the service when Cache API read or write fails", async () => {
    const readFailure = new FakeCache();
    readFailure.failRead = true;
    vi.stubGlobal("caches", { default: readFailure });
    let calls = 0;
    const cacheApp = createApp({ authenticate: auth, services: () => ({ ...services, listMaps: async () => { calls += 1; return []; } }) });
    const readResponse = await cacheApp.request("http://localhost/v1/maps", {}, env);
    expect(readResponse.status).toBe(200);
    expect(await readResponse.json()).toMatchObject({ contractVersion: "1", items: [] });

    vi.unstubAllGlobals();
    const writeFailure = new FakeCache();
    writeFailure.failWrite = true;
    vi.stubGlobal("caches", { default: writeFailure });
    const writeResponse = await cacheApp.request("http://localhost/v1/maps", {}, env);
    expect(writeResponse.status).toBe(200);
    expect(await writeResponse.json()).toMatchObject({ contractVersion: "1", items: [] });
    expect(calls).toBe(2);
  });

  it("does not look up or populate Cache API when public caching is disabled", async () => {
    const cache = new FakeCache();
    vi.stubGlobal("caches", { default: cache });
    const response = await app.request("http://localhost/v1/maps", {}, { ...env, PUBLIC_HTTP_CACHE_ENABLED: "false" });

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(cache.matchCalls).toBe(0);
    expect(cache.putCalls).toBe(0);
  });

  it("returns to the miss path when a cache entry has expired", async () => {
    const cache = new FakeCache();
    cache.expireNextRead = true;
    vi.stubGlobal("caches", { default: cache });
    let calls = 0;
    const cacheApp = createApp({ authenticate: auth, services: () => ({ ...services, listMaps: async () => { calls += 1; return []; } }) });

    await cacheApp.request("http://localhost/v1/maps", {}, env);
    await cacheApp.request("http://localhost/v1/maps", {}, env);

    expect(calls).toBe(1);
    expect(cache.matchCalls).toBe(2);
    expect(cache.putCalls).toBe(1);
  });

  it("does not share-cache filtered public event variants", async () => {
    const response = await app.request("http://localhost/v1/events?category=%E5%A2%9E%E7%9B%8A", {}, env);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
  });

  it("separates public Agents responses from authenticated build reads", async () => {
    const publicResponse = await app.request("http://localhost/v1/agents/events?page=1&pageSize=20", {}, { ...env, BASTION_BUILD_TOKEN: "build-token" });
    const buildResponse = await app.request("http://localhost/v1/agents/events?page=1&pageSize=20", { headers: { authorization: "Bearer build-token" } }, { ...env, BASTION_BUILD_TOKEN: "build-token" });
    expect(publicResponse.headers.get("cache-control")).toBe("public, max-age=60, s-maxage=60");
    expect(publicResponse.headers.get("vary")).toBe("Authorization");
    expect(buildResponse.headers.get("cache-control")).toBe("private, no-store");
  });
  it("requires a maintainer and an idempotency key for event imports", async () => {
    const request = { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ contractVersion: "1", fileName: "events.csv", csv: "名称" }) };
    expect((await app.request("http://localhost/v1/admin/events/imports", request, env)).status).toBe(403);
    const maintainerApp = createApp({ authenticate: async () => ({ actorType: "user" as const, subject: "admin", roles: ["maintainer"], provider: "test" }), services: () => services });
    expect((await maintainerApp.request("http://localhost/v1/admin/events/imports", request, env)).status).toBe(422);
  });
  it("reports health without external services and identifies its deployment revision", async () => {
    const response = await app.request("http://localhost/health", {}, { ...env, DEPLOYMENT_REVISION: "sha-0123456789abcdef" });
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ service: "api", status: "ok", deploymentRevision: "sha-0123456789abcdef" });
    expect(response.headers.get("cache-control")).toBe("private, no-store");
  });

  describe("X-Request-ID middleware", () => {
    it("sets X-Request-ID on successful responses when no header is supplied", async () => {
      const response = await app.request("http://localhost/health", {}, env);
      const id = response.headers.get("x-request-id");
      expect(id).toBeTruthy();
      expect(/^[0-9a-f-]{36}$/.test(id!)).toBe(true);
    });

    it("echoes a valid incoming X-Request-ID on successful responses", async () => {
      const incomingId = "portal-req-abc123";
      const response = await app.request("http://localhost/health", { headers: { "x-request-id": incomingId } }, env);
      expect(response.headers.get("x-request-id")).toBe(incomingId);
    });

    it("generates a new UUID when the incoming X-Request-ID has an invalid format", async () => {
      const badId = "bad id with spaces!";
      const response = await app.request("http://localhost/health", { headers: { "x-request-id": badId } }, env);
      const id = response.headers.get("x-request-id");
      expect(id).not.toBe(badId);
      expect(/^[0-9a-f-]{36}$/.test(id!)).toBe(true);
    });

    it("sets X-Request-ID on error responses", async () => {
      const response = await app.request("http://localhost/v1/me", {}, env);
      expect(response.status).toBe(401);
      const id = response.headers.get("x-request-id");
      expect(id).toBeTruthy();
    });

    it("error body requestId matches X-Request-ID response header", async () => {
      const incomingId = "trace-id-for-error";
      const response = await app.request("http://localhost/v1/me", { headers: { "x-request-id": incomingId } }, env);
      expect(response.status).toBe(401);
      const body = await response.json() as { error: { requestId: string } };
      expect(body.error.requestId).toBe(incomingId);
      expect(response.headers.get("x-request-id")).toBe(incomingId);
    });

    it("logs a low-cardinality request record with the revision and cache policy", async () => {
      const log = vi.spyOn(console, "log").mockImplementation(() => undefined);
      try {
        const response = await app.request("http://localhost/v1/agents/maps?page=1&pageSize=20", { headers: { "x-request-id": "trace-for-observability" } }, { ...env, DEPLOYMENT_REVISION: "sha-0123456789abcdef" });
        expect(response.status).toBe(200);
        const entries = log.mock.calls.map(([entry]) => JSON.parse(String(entry)) as Record<string, unknown>);
        expect(entries).toContainEqual(expect.objectContaining({
          event: "request_complete",
          deploymentRevision: "sha-0123456789abcdef",
          requestId: "trace-for-observability",
          routeClass: "agents",
          status: 200,
          cachePolicy: "public_ttl",
          edgeCacheStatus: "unavailable",
        }));
      } finally {
        log.mockRestore();
      }
    });

    it("marks administrative responses as private and no-store", async () => {
      const response = await app.request("http://localhost/v1/admin/events", {}, env);
      expect(response.status).toBe(403);
      expect(response.headers.get("cache-control")).toBe("private, no-store");
    });

  });

  it("rejects the legacy binding endpoint in favor of invitations", async () => {
    const response = await app.request("http://localhost/v1/qq/bindings", { method: "POST", headers: { "idempotency-key": "binding-1", "content-type": "application/json" }, body: JSON.stringify({ contractVersion: "1", provider: "qq", groupOpenId: "group-1", memberOpenId: "member-1", playerName: "Player", playerId: "1234" }) }, env);
    expect(response.status).toBe(422);
    expect((await response.json() as { error: { code: string } }).error.code).toBe("INVITE_REQUIRED");
  });

  it("creates a public invitation claim without a player session", async () => {
    const response = await app.request("http://localhost/v1/public/binding-invites/redeem", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ contractVersion: "1", code: "ABCDEFGHIJKL" }) }, env);
    expect(response.status).toBe(201);
    expect(await response.json()).toMatchObject({ claimId: "00000000-0000-0000-0000-000000000008", code: "ABC234", playerName: "Player", playerId: "1234" });
  });

  it("exchanges a completed invitation claim for the normal Portal session", async () => {
    const exchangeApp = createApp({ authenticate: auth, services: () => ({ ...services, exchangeBindingClaimSession: async ({ claimId, claimToken }) => {
      expect(claimId).toBe("00000000-0000-0000-0000-000000000008");
      expect(claimToken).toBe("a".repeat(64));
      return { contractVersion: "1" as const, status: "authenticated" as const, sessionToken: "s".repeat(64) };
    } }) });
    const response = await exchangeApp.request("https://owbastion.com/v1/public/binding-claims/00000000-0000-0000-0000-000000000008/session", { method: "POST", headers: { "x-claim-token": "a".repeat(64) } }, env);
    expect(response.status).toBe(200);
    expect(response.headers.get("set-cookie")).toContain("owb_session=");
    expect(await response.json()).toEqual({ contractVersion: "1", status: "authenticated" });
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
    expect(await response.json()).toEqual({ contractVersion: "1", status: "pending_confirmation", expiresAt: 1, historicalMigration: { status: "not_requested", requestedCount: 0, restoredCount: 0 } });
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
    expect(response.headers.get("Cache-Control")).toBe("private, no-store");
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

  it("returns only the signed-in player's active mastery projections", async () => {
    const calls: Array<{ sessionToken: string; mapId?: string; page: number; pageSize: number }> = [];
    const masteryApp = createApp({
      authenticate: auth,
      services: () => ({
        ...services,
        getCurrentPlayerMastery: async (input) => {
          calls.push(input);
          return input.sessionToken === "session-token" ? {
            contractVersion: "1" as const,
            profiles: [{
              mapId: "map.test",
              totalXp: 225,
              verifiedRunCount: 1,
              difficultyStats: [{ difficulty: "困难" as const, verifiedRunCount: 1, fastestCompletionSeconds: 600 }],
              lowestDeaths: 2,
              fewestSkips: 1,
              highestSingleRunXp: 225,
              highestCompletedDifficulty: "困难" as const,
              recentRuns: [{ runId: "00000000-0000-4000-8000-000000000010", mapId: "map.test", mapVariant: null, difficulty: "困难" as const, completionDurationSeconds: 600, deaths: 2, skips: 1, awardedXp: 225, acceptedAt: 1_000, status: "active" as const }],
            }],
            runs: [{ runId: "00000000-0000-4000-8000-000000000010", mapId: "map.test", mapVariant: null, difficulty: "困难" as const, completionDurationSeconds: 600, deaths: 2, skips: 1, awardedXp: 225, acceptedAt: 1_000, status: "active" as const }],
            page: input.page,
            pageSize: input.pageSize,
            total: 1,
            hasMore: false,
          } : null;
        },
      }),
    });

    expect((await masteryApp.request("http://localhost/v1/me/mastery", {}, env)).status).toBe(401);
    const response = await masteryApp.request("http://localhost/v1/me/mastery?mapId=map.test&page=1&pageSize=1", { headers: { cookie: "owb_session=session-token" } }, env);
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    const body = await response.json() as Record<string, unknown>;
    expect(body).toMatchObject({ contractVersion: "1", profiles: [{ mapId: "map.test", recentRuns: [{ status: "active", awardedXp: 225 }] }], runs: [{ mapId: "map.test", difficulty: "困难" }], page: 1, pageSize: 1, total: 1, hasMore: false });
    expect(JSON.stringify(body)).not.toMatch(/playerAccountId|sourceSubmissionId|runCode|gameVersion|eventCounters|acceptanceSource|xpInputSnapshot|invalidation|evidence|audit|memberOpenId|groupOpenId/);
    expect(calls).toEqual([{ sessionToken: "session-token", mapId: "map.test", page: 1, pageSize: 1 }]);
    expect((await masteryApp.request("http://localhost/v1/me/mastery?mapId=map.test&mapId=map.other", { headers: { cookie: "owb_session=session-token" } }, env)).status).toBe(422);
  });

  it("returns only the signed-in player's active title grants", async () => {
    expect((await app.request("http://localhost/v1/me/titles", {}, env)).status).toBe(401);
    const response = await app.request("http://localhost/v1/me/titles", { headers: { cookie: "owb_session=session-token" } }, env);
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ contractVersion: "1", items: [{ titleKey: "PIONEER", mapName: "萨摩亚", condition: "完成萨摩亚地狱难度。" }] });
  });

  it("reads and writes only the signed-in player's current review", async () => {
    const calls: Array<{ operation: string; subject?: string; target?: unknown; key?: string }> = [];
    let currentStatus: "active" | "withdrawn" = "active";
    const review = {
      reviewId: "00000000-0000-4000-8000-000000000003",
      playerAccountId: "11111111-1111-4111-8111-111111111111",
      targetType: "map" as const,
      targetId: "map.test",
      rating: 4 as const,
      comment: "很好",
      commentStatus: "visible" as const,
      anonymous: true,
      status: "active" as const,
      createdAt: 1,
      updatedAt: 2,
      withdrawnAt: null,
      invalidatedAt: null,
      invalidatedBy: null,
      invalidationReason: null,
    };
    const reviewApp = createApp({
      authenticate: auth,
      services: () => ({
        ...services,
        getPlayerReview: async (target, currentAuth) => { calls.push({ operation: "read", subject: currentAuth.subject, target }); return { ...review, status: currentStatus }; },
        upsertReview: async (input, currentAuth, key) => { calls.push({ operation: "upsert", subject: currentAuth.subject, target: input, key }); return review; },
        withdrawReview: async (input, currentAuth, key) => { currentStatus = "withdrawn"; calls.push({ operation: "withdraw", subject: currentAuth.subject, target: input, key }); return { ...review, status: "withdrawn" as const, withdrawnAt: 3 }; },
      }),
    });

    expect((await reviewApp.request("http://localhost/v1/me/reviews/map/map.test", {}, env)).status).toBe(401);
    const read = await reviewApp.request("http://localhost/v1/me/reviews/map/map.test", { headers: { cookie: "owb_session=session-token" } }, env);
    expect(read.status).toBe(200);
    const readBody = await read.json() as Record<string, unknown>;
    expect(readBody).toEqual({ contractVersion: "1", review: { reviewId: review.reviewId, targetType: "map", targetId: "map.test", rating: 4, comment: "很好", anonymous: true, createdAt: 1, updatedAt: 2 } });
    expect(JSON.stringify(readBody)).not.toContain("playerAccountId");
    expect(JSON.stringify(readBody)).not.toMatch(/commentStatus|invalidatedBy|invalidationReason|status/);

    const missingKey = await reviewApp.request("http://localhost/v1/me/reviews/map/map.test", { method: "PUT", headers: { "content-type": "application/json", cookie: "owb_session=session-token" }, body: JSON.stringify({ contractVersion: "1", rating: 4 }) }, env);
    expect(missingKey.status).toBe(422);
    const write = await reviewApp.request("http://localhost/v1/me/reviews/map/map.test", { method: "PUT", headers: { "content-type": "application/json", cookie: "owb_session=session-token", "idempotency-key": "review-1" }, body: JSON.stringify({ contractVersion: "1", rating: 4, comment: "很好", anonymous: true }) }, env);
    expect(write.status).toBe(200);
    expect(await write.json()).toEqual({ contractVersion: "1", review: { reviewId: review.reviewId, targetType: "map", targetId: "map.test", rating: 4, comment: "很好", anonymous: true, createdAt: 1, updatedAt: 2 } });
    const withdraw = await reviewApp.request(`http://localhost/v1/me/reviews/${review.reviewId}/withdraw`, { method: "POST", headers: { "content-type": "application/json", cookie: "owb_session=session-token", "idempotency-key": "review-withdraw-1" }, body: JSON.stringify({ contractVersion: "1" }) }, env);
    expect(withdraw.status).toBe(200);
    expect(await withdraw.json()).toEqual({ contractVersion: "1", review: null });
    const afterWithdraw = await reviewApp.request("http://localhost/v1/me/reviews/map/map.test", { headers: { cookie: "owb_session=session-token" } }, env);
    expect(await afterWithdraw.json()).toEqual({ contractVersion: "1", review: null });
    expect(calls).toEqual([
      { operation: "read", subject: "1234", target: { targetType: "map", targetId: "map.test" } },
      { operation: "upsert", subject: "1234", target: { targetType: "map", targetId: "map.test", rating: 4, comment: "很好", anonymous: true }, key: "review-1" },
      { operation: "withdraw", subject: "1234", target: { reviewId: review.reviewId }, key: "review-withdraw-1" },
      { operation: "read", subject: "1234", target: { targetType: "map", targetId: "map.test" } },
    ]);
  });

  it("returns actionable player review target, content, and idempotency errors", async () => {
    const notFoundApp = createApp({ authenticate: auth, services: () => ({ ...services, upsertReview: async () => { throw new Error("REVIEW_TARGET_NOT_FOUND"); } }) });
    const notFound = await notFoundApp.request("http://localhost/v1/me/reviews/event/missing", { method: "PUT", headers: { "content-type": "application/json", cookie: "owb_session=session-token", "idempotency-key": "review-2" }, body: JSON.stringify({ contractVersion: "1", rating: 3 }) }, env);
    expect(notFound.status).toBe(404);
    expect((await notFound.json() as { error: { code: string } }).error.code).toBe("REVIEW_TARGET_NOT_FOUND");

    const closedApp = createApp({ authenticate: auth, services: () => ({ ...services, upsertReview: async () => { throw new Error("REVIEW_TARGET_NOT_RATEABLE"); } }) });
    const closed = await closedApp.request("http://localhost/v1/me/reviews/event/removed", { method: "PUT", headers: { "content-type": "application/json", cookie: "owb_session=session-token", "idempotency-key": "review-3" }, body: JSON.stringify({ contractVersion: "1", rating: 3 }) }, env);
    expect(closed.status).toBe(409);
    expect((await closed.json() as { error: { code: string } }).error.code).toBe("REVIEW_TARGET_NOT_RATEABLE");

    const conflictApp = createApp({ authenticate: auth, services: () => ({ ...services, upsertReview: async () => { throw new Error("IDEMPOTENCY_CONFLICT"); } }) });
    const conflict = await conflictApp.request("http://localhost/v1/me/reviews/map/map.test", { method: "PUT", headers: { "content-type": "application/json", cookie: "owb_session=session-token", "idempotency-key": "review-5" }, body: JSON.stringify({ contractVersion: "1", rating: 3 }) }, env);
    expect(conflict.status).toBe(409);
    expect((await conflict.json() as { error: { code: string } }).error.code).toBe("IDEMPOTENCY_CONFLICT");

    const invalid = await app.request("http://localhost/v1/me/reviews/map/map.test", { method: "PUT", headers: { "content-type": "application/json", cookie: "owb_session=session-token", "idempotency-key": "review-4" }, body: JSON.stringify({ contractVersion: "1", rating: 6 }) }, env);
    expect(invalid.status).toBe(422);
    const invalidTarget = await app.request("http://localhost/v1/me/reviews/not-a-target/map.test", { headers: { cookie: "owb_session=session-token" } }, env);
    expect(invalidTarget.status).toBe(422);
  });

  it("limits review identity and moderation operations to maintainers", async () => {
    const reviewId = "00000000-0000-4000-8000-000000000003";
    const adminReview = { reviewId, targetType: "map" as const, targetId: "map.test", targetName: "测试地图", playerAccountId: "11111111-1111-4111-8111-111111111111", playerId: "1234", playerName: "Player", rating: 4 as const, comment: "很好", anonymous: true, commentStatus: "visible" as const, status: "active" as const, createdAt: 1, updatedAt: 2, withdrawnAt: null, invalidatedAt: null, invalidatedBy: null, invalidationReason: null };
    const detail = { contractVersion: "1" as const, review: adminReview, audit: [{ operation: "review.create", actorType: "user", actorId: "1234", reason: null, createdAt: 1 }] };
    const calls: Array<{ operation: string; input: unknown; key: string }> = [];
    const reviewApp = createApp({
      authenticate: async () => ({ actorType: "user" as const, subject: "admin", roles: ["maintainer"], provider: "test" }),
      services: () => ({
        ...services,
        listAdminReviews: async (input) => ({ contractVersion: "1" as const, items: [adminReview], page: input.page, pageSize: input.pageSize, total: 1, hasMore: false }),
        getAdminReview: async () => detail,
        hideReviewComment: async (input, _auth, key) => { calls.push({ operation: "comment", input, key }); return { ...adminReview, commentStatus: "hidden" as const }; },
        invalidateReview: async (input, _auth, key) => { calls.push({ operation: "state", input, key }); return { ...adminReview, status: "invalidated" as const }; },
      }),
    });
    const unauthenticated = createApp({ authenticate: async () => null, services: () => services });
    expect((await unauthenticated.request("http://localhost/v1/admin/reviews", {}, env)).status).toBe(401);
    expect((await app.request("http://localhost/v1/admin/reviews", {}, env)).status).toBe(403);

    const list = await reviewApp.request("http://localhost/v1/admin/reviews?targetType=map&status=active&commentStatus=visible&rating=4&targetId=map.test&page=2&pageSize=10", {}, env);
    expect(list.status).toBe(200);
    expect(await list.json()).toMatchObject({ items: [{ playerName: "Player", playerId: "1234", anonymous: true }] });
    const detailResponse = await reviewApp.request(`http://localhost/v1/admin/reviews/${reviewId}`, {}, env);
    expect(detailResponse.status).toBe(200);
    expect(await detailResponse.json()).toMatchObject({ review: { playerAccountId: adminReview.playerAccountId }, audit: [{ actorId: "1234" }] });

    const action = await reviewApp.request(`http://localhost/v1/admin/reviews/${reviewId}/comment`, { method: "POST", headers: { "content-type": "application/json", "idempotency-key": "admin-hide-1" }, body: JSON.stringify({ contractVersion: "1", action: "hide" }) }, env);
    expect(action.status).toBe(200);
    expect(calls).toEqual([{ operation: "comment", input: { reviewId }, key: "admin-hide-1" }]);
    expect(JSON.stringify(await action.clone().json())).toContain("playerAccountId");
    expect((await reviewApp.request(`http://localhost/v1/admin/reviews/${reviewId}/comment`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ contractVersion: "1", action: "hide" }) }, env)).status).toBe(422);
    const state = await reviewApp.request(`http://localhost/v1/admin/reviews/${reviewId}/state`, { method: "POST", headers: { "content-type": "application/json", "idempotency-key": "admin-invalidate-1" }, body: JSON.stringify({ contractVersion: "1", action: "invalidate", reason: "内容不符合规范" }) }, env);
    expect(state.status).toBe(200);
    expect(calls).toContainEqual({ operation: "state", input: { reviewId, reason: "内容不符合规范" }, key: "admin-invalidate-1" });
  });

  it("limits mastery-run inspection and reconciliation to maintainers", async () => {
    const masteryRunId = "00000000-0000-4000-8000-000000000013";
    const conflictSubmissionId = "00000000-0000-4000-8000-000000000014";
    const run = {
      runId: masteryRunId,
      playerAccountId: "00000000-0000-4000-8000-000000000011",
      playerId: "1234",
      playerName: "Player",
      sourceSubmissionId: "00000000-0000-4000-8000-000000000012",
      mapId: "map.test",
      mapName: "测试地图",
      mapVariant: null,
      difficulty: "困难" as const,
      gameVersion: "26.0810.1",
      runCode: "1234-5678-9012",
      completionDurationSeconds: 600,
      deaths: 1,
      skips: 0,
      eventCounters: {},
      acceptanceSource: "submission_review" as const,
      acceptedAt: 1,
      status: "active" as const,
      invalidatedAt: null,
      invalidatedBy: null,
      invalidationReason: null,
      xpRuleVersion: "v1" as const,
      xpInputSnapshot: { ruleVersion: "v1" as const, baseDifficultyXp: 225, mapFactor: 1, performanceBonus: 11, performanceBonusReasons: ["no_skips" as const], challengeBonus: 0 },
      awardedXp: 236,
      conflictCount: 1,
    };
    const projection = { mapId: "map.test", totalXp: 236, verifiedRunCount: 1, difficultyStats: [{ difficulty: "困难" as const, verifiedRunCount: 1, fastestCompletionSeconds: 600 }], lowestDeaths: 1, fewestSkips: 0, highestSingleRunXp: 236, highestCompletedDifficulty: "困难" as const };
    const calls: Array<{ operation: string; input: unknown; key?: string }> = [];
    const masteryApp = createApp({
      authenticate: async () => ({ actorType: "user" as const, subject: "admin", roles: ["maintainer"], provider: "test" }),
      services: () => ({
        ...services,
        listAdminMasteryRuns: async (input) => {
          calls.push({ operation: "list", input });
          return { contractVersion: "1" as const, items: [run], page: input.page, pageSize: input.pageSize, total: 1, hasMore: false };
        },
        getAdminMasteryRun: async () => ({ contractVersion: "1" as const, run, projection, sourceSubmission: {} as never, lifecycle: [{ transition: "accepted" as const, actorType: "service" as const, actorId: "submission_review", reason: null, createdAt: 1 }], conflicts: [{ submissionId: conflictSubmissionId, submissionStatus: "ocr_review_required" as const, playerAccountId: run.playerAccountId, playerName: run.playerName, conflictFields: ["difficulty" as const], facts: { mapName: "测试地图", mapVariant: null, difficulty: "传奇" as const, gameVersion: "26.0810.1", runCode: "1234-5678-9012", completionDurationSeconds: 600, deaths: 1, skips: 0 }, resolution: null }] }),
        transitionAdminMasteryRun: async (input, _auth, key) => {
          calls.push({ operation: "state", input, key });
          return { contractVersion: "1" as const, run, projection };
        },
        resolveAdminMasteryRunConflict: async (input, _auth, key) => {
          calls.push({ operation: "conflict", input, key });
          return { contractVersion: "1" as const, action: input.action, run, projection };
        },
      }),
    });
    const unauthenticated = createApp({ authenticate: async () => null, services: () => services });
    expect((await unauthenticated.request("http://localhost/v1/admin/mastery-runs", {}, env)).status).toBe(401);
    expect((await app.request("http://localhost/v1/admin/mastery-runs", {}, env)).status).toBe(403);

    const list = await masteryApp.request("http://localhost/v1/admin/mastery-runs?playerAccountId=00000000-0000-4000-8000-000000000011&mapId=map.test&difficulty=%E5%9B%B0%E9%9A%BE&status=active&acceptanceSource=submission_review&runCode=1234-5678-9012&from=1&to=2&page=2&pageSize=10", {}, env);
    expect(list.status).toBe(200);
    expect(list.headers.get("cache-control")).toBe("private, no-store");
    expect(await list.json()).toMatchObject({ items: [{ runCode: "1234-5678-9012", playerAccountId: run.playerAccountId }], page: 2, pageSize: 10 });
    expect(calls[0]).toEqual({ operation: "list", input: { playerAccountId: run.playerAccountId, mapId: "map.test", difficulty: "困难", status: "active", acceptanceSource: "submission_review", runCode: "1234-5678-9012", from: 1, to: 2, page: 2, pageSize: 10 } });
    expect((await masteryApp.request("http://localhost/v1/admin/mastery-runs?status=unknown", {}, env)).status).toBe(422);

    const detail = await masteryApp.request(`http://localhost/v1/admin/mastery-runs/${masteryRunId}`, {}, env);
    expect(detail.status).toBe(200);
    expect(await detail.json()).toMatchObject({ run: { runCode: "1234-5678-9012" }, conflicts: [{ submissionId: conflictSubmissionId, conflictFields: ["difficulty"] }] });
    expect((await masteryApp.request("http://localhost/v1/admin/mastery-runs/not-a-uuid", {}, env)).status).toBe(422);

    expect((await masteryApp.request(`http://localhost/v1/admin/mastery-runs/${masteryRunId}/state`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ contractVersion: "1", action: "invalidate" }) }, env)).status).toBe(422);
    const state = await masteryApp.request(`http://localhost/v1/admin/mastery-runs/${masteryRunId}/state`, { method: "POST", headers: { "content-type": "application/json", "idempotency-key": "mastery-state-1" }, body: JSON.stringify({ contractVersion: "1", action: "invalidate", reason: "证据不一致" }) }, env);
    expect(state.status).toBe(200);
    expect(calls).toContainEqual({ operation: "state", input: { masteryRunId, action: "invalidate", reason: "证据不一致", contractVersion: "1" }, key: "mastery-state-1" });

    const conflict = await masteryApp.request(`http://localhost/v1/admin/mastery-runs/${masteryRunId}/conflicts/${conflictSubmissionId}`, { method: "POST", headers: { "content-type": "application/json", "idempotency-key": "mastery-conflict-1" }, body: JSON.stringify({ contractVersion: "1", action: "invalidate_existing", reason: "以修正截图为准" }) }, env);
    expect(conflict.status).toBe(200);
    expect(calls).toContainEqual({ operation: "conflict", input: { masteryRunId, submissionId: conflictSubmissionId, action: "invalidate_existing", reason: "以修正截图为准", contractVersion: "1" }, key: "mastery-conflict-1" });
  });

  it("serves privacy-safe public review summaries and comments", async () => {
    const calls: Array<{ operation: string; input: unknown }> = [];
    const publicApp = createApp({
      authenticate: auth,
      services: () => ({
        ...services,
        getReviewSummary: async (input) => {
          calls.push({ operation: "summary", input });
          return { targetType: input.targetType, targetId: input.targetId, averageRating: null, reviewCount: 0, ratingDistribution: { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 }, sampleInsufficient: true };
        },
        getReviewSummaries: async (input) => {
          calls.push({ operation: "batch", input });
          return input.targetIds.map((targetId) => ({ targetType: input.targetType, targetId, averageRating: 4, reviewCount: 3, ratingDistribution: { 1: 0, 2: 0, 3: 0, 4: 1, 5: 2 }, sampleInsufficient: false }));
        },
        listPublicReviewComments: async (input) => {
          calls.push({ operation: "comments", input });
          return { ...input, items: [{ rating: 5 as const, comment: "很好", author: null, createdAt: 3 }, { rating: 4 as const, comment: "稳定", author: { displayName: "公开玩家" }, createdAt: 2 }], total: 2, hasMore: false };
        },
      }),
    });

    const summary = await publicApp.request("http://localhost/v1/public/reviews/map/map.test/summary", {}, env);
    expect(summary.status).toBe(200);
    expect(summary.headers.get("cache-control")).toBe("private, no-store");
    expect(await summary.json()).toEqual({ contractVersion: "1", summary: { targetType: "map", targetId: "map.test", averageRating: null, reviewCount: 0, ratingDistribution: { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 }, sampleInsufficient: true } });

    const batch = await publicApp.request("http://localhost/v1/public/reviews/summaries?targetType=map&targetIds=map.test%2Cmap.empty", {}, env);
    expect(batch.status).toBe(200);
    expect(await batch.json()).toMatchObject({ contractVersion: "1", targetType: "map", items: [{ targetId: "map.test", reviewCount: 3 }, { targetId: "map.empty", reviewCount: 3 }] });

    const comments = await publicApp.request("http://localhost/v1/public/reviews/map/map.test/comments?page=1&pageSize=2", {}, env);
    expect(comments.status).toBe(200);
    const commentBody = await comments.json() as Record<string, unknown>;
    expect(commentBody).toEqual({ contractVersion: "1", targetType: "map", targetId: "map.test", items: [{ rating: 5, comment: "很好", author: null, createdAt: 3 }, { rating: 4, comment: "稳定", author: { displayName: "公开玩家" }, createdAt: 2 }], page: 1, pageSize: 2, total: 2, hasMore: false });
    expect(JSON.stringify(commentBody)).not.toMatch(/playerAccountId|playerId|qq|audit|moderation|session|reviewId/);

    expect((await publicApp.request("http://localhost/v1/public/reviews/map/map.test/comments?page=0", {}, env)).status).toBe(422);
    expect((await publicApp.request("http://localhost/v1/public/reviews/not-a-target/map.test/summary", {}, env)).status).toBe(422);
    expect(calls).toEqual([
      { operation: "summary", input: { targetType: "map", targetId: "map.test" } },
      { operation: "batch", input: { targetType: "map", targetIds: ["map.test", "map.empty"] } },
      { operation: "comments", input: { targetType: "map", targetId: "map.test", page: 1, pageSize: 2 } },
    ]);
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

  it("returns paginated historical title migration data with global stats", async () => {
    const calls: Array<{ query?: string; filter?: string; page: number; pageSize: number }> = [];
    const listResponse = { contractVersion: "1" as const, holders: [{ holderName: "Cold", totalCount: 3, unclaimedCount: 2, status: "pending" as const }], page: 2, pageSize: 10, total: 25, hasMore: true, filter: "pending" as const, stats: { pendingHolderCount: 3, unclaimedGrantCount: 12, migratedGrantCount: 28 } };
    const adminApp = createApp({ authenticate: async () => ({ actorType: "user", subject: "admin", roles: ["maintainer"], provider: "test" }), services: () => ({ ...services, listHistoricalTitleGrants: async (input) => { calls.push(input); return listResponse; } }) });
    const response = await adminApp.request("http://localhost/v1/admin/title-grants?query=Cold&filter=pending&page=2&pageSize=10", {}, env);
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual(listResponse);
    expect(calls).toEqual([{ query: "Cold", filter: "pending", page: 2, pageSize: 10 }]);
  });

  it("returns complete historical holder detail with grant pagination", async () => {
    const calls: Array<{ holderName: string; page: number; pageSize: number; grantStatus?: string }> = [];
    const detailResponse = {
      contractVersion: "1" as const,
      holder: { holderName: "Cold", totalCount: 3, unclaimedCount: 2, status: "pending" as const },
      items: [{ grantId: "historical-1", titleKey: "TITLE", label: "传奇挑战者", icon: "star", category: "难度挑战", condition: "通关", scope: "global" as const, grantedAt: 0, holderName: "Cold", status: "unclaimed" as const }],
      page: 1,
      pageSize: 1,
      total: 2,
      hasMore: true,
      grantStatus: "unclaimed" as const,
    };
    const adminApp = createApp({ authenticate: async () => ({ actorType: "user", subject: "admin", roles: ["maintainer"], provider: "test" }), services: () => ({ ...services, getHistoricalTitleHolder: async (input) => { calls.push(input); return detailResponse; } }) });
    const response = await adminApp.request("http://localhost/v1/admin/title-grants/holder?holderName=Cold&page=1&pageSize=1&grantStatus=unclaimed", {}, env);
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual(detailResponse);
    expect(calls).toEqual([{ holderName: "Cold", page: 1, pageSize: 1, grantStatus: "unclaimed" }]);
  });

  it("exposes manual title grants only to maintainers", async () => {
    const manualGrant = { contractVersion: "1" as const, grantId: "00000000-0000-4000-8000-000000000009", titleKey: "PIONEER", titleName: "开拓者", mapId: null, slot: null, alreadyOwned: true };
    const adminApp = createApp({ authenticate: async () => ({ actorType: "user", subject: "admin", roles: ["maintainer"], provider: "test" }), services: () => ({ ...services, createAdminManualTitleGrant: async () => manualGrant }) });
    const body = JSON.stringify({ contractVersion: "1", playerAccountId: "11111111-1111-4111-8111-111111111111", titleKey: "PIONEER", reason: "申诉纠正" });
    expect((await app.request("http://localhost/v1/admin/title-grants/manual", { method: "POST", headers: { "content-type": "application/json", "idempotency-key": "manual-1" }, body }, env)).status).toBe(403);
    const response = await adminApp.request("http://localhost/v1/admin/title-grants/manual", { method: "POST", headers: { "content-type": "application/json", "idempotency-key": "manual-1" }, body }, env);
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual(manualGrant);
  });

  it("bulk-links every unclaimed title held by one exact historical player name", async () => {
    const requests: Array<{ holderName: string; playerAccountId: string; idempotencyKey: string }> = [];
    const responses = new Map<string, { contractVersion: "1"; grantedCount: number; skippedClaimedCount: number }>();
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
        const response = { contractVersion: "1" as const, grantedCount: input.holderName === "Cold" ? 42 : 0, skippedClaimedCount: input.holderName === "Cold" ? 1 : 0 };
        responses.set(idempotencyKey, response);
        return response;
      } }),
    });
    const body = JSON.stringify({ contractVersion: "1", holderName: "Cold", playerAccountId: "11111111-1111-4111-8111-111111111111" });
    expect((await adminApp.request("http://localhost/v1/admin/title-grants/bulk", { method: "POST", headers: { "content-type": "application/json" }, body }, env)).status).toBe(422);
    expect((await app.request("http://localhost/v1/admin/title-grants/bulk", { method: "POST", headers: { "content-type": "application/json", "idempotency-key": "bulk-1" }, body }, env)).status).toBe(403);
    const first = await adminApp.request("http://localhost/v1/admin/title-grants/bulk", { method: "POST", headers: { "content-type": "application/json", "idempotency-key": "bulk-1" }, body }, env);
    expect(first.status).toBe(200);
    expect(await first.json()).toEqual({ contractVersion: "1", grantedCount: 42, skippedClaimedCount: 1 });
    const replay = await adminApp.request("http://localhost/v1/admin/title-grants/bulk", { method: "POST", headers: { "content-type": "application/json", "idempotency-key": "bulk-1" }, body }, env);
    expect(await replay.json()).toEqual({ contractVersion: "1", grantedCount: 42, skippedClaimedCount: 1 });
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
    expect(listed.headers.get("cache-control")).toBe("private, no-store");
    const denied = await app.request("http://localhost/v1/admin/achievements", {}, env);
    expect(denied.headers.get("cache-control")).toBe("private, no-store");
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

  it("creates a scoped achievement through the maintainer API", async () => {
    const created: unknown[] = [];
    const adminApp = createApp({
      authenticate: async () => ({ actorType: "user", subject: "admin", roles: ["maintainer"], provider: "test" }),
      services: () => ({
        ...services,
        createAdminAchievement: async (input) => {
          created.push(input);
          return { challengeId: `title.${input.titleKey}`, family: "achievement", type: "title_achievement", kind: "title_achievement", titleKey: input.titleKey, titleName: input.titleName, icon: input.icon, category: input.category, categoryOverride: null, condition: input.condition, evidenceRule: input.evidenceRule, gameVersion: input.gameVersion, status: input.status, submissionMode: input.submissionMode, introducedVersion: input.gameVersion, retiredVersion: null, scope: input.scope, mapIds: input.mapIds };
        },
      }),
    });
    const body = { contractVersion: "1", titleKey: "CLASSIC_RACETRACK", titleName: "经典赛道", icon: "trophy", category: "经典版系列", condition: "完成经典版挑战", evidenceRule: "完整截图", submissionMode: "manual", scope: "map", mapIds: ["map.route66"], status: "active", gameVersion: "26.0728.1" };
    expect((await app.request("http://localhost/v1/admin/achievements", { method: "POST", headers: { "content-type": "application/json", "idempotency-key": "create-1" }, body: JSON.stringify(body) }, env)).status).toBe(403);
    const response = await adminApp.request("http://localhost/v1/admin/achievements", { method: "POST", headers: { "content-type": "application/json", "idempotency-key": "create-1" }, body: JSON.stringify(body) }, env);
    expect(response.status).toBe(201);
    expect(await response.json()).toMatchObject({ challengeId: "title.CLASSIC_RACETRACK", scope: "map", mapIds: ["map.route66"] });
    expect(created).toEqual([expect.objectContaining(body)]);
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
      listTitles: async ({ mapId }) => mapId ? [{ titleKey: "PIONEER", label: "开拓者", icon: "trophy", category: "社区贡献系列", condition: "地图挑战", availability: "active", scope: "map", displayKind: "map_pioneer", mapId, slot: "pioneer", pioneerPrefixes: ["萨摩亚"], color: { kind: "heroColor" as const, index: 12 }, gameVersion: "2026.07.15" }] : [{ titleKey: "ALL_IN_ONE", label: "万象归一", icon: "trophy", category: "地图精通系列", condition: "获得所有地图征服者头衔", availability: "active", scope: "global", displayKind: "fixed", color: null, gameVersion: "2026.07.15" }],
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
    const adminMapTitles = await adminCatalogApp.request("http://localhost/v1/admin/titles?mapId=map.samoa", {}, env);
    expect(adminMapTitles.status).toBe(200);
    expect(await adminMapTitles.json()).toMatchObject({ contractVersion: "1", items: [{ titleKey: "PIONEER", scope: "map", mapId: "map.samoa" }] });
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
    expect(await response.json()).toMatchObject({ error: { code: "CHALLENGE_AUTOMATIC", message: "该称号满足条件后自动获得，无需提交截图。" } });
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

  it("returns the title grant summary from an approved review", async () => {
    const reviewApp = createApp({ authenticate: async () => ({ actorType: "user", subject: "admin", roles: ["maintainer"], provider: "test" }), services: () => ({ ...services, reviewSubmission: async () => ({ contractVersion: "1", submissionId: "00000000-0000-4000-8000-000000000000", decision: "approved" as const, grantId: "00000000-0000-4000-8000-000000000001", titleKey: "PIONEER", titleName: "开拓者", alreadyOwned: false }) }) });
    const response = await reviewApp.request("http://localhost/v1/admin/submissions/00000000-0000-4000-8000-000000000000/review", { method: "POST", headers: { "content-type": "application/json", "idempotency-key": "review-1" }, body: JSON.stringify({ contractVersion: "1", decision: "approved" }) }, env);
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ decision: "approved", titleKey: "PIONEER", titleName: "开拓者", alreadyOwned: false });
  });

  it("allows maintainers to request another OCRKit attempt", async () => {
    const requests: string[] = [];
    const retryApp = createApp({ authenticate: async () => ({ actorType: "user", subject: "admin", roles: ["maintainer"], provider: "test" }), services: () => ({ ...services, requestAdminOcr: async ({ submissionId }) => { requests.push(submissionId); return { contractVersion: "1", submissionId, status: "ocr_pending" as const }; } }) });
    const response = await retryApp.request("http://localhost/v1/admin/submissions/00000000-0000-4000-8000-000000000000/ocr/retry", { method: "POST", headers: { "content-type": "application/json", "idempotency-key": "ocr-retry-1" }, body: JSON.stringify({ contractVersion: "1" }) }, env);
    expect(response.status).toBe(200);
    expect(requests).toEqual(["00000000-0000-4000-8000-000000000000"]);
    expect(await response.json()).toMatchObject({ status: "ocr_pending" });
  });

  it("lets maintainers select a submission challenge", async () => {
    const selections: string[] = [];
    const selectionApp = createApp({ authenticate: async () => ({ actorType: "user", subject: "admin", roles: ["maintainer"], provider: "test" }), services: () => ({ ...services, selectAdminSubmissionChallenge: async ({ submissionId, challengeId }) => { selections.push(`${submissionId}:${challengeId}`); return { contractVersion: "1", submissionId, status: "ready_for_review" as const, challengeId }; } }) });
    const response = await selectionApp.request("http://localhost/v1/admin/submissions/00000000-0000-0000-0000-000000000000/challenge", { method: "POST", headers: { "content-type": "application/json", "idempotency-key": "challenge-select-1" }, body: JSON.stringify({ contractVersion: "1", challengeId: "map.paraiso.hell", mapId: "map.paraiso" }) }, env);
    expect(response.status).toBe(200);
    expect(selections).toEqual(["00000000-0000-0000-0000-000000000000:map.paraiso.hell"]);
  });

  it("lets maintainers resolve an automatic-decision spot check", async () => {
    const resolutions: string[] = [];
    const spotCheckApp = createApp({ authenticate: async () => ({ actorType: "user", subject: "admin", roles: ["maintainer"], provider: "test" }), services: () => ({ ...services, resolveAdminSubmissionSpotCheck: async ({ submissionId, decision }) => { resolutions.push(`${submissionId}:${decision}`); return { contractVersion: "1", submissionId, status: decision, grantId: "00000000-0000-4000-8000-000000000001", masteryRunId: null }; } }) });
    const response = await spotCheckApp.request("http://localhost/v1/admin/submissions/00000000-0000-4000-8000-000000000000/spot-check", { method: "POST", headers: { "content-type": "application/json", "idempotency-key": "spot-check-1" }, body: JSON.stringify({ contractVersion: "1", decision: "confirmed" }) }, env);
    expect(response.status).toBe(200);
    expect(resolutions).toEqual(["00000000-0000-4000-8000-000000000000:confirmed"]);
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

  it("updates a player's BattleTag through the maintainer route", async () => {
    const updates: Array<{ playerAccountId: string; playerName: string; key: string }> = [];
    const adminApp = createApp({
      authenticate: async () => ({ actorType: "user" as const, subject: "admin", roles: ["maintainer"], provider: "test" }),
      services: () => ({ ...services, updateAdminPlayerIdentity: async (input, _auth, key) => { updates.push({ playerAccountId: input.playerAccountId, playerName: input.playerName, key }); } }),
    });
    const response = await adminApp.request("http://localhost/v1/admin/player-accounts/player-1/identity", { method: "PUT", headers: { "content-type": "application/json", "idempotency-key": "identity-1" }, body: JSON.stringify({ contractVersion: "1", playerName: "新名称" }) }, env);
    expect(response.status).toBe(204);
    expect(updates).toEqual([{ playerAccountId: "player-1", playerName: "新名称", key: "identity-1" }]);
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
    const awaiting = await adminApp.request("http://localhost/v1/admin/submissions?status=awaiting_player_confirmation&page=1&pageSize=20", {}, env);
    expect(awaiting.status).toBe(200);
    expect(requests[1]).toEqual({ statuses: ["awaiting_player_confirmation"], page: 1, pageSize: 20 });
    const dashboard = await adminApp.request("http://localhost/v1/admin/submissions?status=received,evidence_pending,evidence_stored,upload_pending,ocr_pending,ready_for_review,ocr_review_required&page=1&pageSize=5", {}, env);
    expect(dashboard.status).toBe(200);
    expect(requests[2]).toEqual({ statuses: ["received", "evidence_pending", "evidence_stored", "upload_pending", "ocr_pending", "ready_for_review", "ocr_review_required"], page: 1, pageSize: 5 });
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

  it("reads public submission status directly from D1 on every request", async () => {
    const getSubmissionMock = vi.fn().mockResolvedValue({
      contractVersion: "1",
      submissionId: "00000000-0000-0000-0000-000000000099",
      status: "ready_for_review",
      mapName: "Test Map",
      createdAt: 100,
      updatedAt: 200,
    });
    const subApp = createApp({
      authenticate: auth,
      services: () => ({ ...services, getSubmission: getSubmissionMock }),
    });

    const url = "http://localhost/v1/submissions/00000000-0000-0000-0000-000000000099";

    const res1 = await subApp.request(url, {}, env);
    expect(res1.status).toBe(200);
    expect(getSubmissionMock).toHaveBeenCalledTimes(1);

    getSubmissionMock.mockResolvedValueOnce({
      contractVersion: "1",
      submissionId: "00000000-0000-0000-0000-000000000099",
      status: "approved",
      mapName: "Test Map",
      createdAt: 100,
      updatedAt: 300,
    });
    const res2 = await subApp.request(url, {}, env);
    expect(res2.status).toBe(200);
    expect(getSubmissionMock).toHaveBeenCalledTimes(2);
    expect(await res2.json()).toMatchObject({ status: "approved", updatedAt: 300 });
  });

  it("returns 401 for manual review request without session", async () => {
    const response = await app.request("http://localhost/v1/player/submissions/00000000-0000-4000-8000-000000000001/manual-review", { method: "POST", headers: { origin: "https://owbastion.com" } }, env);
    expect(response.status).toBe(401);
  });

  it("returns 404 when submission not found for manual review", async () => {
    const notFoundApp = createApp({ authenticate: auth, services: () => ({ ...services, requestManualReview: async () => { throw new Error("SUBMISSION_NOT_FOUND"); } }) });
    const response = await notFoundApp.request("http://localhost/v1/player/submissions/00000000-0000-4000-8000-000000000001/manual-review", { method: "POST", headers: { origin: "https://owbastion.com", cookie: "owb_session=session-token" } }, env);
    expect(response.status).toBe(404);
    expect((await response.json() as any).error.code).toBe("SUBMISSION_NOT_FOUND");
  });

  it("returns 409 when submission is not eligible for manual review", async () => {
    const ineligibleApp = createApp({ authenticate: auth, services: () => ({ ...services, requestManualReview: async () => { throw new Error("MANUAL_REVIEW_NOT_ELIGIBLE"); } }) });
    const response = await ineligibleApp.request("http://localhost/v1/player/submissions/00000000-0000-4000-8000-000000000001/manual-review", { method: "POST", headers: { origin: "https://owbastion.com", cookie: "owb_session=session-token" } }, env);
    expect(response.status).toBe(409);
    expect((await response.json() as any).error.code).toBe("MANUAL_REVIEW_NOT_ELIGIBLE");
  });

  it("returns 204 on successful manual review request", async () => {
    const response = await app.request("http://localhost/v1/player/submissions/00000000-0000-4000-8000-000000000001/manual-review", { method: "POST", headers: { origin: "https://owbastion.com", cookie: "owb_session=session-token" } }, env);
    expect(response.status).toBe(204);
  });
});
