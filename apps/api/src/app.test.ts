import { afterEach, describe, expect, it, vi } from "vitest";
import type { PlatformServices } from "@owbastion/domain";
import { playerReviewResponseSchema, publicReviewSummaryResponseSchema } from "@owbastion/contracts";
import { createApp, type RuntimeEnv } from "./app";
import { withPublicCache } from "./public-cache";

const auth = async () => ({ actorType: "service" as const, subject: "qqbot", roles: ["channel:write"], provider: "test" });
const services: PlatformServices = {
  submitQqScreenshot: async () => ({ contractVersion: "1", submissionId: "00000000-0000-4000-8000-000000000010", status: "processing" }),
  recordVerifiedRun: async () => { throw new Error("VERIFIED_RUN_NOT_IMPLEMENTED"); },
  invalidateVerifiedRun: async () => { throw new Error("VERIFIED_RUN_NOT_IMPLEMENTED"); },
  restoreVerifiedRun: async () => { throw new Error("VERIFIED_RUN_NOT_IMPLEMENTED"); },
  rebuildMasteryProfiles: async () => [],
  listAdminVerifiedRuns: async ({ page, pageSize }) => ({ contractVersion: "1", items: [], page, pageSize, total: 0, hasMore: false }),
  getAdminVerifiedRun: async () => { throw new Error("VERIFIED_RUN_NOT_FOUND"); },
  correctAdminVerifiedRun: async () => { throw new Error("VERIFIED_RUN_NOT_FOUND"); },
  transitionAdminVerifiedRun: async () => { throw new Error("VERIFIED_RUN_NOT_FOUND"); },
  resolveAdminVerifiedRunConflict: async () => { throw new Error("VERIFIED_RUN_NOT_FOUND"); },
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
  listAdminRandomEventVersions: async () => ({ contractVersion: "1" as const, items: [] }),
  updateAdminRandomEventVersion: async ({ gameVersion, availability }) => ({ gameVersion, availability, eventCount: 0 }),
  listMaps: async () => [],
  updateAdminMapMetadata: async () => { throw new Error("MAP_NOT_FOUND"); },
  getAdminMapEditor: async () => { throw new Error("MAP_NOT_FOUND"); },
  createAdminMapRevision: async () => { throw new Error("MAP_NOT_FOUND"); },
  updateAdminMapRevision: async () => { throw new Error("REVISION_NOT_FOUND"); },
  promoteAdminMapRevision: async () => { throw new Error("REVISION_NOT_FOUND"); },
  listChallenges: async () => [],
  listTitles: async () => [],
  uploadAdminTitleIcon: async () => ({ iconUrl: "https://api.example.com/v1/public/achievement-icons/TEST" }),
  getPublicTitleIcon: async () => null,
  listCurrentPlayerTitles: async ({ sessionToken }) => sessionToken === "session-token" ? { items: [{ grantId: "00000000-0000-0000-0000-000000000006", titleKey: "PIONEER", label: "开拓者", icon: "trophy", category: "社区贡献系列", condition: "完成萨摩亚地狱难度。", scope: "map", mapName: "萨摩亚", slot: "pioneer", grantedAt: 4 }], allTitles: false } : null,
  replaceCurrentPlayerEquippedTitles: async ({ grantIds, sessionToken }) => { if (sessionToken !== "session-token") throw new Error("UNAUTHENTICATED"); return { contractVersion: "1" as const, grantIds }; },
  replaceAdminPlayerEquippedTitles: async ({ grantIds }) => ({ contractVersion: "1" as const, grantIds }),
  listHistoricalTitleGrants: async () => ({ contractVersion: "1", holders: [], page: 1, pageSize: 20, total: 0, hasMore: false, filter: "all", stats: { pendingHolderCount: 0, unclaimedGrantCount: 0, migratedGrantCount: 0 } }),
  getHistoricalTitleHolder: async () => ({ contractVersion: "1", holder: { holderName: "Cold", totalCount: 0, unclaimedCount: 0, status: "completed" }, items: [], page: 1, pageSize: 50, total: 0, hasMore: false, grantStatus: "all" }),
  createAdminTitleGrant: async () => {},
  createAdminTitleGrantBulk: async () => ({ contractVersion: "1", grantedCount: 0, skippedClaimedCount: 0 }),
  revokeAdminTitleGrant: async () => {},
  restoreAdminTitleGrant: async () => {},
  createAdminManualTitleGrant: async () => ({ contractVersion: "1", grantId: "00000000-0000-4000-8000-000000000009", titleKey: "PIONEER", titleName: "开拓者", mapId: null, slot: null, alreadyOwned: false }),
  createAdminManualTitleGrantBatch: async () => ({ contractVersion: "1", batchId: "00000000-0000-4000-8000-000000000010", playerCount: 0, targetCount: 0, requestedCount: 0, createdCount: 0, alreadyOwnedCount: 0, items: [] }),
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
  completePlayerUpload: async () => ({ submissionId: "00000000-0000-0000-0000-000000000003", status: "processing" }),
  listAdminSubmissions: async () => ({ contractVersion: "1", items: [], page: 1, pageSize: 50, total: 0, hasMore: false }),
  getAdminSubmission: async () => { throw new Error("SUBMISSION_NOT_FOUND"); },
  requestAdminOcr: async ({ submissionId }) => ({ contractVersion: "1", submissionId, status: "ocr_pending" }),
  resolveAdminSubmissionSpotCheck: async ({ submissionId, decision }) => ({ contractVersion: "1", submissionId, status: decision, grantId: null, verifiedRunId: null }),
  getPlayerSubmission: async () => ({ contractVersion: "1", submissionId: "00000000-0000-0000-0000-000000000003", status: "needs_review", mapName: "Test Map", createdAt: 1, updatedAt: 2, evidenceUrl: "https://evidence.owbastion.codes/uploads/submissions/opaque-object-key.png", ocr: { mapName: "Test Map", difficulty: "困难", playerName: "Player", challengeCompleted: true } }),
  submitPlayerOcrFeedback: async (input) => ({ contractVersion: "1" as const, submissionId: input.submissionId, ocrResultId: input.ocrResultId, accuracy: input.accuracy, alreadySubmitted: false }),
  submitAdminOcrAccuracy: async (input) => ({ contractVersion: "1" as const, submissionId: input.submissionId, ocrResultId: input.ocrResultId, accuracy: input.accuracy, alreadySubmitted: false }),
  listAdminScreenshotSetCandidates: async () => ({ contractVersion: "1" as const, items: [], page: 1, pageSize: 20, total: 0, hasMore: false }),
  createAdminScreenshotSet: async () => ({ contractVersion: "1" as const, setId: "00000000-0000-4000-8000-000000000009", version: 1, status: "draft" as const, counts: { memberCount: 0, excludedCount: 0 } }),
  listAdminScreenshotSets: async ({ page, pageSize }) => ({ contractVersion: "1" as const, items: [], page, pageSize, total: 0, hasMore: false }),
  getAdminScreenshotSet: async () => { throw new Error("SCREENSHOT_SET_NOT_FOUND"); },
  finalizeAdminScreenshotSet: async () => { throw new Error("SCREENSHOT_SET_NOT_FOUND"); },
  discardAdminScreenshotSet: async () => { throw new Error("SCREENSHOT_SET_NOT_FOUND"); },
  getOcrkitScreenshotSet: async () => { throw new Error("SCREENSHOT_SET_NOT_FOUND"); },
  previewSubmissionReview: async ({ submissionId }) => ({ contractVersion: "1", submissionId, evidenceOutcome: "review", candidates: [], completions: [], titles: [], verifiedRun: { status: "ineligible", reason: "missing_match_code" }, approvable: false, blockingCode: "SUBMISSION_OUTCOME_NOT_CONFIGURED" }),
  reviewSubmission: async () => ({ contractVersion: "1", submissionId: "00000000-0000-4000-8000-000000000000", decision: "rejected", grant: null }),
  processOcrJob: async () => {},
  completeOcrJob: async () => {},
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
  verifyBindingClaim: async () => ({ contractVersion: "1", status: "verified", environment: "test" }),
  listAdminBindingClaims: async () => ({ contractVersion: "1", items: [] }),
  decideAdminBindingClaim: async () => {},
  retryHistoricalTitleMigration: async () => {},
  getSubmission: async () => ({ contractVersion: "1", submissionId: "00000000-0000-0000-0000-000000000003", status: "processing", mapName: "Test Map", createdAt: 1, updatedAt: 1 }),
  createQqLoginAttempt: async () => ({ contractVersion: "1", attemptId: "00000000-0000-0000-0000-000000000005", attemptToken: "a".repeat(64), code: "ABC234", expiresAt: 1 }),
  getQqLoginStatus: async () => ({ contractVersion: "1", status: "pending" }),
  verifyQqLogin: async () => ({ contractVersion: "1", status: "verified", environment: "test" }),
  upsertQqGroupAccess: async () => {},
  registerQqGroup: async () => {},
  listQqGroupAccess: async () => [],
  dispatchPendingQqGroupPolicyEvents: async () => {},
  reconcileStaleOcrJobs: async () => 0,
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
  listPublicReviewComments: async (input) => ({ targetType: input.targetType, targetId: input.targetId, gameplayRevisionId: input.targetType === "map" ? input.gameplayRevisionId : null, items: [], page: input.page, pageSize: input.pageSize, total: 0, hasMore: false }),
  getPlayerReview: async () => { throw new Error("REVIEW_NOT_IMPLEMENTED"); },
  upsertReview: async () => { throw new Error("REVIEW_NOT_IMPLEMENTED"); },
  withdrawReview: async () => { throw new Error("REVIEW_NOT_IMPLEMENTED"); },
  hideReviewComment: async () => { throw new Error("REVIEW_NOT_IMPLEMENTED"); },
  restoreReviewComment: async () => { throw new Error("REVIEW_NOT_IMPLEMENTED"); },
  invalidateReview: async () => { throw new Error("REVIEW_NOT_IMPLEMENTED"); },
  restoreReview: async () => { throw new Error("REVIEW_NOT_IMPLEMENTED"); },
  getCurrentPlayer: async ({ sessionToken }) => sessionToken === "session-token" ? {
    contractVersion: "1",
    player: { playerId: "1234", playerName: "Player", isAdmin: false },
    recentSubmissions: [{ submissionId: "00000000-0000-0000-0000-000000000003", status: "processing", mapName: "Test Map", createdAt: 2, updatedAt: 3 }],
  } : null,
  createPasskeyLoginOptions: async () => ({ contractVersion: "1", challengeId: "00000000-0000-4000-8000-000000000011", options: { challenge: "challenge" } }),
  completePasskeyLogin: async () => ({ sessionToken: "passkey-session-token" }),
  exchangeBindingClaimSession: async () => ({ contractVersion: "1" as const, status: "authenticated" as const, sessionToken: "claim-session-token" }),
  createCurrentPlayerPasskeyRegistrationOptions: async () => ({ contractVersion: "1", challengeId: "00000000-0000-4000-8000-000000000013", options: { challenge: "challenge" } }),
  completeCurrentPlayerPasskeyRegistration: async () => {},
  listCurrentPlayerPasskeys: async () => ({ contractVersion: "1", items: [], qqBound: false }),
  removeCurrentPlayerPasskey: async () => {},
  createAdminPasskeyRecovery: async () => ({ token: "r".repeat(64), expiresAt: 1_800_000_000_000 }),
  createPasskeyRecoveryOptions: async () => ({ contractVersion: "1", challengeId: "00000000-0000-4000-8000-000000000014", options: { challenge: "challenge" } }),
  completePasskeyRecoveryRegistration: async () => ({ sessionToken: "recovery-session-token" }),
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

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("API", () => {
  it("exposes platform player and map title grant Agents endpoints", async () => {
    const agentApp = createApp({ authenticate: auth, services: () => ({
      ...services,
      listAgentPlayerTitleGrants: async () => ({ contractVersion: "1" as const, items: [{ playerId: "1234", playerName: "Player", titleKeys: ["TITLE"], allTitles: false }], page: 1, pageSize: 20, total: 1, hasMore: false }),
      getAgentMap: async ({ mapId }) => mapId === "map.test" ? { mapId, mapName: "测试地图", gameVersion: "2026.07.15", difficultyRating: null, mechanics: [], coverUrl: null, backgroundUrl: null, gameplayRevisions: [] } : null,
      listAgentMapTitleHolders: async () => ({ contractVersion: "1" as const, items: [{ mapId: "map.test", gameplayRevisionId: "revision:map.test:initial", titleKey: "PIONEER", slot: "pioneer" as const, slotSemantics: "named" as const, playerId: "1234", playerName: "Player" }], page: 1, pageSize: 20, total: 1, hasMore: false }),
    }) });
    const players = await agentApp.request("http://localhost/v1/agents/player-title-grants?page=1&pageSize=20", {}, env);
    const holders = await agentApp.request("http://localhost/v1/agents/map-title-holders?mapId=map.test&page=1&pageSize=20", {}, env);
    expect(players.status).toBe(200);
    expect(holders.status).toBe(200);
    expect((await players.json() as { items: Array<{ playerId?: string; playerName: string }> }).items[0]).toEqual({ playerName: "Player", titleKeys: ["TITLE"], allTitles: false });
    expect((await holders.json() as { items: Array<{ playerId?: string; mapId: string; gameplayRevisionId: string; titleKey: string; slot: string; slotSemantics: string; playerName: string }> }).items[0]).toEqual({ mapId: "map.test", gameplayRevisionId: "revision:map.test:initial", titleKey: "PIONEER", slot: "pioneer", slotSemantics: "named", playerName: "Player" });
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

  it("fails closed when map title-holder projection is unavailable", async () => {
    const agentApp = createApp({ authenticate: auth, services: () => ({
      ...services,
      getAgentMap: async () => ({ mapId: "map.test", mapName: "测试地图", gameVersion: "2026.07.15", difficultyRating: null, mechanics: [], coverUrl: null, backgroundUrl: null, gameplayRevisions: [] }),
      listAgentMapTitleHolders: async () => { throw new Error("AGENT_MAP_TITLE_PROJECTION_UNAVAILABLE"); },
    }) });
    const response = await agentApp.request("http://localhost/v1/agents/map-title-holders?mapId=map.test&page=1&pageSize=20", {}, env);
    expect(response.status).toBe(503);
    expect(await response.json()).toMatchObject({ contractVersion: "1", error: { code: "AGENT_MAP_TITLE_PROJECTION_UNAVAILABLE" } });
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
    expect(response.headers.get("cache-control")).toBe("public, max-age=300, s-maxage=300");
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

  it("bypasses Cache API for filtered, credentialed, and admin requests", async () => {
    const cache = new FakeCache();
    vi.stubGlobal("caches", { default: cache });
    const cacheApp = createApp({ authenticate: async () => null, services: () => services });

    expect((await cacheApp.request("http://localhost/v1/events?category=%E5%A2%9E%E7%9B%8A", {}, env)).status).toBe(200);
    expect((await cacheApp.request("http://localhost/v1/agents/maps", { headers: { authorization: "Bearer build-token" } }, { ...env, BASTION_BUILD_TOKEN: "build-token" })).status).toBe(200);
    expect((await cacheApp.request("http://localhost/v1/admin/events", {}, env)).status).toBe(401);

    expect(cache.matchCalls).toBe(0);
    expect(cache.putCalls).toBe(0);
  });

  it("serves public catalog cache to signed-in players and anonymous requests", async () => {
    const cache = new FakeCache();
    vi.stubGlobal("caches", { default: cache });
    let mapCalls = 0;
    const cacheApp = createApp({
      authenticate: async () => null,
      services: () => ({
        ...services,
        listMaps: async () => {
          mapCalls += 1;
          return [{ mapId: "map.samoa", mapName: "萨摩亚", gameVersion: "2026.07.15", difficultyRating: "T3", mechanics: [], coverUrl: null, backgroundUrl: null }];
        },
      }),
    });
    const log = vi.spyOn(console, "log").mockImplementation(() => undefined);

    // 1. Signed-in player request (carries owb_session cookie)
    const first = await cacheApp.request(
      "http://localhost/v1/maps",
      { headers: { cookie: "owb_session=player-session-token", origin: "http://localhost:3000" } },
      { ...env, LOCAL_DEV_AUTH: "true" },
    );
    expect(first.status).toBe(200);
    expect(first.headers.get("cache-control")).toBe("public, max-age=300, s-maxage=300");
    expect(first.headers.get("set-cookie")).toBeNull();
    expect(mapCalls).toBe(1);

    // 2. Repeated signed-in player request (carries owb_session cookie) -> HIT without service operation
    const second = await cacheApp.request(
      "http://localhost/v1/maps",
      { headers: { cookie: "owb_session=player-session-token", origin: "http://localhost:3000" } },
      { ...env, LOCAL_DEV_AUTH: "true" },
    );
    expect(second.status).toBe(200);
    expect(second.headers.get("cache-control")).toBe("public, max-age=300, s-maxage=300");
    expect(second.headers.get("set-cookie")).toBeNull();
    expect(mapCalls).toBe(1);

    // 3. Anonymous request (no cookie) -> served unchanged from shared cache
    const third = await cacheApp.request(
      "http://localhost/v1/maps",
      { headers: { origin: "http://127.0.0.1:3000" } },
      { ...env, LOCAL_DEV_AUTH: "true" },
    );
    expect(third.status).toBe(200);
    expect(third.headers.get("cache-control")).toBe("public, max-age=300, s-maxage=300");
    expect(third.headers.get("set-cookie")).toBeNull();
    expect(await third.json()).toEqual(await first.json());
    expect(third.headers.get("access-control-allow-origin")).toBe("http://127.0.0.1:3000");
    expect(mapCalls).toBe(1);

    const cacheStatuses = log.mock.calls
      .map(([entry]) => JSON.parse(String(entry)) as Record<string, unknown>)
      .filter((entry) => entry.event === "public_cache")
      .map((entry) => entry.status);
    const serviceOps = log.mock.calls
      .map(([entry]) => JSON.parse(String(entry)) as Record<string, unknown>)
      .filter((entry) => entry.event === "service_operation_complete")
      .map((entry) => entry.operation);
    log.mockRestore();

    expect(cacheStatuses).toEqual(["MISS", "HIT", "HIT"]);
    expect(serviceOps).toEqual(["catalog_list_maps"]);
  });

  it("serves other allowlisted catalog routes from cache when carrying a player cookie", async () => {
    const cache = new FakeCache();
    vi.stubGlobal("caches", { default: cache });
    let mapChallengeCalls = 0;
    let achievementCalls = 0;
    let eventCalls = 0;
    let singleEventCalls = 0;
    const cacheApp = createApp({
      authenticate: async () => null,
      services: () => ({
        ...services,
        listChallenges: async (input) => {
          if (input?.family === "map") mapChallengeCalls += 1;
          if (input?.family === "achievement") achievementCalls += 1;
          return [];
        },
        listRandomEvents: async () => { eventCalls += 1; return [{ eventId: "event.test", name: "稳住", category: "增益", rarity: "R", description: "测试事件", durationSeconds: 60, cooldownSeconds: .32, weight: 1, gameVersion: "5.0", effectTags: [], effectAnnotations: [], releaseStatus: "implemented", archived: false, challenges: [] }]; },
        getRandomEvent: async () => { singleEventCalls += 1; return { eventId: "event.test", name: "稳住", category: "增益", rarity: "R", description: "测试事件", durationSeconds: 60, cooldownSeconds: .32, weight: 1, gameVersion: "5.0", effectTags: [], effectAnnotations: [], releaseStatus: "implemented", archived: false, challenges: [] }; },
      }),
    });

    const cookieHeader = { headers: { cookie: "owb_session=player-session" } };

    // /v1/challenges?family=map
    const mapChal1 = await cacheApp.request("http://localhost/v1/challenges?family=map", cookieHeader, env);
    const mapChal2 = await cacheApp.request("http://localhost/v1/challenges?family=map", cookieHeader, env);
    expect(mapChal1.headers.get("cache-control")).toBe("public, max-age=300, s-maxage=300");
    expect(mapChal2.headers.get("cache-control")).toBe("public, max-age=300, s-maxage=300");
    expect(mapChallengeCalls).toBe(1);

    // /v1/public/achievements
    const ach1 = await cacheApp.request("http://localhost/v1/public/achievements", cookieHeader, env);
    const ach2 = await cacheApp.request("http://localhost/v1/public/achievements", cookieHeader, env);
    expect(ach1.headers.get("cache-control")).toBe("public, max-age=300, s-maxage=300");
    expect(ach2.headers.get("cache-control")).toBe("public, max-age=300, s-maxage=300");
    expect(achievementCalls).toBe(1);

    // /v1/events
    const ev1 = await cacheApp.request("http://localhost/v1/events", cookieHeader, env);
    const ev2 = await cacheApp.request("http://localhost/v1/events", cookieHeader, env);
    expect(ev1.headers.get("cache-control")).toBe("public, max-age=300, s-maxage=300");
    expect(ev2.headers.get("cache-control")).toBe("public, max-age=300, s-maxage=300");
    expect(eventCalls).toBe(1);

    // /v1/events/event.test
    const sev1 = await cacheApp.request("http://localhost/v1/events/event.test", cookieHeader, env);
    const sev2 = await cacheApp.request("http://localhost/v1/events/event.test", cookieHeader, env);
    expect(sev1.headers.get("cache-control")).toBe("public, max-age=300, s-maxage=300");
    expect(sev2.headers.get("cache-control")).toBe("public, max-age=300, s-maxage=300");
    expect(singleEventCalls).toBe(1);
  });

  it("returns private, no-store for filtered variants, build-token requests, and identity-reading routes", async () => {
    const cache = new FakeCache();
    vi.stubGlobal("caches", { default: cache });
    const cacheApp = createApp({
      authenticate: async () => null,
      services: () => ({
        ...services,
        getCurrentPlayer: async ({ sessionToken }) => sessionToken === "player-session" ? {
          contractVersion: "1" as const,
          player: { playerId: "p1", playerName: "Player", isAdmin: false },
          recentSubmissions: [],
        } : null,
        listChallenges: async () => [],
        listTitles: async () => [],
      }),
    });

    const cookieHeader = { headers: { cookie: "owb_session=player-session" } };

    // Filtered / search variants
    const filteredEvent = await cacheApp.request("http://localhost/v1/events?category=%E5%A2%9E%E7%9B%8A", cookieHeader, env);
    expect(filteredEvent.headers.get("cache-control")).toBe("private, no-store");

    const filteredAgentsEvent = await cacheApp.request("http://localhost/v1/agents/events?page=1&pageSize=20&q=test", {}, env);
    expect(filteredAgentsEvent.headers.get("cache-control")).toBe("private, no-store");

    // Agents carrying build token
    const buildAgentsEvent = await cacheApp.request(
      "http://localhost/v1/agents/events?page=1&pageSize=20",
      { headers: { authorization: "Bearer build-token" } },
      { ...env, BASTION_BUILD_TOKEN: "build-token" },
    );
    expect(buildAgentsEvent.headers.get("cache-control")).toBe("private, no-store");
    expect(buildAgentsEvent.headers.get("vary")).toBe("Authorization");

    // Routes that read caller identity
    const challengesWithoutMap = await cacheApp.request("http://localhost/v1/challenges", cookieHeader, env);
    expect(challengesWithoutMap.headers.get("cache-control")).toBe("private, no-store");

    const achievementChallenges = await cacheApp.request("http://localhost/v1/challenges?family=achievement", cookieHeader, env);
    expect(achievementChallenges.headers.get("cache-control")).toBe("private, no-store");

    const titles = await cacheApp.request("http://localhost/v1/titles", cookieHeader, env);
    expect(titles.headers.get("cache-control")).toBe("private, no-store");

    const me = await cacheApp.request("http://localhost/v1/me", cookieHeader, env);
    expect(me.headers.get("cache-control")).toBe("private, no-store");

    const meTitles = await cacheApp.request("http://localhost/v1/me/titles", cookieHeader, env);
    expect(meTitles.headers.get("cache-control")).toBe("private, no-store");
  });

  it("enforces identity-independent bypass rules in withPublicCache", async () => {
    const cache = new FakeCache();
    vi.stubGlobal("caches", { default: cache });
    const log = vi.spyOn(console, "log").mockImplementation(() => undefined);

    const makeRequest = (headers: Record<string, string> = {}) =>
      new Request("http://localhost/v1/test", { method: "GET", headers });
    const cacheKey = new Request("http://localhost/v1/test", { method: "GET" });

    // 1. identityIndependent = false (default) + cookie -> BYPASS with private, no-store
    const nonIndependentResponse = await withPublicCache({
      request: makeRequest({ cookie: "owb_session=token" }),
      cacheKey,
      enabled: true,
      eligible: true,
      identityIndependent: false,
      operation: "test_identity_dependent",
      response: () => new Response(JSON.stringify({ ok: true }), { headers: { "content-type": "application/json", "cache-control": "public, max-age=300, s-maxage=300" } }),
    });
    expect(nonIndependentResponse.headers.get("cache-control")).toBe("private, no-store");

    // 2. identityIndependent = true + authorization -> BYPASS with private, no-store
    const authResponse = await withPublicCache({
      request: makeRequest({ authorization: "Bearer token" }),
      cacheKey,
      enabled: true,
      eligible: true,
      identityIndependent: true,
      operation: "test_auth_bypass",
      response: () => new Response(JSON.stringify({ ok: true }), { headers: { "content-type": "application/json", "cache-control": "public, max-age=300, s-maxage=300" } }),
    });
    expect(authResponse.headers.get("cache-control")).toBe("private, no-store");

    // 3. identityIndependent = true + cookie -> MISS then HIT, stripped set-cookie
    const firstHit = await withPublicCache({
      request: makeRequest({ cookie: "owb_session=token" }),
      cacheKey,
      enabled: true,
      eligible: true,
      identityIndependent: true,
      operation: "test_cookie_hit",
      response: () => new Response(JSON.stringify({ ok: true }), { headers: { "content-type": "application/json", "cache-control": "public, max-age=300, s-maxage=300", "set-cookie": "leak=bad" } }),
    });
    expect(firstHit.headers.get("cache-control")).toBe("public, max-age=300, s-maxage=300");

    const secondHit = await withPublicCache({
      request: makeRequest({ cookie: "owb_session=token" }),
      cacheKey,
      enabled: true,
      eligible: true,
      identityIndependent: true,
      operation: "test_cookie_hit",
      response: () => { throw new Error("should not be called on cache hit"); },
    });
    expect(secondHit.headers.get("cache-control")).toBe("public, max-age=300, s-maxage=300");
    expect(secondHit.headers.get("set-cookie")).toBeNull();

    const cacheStatuses = log.mock.calls
      .map(([entry]) => JSON.parse(String(entry)) as Record<string, unknown>)
      .filter((entry) => entry.event === "public_cache")
      .map((entry) => `${entry.operation}:${entry.status}`);
    log.mockRestore();

    expect(cacheStatuses).toEqual([
      "test_identity_dependent:BYPASS",
      "test_auth_bypass:BYPASS",
      "test_cookie_hit:MISS",
      "test_cookie_hit:HIT",
    ]);
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
    expect(publicResponse.headers.get("cache-control")).toBe("public, max-age=300, s-maxage=300");
    expect(publicResponse.headers.get("vary")).toBe("Authorization");
    expect(buildResponse.headers.get("cache-control")).toBe("private, no-store");
  });
  it("exposes the Agents event release-status contract across list, detail, and search", async () => {
    const listAgentEvents = vi.fn(async () => ({ contractVersion: "1" as const, items: [], page: 1, pageSize: 20, total: 0, hasMore: false }));
    const getAgentEvent = vi.fn(async () => null);
    const searchAgentContent = vi.fn(async () => ({ contractVersion: "1" as const, items: [], page: 1, pageSize: 20, total: 0, hasMore: false }));
    const statusApp = createApp({ authenticate: auth, services: () => ({ ...services, listAgentEvents, getAgentEvent, searchAgentContent }) });

    const devList = await statusApp.request("http://localhost/v1/agents/events?status=development", {}, env);
    expect(devList.status).toBe(200);
    expect(listAgentEvents).toHaveBeenCalledWith(expect.objectContaining({ status: "development" }));
    expect(devList.headers.get("cache-control")).toBe("private, no-store");

    await statusApp.request("http://localhost/v1/agents/events/event.dev?status=development", {}, env);
    expect(getAgentEvent).toHaveBeenCalledWith({ eventId: "event.dev", status: "development" });

    await statusApp.request("http://localhost/v1/agents/search?q=test&kind=event&status=development", {}, env);
    expect(searchAgentContent).toHaveBeenCalledWith(expect.objectContaining({ status: "development" }));

    for (const path of ["/v1/agents/events?status=bogus", "/v1/agents/events/event.dev?status=bogus", "/v1/agents/search?q=test&status=bogus"]) {
      const response = await statusApp.request(`http://localhost${path}`, {}, env);
      expect(response.status).toBe(422);
    }
  });
  it("requires a maintainer and an idempotency key for event imports", async () => {
    const request = { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ contractVersion: "1", fileName: "events.csv", csv: "名称" }) };
    expect((await app.request("http://localhost/v1/admin/events/imports", request, env)).status).toBe(403);
    const maintainerApp = createApp({ authenticate: async () => ({ actorType: "user" as const, subject: "admin", roles: ["maintainer"], provider: "test" }), services: () => services });
    expect((await maintainerApp.request("http://localhost/v1/admin/events/imports", request, env)).status).toBe(422);
  });
  it("lists and updates random-event version availability through maintainer routes", async () => {
    const calls: Array<{ gameVersion: string; availability: string; key: string }> = [];
    const maintainerApp = createApp({ authenticate: async () => ({ actorType: "user" as const, subject: "admin", roles: ["maintainer"], provider: "test" }), services: () => ({
      ...services,
      listAdminRandomEventVersions: async () => ({ contractVersion: "1" as const, items: [{ gameVersion: "26.0901.1", availability: "available" as const, eventCount: 2 }] }),
      updateAdminRandomEventVersion: async (input, _auth, key) => { calls.push({ gameVersion: input.gameVersion, availability: input.availability, key }); return { gameVersion: input.gameVersion, availability: input.availability, eventCount: 2 }; },
    }) });
    const listed = await maintainerApp.request("http://localhost/v1/admin/event-versions", {}, env);
    const updated = await maintainerApp.request("http://localhost/v1/admin/event-versions/26.0901.1/availability", { method: "PUT", headers: { "content-type": "application/json", "idempotency-key": "version-1" }, body: JSON.stringify({ contractVersion: "1", availability: "suspended" }) }, env);
    expect(listed.status).toBe(200);
    expect(updated.status).toBe(200);
    expect(calls).toEqual([{ gameVersion: "26.0901.1", availability: "suspended", key: "version-1" }]);
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

  it("exchanges an approved QQ claim for a Portal session", async () => {
    const response = await app.request("https://owbastion.com/v1/public/binding-claims/00000000-0000-0000-0000-000000000008/session", { method: "POST", headers: { "x-claim-token": "a".repeat(64) } }, env);
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ contractVersion: "1", status: "authenticated" });
    expect(response.headers.get("set-cookie")).toContain("owb_session");
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
    expect(await response.json()).toEqual({ contractVersion: "1", submissionId: "00000000-0000-0000-0000-000000000003", status: "processing", mapName: "Test Map", createdAt: 1, updatedAt: 1 });
  });

  it("creates and polls a browser login attempt", async () => {
    const create = await app.request("http://localhost/v1/auth/qq/login-attempt", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ contractVersion: "1", provider: "qq" }) }, env);
    expect(create.status).toBe(201);
    const payload = await create.json() as { attemptId: string; attemptToken: string };
    const status = await app.request(`http://localhost/v1/auth/qq/login-attempt/${payload.attemptId}`, { headers: { "x-login-attempt-token": payload.attemptToken } }, env);
    expect(status.status).toBe(200);
    expect(await status.json()).toMatchObject({ contractVersion: "1", status: "pending" });
  });

  it("creates a Passkey challenge only for the configured Portal origin", async () => {
    const originEnv = { ...env, PORTAL_ORIGIN: "https://owbastion.com" };
    const invalid = await app.request("https://api.owbastion.com/v1/auth/passkeys/login/options", { method: "POST", headers: { origin: "https://attacker.example", "content-type": "application/json" }, body: JSON.stringify({ contractVersion: "1" }) }, originEnv);
    expect(invalid.status).toBe(403);
    const response = await app.request("https://api.owbastion.com/v1/auth/passkeys/login/options", { method: "POST", headers: { origin: "https://owbastion.com", "content-type": "application/json" }, body: JSON.stringify({ contractVersion: "1" }) }, originEnv);
    expect(response.status).toBe(201);
    expect(await response.json()).toMatchObject({ challengeId: "00000000-0000-4000-8000-000000000011", options: { challenge: "challenge" } });
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

  it("sets a secure Portal session only after Passkey verification from the Portal origin", async () => {
    const completed: Array<{ challengeId: string; origin: string; rpId: string }> = [];
    const verifiedApp = createApp({
      authenticate: auth,
      services: () => ({ ...services, completePasskeyLogin: async (input) => { completed.push({ challengeId: input.challengeId, origin: input.origin, rpId: input.rpId }); return { sessionToken: "a".repeat(64) }; } }),
    });
    const body = JSON.stringify({ contractVersion: "1", challengeId: "00000000-0000-4000-8000-000000000011", credential: { id: "credential" } });
    const denied = await verifiedApp.request("https://api.owbastion.com/v1/auth/passkeys/login/verify", { method: "POST", headers: { origin: "https://attacker.example", "content-type": "application/json" }, body }, { ...env, PORTAL_ORIGIN: "https://owbastion.com" });
    expect(denied.status).toBe(403);
    expect(completed).toEqual([]);
    const response = await verifiedApp.request("https://api.owbastion.com/v1/auth/passkeys/login/verify", { method: "POST", headers: { origin: "https://owbastion.com", "content-type": "application/json" }, body }, { ...env, PORTAL_ORIGIN: "https://owbastion.com" });
    expect(response.headers.get("set-cookie")).toContain("Secure");
    expect(response.headers.get("access-control-allow-origin")).toBe("https://owbastion.com");
    expect(completed).toEqual([{ challengeId: "00000000-0000-4000-8000-000000000011", origin: "https://owbastion.com", rpId: "owbastion.com" }]);
  });

  it("restricts assisted Passkey recovery to maintainers with explicit identity verification", async () => {
    const issued: Array<{ input: unknown; auth: unknown; idempotencyKey: string }> = [];
    const adminApp = createApp({
      authenticate: async () => ({ actorType: "user" as const, subject: "admin.1", roles: ["maintainer"], provider: "test" }),
      services: () => ({ ...services, createAdminPasskeyRecovery: async (input, auth, idempotencyKey) => {
        issued.push({ input, auth, idempotencyKey });
        return { token: "r".repeat(64), expiresAt: 1_800_000_000_000 };
      } }),
    });
    const path = "https://api.owbastion.com/v1/admin/player-accounts/player.1/passkey-recovery";
    const headers = { origin: "https://owbastion.com", "content-type": "application/json", "idempotency-key": "recovery.1" };
    const unprivileged = await app.request(path, { method: "POST", headers, body: JSON.stringify({ contractVersion: "1", identityVerified: true }) }, { ...env, PORTAL_ORIGIN: "https://owbastion.com" });
    expect(unprivileged.status).toBe(403);
    const unverified = await adminApp.request(path, { method: "POST", headers, body: JSON.stringify({ contractVersion: "1", identityVerified: false }) }, { ...env, PORTAL_ORIGIN: "https://owbastion.com" });
    expect(unverified.status).toBe(422);
    const wrongOrigin = await adminApp.request(path, { method: "POST", headers: { ...headers, origin: "https://attacker.example" }, body: JSON.stringify({ contractVersion: "1", identityVerified: true }) }, { ...env, PORTAL_ORIGIN: "https://owbastion.com" });
    expect(wrongOrigin.status).toBe(403);
    const response = await adminApp.request(path, { method: "POST", headers, body: JSON.stringify({ contractVersion: "1", identityVerified: true }) }, { ...env, PORTAL_ORIGIN: "https://owbastion.com" });
    expect(response.status).toBe(201);
    expect(await response.json()).toEqual({ contractVersion: "1", recoveryUrl: `https://owbastion.com/recover#token=${"r".repeat(64)}`, expiresAt: 1_800_000_000_000 });
    expect(issued).toEqual([{ input: { contractVersion: "1", identityVerified: true, playerAccountId: "player.1" }, auth: { actorType: "user", subject: "admin.1", roles: ["maintainer"], provider: "test" }, idempotencyKey: "recovery.1" }]);
  });

  it("requires a valid portal session and returns only player-facing fields", async () => {
    const unauthenticated = await app.request("http://localhost/v1/me", {}, env);
    expect(unauthenticated.status).toBe(401);

    const response = await app.request("http://localhost/v1/me", { headers: { cookie: "owb_session=session-token" } }, env);
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      contractVersion: "1",
      player: { playerId: "1234", playerName: "Player", isAdmin: false },
      recentSubmissions: [{ submissionId: "00000000-0000-0000-0000-000000000003", status: "processing", mapName: "Test Map", createdAt: 2, updatedAt: 3 }],
    });
  });

  it("returns only the signed-in player's active mastery projections", async () => {
    const calls: Array<{ sessionToken: string; mapId?: string; gameplayRevisionId?: string; page: number; pageSize: number }> = [];
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
              gameplayRevisionId: "revision:map.test:initial",
              gameplayRevisionLifecycle: "default" as const,
              totalXp: 225,
              verifiedRunCount: 1,
              difficultyStats: [{ difficulty: "困难" as const, verifiedRunCount: 1, fastestCompletionSeconds: 600 }],
              lowestDeaths: 2,
              fewestSkips: 1,
              highestSingleRunXp: 225,
              highestCompletedDifficulty: "困难" as const,
              recentRuns: [{ runId: "00000000-0000-4000-8000-000000000010", mapId: "map.test", gameplayRevisionId: "revision:map.test:initial", gameplayRevisionLifecycle: "default" as const, mapVariant: null, difficulty: "困难" as const, completionDurationSeconds: 600, deaths: 2, skips: 1, awardedXp: 225, acceptedAt: 1_000, status: "active" as const }],
            }],
            runs: [{ runId: "00000000-0000-4000-8000-000000000010", mapId: "map.test", gameplayRevisionId: "revision:map.test:initial", gameplayRevisionLifecycle: "default" as const, mapVariant: null, difficulty: "困难" as const, completionDurationSeconds: 600, deaths: 2, skips: 1, awardedXp: 225, acceptedAt: 1_000, status: "active" as const }],
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
    expect(JSON.stringify(body)).not.toMatch(/playerAccountId|sourceSubmissionId|matchCode|gameVersion|eventCounters|acceptanceSource|xpInputSnapshot|invalidation|evidence|audit|memberOpenId|groupOpenId/);
    const selectable = await masteryApp.request("http://localhost/v1/me/mastery?mapId=map.test&gameplayRevisionId=revision%3Amap.test%3Ainitial", { headers: { cookie: "owb_session=session-token" } }, env);
    expect(selectable.status).toBe(200);
    expect(calls).toEqual([
      { sessionToken: "session-token", mapId: "map.test", page: 1, pageSize: 1 },
      { sessionToken: "session-token", mapId: "map.test", gameplayRevisionId: "revision:map.test:initial", page: 1, pageSize: 20 },
    ]);
    expect((await masteryApp.request("http://localhost/v1/me/mastery?mapId=map.test&mapId=map.other", { headers: { cookie: "owb_session=session-token" } }, env)).status).toBe(422);
    expect((await masteryApp.request("http://localhost/v1/me/mastery?gameplayRevisionId=one&gameplayRevisionId=two", { headers: { cookie: "owb_session=session-token" } }, env)).status).toBe(422);
  });

  it("returns only the signed-in player's active title grants", async () => {
    expect((await app.request("http://localhost/v1/me/titles", {}, env)).status).toBe(401);
    const response = await app.request("http://localhost/v1/me/titles", { headers: { cookie: "owb_session=session-token" } }, env);
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(await response.json()).toMatchObject({ contractVersion: "1", items: [{ titleKey: "PIONEER", mapName: "萨摩亚", condition: "完成萨摩亚地狱难度。" }] });
  });

  it("requires a Portal session before replacing equipped titles", async () => {
    const response = await app.request("http://localhost/v1/me/titles/equipped", { method: "PUT", headers: { "content-type": "application/json", "idempotency-key": "equip-auth" }, body: JSON.stringify({ grantIds: [] }) }, env);
    expect(response.status).toBe(401);
  });

  it("reads and writes only the signed-in player's current review", async () => {
    const calls: Array<{ operation: string; subject?: string; target?: unknown; key?: string }> = [];
    let currentStatus: "active" | "withdrawn" = "active";
    const review = {
      reviewId: "00000000-0000-4000-8000-000000000003",
      playerAccountId: "11111111-1111-4111-8111-111111111111",
      targetType: "map" as const,
      targetId: "map.test",
      gameplayRevisionId: "revision:map.test:initial",
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

    expect((await reviewApp.request("http://localhost/v1/me/reviews/map/map.test?gameplayRevisionId=revision%3Amap.test%3Ainitial", {}, env)).status).toBe(401);
    const read = await reviewApp.request("http://localhost/v1/me/reviews/map/map.test?gameplayRevisionId=revision%3Amap.test%3Ainitial", { headers: { cookie: "owb_session=session-token" } }, env);
    expect(read.status).toBe(200);
    const readBody = await read.json() as Record<string, unknown>;
    expect(readBody).toEqual({ contractVersion: "1", review: { reviewId: review.reviewId, targetType: "map", targetId: "map.test", gameplayRevisionId: "revision:map.test:initial", rating: 4, comment: "很好", anonymous: true, createdAt: 1, updatedAt: 2 } });
    playerReviewResponseSchema.parse(readBody);
    expect(JSON.stringify(readBody)).not.toContain("playerAccountId");
    expect(JSON.stringify(readBody)).not.toMatch(/commentStatus|invalidatedBy|invalidationReason|status/);

    const missingKey = await reviewApp.request("http://localhost/v1/me/reviews/map/map.test?gameplayRevisionId=revision%3Amap.test%3Ainitial", { method: "PUT", headers: { "content-type": "application/json", cookie: "owb_session=session-token" }, body: JSON.stringify({ contractVersion: "1", rating: 4 }) }, env);
    expect(missingKey.status).toBe(422);
    const unscopedWrite = await reviewApp.request("http://localhost/v1/me/reviews/map/map.test", { method: "PUT", headers: { "content-type": "application/json", cookie: "owb_session=session-token", "idempotency-key": "review-unscoped" }, body: JSON.stringify({ contractVersion: "1", rating: 4 }) }, env);
    expect(unscopedWrite.status).toBe(422);
    const write = await reviewApp.request("http://localhost/v1/me/reviews/map/map.test?gameplayRevisionId=revision%3Amap.test%3Ainitial", { method: "PUT", headers: { "content-type": "application/json", cookie: "owb_session=session-token", "idempotency-key": "review-1" }, body: JSON.stringify({ contractVersion: "1", rating: 4, comment: "很好", anonymous: true }) }, env);
    expect(write.status).toBe(200);
    expect(await write.json()).toEqual({ contractVersion: "1", review: { reviewId: review.reviewId, targetType: "map", targetId: "map.test", gameplayRevisionId: "revision:map.test:initial", rating: 4, comment: "很好", anonymous: true, createdAt: 1, updatedAt: 2 } });
    const withdraw = await reviewApp.request(`http://localhost/v1/me/reviews/${review.reviewId}/withdraw`, { method: "POST", headers: { "content-type": "application/json", cookie: "owb_session=session-token", "idempotency-key": "review-withdraw-1" }, body: JSON.stringify({ contractVersion: "1" }) }, env);
    expect(withdraw.status).toBe(200);
    expect(await withdraw.json()).toEqual({ contractVersion: "1", review: null });
    const afterWithdraw = await reviewApp.request("http://localhost/v1/me/reviews/map/map.test?gameplayRevisionId=revision%3Amap.test%3Ainitial", { headers: { cookie: "owb_session=session-token" } }, env);
    expect(await afterWithdraw.json()).toEqual({ contractVersion: "1", review: null });
    expect(calls).toEqual([
      { operation: "read", subject: "1234", target: { targetType: "map", targetId: "map.test", gameplayRevisionId: "revision:map.test:initial" } },
      { operation: "upsert", subject: "1234", target: { targetType: "map", targetId: "map.test", gameplayRevisionId: "revision:map.test:initial", rating: 4, comment: "很好", anonymous: true }, key: "review-1" },
      { operation: "withdraw", subject: "1234", target: { reviewId: review.reviewId }, key: "review-withdraw-1" },
      { operation: "read", subject: "1234", target: { targetType: "map", targetId: "map.test", gameplayRevisionId: "revision:map.test:initial" } },
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
    const conflict = await conflictApp.request("http://localhost/v1/me/reviews/map/map.test?gameplayRevisionId=revision%3Amap.test%3Ainitial", { method: "PUT", headers: { "content-type": "application/json", cookie: "owb_session=session-token", "idempotency-key": "review-5" }, body: JSON.stringify({ contractVersion: "1", rating: 3 }) }, env);
    expect(conflict.status).toBe(409);
    expect((await conflict.json() as { error: { code: string } }).error.code).toBe("IDEMPOTENCY_CONFLICT");

    const invalid = await app.request("http://localhost/v1/me/reviews/map/map.test", { method: "PUT", headers: { "content-type": "application/json", cookie: "owb_session=session-token", "idempotency-key": "review-4" }, body: JSON.stringify({ contractVersion: "1", rating: 6 }) }, env);
    expect(invalid.status).toBe(422);
    const invalidTarget = await app.request("http://localhost/v1/me/reviews/not-a-target/map.test", { headers: { cookie: "owb_session=session-token" } }, env);
    expect(invalidTarget.status).toBe(422);
  });

  it("records a player OCR accuracy mark with an idempotency key and contract validation", async () => {
    const calls: Array<{ input: unknown; key: string; sessionToken: string }> = [];
    const feedbackApp = createApp({
      authenticate: auth,
      services: () => ({
        ...services,
        submitPlayerOcrFeedback: async (input, sessionToken, key) => {
          calls.push({ input, key, sessionToken });
          return { contractVersion: "1" as const, submissionId: input.submissionId, ocrResultId: input.ocrResultId, accuracy: input.accuracy, alreadySubmitted: false };
        },
      }),
    });

    const unauth = await feedbackApp.request("http://localhost/v1/me/submissions/00000000-0000-4000-8000-000000000003/ocr-feedback", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ contractVersion: "1", ocrResultId: "00000000-0000-4000-8000-000000000004", accuracy: "accurate" }) }, env);
    expect(unauth.status).toBe(401);

    const missingKey = await feedbackApp.request("http://localhost/v1/me/submissions/00000000-0000-4000-8000-000000000003/ocr-feedback", { method: "POST", headers: { "content-type": "application/json", cookie: "owb_session=session-token" }, body: JSON.stringify({ contractVersion: "1", ocrResultId: "00000000-0000-4000-8000-000000000004", accuracy: "accurate" }) }, env);
    expect(missingKey.status).toBe(422);

    const submitted = await feedbackApp.request("http://localhost/v1/me/submissions/00000000-0000-4000-8000-000000000003/ocr-feedback", { method: "POST", headers: { "content-type": "application/json", cookie: "owb_session=session-token", "idempotency-key": "feedback-1" }, body: JSON.stringify({ contractVersion: "1", ocrResultId: "00000000-0000-4000-8000-000000000004", accuracy: "inaccurate" }) }, env);
    expect(submitted.status).toBe(200);
    expect(await submitted.json()).toEqual({ contractVersion: "1", submissionId: "00000000-0000-4000-8000-000000000003", ocrResultId: "00000000-0000-4000-8000-000000000004", accuracy: "inaccurate", alreadySubmitted: false });
    expect(calls).toEqual([{ input: { contractVersion: "1", ocrResultId: "00000000-0000-4000-8000-000000000004", accuracy: "inaccurate", submissionId: "00000000-0000-4000-8000-000000000003" }, key: "feedback-1", sessionToken: "session-token" }]);

    // Transcription payloads and out-of-enum marks are rejected at the contract boundary.
    const transcription = await feedbackApp.request("http://localhost/v1/me/submissions/00000000-0000-4000-8000-000000000003/ocr-feedback", { method: "POST", headers: { "content-type": "application/json", cookie: "owb_session=session-token", "idempotency-key": "feedback-2" }, body: JSON.stringify({ contractVersion: "1", ocrResultId: "00000000-0000-4000-8000-000000000004", items: [{ fieldKey: "difficulty", action: "corrected", proposedValue: "一般" }] }) }, env);
    expect(transcription.status).toBe(422);
    const invalidMark = await feedbackApp.request("http://localhost/v1/me/submissions/00000000-0000-4000-8000-000000000003/ocr-feedback", { method: "POST", headers: { "content-type": "application/json", cookie: "owb_session=session-token", "idempotency-key": "feedback-3" }, body: JSON.stringify({ contractVersion: "1", ocrResultId: "00000000-0000-4000-8000-000000000004", accuracy: "wrong" }) }, env);
    expect(invalidMark.status).toBe(422);

    // Actionable service errors map to explicit HTTP states.
    const staleApp = createApp({ authenticate: auth, services: () => ({ ...services, submitPlayerOcrFeedback: async () => { throw new Error("OCR_PROMPT_STALE"); } }) });
    const stale = await staleApp.request("http://localhost/v1/me/submissions/00000000-0000-4000-8000-000000000003/ocr-feedback", { method: "POST", headers: { "content-type": "application/json", cookie: "owb_session=session-token", "idempotency-key": "feedback-4" }, body: JSON.stringify({ contractVersion: "1", ocrResultId: "00000000-0000-4000-8000-000000000004", accuracy: "accurate" }) }, env);
    expect(stale.status).toBe(409);
    expect((await stale.json() as { error: { code: string } }).error.code).toBe("OCR_PROMPT_STALE");

    const noResultApp = createApp({ authenticate: auth, services: () => ({ ...services, submitPlayerOcrFeedback: async () => { throw new Error("OCR_RESULT_NOT_FOUND"); } }) });
    const noResult = await noResultApp.request("http://localhost/v1/me/submissions/00000000-0000-4000-8000-000000000003/ocr-feedback", { method: "POST", headers: { "content-type": "application/json", cookie: "owb_session=session-token", "idempotency-key": "feedback-5" }, body: JSON.stringify({ contractVersion: "1", ocrResultId: "00000000-0000-4000-8000-000000000004", accuracy: "accurate" }) }, env);
    expect(noResult.status).toBe(409);
    expect((await noResult.json() as { error: { code: string } }).error.code).toBe("OCR_RESULT_NOT_FOUND");
  });

  it("lets maintainers mark screenshot OCR accuracy with an idempotency key", async () => {
    const calls: Array<{ input: unknown; key: string }> = [];
    const accuracyApp = createApp({
      authenticate: async () => ({ actorType: "user" as const, subject: "admin", roles: ["maintainer"], provider: "test" }),
      services: () => ({
        ...services,
        submitAdminOcrAccuracy: async (input, _auth, key) => {
          calls.push({ input, key });
          return { contractVersion: "1" as const, submissionId: input.submissionId, ocrResultId: input.ocrResultId, accuracy: input.accuracy, alreadySubmitted: false };
        },
      }),
    });

    // Maintainer-only: the shared mark must not be writable by players or anonymous callers.
    expect((await app.request("http://localhost/v1/admin/submissions/00000000-0000-4000-8000-000000000003/ocr-accuracy", { method: "POST", headers: { "content-type": "application/json", "idempotency-key": "acc-0" }, body: JSON.stringify({ contractVersion: "1", ocrResultId: "00000000-0000-4000-8000-000000000004", accuracy: "accurate" }) }, env)).status).toBe(403);
    const unauthenticated = createApp({ authenticate: async () => null, services: () => services });
    expect((await unauthenticated.request("http://localhost/v1/admin/submissions/00000000-0000-4000-8000-000000000003/ocr-accuracy", { method: "POST", headers: { "content-type": "application/json", "idempotency-key": "acc-0" }, body: JSON.stringify({ contractVersion: "1", ocrResultId: "00000000-0000-4000-8000-000000000004", accuracy: "accurate" }) }, env)).status).toBe(401);

    const missingKey = await accuracyApp.request("http://localhost/v1/admin/submissions/00000000-0000-4000-8000-000000000003/ocr-accuracy", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ contractVersion: "1", ocrResultId: "00000000-0000-4000-8000-000000000004", accuracy: "accurate" }) }, env);
    expect(missingKey.status).toBe(422);

    const marked = await accuracyApp.request("http://localhost/v1/admin/submissions/00000000-0000-4000-8000-000000000003/ocr-accuracy", { method: "POST", headers: { "content-type": "application/json", "idempotency-key": "acc-1" }, body: JSON.stringify({ contractVersion: "1", ocrResultId: "00000000-0000-4000-8000-000000000004", accuracy: "inaccurate" }) }, env);
    expect(marked.status).toBe(200);
    expect(await marked.json()).toEqual({ contractVersion: "1", submissionId: "00000000-0000-4000-8000-000000000003", ocrResultId: "00000000-0000-4000-8000-000000000004", accuracy: "inaccurate", alreadySubmitted: false });
    expect(calls).toEqual([{ input: { contractVersion: "1", ocrResultId: "00000000-0000-4000-8000-000000000004", accuracy: "inaccurate", submissionId: "00000000-0000-4000-8000-000000000003" }, key: "acc-1" }]);

    const invalidMark = await accuracyApp.request("http://localhost/v1/admin/submissions/00000000-0000-4000-8000-000000000003/ocr-accuracy", { method: "POST", headers: { "content-type": "application/json", "idempotency-key": "acc-2" }, body: JSON.stringify({ contractVersion: "1", ocrResultId: "00000000-0000-4000-8000-000000000004", accuracy: "confirmed" }) }, env);
    expect(invalidMark.status).toBe(422);

    const staleApp = createApp({ authenticate: async () => ({ actorType: "user" as const, subject: "admin", roles: ["maintainer"], provider: "test" }), services: () => ({ ...services, submitAdminOcrAccuracy: async () => { throw new Error("OCR_PROMPT_STALE"); } }) });
    const stale = await staleApp.request("http://localhost/v1/admin/submissions/00000000-0000-4000-8000-000000000003/ocr-accuracy", { method: "POST", headers: { "content-type": "application/json", "idempotency-key": "acc-3" }, body: JSON.stringify({ contractVersion: "1", ocrResultId: "00000000-0000-4000-8000-000000000004", accuracy: "accurate" }) }, env);
    expect(stale.status).toBe(409);
    expect((await stale.json() as { error: { code: string } }).error.code).toBe("OCR_PROMPT_STALE");

    const noResultApp = createApp({ authenticate: async () => ({ actorType: "user" as const, subject: "admin", roles: ["maintainer"], provider: "test" }), services: () => ({ ...services, submitAdminOcrAccuracy: async () => { throw new Error("OCR_RESULT_NOT_FOUND"); } }) });
    const noResult = await noResultApp.request("http://localhost/v1/admin/submissions/00000000-0000-4000-8000-000000000003/ocr-accuracy", { method: "POST", headers: { "content-type": "application/json", "idempotency-key": "acc-4" }, body: JSON.stringify({ contractVersion: "1", ocrResultId: "00000000-0000-4000-8000-000000000004", accuracy: "accurate" }) }, env);
    expect(noResult.status).toBe(409);
    expect((await noResult.json() as { error: { code: string } }).error.code).toBe("OCR_RESULT_NOT_FOUND");
  });

  it("no longer exposes annotation review, dataset, or OCRKit snapshot routes", async () => {
    const maintainerApp = createApp({
      authenticate: async () => ({ actorType: "user" as const, subject: "admin", roles: ["maintainer"], provider: "test" }),
      services: () => services,
    });
    const removed = [
      ["GET", "/v1/admin/annotations/proposals"],
      ["GET", "/v1/admin/annotations/proposals/00000000-0000-4000-8000-000000000005"],
      ["POST", "/v1/admin/annotations/proposals/00000000-0000-4000-8000-000000000005/decision"],
      ["POST", "/v1/admin/annotations/direct"],
      ["GET", "/v1/admin/annotations/reviewed"],
      ["GET", "/v1/admin/datasets"],
      ["POST", "/v1/admin/datasets"],
      ["GET", "/v1/admin/datasets/candidates"],
      ["GET", "/v1/admin/datasets/00000000-0000-4000-8000-000000000007"],
      ["POST", "/v1/admin/datasets/00000000-0000-4000-8000-000000000007/finalize"],
      ["GET", "/v1/ocrkit/datasets/1"],
      ["GET", "/v1/ocrkit/datasets/1/evidence/00000000-0000-4000-8000-000000000006"],
    ] as const;
    for (const [method, path] of removed) {
      const response = await maintainerApp.request(`http://localhost${path}`, { method, headers: { "content-type": "application/json", "idempotency-key": "removed-1", authorization: "Bearer whatever" }, ...(method === "POST" ? { body: "{}" } : {}) }, env);
      expect(response.status, `${method} ${path}`).toBe(404);
    }
  });

  it("limits review identity and moderation operations to maintainers", async () => {
    const reviewId = "00000000-0000-4000-8000-000000000003";
    const adminReview = { reviewId, targetType: "map" as const, targetId: "map.test", gameplayRevisionId: "revision:map.test:initial", targetName: "测试地图", playerAccountId: "11111111-1111-4111-8111-111111111111", playerId: "1234", playerName: "Player", rating: 4 as const, comment: "很好", anonymous: true, commentStatus: "visible" as const, status: "active" as const, createdAt: 1, updatedAt: 2, withdrawnAt: null, invalidatedAt: null, invalidatedBy: null, invalidationReason: null };
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
    const verifiedRunId = "00000000-0000-4000-8000-000000000013";
    const conflictSubmissionId = "00000000-0000-4000-8000-000000000014";
    const run = {
      runId: verifiedRunId,
      playerAccountId: "00000000-0000-4000-8000-000000000011",
      playerId: "1234",
      playerName: "Player",
      sourceSubmissionId: "00000000-0000-4000-8000-000000000012",
      mapId: "map.test",
      mapName: "测试地图",
      gameplayRevisionId: "revision:map.test:initial",
      gameplayRevisionLifecycle: "default" as const,
      mapVariant: null,
      difficulty: "困难" as const,
      gameVersion: "26.0810.1",
      matchCode: "1234-5678-9012",
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
    const projection = { mapId: "map.test", gameplayRevisionId: "revision:map.test:initial", totalXp: 236, verifiedRunCount: 1, difficultyStats: [{ difficulty: "困难" as const, verifiedRunCount: 1, fastestCompletionSeconds: 600 }], lowestDeaths: 1, fewestSkips: 0, highestSingleRunXp: 236, highestCompletedDifficulty: "困难" as const };
    const calls: Array<{ operation: string; input: unknown; key?: string }> = [];
    const masteryApp = createApp({
      authenticate: async () => ({ actorType: "user" as const, subject: "admin", roles: ["maintainer"], provider: "test" }),
      services: () => ({
        ...services,
        listAdminVerifiedRuns: async (input) => {
          calls.push({ operation: "list", input });
          return { contractVersion: "1" as const, items: [run], page: input.page, pageSize: input.pageSize, total: 1, hasMore: false };
        },
        getAdminVerifiedRun: async () => ({ contractVersion: "1" as const, run, projection, sourceSubmission: {} as never, lifecycle: [{ transition: "accepted" as const, actorType: "service" as const, actorId: "submission_review", reason: null, createdAt: 1 }], corrections: [], conflicts: [{ submissionId: conflictSubmissionId, submissionStatus: "ocr_review_required" as const, playerAccountId: run.playerAccountId, playerName: run.playerName, conflictFields: ["difficulty" as const], facts: { mapName: "测试地图", mapVariant: null, difficulty: "传奇" as const, gameVersion: "26.0810.1", matchCode: "1234-5678-9012", completionDurationSeconds: 600, deaths: 1, skips: 0 }, resolution: null }] }),
        transitionAdminVerifiedRun: async (input, _auth, key) => {
          calls.push({ operation: "state", input, key });
          return { contractVersion: "1" as const, run, projection };
        },
        resolveAdminVerifiedRunConflict: async (input, _auth, key) => {
          calls.push({ operation: "conflict", input, key });
          return { contractVersion: "1" as const, action: input.action, run, projection };
        },
        correctAdminVerifiedRun: async (input, _auth, key) => {
          calls.push({ operation: "correct", input, key });
          return { contractVersion: "1" as const, detail: { contractVersion: "1" as const, run, projection, sourceSubmission: {} as never, lifecycle: [], corrections: [], conflicts: [] }, affectedProjections: [projection] };
        },
      }),
    });
    const unauthenticated = createApp({ authenticate: async () => null, services: () => services });
    expect((await unauthenticated.request("http://localhost/v1/admin/verified-runs", {}, env)).status).toBe(401);
    expect((await app.request("http://localhost/v1/admin/verified-runs", {}, env)).status).toBe(403);

    const list = await masteryApp.request("http://localhost/v1/admin/verified-runs?playerAccountId=00000000-0000-4000-8000-000000000011&mapId=map.test&gameplayRevisionId=revision%3Amap.test%3Ainitial&difficulty=%E5%9B%B0%E9%9A%BE&status=active&unresolvedConflictsOnly=true&acceptanceSource=submission_review&matchCode=1234-5678-9012&from=1&to=2&page=2&pageSize=10", {}, env);
    expect(list.status).toBe(200);
    expect(list.headers.get("cache-control")).toBe("private, no-store");
    expect(await list.json()).toMatchObject({ items: [{ matchCode: "1234-5678-9012", playerAccountId: run.playerAccountId }], page: 2, pageSize: 10 });
    expect(calls[0]).toEqual({ operation: "list", input: { playerAccountId: run.playerAccountId, mapId: "map.test", gameplayRevisionId: "revision:map.test:initial", difficulty: "困难", status: "active", unresolvedConflictsOnly: true, acceptanceSource: "submission_review", matchCode: "1234-5678-9012", from: 1, to: 2, page: 2, pageSize: 10 } });
    expect((await masteryApp.request("http://localhost/v1/admin/verified-runs?status=unknown", {}, env)).status).toBe(422);
    expect((await masteryApp.request("http://localhost/v1/admin/verified-runs?unresolvedConflictsOnly=false", {}, env)).status).toBe(422);

    const detail = await masteryApp.request(`http://localhost/v1/admin/verified-runs/${verifiedRunId}`, {}, env);
    expect(detail.status).toBe(200);
    expect(await detail.json()).toMatchObject({ run: { matchCode: "1234-5678-9012" }, conflicts: [{ submissionId: conflictSubmissionId, conflictFields: ["difficulty"] }] });
    expect((await masteryApp.request("http://localhost/v1/admin/verified-runs/not-a-uuid", {}, env)).status).toBe(422);

    expect((await masteryApp.request(`http://localhost/v1/admin/verified-runs/${verifiedRunId}/state`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ contractVersion: "1", action: "invalidate" }) }, env)).status).toBe(422);
    const state = await masteryApp.request(`http://localhost/v1/admin/verified-runs/${verifiedRunId}/state`, { method: "POST", headers: { "content-type": "application/json", "idempotency-key": "mastery-state-1" }, body: JSON.stringify({ contractVersion: "1", action: "invalidate", reason: "证据不一致" }) }, env);
    expect(state.status).toBe(200);
    expect(calls).toContainEqual({ operation: "state", input: { verifiedRunId, action: "invalidate", reason: "证据不一致", contractVersion: "1" }, key: "mastery-state-1" });

    const conflict = await masteryApp.request(`http://localhost/v1/admin/verified-runs/${verifiedRunId}/conflicts/${conflictSubmissionId}`, { method: "POST", headers: { "content-type": "application/json", "idempotency-key": "mastery-conflict-1" }, body: JSON.stringify({ contractVersion: "1", action: "invalidate_existing", reason: "以修正截图为准" }) }, env);
    expect(conflict.status).toBe(200);
    expect(calls).toContainEqual({ operation: "conflict", input: { verifiedRunId, submissionId: conflictSubmissionId, action: "invalidate_existing", reason: "以修正截图为准", contractVersion: "1" }, key: "mastery-conflict-1" });

    const correctionUrl = `http://localhost/v1/admin/verified-runs/${verifiedRunId}/corrections`;
    expect((await masteryApp.request(correctionUrl, { method: "POST", headers: { "content-type": "application/json", "idempotency-key": "verified-run-correction-invalid" }, body: JSON.stringify({ contractVersion: "1", changes: { mapId: "map.test" }, reason: "来自来源截图" }) }, env)).status).toBe(422);
    const correction = await masteryApp.request(correctionUrl, { method: "POST", headers: { "content-type": "application/json", "idempotency-key": "verified-run-correction-1" }, body: JSON.stringify({ contractVersion: "1", changes: { difficulty: "传奇", deaths: 0 } }) }, env);
    expect(correction.status).toBe(200);
    expect(calls).toContainEqual({ operation: "correct", input: { verifiedRunId, contractVersion: "1", changes: { difficulty: "传奇", deaths: 0 } }, key: "verified-run-correction-1" });
  });

  it("serves privacy-safe public review summaries and comments", async () => {
    const calls: Array<{ operation: string; input: unknown }> = [];
    const publicApp = createApp({
      authenticate: auth,
      services: () => ({
        ...services,
        getReviewSummary: async (input) => {
          calls.push({ operation: "summary", input });
          return { targetType: input.targetType, targetId: input.targetId, gameplayRevisionId: input.targetType === "map" ? input.gameplayRevisionId : null, averageRating: null, reviewCount: 0, ratingDistribution: { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 }, sampleInsufficient: true };
        },
        getReviewSummaries: async (input) => {
          calls.push({ operation: "batch", input });
          return input.targetType === "map"
            ? input.targets.map(({ targetId, gameplayRevisionId }) => ({ targetType: "map" as const, targetId, gameplayRevisionId, averageRating: 4, reviewCount: 3, ratingDistribution: { 1: 0, 2: 0, 3: 0, 4: 1, 5: 2 }, sampleInsufficient: false }))
            : input.targetIds.map((targetId) => ({ targetType: "event" as const, targetId, gameplayRevisionId: null, averageRating: 4, reviewCount: 3, ratingDistribution: { 1: 0, 2: 0, 3: 0, 4: 1, 5: 2 }, sampleInsufficient: false }));
        },
        listPublicReviewComments: async (input) => {
          calls.push({ operation: "comments", input });
          return { ...input, gameplayRevisionId: input.targetType === "map" ? input.gameplayRevisionId : null, items: [{ rating: 5 as const, comment: "很好", author: null, createdAt: 3 }, { rating: 4 as const, comment: "稳定", author: { displayName: "公开玩家" }, createdAt: 2 }], total: 2, hasMore: false };
        },
      }),
    });

    const summary = await publicApp.request("http://localhost/v1/public/reviews/map/map.test/summary?gameplayRevisionId=revision%3Amap.test%3Ainitial", {}, env);
    expect(summary.status).toBe(200);
    expect(summary.headers.get("cache-control")).toBe("private, no-store");
    expect(await summary.json()).toEqual({ contractVersion: "1", summary: { targetType: "map", targetId: "map.test", gameplayRevisionId: "revision:map.test:initial", averageRating: null, reviewCount: 0, ratingDistribution: { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 }, sampleInsufficient: true } });

    const eventSummary = await publicApp.request("http://localhost/v1/public/reviews/event/event.test/summary", {}, env);
    expect(eventSummary.status).toBe(200);
    const eventSummaryBody = await eventSummary.json();
    expect(eventSummaryBody).toMatchObject({ summary: { targetType: "event", targetId: "event.test", gameplayRevisionId: null } });
    publicReviewSummaryResponseSchema.parse(eventSummaryBody);

    const unscopedBatch = await publicApp.request("http://localhost/v1/public/reviews/summaries?targetType=map&targetIds=map.test%2Cmap.empty", {}, env);
    expect(unscopedBatch.status).toBe(422);
    const batch = await publicApp.request("http://localhost/v1/public/reviews/summaries?targetType=map&targetIds=map.test%2Cmap.empty&gameplayRevisionIds=revision%3Amap.test%3Ainitial%2Crevision%3Amap.empty%3Ainitial", {}, env);
    expect(batch.status).toBe(200);
    expect(await batch.json()).toMatchObject({ contractVersion: "1", targetType: "map", items: [{ targetId: "map.test", gameplayRevisionId: "revision:map.test:initial", reviewCount: 3 }, { targetId: "map.empty", gameplayRevisionId: "revision:map.empty:initial", reviewCount: 3 }] });
    const mapRevisionsBatch = await publicApp.request("http://localhost/v1/public/reviews/summaries?targetType=map&targetIds=map.test%2Cmap.test&gameplayRevisionIds=revision%3Amap.test%3Ar1%2Crevision%3Amap.test%3Ar2", {}, env);
    expect(mapRevisionsBatch.status).toBe(200);
    expect(calls.at(-1)).toEqual({ operation: "batch", input: { targetType: "map", targets: [
      { targetId: "map.test", gameplayRevisionId: "revision:map.test:r1" },
      { targetId: "map.test", gameplayRevisionId: "revision:map.test:r2" },
    ] } });
    expect((await publicApp.request("http://localhost/v1/public/reviews/summaries?targetType=map&targetIds=map.test%2Cmap.test&gameplayRevisionIds=revision%3Amap.test%3Ar1%2Crevision%3Amap.test%3Ar1", {}, env)).status).toBe(422);
    expect((await publicApp.request("http://localhost/v1/public/reviews/summaries?targetType=event&targetIds=event.test%2Cevent.test", {}, env)).status).toBe(422);

    const comments = await publicApp.request("http://localhost/v1/public/reviews/map/map.test/comments?gameplayRevisionId=revision%3Amap.test%3Ainitial&page=1&pageSize=2", {}, env);
    expect(comments.status).toBe(200);
    const commentBody = await comments.json() as Record<string, unknown>;
    expect(commentBody).toEqual({ contractVersion: "1", targetType: "map", targetId: "map.test", gameplayRevisionId: "revision:map.test:initial", items: [{ rating: 5, comment: "很好", author: null, createdAt: 3 }, { rating: 4, comment: "稳定", author: { displayName: "公开玩家" }, createdAt: 2 }], page: 1, pageSize: 2, total: 2, hasMore: false });
    expect(JSON.stringify(commentBody)).not.toMatch(/playerAccountId|playerId|qq|audit|moderation|session|reviewId/);

    expect((await publicApp.request("http://localhost/v1/public/reviews/map/map.test/comments?page=0&gameplayRevisionId=revision%3Amap.test%3Ainitial", {}, env)).status).toBe(422);
    expect((await publicApp.request("http://localhost/v1/public/reviews/not-a-target/map.test/summary", {}, env)).status).toBe(422);
    expect(calls).toEqual([
      { operation: "summary", input: { targetType: "map", targetId: "map.test", gameplayRevisionId: "revision:map.test:initial" } },
      { operation: "summary", input: { targetType: "event", targetId: "event.test" } },
      { operation: "batch", input: { targetType: "map", targets: [{ targetId: "map.test", gameplayRevisionId: "revision:map.test:initial" }, { targetId: "map.empty", gameplayRevisionId: "revision:map.empty:initial" }] } },
      { operation: "batch", input: { targetType: "map", targets: [{ targetId: "map.test", gameplayRevisionId: "revision:map.test:r1" }, { targetId: "map.test", gameplayRevisionId: "revision:map.test:r2" }] } },
      { operation: "comments", input: { targetType: "map", targetId: "map.test", gameplayRevisionId: "revision:map.test:initial", page: 1, pageSize: 2 } },
    ]);
  });

  it("returns a signed-in player's private submission detail with its CDN evidence URL", async () => {
    expect((await app.request("http://localhost/v1/me/submissions/00000000-0000-0000-0000-000000000003", {}, env)).status).toBe(401);

    const detail = await app.request("http://localhost/v1/me/submissions/00000000-0000-0000-0000-000000000003", { headers: { cookie: "owb_session=session-token" } }, env);
    expect(detail.status).toBe(200);
    expect(await detail.json()).toMatchObject({ status: "needs_review", evidenceUrl: "https://evidence.owbastion.codes/uploads/submissions/opaque-object-key.png", ocr: { mapName: "Test Map", difficulty: "困难", playerName: "Player", challengeCompleted: true } });
  });

  it("does not reveal another player's submission", async () => {
    const privateApp = createApp({
      authenticate: auth,
      services: () => ({ ...services, getPlayerSubmission: async () => { throw new Error("SUBMISSION_NOT_FOUND"); } }),
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

  it("restores administrator-revoked title grants only for maintainers", async () => {
    const requests: unknown[] = [];
    const adminApp = createApp({
      authenticate: async () => ({ actorType: "user", subject: "admin", roles: ["maintainer"], provider: "test" }),
      services: () => ({ ...services, restoreAdminTitleGrant: async (input, _auth, idempotencyKey) => { requests.push({ input, idempotencyKey }); } }),
    });
    const url = "http://localhost/v1/admin/title-grants/00000000-0000-4000-8000-000000000001/restore";
    const headers = { "content-type": "application/json", "idempotency-key": "restore-1" };
    const body = JSON.stringify({ contractVersion: "1", reason: "复核完成" });
    expect((await app.request(url, { method: "POST", headers, body }, env)).status).toBe(403);
    expect((await adminApp.request(url, { method: "POST", headers: { "content-type": "application/json" }, body }, env)).status).toBe(422);
    const response = await adminApp.request(url, { method: "POST", headers, body }, env);
    expect(response.status).toBe(204);
    expect(requests).toEqual([{ input: { grantId: "00000000-0000-4000-8000-000000000001", reason: "复核完成" }, idempotencyKey: "restore-1" }]);
  });

  it("exposes idempotent manual batch title grants only to maintainers", async () => {
    const requests: unknown[] = [];
    const requestByKey = new Map<string, string>();
    const batchResponse = {
      contractVersion: "1" as const,
      batchId: "00000000-0000-4000-8000-000000000011",
      playerCount: 2,
      targetCount: 1,
      requestedCount: 2,
      createdCount: 1,
      alreadyOwnedCount: 1,
      items: [
        { playerAccountId: "11111111-1111-4111-8111-111111111111", titleKey: "GLOBAL", mapId: null, gameplayRevisionId: null, grantId: "00000000-0000-4000-8000-000000000012", status: "created" as const },
        { playerAccountId: "22222222-2222-4222-8222-222222222222", titleKey: "GLOBAL", mapId: null, gameplayRevisionId: null, grantId: "00000000-0000-4000-8000-000000000013", status: "already_owned" as const },
      ],
    };
    const adminApp = createApp({
      authenticate: async () => ({ actorType: "user", subject: "admin", roles: ["maintainer"], provider: "test" }),
      services: () => ({ ...services, createAdminManualTitleGrantBatch: async (input, _auth, idempotencyKey) => {
        const serialized = JSON.stringify(input);
        const existing = requestByKey.get(idempotencyKey);
        if (existing && existing !== serialized) throw new Error("IDEMPOTENCY_CONFLICT");
        if (!existing) { requestByKey.set(idempotencyKey, serialized); requests.push({ input, idempotencyKey }); }
        return batchResponse;
      } }),
    });
    const body = JSON.stringify({ contractVersion: "1", playerAccountIds: ["11111111-1111-4111-8111-111111111111", "22222222-2222-4222-8222-222222222222"], targets: [{ titleKey: "GLOBAL" }] });
    expect((await app.request("http://localhost/v1/admin/title-grants/manual/batch", { method: "POST", headers: { "content-type": "application/json", "idempotency-key": "batch-1" }, body }, env)).status).toBe(403);
    expect((await adminApp.request("http://localhost/v1/admin/title-grants/manual/batch", { method: "POST", headers: { "content-type": "application/json" }, body }, env)).status).toBe(422);
    const first = await adminApp.request("http://localhost/v1/admin/title-grants/manual/batch", { method: "POST", headers: { "content-type": "application/json", "idempotency-key": "batch-1" }, body }, env);
    expect(first.status).toBe(200);
    expect(await first.json()).toEqual(batchResponse);
    const replay = await adminApp.request("http://localhost/v1/admin/title-grants/manual/batch", { method: "POST", headers: { "content-type": "application/json", "idempotency-key": "batch-1" }, body }, env);
    expect(await replay.json()).toEqual(batchResponse);
    const conflict = await adminApp.request("http://localhost/v1/admin/title-grants/manual/batch", { method: "POST", headers: { "content-type": "application/json", "idempotency-key": "batch-1" }, body: JSON.stringify({ contractVersion: "1", playerAccountIds: ["11111111-1111-4111-8111-111111111111"], targets: [{ titleKey: "OTHER" }] }) }, env);
    expect(conflict.status).toBe(409);
    expect(requests).toHaveLength(1);
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
        listAdminChallenges: async ({ family, status }) => ({ contractVersion: "1", items: family === "achievement" && status === "active" ? [{ challengeId: "title.flawless", family: "achievement", type: "title_achievement", kind: "title_achievement", titleKey: "FLAWLESS", titleName: "完美无缺", icon: "zap", category: "极限操作系列", categoryOverride: null, condition: "单局跳过英雄次数为 0 且通关。", evidenceRule: "完整截图", gameVersion: "2026.07.15", status: "active", submissionMode: "manual", introducedVersion: "2026.07.15", retiredVersion: null }] : family === undefined ? [{ challengeId: "title.INTERNAL", family: "title_catalog", type: "title_catalog", titleKey: "INTERNAL", titleName: "内部称号", icon: "wrench", category: "开发保留", condition: "开发/管理用途。", lifecycle: "active", publicVisibility: true, availability: "active", scope: "global", displayKind: "fixed", status: "active", gameVersion: "2026.07.15", hasChallenge: false }] : [] }),
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
          return { challengeId: `title.${input.titleKey}`, family: "achievement", type: "title_achievement", kind: "title_achievement", titleKey: input.titleKey, titleName: input.titleName, icon: input.icon, category: input.category, categoryOverride: null, condition: input.condition, evidenceRule: input.evidenceRule, gameVersion: input.gameVersion ?? null, status: input.status, submissionMode: input.submissionMode, introducedVersion: input.gameVersion ?? null, retiredVersion: null, scope: input.scope, mapIds: input.mapIds };
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

  it("serves the versioned achievement icon route as immutable and the unversioned route with a short TTL", async () => {
    const requestedVersions: Array<string | undefined> = [];
    const iconApp = createApp({
      authenticate: async () => ({ actorType: "service" as const, subject: "qqbot", roles: [], provider: "test" }),
      services: () => ({
        ...services,
        getPublicTitleIcon: async (input) => {
          requestedVersions.push(input.version);
          if (input.version !== undefined && input.version !== "current-version") return null;
          return { body: new ReadableStream({ start: (controller) => { controller.enqueue(new Uint8Array([1, 2, 3])); controller.close(); } }), contentType: "image/png", etag: "\"abc\"" };
        },
      }),
    });

    const versioned = await iconApp.request("http://localhost/v1/public/achievement-icons/FLAWLESS/current-version", {}, env);
    expect(versioned.status).toBe(200);
    expect(versioned.headers.get("Cache-Control")).toBe("public, max-age=31536000, immutable");

    const stale = await iconApp.request("http://localhost/v1/public/achievement-icons/FLAWLESS/stale-version", {}, env);
    expect(stale.status).toBe(404);
    expect(stale.headers.get("Cache-Control") ?? "").not.toContain("immutable");

    const legacy = await iconApp.request("http://localhost/v1/public/achievement-icons/FLAWLESS", {}, env);
    expect(legacy.status).toBe(200);
    expect(legacy.headers.get("Cache-Control")).toBe("public, max-age=300");
    expect(legacy.headers.get("Cache-Control")).not.toContain("immutable");

    expect(requestedVersions).toEqual(["current-version", "stale-version", undefined]);
  });


  it("publishes map catalogs while protecting player-only catalogs", async () => {
    const requestedFamilies: Array<string | undefined> = [];
    const catalogServices: PlatformServices = {
      ...services,
      listMaps: async () => [{ mapId: "map.samoa", mapName: "萨摩亚", gameVersion: "2026.07.15", difficultyRating: "T3", mechanics: ["动态掩体"], coverUrl: null, backgroundUrl: null }],
        listChallenges: async (input) => {
        requestedFamilies.push(input?.family);
        if (input?.family === "achievement") return [{ challengeId: "title.flawless", family: "achievement", type: "title_achievement", kind: "title_achievement", titleKey: "FLAWLESS", titleName: "完美无缺", icon: "zap", category: "极限操作系列", condition: "单局跳过英雄次数为 0 且通关。", evidenceRule: "完整截图", gameVersion: "2026.07.15", status: "active", submissionMode: "manual" }];
        return [{ challengeId: "map.samoa.conqueror", family: "map", gameplayRevisionId: "revision:map.samoa:initial", type: "map_completion", kind: "difficulty_completion", name: "征服者", mapId: "map.samoa", mapName: "萨摩亚", difficulty: "传奇", gameVersion: "2026.07.15", status: "active" }];
      },
      listTitles: async ({ mapId }) => mapId ? [{ titleKey: "PIONEER", label: "开拓者", icon: "trophy", category: "社区贡献系列", condition: "地图挑战", lifecycle: "active", publicVisibility: true, availability: "active", scope: "map", displayKind: "map_pioneer", mapId, slot: "pioneer", pioneerPrefixes: ["萨摩亚"], color: { kind: "heroColor" as const, index: 12 }, gameVersion: "2026.07.15" }] : [{ titleKey: "ALL_IN_ONE", label: "万象归一", icon: "trophy", category: "地图精通系列", condition: "获得所有地图征服者头衔", lifecycle: "active", publicVisibility: true, availability: "active", scope: "global", displayKind: "fixed", color: null, gameVersion: "2026.07.15" }],
    };
    const catalogApp = createApp({ authenticate: async () => null, services: () => catalogServices });
    expect((await catalogApp.request("http://localhost/v1/maps", {}, env)).status).toBe(200);
    expect((await catalogApp.request("http://localhost/v1/challenges?family=map", {}, env)).status).toBe(200);
    expect((await catalogApp.request("http://localhost/v1/titles", {}, env)).status).toBe(401);

    const adminCatalogApp = createApp({
      authenticate: async () => ({ actorType: "user", subject: "admin", roles: ["maintainer"], provider: "test" }),
      services: () => ({ ...catalogServices, updateAdminMapMetadata: async (input) => ({ mapId: input.mapId, mapName: "萨摩亚", gameVersion: input.gameVersion, difficultyRating: input.difficultyRating, mechanics: input.mechanics, coverUrl: input.coverUrl, backgroundUrl: input.backgroundUrl }) }),
    });
    expect((await adminCatalogApp.request("http://localhost/v1/admin/maps", {}, env)).status).toBe(200);
    const adminMapTitles = await adminCatalogApp.request("http://localhost/v1/admin/titles?mapId=map.samoa", {}, env);
    expect(adminMapTitles.status).toBe(200);
    expect(await adminMapTitles.json()).toMatchObject({ contractVersion: "1", items: [{ titleKey: "PIONEER", scope: "map", mapId: "map.samoa" }] });
    expect((await adminCatalogApp.request("http://localhost/v1/admin/maps/map.samoa/metadata", { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify({ contractVersion: "1", difficultyRating: "T3", mechanics: ["动态掩体"] }) }, env)).status).toBe(422);
    const metadataUpdate = await adminCatalogApp.request("http://localhost/v1/admin/maps/map.samoa/metadata", { method: "PUT", headers: { "content-type": "application/json", "idempotency-key": "map-metadata-1" }, body: JSON.stringify({ contractVersion: "1", gameVersion: "2026.08.13", difficultyRating: "T3", mechanics: ["动态掩体"], coverUrl: null, backgroundUrl: null }) }, env);
    expect(metadataUpdate.status).toBe(200);
    expect(await metadataUpdate.json()).toMatchObject({ mapId: "map.samoa", gameVersion: "2026.08.13", difficultyRating: "T3", mechanics: ["动态掩体"] });

    const revisionRequests: Array<{ operation: string; input: Record<string, unknown> }> = [];
    const editorRevision = {
      revisionId: "revision:map.samoa:rework",
      mapId: "map.samoa",
      lifecycle: "preparing" as const,
      mapVariant: null,
      copiedFromRevisionId: "revision:map.samoa:initial",
      resetReason: "geometry rework",
      gameVersion: "2026.08.12",
      spatialConfig: null,
      isDefault: false,
      isSelectable: false,
      challengeAssignments: [],
      createdAt: 1,
      updatedAt: 1,
    };
    const compositeSpatialConfig = {
      resetPosition: [4, 5, 6],
      endPosition: [7, 8, 9],
      thirdPersonPosition: [10, 11, 12],
      creditsPosition: [13, 14, 15],
      control: { respawnAxis: "x", respawnAxisThreshold: 40 },
      composition: {
        selectionCount: 2,
        firstStageSelection: { mode: "setup_detection", fallbackStageId: "alpha" },
        remainingStageSelection: "random_unique",
      },
      stages: [
        { stageId: "alpha", bastionPositions: [[0, 1, 2]], control: { centerPositions: [], jumpPositions: [[3, 4, 5]], respawnPositions: [[6, 7, 8]] }, portalPositions: [], springboardPositions: [] },
        { stageId: "beta", setupDetection: { position: [20, 21, 22], radius: 30 }, bastionPositions: [[20, 21, 22]], control: { centerPositions: [], jumpPositions: [[23, 24, 25]], respawnPositions: [[26, 27, 28]] }, portalPositions: [], springboardPositions: [] },
      ],
    };
    const editorApp = createApp({
      authenticate: async () => ({ actorType: "user", subject: "admin", roles: ["maintainer"], provider: "test" }),
      services: () => ({
        ...catalogServices,
        getAdminMapEditor: async () => ({ contractVersion: "1" as const, map: (await catalogServices.listMaps())[0]!, revisions: [editorRevision], challengeCatalog: [], audit: [] }),
        createAdminMapRevision: async (input) => { revisionRequests.push({ operation: "create", input }); return editorRevision; },
        updateAdminMapRevision: async (input) => {
          revisionRequests.push({ operation: "update", input });
          if (input.lifecycle === "default") throw new Error("REVISION_PROMOTION_REQUIRES_EXPLICIT_OPERATION");
          return { ...editorRevision, lifecycle: input.lifecycle, spatialConfig: input.spatialConfig };
        },
        promoteAdminMapRevision: async (input) => {
          revisionRequests.push({ operation: "promote", input });
          return { ...editorRevision, lifecycle: "default", isDefault: true };
        },
      }),
    });
    expect((await editorApp.request("http://localhost/v1/admin/maps/map.samoa/editor", {}, env)).status).toBe(200);
    expect((await editorApp.request("http://localhost/v1/admin/maps/map.samoa/revisions", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ contractVersion: "1", mapVariant: null, copyConfiguration: true }) }, env)).status).toBe(422);
    const resetRevision = await editorApp.request("http://localhost/v1/admin/maps/map.samoa/revisions", { method: "POST", headers: { "content-type": "application/json", "idempotency-key": "map-revision-create-1" }, body: JSON.stringify({ contractVersion: "1", sourceRevisionId: "revision:map.samoa:initial", mapVariant: null, copyConfiguration: true }) }, env);
    expect(resetRevision.status).toBe(201);
    expect(revisionRequests[0]).toMatchObject({ operation: "create", input: { mapId: "map.samoa", copyConfiguration: true, sourceRevisionId: "revision:map.samoa:initial" } });
    expect(revisionRequests[0]!.input.gameVersion).toBeUndefined();
    const manualVersionRevision = await editorApp.request("http://localhost/v1/admin/maps/map.samoa/revisions", { method: "POST", headers: { "content-type": "application/json", "idempotency-key": "map-revision-manual-version" }, body: JSON.stringify({ contractVersion: "1", sourceRevisionId: "revision:map.samoa:initial", gameVersion: "2026.08.13", mapVariant: null, copyConfiguration: true }) }, env);
    expect(manualVersionRevision.status).toBe(201);
    expect(revisionRequests[1]).toMatchObject({ operation: "create", input: { gameVersion: "2026.08.13" } });
    expect(revisionRequests[0]!.input.resetReason).toBeUndefined();
    const manualVersionUpdate = await editorApp.request("http://localhost/v1/admin/maps/map.samoa/revisions/revision:map.samoa:rework", { method: "PUT", headers: { "content-type": "application/json", "idempotency-key": "map-revision-update-manual-version" }, body: JSON.stringify({ contractVersion: "1", lifecycle: "selectable", gameVersion: "2026.08.13", mapVariant: null, spatialConfig: null, challengeAssignments: [] }) }, env);
    expect(manualVersionUpdate.status).toBe(200);
    const savedRevision = await editorApp.request("http://localhost/v1/admin/maps/map.samoa/revisions/revision:map.samoa:rework", { method: "PUT", headers: { "content-type": "application/json", "idempotency-key": "map-revision-update-1" }, body: JSON.stringify({ contractVersion: "1", lifecycle: "selectable", gameVersion: "2026.08.12", mapVariant: null, spatialConfig: null, challengeAssignments: [] }) }, env);
    expect(savedRevision.status).toBe(200);
    expect(revisionRequests[3]).toMatchObject({ operation: "update", input: { mapId: "map.samoa", revisionId: "revision:map.samoa:rework", lifecycle: "selectable", gameVersion: "2026.08.12" } });
    const directPromotion = await editorApp.request("http://localhost/v1/admin/maps/map.samoa/revisions/revision:map.samoa:rework", {
      method: "PUT",
      headers: { "content-type": "application/json", "idempotency-key": "map-revision-direct-promotion" },
      body: JSON.stringify({ contractVersion: "1", lifecycle: "default", gameVersion: "2026.08.13", mapVariant: null, spatialConfig: null, challengeAssignments: [] }),
    }, env);
    expect(directPromotion.status).toBe(409);
    const compositeRevision = await editorApp.request("http://localhost/v1/admin/maps/map.samoa/revisions/revision:map.samoa:rework", {
      method: "PUT",
      headers: { "content-type": "application/json", "idempotency-key": "map-revision-composite-enabled" },
      body: JSON.stringify({ contractVersion: "1", lifecycle: "selectable", gameVersion: "2026.08.13", mapVariant: null, spatialConfig: compositeSpatialConfig, challengeAssignments: [] }),
    }, env);
    expect(compositeRevision.status).toBe(200);
    expect(await compositeRevision.json()).toMatchObject({
      lifecycle: "selectable",
      spatialConfig: { composition: { selectionCount: 2 }, stages: [{ stageId: "alpha" }, { stageId: "beta" }] },
    });
    const promotion = await editorApp.request("http://localhost/v1/admin/maps/map.samoa/revisions/revision:map.samoa:rework/promote", {
      method: "POST",
      headers: { "content-type": "application/json", "idempotency-key": "map-revision-promote-1" },
      body: JSON.stringify({ contractVersion: "1", replacedDefaultLifecycle: "selectable" }),
    }, env);
    expect(promotion.status).toBe(200);
    expect(await promotion.json()).toMatchObject({ lifecycle: "default", isDefault: true });
    expect(revisionRequests.find((request) => request.operation === "promote")).toMatchObject({ operation: "promote", input: { mapId: "map.samoa", revisionId: "revision:map.samoa:rework", replacedDefaultLifecycle: "selectable" } });

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

  it("rejects a challenge selector in player upload requests", async () => {
    const createSession = vi.fn(async () => services.createPlayerUploadSession({ contractVersion: "1", contentType: "image/png", byteSize: 1, sha256: "a".repeat(64) }, "session-token"));
    const uploadApp = createApp({ authenticate: async () => null, services: () => ({ ...services, createPlayerUploadSession: createSession }) });
    const response = await uploadApp.request("http://localhost/v1/player/uploads/session", {
      method: "POST",
      headers: { cookie: "owb_session=session-token", "content-type": "application/json" },
      body: JSON.stringify({ contractVersion: "1", challengeId: "title.SKY", contentType: "image/png", byteSize: 1, sha256: "a".repeat(64) }),
    }, env);
    expect(response.status).toBe(422);
    expect(await response.json()).toMatchObject({ error: { code: "INVALID_REQUEST" } });
    expect(createSession).not.toHaveBeenCalled();
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

  it("returns a conflict while another player upload completion is enqueueing", async () => {
    const completionApp = createApp({
      authenticate: async () => null,
      services: () => ({ ...services, completePlayerUpload: async () => { throw new Error("UPLOAD_COMPLETION_IN_PROGRESS"); } }),
    });
    const response = await completionApp.request("http://localhost/v1/player/uploads/00000000-0000-0000-0000-000000000004/complete", {
      method: "POST",
      headers: { cookie: "owb_session=session-token" },
    }, env);

    expect(response.status).toBe(409);
    expect(await response.json()).toMatchObject({ error: { code: "UPLOAD_COMPLETION_IN_PROGRESS" } });
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

  it("requires a service idempotency key for QQ binding verification", async () => {
    const response = await app.request("http://localhost/v1/qq/auth/verify", { method: "POST", headers: { authorization: "Bearer service", "content-type": "application/json" }, body: JSON.stringify({ contractVersion: "1", provider: "qq", code: "ABC234", groupOpenId: "group-1", memberOpenId: "member-1", messageId: "message-1" }) }, env);
    expect(response.status).toBe(422);
    expect((await response.json() as { error: { code: string } }).error.code).toBe("IDEMPOTENCY_KEY_REQUIRED");
  });

  describe("POST /v1/qq/submissions", () => {
    const body = JSON.stringify({ contractVersion: "1", commandMessageId: "message-1", groupOpenId: "group-1", memberOpenId: "member-1", attachment: { url: "https://gchat.qpic.cn/a.png", filename: "a.png", contentType: "image/png" } });
    const post = (target: ReturnType<typeof createApp>, headers: Record<string, string> = { "idempotency-key": "k1" }, payload = body) => target.request("http://localhost/v1/qq/submissions", { method: "POST", headers: { authorization: "Bearer service", "content-type": "application/json", ...headers }, body: payload }, env);

    it("requires the channel role and an idempotency key", async () => {
      const unauthorized = createApp({ authenticate: async () => null, services: () => services });
      expect((await post(unauthorized)).status).toBe(401);
      const forbidden = createApp({ authenticate: async () => ({ actorType: "service", subject: "x", roles: [], provider: "test" }), services: () => services });
      expect((await post(forbidden)).status).toBe(403);
      const missing = await post(app, {});
      expect(missing.status).toBe(422);
      expect((await missing.json() as { error: { code: string } }).error.code).toBe("IDEMPOTENCY_KEY_REQUIRED");
    });

    it("rejects unknown fields so Challenge or map targets cannot be supplied", async () => {
      expect((await post(app, { "idempotency-key": "k1" }, JSON.stringify({ ...JSON.parse(body), mapId: "map-1" }))).status).toBe(422);
    });

    it("accepts a screenshot and maps domain failures to channel-safe statuses", async () => {
      const accepted = await post(app);
      expect(accepted.status).toBe(201);
      expect(await accepted.json()).toMatchObject({ status: "processing" });
      for (const [code, status] of [["BINDING_NOT_FOUND", 422], ["PLAYER_BANNED", 422], ["SOURCE_ATTACHMENT_UNAVAILABLE", 422], ["IDEMPOTENCY_CONFLICT", 409], ["QQ_SUBMISSION_IN_PROGRESS", 409], ["OCR_NOT_CONFIGURED", 503]] as const) {
        const failing = createApp({ authenticate: auth, services: () => ({ ...services, submitQqScreenshot: async () => { throw new Error(code); } }) });
        const response = await post(failing);
        expect(response.status).toBe(status);
        expect((await response.json() as { error: { code: string } }).error.code).toBe(code);
      }
    });
  });

  it("returns the title grant summary from an approved review", async () => {
    const reviewApp = createApp({ authenticate: async () => ({ actorType: "user", subject: "admin", roles: ["maintainer"], provider: "test" }), services: () => ({ ...services, reviewSubmission: async () => ({ contractVersion: "1", submissionId: "00000000-0000-4000-8000-000000000000", decision: "approved" as const, grantId: "00000000-0000-4000-8000-000000000001", titleKey: "PIONEER", titleName: "开拓者", alreadyOwned: false }) }) });
    const response = await reviewApp.request("http://localhost/v1/admin/submissions/00000000-0000-4000-8000-000000000000/review", { method: "POST", headers: { "content-type": "application/json", "idempotency-key": "review-1" }, body: JSON.stringify({ contractVersion: "1", decision: "approved" }) }, env);
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ decision: "approved", titleKey: "PIONEER", titleName: "开拓者", alreadyOwned: false });
  });

  it("passes maintainer Challenge confirmations to approval and preview", async () => {
    const reviewInputs: unknown[] = [];
    const previewInputs: unknown[] = [];
    const reviewApp = createApp({ authenticate: async () => ({ actorType: "user", subject: "admin", roles: ["maintainer"], provider: "test" }), services: () => ({
      ...services,
      reviewSubmission: async (input) => { reviewInputs.push(input); return { contractVersion: "1", submissionId: "00000000-0000-4000-8000-000000000000", decision: "approved" as const, grantId: "00000000-0000-4000-8000-000000000001", titleKey: "HERO", titleName: "英雄", alreadyOwned: false }; },
      previewSubmissionReview: async (input) => { previewInputs.push(input); return services.previewSubmissionReview(input, { actorType: "user", subject: "admin", roles: ["maintainer"], provider: "test" }); },
    }) });
    const body = { contractVersion: "1", fieldCorrections: [{ fieldKey: "map_name", reviewedValue: "国王大道" }], confirmedChallengeIds: ["legacy:title_challenge:title.hero:::abc"] };
    const preview = await reviewApp.request("http://localhost/v1/admin/submissions/00000000-0000-4000-8000-000000000000/review/preview", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) }, env);
    expect(preview.status).toBe(200);
    expect(previewInputs).toEqual([{ submissionId: "00000000-0000-4000-8000-000000000000", fieldCorrections: body.fieldCorrections, confirmedChallengeIds: body.confirmedChallengeIds }]);
    const approval = await reviewApp.request("http://localhost/v1/admin/submissions/00000000-0000-4000-8000-000000000000/review", { method: "POST", headers: { "content-type": "application/json", "idempotency-key": "review-confirm-1" }, body: JSON.stringify({ ...body, decision: "approved" }) }, env);
    expect(approval.status).toBe(200);
    expect(reviewInputs).toEqual([expect.objectContaining({ decision: "approved", confirmedChallengeIds: ["legacy:title_challenge:title.hero:::abc"] })]);
    const rejectedWithConfirmation = await reviewApp.request("http://localhost/v1/admin/submissions/00000000-0000-4000-8000-000000000000/review", { method: "POST", headers: { "content-type": "application/json", "idempotency-key": "review-confirm-2" }, body: JSON.stringify({ ...body, decision: "rejected" }) }, env);
    expect(rejectedWithConfirmation.status).toBe(422);
    expect(reviewInputs).toHaveLength(1);
  });

  it("maps ineligible Challenge confirmations to a review error", async () => {
    const reviewApp = createApp({ authenticate: async () => ({ actorType: "user", subject: "admin", roles: ["maintainer"], provider: "test" }), services: () => ({ ...services, reviewSubmission: async () => { throw new Error("CHALLENGE_CONFIRMATION_INELIGIBLE"); } }) });
    const response = await reviewApp.request("http://localhost/v1/admin/submissions/00000000-0000-4000-8000-000000000000/review", { method: "POST", headers: { "content-type": "application/json", "idempotency-key": "review-ineligible-1" }, body: JSON.stringify({ contractVersion: "1", decision: "approved", confirmedChallengeIds: ["challenge.owned"] }) }, env);
    expect(response.status).toBe(422);
    expect((await response.json() as { error: { code: string } }).error.code).toBe("CHALLENGE_CONFIRMATION_INELIGIBLE");
  });

  it("requires maintainer access for review previews", async () => {
    const response = await app.request("http://localhost/v1/admin/submissions/00000000-0000-4000-8000-000000000000/review/preview", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ contractVersion: "1" }) }, env);
    expect([401, 403]).toContain(response.status);
  });

  it("allows maintainers to request another OCRKit attempt", async () => {
    const requests: string[] = [];
    const retryApp = createApp({ authenticate: async () => ({ actorType: "user", subject: "admin", roles: ["maintainer"], provider: "test" }), services: () => ({ ...services, requestAdminOcr: async ({ submissionId }) => { requests.push(submissionId); return { contractVersion: "1", submissionId, status: "ocr_pending" as const }; } }) });
    const response = await retryApp.request("http://localhost/v1/admin/submissions/00000000-0000-4000-8000-000000000000/ocr/retry", { method: "POST", headers: { "content-type": "application/json", "idempotency-key": "ocr-retry-1" }, body: JSON.stringify({ contractVersion: "1" }) }, env);
    expect(response.status).toBe(200);
    expect(requests).toEqual(["00000000-0000-4000-8000-000000000000"]);
    expect(await response.json()).toMatchObject({ status: "ocr_pending" });
  });

  it("returns a conflict when another OCR retry is already in progress", async () => {
    const retryApp = createApp({ authenticate: async () => ({ actorType: "user", subject: "admin", roles: ["maintainer"], provider: "test" }), services: () => ({ ...services, requestAdminOcr: async () => { throw new Error("OCR_RETRY_IN_PROGRESS"); } }) });
    const response = await retryApp.request("http://localhost/v1/admin/submissions/00000000-0000-0000-0000-000000000000/ocr/retry", { method: "POST", headers: { "content-type": "application/json", "idempotency-key": "ocr-retry-race-1" }, body: JSON.stringify({ contractVersion: "1" }) }, env);
    expect(response.status).toBe(409);
    expect((await response.json() as { error: { code: string } }).error.code).toBe("OCR_RETRY_IN_PROGRESS");
  });

  it("does not expose player or maintainer challenge selection routes", async () => {
    const playerConfirm = await app.request("http://localhost/v1/player/submissions/00000000-0000-0000-0000-000000000000/challenge", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ contractVersion: "1", challengeId: "title.hero" }) });
    const adminOptions = await app.request("http://localhost/v1/admin/submissions/00000000-0000-0000-0000-000000000000/challenges");
    const adminSelect = await app.request("http://localhost/v1/admin/submissions/00000000-0000-0000-0000-000000000000/challenge", { method: "POST", headers: { "content-type": "application/json", "idempotency-key": "challenge-select-1" }, body: JSON.stringify({ contractVersion: "1", challengeId: "title.hero" }) });

    expect(playerConfirm.status).toBe(404);
    expect(adminOptions.status).toBe(404);
    expect(adminSelect.status).toBe(404);
  });

  it("lets maintainers resolve an automatic-decision spot check", async () => {
    const resolutions: string[] = [];
    const spotCheckApp = createApp({ authenticate: async () => ({ actorType: "user", subject: "admin", roles: ["maintainer"], provider: "test" }), services: () => ({ ...services, resolveAdminSubmissionSpotCheck: async ({ submissionId, decision }) => { resolutions.push(`${submissionId}:${decision}`); return { contractVersion: "1", submissionId, status: decision, grantId: "00000000-0000-4000-8000-000000000001", verifiedRunId: null }; } }) });
    const response = await spotCheckApp.request("http://localhost/v1/admin/submissions/00000000-0000-4000-8000-000000000000/spot-check", { method: "POST", headers: { "content-type": "application/json", "idempotency-key": "spot-check-1" }, body: JSON.stringify({ contractVersion: "1", decision: "confirmed" }) }, env);
    expect(response.status).toBe(200);
    expect(resolutions).toEqual(["00000000-0000-4000-8000-000000000000:confirmed"]);
  });

  it("protects administrative player data with the platform session", async () => {
    const adminServices: PlatformServices = { ...services, getCurrentPlayer: async ({ sessionToken }) => sessionToken === "admin-session" ? { contractVersion: "1", player: { playerId: "1234", playerName: "Player", isAdmin: true }, recentSubmissions: [] } : null };
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

  it("lets maintainers repair a player's equipped titles", async () => {
    const requests: Array<{ playerAccountId: string; grantIds: string[]; key: string }> = [];
    const adminApp = createApp({
      authenticate: async () => ({ actorType: "user" as const, subject: "admin", roles: ["maintainer"], provider: "test" }),
      services: () => ({ ...services, replaceAdminPlayerEquippedTitles: async (input, _auth, key) => { requests.push({ ...input, key }); return { contractVersion: "1" as const, grantIds: input.grantIds }; } }),
    });
    const response = await adminApp.request("http://localhost/v1/admin/player-accounts/player-1/titles/equipped", { method: "PUT", headers: { "content-type": "application/json", "idempotency-key": "recover-1" }, body: JSON.stringify({ contractVersion: "1", grantIds: ["00000000-0000-4000-8000-000000000006"] }) }, env);
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ contractVersion: "1", grantIds: ["00000000-0000-4000-8000-000000000006"] });
    expect(requests).toEqual([{ playerAccountId: "player-1", grantIds: ["00000000-0000-4000-8000-000000000006"], key: "recover-1" }]);
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
    const dashboard = await adminApp.request("http://localhost/v1/admin/submissions?status=upload_pending,ocr_pending,ready_for_review,ocr_review_required&page=1&pageSize=5", {}, env);
    expect(dashboard.status).toBe(200);
    expect(requests[2]).toEqual({ statuses: ["upload_pending", "ocr_pending", "ready_for_review", "ocr_review_required"], page: 1, pageSize: 5 });
    expect((await adminApp.request("http://localhost/v1/admin/submissions?status=unknown", {}, env)).status).toBe(422);
    expect((await adminApp.request("http://localhost/v1/admin/submissions?status=ready_for_review&order=oldest&page=1&pageSize=20", {}, env)).status).toBe(200);
    expect(requests[3]).toEqual({ statuses: ["ready_for_review"], order: "oldest", page: 1, pageSize: 20 });
    expect((await adminApp.request("http://localhost/v1/admin/submissions?order=random", {}, env)).status).toBe(422);
  });

  it("keeps local development login disabled unless explicitly enabled", async () => {
    const localServices: PlatformServices = {
      ...services,
      listLocalDevAccounts: async () => [{ accountId: "local-player-account", playerId: "local-player", playerName: "Local Player", isAdmin: false }],
      createLocalDevSession: async () => ({ sessionToken: "local-session" }),
      getCurrentPlayer: async ({ sessionToken }) => sessionToken === "local-session" ? { contractVersion: "1", player: { playerId: "local-player", playerName: "Local Player", isAdmin: false }, recentSubmissions: [] } : null,
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

  it("creates, lists, and finalizes screenshot sets through maintainer routes", async () => {
    const setApp = createApp({
      authenticate: async () => ({ actorType: "user" as const, subject: "admin", roles: ["maintainer"], provider: "test" }),
      services: () => ({
        ...services,
        listAdminScreenshotSetCandidates: async () => ({ contractVersion: "1" as const, items: [{ sourceId: "00000000-0000-4000-8000-000000000010", submissionId: "00000000-0000-4000-8000-000000000011", mapName: "测试地图", submissionStatus: "approved", accuracy: null, layoutVersion: "layout-v2", mimeType: "image/png", sizeBytes: 12, evidenceUrl: "https://evidence.owbastion.codes/uploads/submissions/00000000-0000-4000-8000-000000000011/object.png" }], page: 1, pageSize: 100, total: 1, hasMore: false }),
        createAdminScreenshotSet: async () => ({ contractVersion: "1" as const, setId: "00000000-0000-4000-8000-000000000009", version: 1, status: "draft" as const, counts: { memberCount: 1, excludedCount: 1 } }),
        listAdminScreenshotSets: async () => ({ contractVersion: "1" as const, items: [{ setId: "00000000-0000-4000-8000-000000000009", version: 1, status: "draft" as const, createdBy: "admin", createdAt: 1, finalizedBy: null, finalizedAt: null, discardedBy: null, discardedAt: null, note: null, counts: { memberCount: 1, excludedCount: 1 } }], page: 1, pageSize: 20, total: 1, hasMore: false }),
        getAdminScreenshotSet: async () => ({ contractVersion: "1" as const, set: { setId: "00000000-0000-4000-8000-000000000009", version: 1, status: "draft" as const, createdBy: "admin", createdAt: 1, finalizedBy: null, finalizedAt: null, discardedBy: null, discardedAt: null, note: null, counts: { memberCount: 1, excludedCount: 1 } }, members: [{ sourceId: "00000000-0000-4000-8000-000000000010", submissionId: "00000000-0000-4000-8000-000000000011", mapName: "测试地图", objectKey: "uploads/submissions/00000000-0000-4000-8000-000000000011/object.png", sha256: "a".repeat(64), mimeType: "image/png", sizeBytes: 12, layoutVersion: "layout-v2", accuracy: "inaccurate" as const, evidenceUrl: "https://evidence.owbastion.codes/uploads/submissions/00000000-0000-4000-8000-000000000011/object.png" }], exclusions: [{ sourceId: "00000000-0000-4000-8000-000000000012", submissionId: "00000000-0000-4000-8000-000000000013", reason: "missing_layout_version" }] }),
        finalizeAdminScreenshotSet: async ({ setId }) => ({ contractVersion: "1" as const, setId, version: 1, status: "finalized" as const, finalizedAt: 2 }),
        discardAdminScreenshotSet: async ({ setId }) => ({ contractVersion: "1" as const, setId, version: 1, status: "discarded" as const, discardedAt: 3 }),
      }),
    });

    // Admin surface requires a maintainer session.
    expect((await app.request("http://localhost/v1/admin/screenshot-sets", {}, env)).status).toBe(403);
    expect((await app.request("http://localhost/v1/admin/screenshot-sets/candidates", {}, env)).status).toBe(403);

    const created = await setApp.request("http://localhost/v1/admin/screenshot-sets", { method: "POST", headers: { "content-type": "application/json", "idempotency-key": "set-1" }, body: JSON.stringify({ contractVersion: "1", note: "v1", excludedSourceIds: ["00000000-0000-4000-8000-000000000012"] }) }, env);
    expect(created.status).toBe(201);
    expect(await created.json()).toMatchObject({ setId: "00000000-0000-4000-8000-000000000009", version: 1, status: "draft", counts: { memberCount: 1, excludedCount: 1 } });

    expect((await setApp.request("http://localhost/v1/admin/screenshot-sets", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ contractVersion: "1" }) }, env)).status).toBe(422);

    const list = await setApp.request("http://localhost/v1/admin/screenshot-sets?status=draft&page=1&pageSize=20", {}, env);
    expect(list.status).toBe(200);
    expect(await list.json()).toMatchObject({ items: [{ version: 1, status: "draft" }] });

    expect((await setApp.request("http://localhost/v1/admin/screenshot-sets?status=bogus", {}, env)).status).toBe(422);
    expect((await setApp.request("http://localhost/v1/admin/screenshot-sets/candidates?page=0", {}, env)).status).toBe(422);

    const candidates = await setApp.request("http://localhost/v1/admin/screenshot-sets/candidates?page=1&pageSize=100", {}, env);
    expect(candidates.status).toBe(200);
    expect(await candidates.json()).toMatchObject({ items: [{ sourceId: "00000000-0000-4000-8000-000000000010", mapName: "测试地图", layoutVersion: "layout-v2" }] });

    const detail = await setApp.request("http://localhost/v1/admin/screenshot-sets/00000000-0000-4000-8000-000000000009", {}, env);
    expect(detail.status).toBe(200);
    expect(await detail.json()).toMatchObject({ set: { version: 1 }, members: [{ sourceId: "00000000-0000-4000-8000-000000000010", layoutVersion: "layout-v2" }], exclusions: [{ reason: "missing_layout_version" }] });

    expect((await setApp.request("http://localhost/v1/admin/screenshot-sets/not-a-uuid", {}, env)).status).toBe(422);
    expect((await setApp.request("http://localhost/v1/admin/screenshot-sets/00000000-0000-4000-8000-000000000009/finalize", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ contractVersion: "1" }) }, env)).status).toBe(422);

    const finalized = await setApp.request("http://localhost/v1/admin/screenshot-sets/00000000-0000-4000-8000-000000000009/finalize", { method: "POST", headers: { "content-type": "application/json", "idempotency-key": "set-finalize-1" }, body: JSON.stringify({ contractVersion: "1" }) }, env);
    expect(finalized.status).toBe(200);
    expect(await finalized.json()).toMatchObject({ status: "finalized", version: 1 });

    const discarded = await setApp.request("http://localhost/v1/admin/screenshot-sets/00000000-0000-4000-8000-000000000009/discard", { method: "POST", headers: { "content-type": "application/json", "idempotency-key": "set-discard-1" }, body: JSON.stringify({ contractVersion: "1" }) }, env);
    expect(discarded.status).toBe(200);
    expect(await discarded.json()).toMatchObject({ status: "discarded", version: 1 });
    expect((await setApp.request("http://localhost/v1/admin/screenshot-sets/00000000-0000-4000-8000-000000000009/discard", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ contractVersion: "1" }) }, env)).status).toBe(422);
    expect((await setApp.request("http://localhost/v1/admin/screenshot-sets/not-a-uuid/discard", { method: "POST", headers: { "content-type": "application/json", "idempotency-key": "set-discard-2" }, body: JSON.stringify({ contractVersion: "1" }) }, env)).status).toBe(422);
  });

  it("maps screenshot-set discard lifecycle errors to 404 and 409", async () => {
    const maintainerAuth = async () => ({ actorType: "user" as const, subject: "admin", roles: ["maintainer"], provider: "test" });
    const post = { method: "POST", headers: { "content-type": "application/json", "idempotency-key": "set-discard-err" }, body: JSON.stringify({ contractVersion: "1" }) };
    const path = "http://localhost/v1/admin/screenshot-sets/00000000-0000-4000-8000-000000000009/discard";

    for (const [thrown, status] of [
      ["SCREENSHOT_SET_NOT_FOUND", 404],
      ["SCREENSHOT_SET_ALREADY_FINALIZED", 409],
      ["SCREENSHOT_SET_ALREADY_DISCARDED", 409],
      ["SCREENSHOT_SET_NOT_DRAFT", 409],
      ["IDEMPOTENCY_CONFLICT", 409],
    ] as const) {
      const errorApp = createApp({ authenticate: maintainerAuth, services: () => ({ ...services, discardAdminScreenshotSet: async () => { throw new Error(thrown); } }) });
      const response = await errorApp.request(path, post, env);
      expect(response.status).toBe(status);
      expect((await response.json() as any).error.code).toBe(thrown);
    }
  });

  it("serves finalized screenshot sets only through the private OCRKit contract", async () => {
    const ocrkitSet = {
      schema_version: 1 as const,
      set_id: "00000000-0000-4000-8000-000000000009",
      version: 1,
      finalized: true as const,
      finalized_at: "1970-01-01T00:00:00.002Z",
      members: [{ source_id: "00000000-0000-4000-8000-000000000010", object_key: "uploads/submissions/00000000-0000-4000-8000-000000000011/object.png", sha256: "a".repeat(64), mime_type: "image/png", size_bytes: 12, layout_version: "layout-v2", accuracy: "inaccurate" as const }],
    };
    const ocrkitApp = createApp({
      authenticate: auth,
      services: () => ({ ...services, getOcrkitScreenshotSet: async () => ocrkitSet }),
    });
    const tokenEnv = { ...env, OCRKIT_SNAPSHOT_TOKEN: "ocrkit-set-secret" } as typeof env;

    const unauthenticated = await ocrkitApp.request("http://localhost/v1/ocrkit/screenshot-sets/1", {}, tokenEnv);
    expect(unauthenticated.status).toBe(401);

    const wrongToken = await ocrkitApp.request("http://localhost/v1/ocrkit/screenshot-sets/1", { headers: { authorization: "Bearer nope" } }, tokenEnv);
    expect(wrongToken.status).toBe(401);

    const set = await ocrkitApp.request("http://localhost/v1/ocrkit/screenshot-sets/1", { headers: { authorization: "Bearer ocrkit-set-secret" } }, tokenEnv);
    expect(set.status).toBe(200);
    const body = await set.json() as { members?: Array<Record<string, unknown>> } & Record<string, unknown>;
    expect(body).toEqual(ocrkitSet);
    // The private payload must never carry identity, Submission decision, or
    // business-signal fields.
    const memberKeys = Object.keys(body.members![0]!);
    expect(memberKeys.sort()).toEqual(["accuracy", "layout_version", "mime_type", "object_key", "sha256", "size_bytes", "source_id"]);
    expect(body).not.toHaveProperty("submission_id");
    expect(body).not.toHaveProperty("player");

    expect((await ocrkitApp.request("http://localhost/v1/ocrkit/screenshot-sets/0", { headers: { authorization: "Bearer ocrkit-set-secret" } }, tokenEnv)).status).toBe(422);

    const draftApp = createApp({ authenticate: auth, services: () => ({ ...services, getOcrkitScreenshotSet: async () => { throw new Error("SCREENSHOT_SET_NOT_FINALIZED"); } }) });
    expect((await draftApp.request("http://localhost/v1/ocrkit/screenshot-sets/1", { headers: { authorization: "Bearer ocrkit-set-secret" } }, tokenEnv)).status).toBe(409);

    const missingApp = createApp({ authenticate: auth, services: () => ({ ...services, getOcrkitScreenshotSet: async () => { throw new Error("SCREENSHOT_SET_NOT_FOUND"); } }) });
    expect((await missingApp.request("http://localhost/v1/ocrkit/screenshot-sets/1", { headers: { authorization: "Bearer ocrkit-set-secret" } }, tokenEnv)).status).toBe(404);
  });
});

describe("OCRKit result callbacks", () => {
  const jobId = "b89dab0a-b89e-40b2-932e-ff4f295d8ba3";
  const payload = { contractVersion: "1", result: { schema_version: "1", request_id: jobId, ok: true, fields: {}, data: {} } };
  const callbackEnv = { ...env, OCRKIT_API_TOKEN: "callback-secret" };
  const send = (target: ReturnType<typeof createApp>, body: unknown, token = "callback-secret") => target.request(`http://localhost/v1/ocrkit/jobs/${jobId}/result`, { method: "POST", headers: { "content-type": "application/json", authorization: `Bearer ${token}` }, body: JSON.stringify(body) }, callbackEnv);

  it("authenticates the service token and forwards a valid result", async () => {
    const completeOcrJob = vi.fn().mockResolvedValue(undefined);
    const target = createApp({ authenticate: auth, services: () => ({ ...services, completeOcrJob }) });
    expect((await send(target, payload)).status).toBe(204);
    expect(completeOcrJob).toHaveBeenCalledWith({ jobId, payload });
    expect((await send(target, payload, "wrong-secret")).status).toBe(401);
    expect(completeOcrJob).toHaveBeenCalledTimes(1);
  });

  it.each([
    { ...payload, result: { ...payload.result, request_id: "b89dab0a-b89e-40b2-932e-ff4f295d8ba4" } },
    { ...payload, result: { ...payload.result, data: { viewer_player: 1 } } },
    { ...payload, errorCode: "OCR_JOB_EXPIRED" },
    { contractVersion: "1", errorCode: "UNKNOWN" },
  ])("rejects malformed or mismatched callbacks", async (body) => {
    expect((await send(app, body)).status).toBe(400);
  });

  it("asks OCRKit to retry transient or concurrent processing failures", async () => {
    const completeOcrJob = vi.fn().mockRejectedValue(new Error("temporary D1 error"));
    const target = createApp({ authenticate: auth, services: () => ({ ...services, completeOcrJob }) });
    expect((await send(target, payload)).status).toBe(503);
  });
});

  it("retains complete OCRKit evidence, including nullable low-quality data", async () => {
    const jobId = "b89dab0a-b89e-40b2-932e-ff4f295d8ba3";
    const result = {
      schema_version: "1", request_id: jobId, ok: true, engine: "paddleocr", model_version: "m1",
      fields: { map_name: { status: "ok", confidence: 0.99, value: "Paris", source_roi: "map_name", normalization: { raw: "Paris" } } },
      data: { map_name: "Paris", heroes_completed: 3, heroes_total: 40, achievement_title: "Title", achievement_unlocked: true, duration_text: "1:23" },
      quality: { original_size: [1920, 1080], resized_size: [1280, 720], cropped: false },
    };
    const completeOcrJob = vi.fn().mockResolvedValue(undefined);
    const target = createApp({ authenticate: auth, services: () => ({ ...services, completeOcrJob }) });
    const send = (body: unknown) => target.request(`http://localhost/v1/ocrkit/jobs/${jobId}/result`, { method: "POST", headers: { authorization: "Bearer callback-secret", "content-type": "application/json" }, body: JSON.stringify(body) }, { ...env, OCRKIT_API_TOKEN: "callback-secret" });
    expect((await send({ contractVersion: "1", result })).status).toBe(204);
    expect(completeOcrJob).toHaveBeenLastCalledWith({ jobId, payload: { contractVersion: "1", result } });
    const lowQuality = { ...result, ok: false, data: null };
    expect((await send({ contractVersion: "1", result: lowQuality })).status).toBe(204);
    expect(completeOcrJob).toHaveBeenLastCalledWith({ jobId, payload: { contractVersion: "1", result: lowQuality } });
  });
