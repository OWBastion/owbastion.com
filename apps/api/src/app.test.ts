import { afterEach, describe, expect, it, vi } from "vitest";
import type { Authenticator, PlatformServices } from "@owbastion/domain";
import { playerReviewResponseSchema, publicReviewSummaryResponseSchema, publicPlayerProfileSchema } from "@owbastion/contracts";
import { createApp, type RuntimeEnv } from "./app";


const auth = async () => ({ actorType: "service" as const, subject: "qqbot", roles: ["channel:write"], provider: "test" });
const maintainerContext = { actorType: "user" as const, subject: "admin", roles: ["maintainer"], provider: "test" };
const authenticateAsMaintainer = async () => maintainerContext;
const anonymousAuth = async () => null; const randomEventFixture = { eventId: "event.test", name: "稳住", category: "增益", rarity: "R", description: "测试事件", durationSeconds: 60, cooldownSeconds: .32, weight: 1, gameVersion: "5.0", eventGroup: null, effectTags: [] as string[], effectAnnotations: [], releaseStatus: "implemented" as const, archived: false, challenges: [], outcomes: [] };
const defaultServices: Partial<PlatformServices> = {
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
  getCurrentPlayerActivity: async ({ sessionToken }) => sessionToken === "session-token" ? { days: [{ date: "2026-10-06", runCount: 2 }, { date: "2026-10-07", runCount: 1 }] } : null,
  listCurrentPlayerChallengeProgress: async ({ sessionToken }) => sessionToken === "session-token" ? { contractVersion: "1" as const, items: [] } : null,
  listAgentEvents: async () => ({ contractVersion: "1", items: [], page: 1, pageSize: 20, total: 0, hasMore: false }),
  getAgentEvent: async () => null,
  getRandomEvent: async () => null,
  createAdminRandomEvent: async () => { throw new Error("CHALLENGE_NOT_FOUND"); },
  updateAdminRandomEvent: async () => { throw new Error("EVENT_NOT_FOUND"); },
  batchUpdateAdminRandomEvents: async () => { throw new Error("EVENT_NOT_FOUND"); },
  archiveAdminRandomEvent: async () => { throw new Error("EVENT_NOT_FOUND"); },
  listAdminRandomEventVersions: async () => ({ contractVersion: "1" as const, items: [] }),
  updateAdminRandomEventVersion: async ({ gameVersion, availability }) => ({ gameVersion, availability, mode: null, eventCount: 0 }),
  listAdminStandaloneModes: async () => ({ contractVersion: "1" as const, items: [] }),
  upsertAdminStandaloneMode: async ({ mode, mapIds, eventPools, eventWeightTotal }) => ({ mode, mapIds, eventPools, eventWeightTotal, createdAt: 0, updatedAt: 0 }),
  createAdminMap: async () => { throw new Error("MAP_NAME_CONFLICT"); },
  updateAdminMapMetadata: async () => { throw new Error("MAP_NOT_FOUND"); },
  getAdminMapEditor: async () => { throw new Error("MAP_NOT_FOUND"); },
  createAdminMapRevision: async () => { throw new Error("MAP_NOT_FOUND"); },
  updateAdminMapRevision: async () => { throw new Error("REVISION_NOT_FOUND"); },
  promoteAdminMapRevision: async () => { throw new Error("REVISION_NOT_FOUND"); },
  listChallenges: async () => [],
  listTitles: async () => [],
  uploadAdminTitleIcon: async () => ({ iconUrl: "https://api.example.com/v1/public/achievement-icons/TEST" }),
  getPublicTitleIcon: async () => null,
  uploadEvidence: async () => {},
  completePlayerUpload: async () => ({ submissionId: "00000000-0000-0000-0000-000000000003", status: "processing" }),
  listAdminSubmissions: async () => ({ contractVersion: "1", items: [], page: 1, pageSize: 50, total: 0, hasMore: false }),
  getAdminSubmission: async () => { throw new Error("SUBMISSION_NOT_FOUND"); },
  reopenAdminSubmission: async ({ submissionId }) => ({ contractVersion: "1", submissionId, status: "ocr_review_required", revokedGrantCount: 0, verifiedRunId: null }),
  reevaluateAdminSubmissionOcr: async ({ submissionId }) => ({ contractVersion: "1", submissionId, status: "approved" }),
  requestAdminOcr: async ({ submissionId }) => ({ contractVersion: "1", submissionId, status: "ocr_pending" }),
  resolveAdminSubmissionSpotCheck: async ({ submissionId, decision }) => ({ contractVersion: "1", submissionId, status: decision, grantId: null, verifiedRunId: null }),
  submitPlayerOcrFeedback: async (input) => ({ contractVersion: "1" as const, submissionId: input.submissionId, ocrResultId: input.ocrResultId, accuracy: input.accuracy, alreadySubmitted: false }),
  submitAdminOcrAccuracy: async (input) => ({ contractVersion: "1" as const, submissionId: input.submissionId, ocrResultId: input.ocrResultId, accuracy: input.accuracy, alreadySubmitted: false }),
  listAdminScreenshotSetCandidates: async () => ({ contractVersion: "1" as const, items: [], page: 1, pageSize: 20, total: 0, hasMore: false }),
  createAdminScreenshotSet: async () => ({ contractVersion: "1" as const, setId: "00000000-0000-4000-8000-000000000009", version: 1, status: "draft" as const, counts: { memberCount: 0, excludedCount: 0 } }),
  listAdminScreenshotSets: async ({ page, pageSize }) => ({ contractVersion: "1" as const, items: [], page, pageSize, total: 0, hasMore: false }),
  getAdminScreenshotSet: async () => { throw new Error("SCREENSHOT_SET_NOT_FOUND"); },
  finalizeAdminScreenshotSet: async () => { throw new Error("SCREENSHOT_SET_NOT_FOUND"); },
  discardAdminScreenshotSet: async () => { throw new Error("SCREENSHOT_SET_NOT_FOUND"); },
  getOcrkitScreenshotSet: async () => { throw new Error("SCREENSHOT_SET_NOT_FOUND"); },
  upsertQqGroupAccess: async () => {},
  registerQqGroup: async () => {},
  listQqGroupAccess: async () => [],
  dispatchPendingQqGroupPolicyEvents: async () => {},
  reconcileStaleOcrJobs: async () => 0,
  markQqGroupPolicyEventDelivered: async () => {},
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
  getPortalSessionIdentity: async ({ sessionToken }) => sessionToken === "session-token" ? { player: { playerId: "1234", isAdmin: false } } : null,
  listAgentMaps: async () => ({ contractVersion: "1", items: [], page: 1, pageSize: 20, total: 0, hasMore: false }),
  listRandomEvents: async () => [],
  listMaps: async () => [],
  listCurrentPlayerTitles: async ({ sessionToken }) => sessionToken === "session-token" ? { items: [{ grantId: "00000000-0000-0000-0000-000000000006", titleKey: "PIONEER", label: "开拓者", icon: "trophy", category: "社区贡献系列", condition: "完成萨摩亚地狱难度。", scope: "map", mapName: "萨摩亚", slot: "pioneer", grantedAt: 4 }], allTitles: false } : null,
  listAdminPlayers: async () => ({ contractVersion: "1" as const, items: [], page: 1, pageSize: 25, total: 0, hasMore: false }),
  createPlayerUploadSession: async () => ({ contractVersion: "1", submissionId: "00000000-0000-0000-0000-000000000003", uploadId: "00000000-0000-0000-0000-000000000004", uploadUrl: "http://localhost/upload", expiresAt: 1, maxBytes: 10 }),
  getPlayerSubmission: async () => ({ contractVersion: "1", submissionId: "00000000-0000-0000-0000-000000000003", status: "needs_review", mapName: "Test Map", createdAt: 1, updatedAt: 2, evidenceUrl: "https://evidence.owbastion.codes/uploads/submissions/opaque-object-key.png", ocr: { mapName: "Test Map", difficulty: "困难", playerName: "Player", challengeCompleted: true } }),
  previewSubmissionReview: async ({ submissionId }) => ({ contractVersion: "1", submissionId, evidenceOutcome: "review", candidates: [], completions: [], titles: [], verifiedRun: { status: "ineligible", reason: "missing_match_code", supersededFields: [] }, approvable: false, blockingCode: "SUBMISSION_OUTCOME_NOT_CONFIGURED", knownModes: [], matchCodeCandidates: [] }),
  reviewSubmission: async () => ({ contractVersion: "1", submissionId: "00000000-0000-4000-8000-000000000000", decision: "rejected", grant: null }),
  processOcrJob: async () => {},
  completeOcrJob: async () => {},
  markOcrJobFailed: async () => {},
  requestManualReview: async () => {},
  createAdminBindingInvite: async () => ({ contractVersion: "1", inviteId: "00000000-0000-0000-0000-000000000007", code: "ABCDEFGHIJKL", playerName: "Player", playerId: "1234", expiresAt: 1, historicalMigration: { status: "not_requested" as const, requestedCount: 0, completedCount: 0, conflictCount: 0, retryCount: 0 } }),
  createAdminBindingInviteBatch: async () => ({ contractVersion: "1", items: [{ contractVersion: "1", inviteId: "00000000-0000-0000-0000-000000000007", code: "ABCDEFGHIJKL", playerName: "Player", playerId: "1234", expiresAt: 1, historicalMigration: { status: "not_requested" as const, requestedCount: 0, completedCount: 0, conflictCount: 0, retryCount: 0 } }] }),
  listAdminBindingInvites: async () => ({ contractVersion: "1", items: [{ inviteId: "00000000-0000-0000-0000-000000000007", playerName: "Player", playerId: "1234", status: "active" as const, codeAvailable: true, createdAt: 1, expiresAt: 2, historicalMigration: { status: "not_requested" as const, requestedCount: 0, completedCount: 0, conflictCount: 0, retryCount: 0 } }] }),
  getAdminBindingInviteCode: async () => ({ contractVersion: "1", inviteId: "00000000-0000-0000-0000-000000000007", code: "ABCDEFGHIJKL" }),
  decideAdminBindingClaim: async () => {},
  redeemBindingInvite: async () => ({ contractVersion: "1", claimId: "00000000-0000-0000-0000-000000000008", claimToken: "a".repeat(64), code: "ABC234", playerName: "Player", playerId: "1234", expiresAt: 1 }),
  getBindingClaimStatus: async () => ({ contractVersion: "1", status: "pending_confirmation", expiresAt: 1, historicalMigration: { status: "not_requested" as const, requestedCount: 0, restoredCount: 0 } }),
  verifyBindingClaim: async () => ({ contractVersion: "1", status: "verified", environment: "test" }),
  getSubmission: async () => ({ contractVersion: "1", submissionId: "00000000-0000-0000-0000-000000000003", status: "processing", mapName: "Test Map", createdAt: 1, updatedAt: 1 }),
  createQqLoginAttempt: async () => ({ contractVersion: "1", attemptId: "00000000-0000-0000-0000-000000000005", attemptToken: "a".repeat(64), code: "ABC234", expiresAt: 1 }),
  getQqLoginStatus: async () => ({ contractVersion: "1", status: "pending" }),
  verifyQqLogin: async () => ({ contractVersion: "1", status: "verified", environment: "test" }),
  getCurrentPlayer: async ({ sessionToken }) => sessionToken === "session-token" ? {
    contractVersion: "1",
    player: { playerId: "1234", playerName: "Player", isAdmin: false, publicProfile: true, hideBattleTag: false },
    recentSubmissions: [{ submissionId: "00000000-0000-0000-0000-000000000003", status: "processing", mapName: "Test Map", createdAt: 2, updatedAt: 3 }],
  } : null,
  updateCurrentPlayerProfileVisibility: async (input) => input.sessionToken === "session-token" ? { contractVersion: "1" as const, publicProfile: input.publicProfile, hideBattleTag: input.hideBattleTag } : (() => { throw new Error("UNAUTHENTICATED"); })(),
  getPublicLeaderboard: async ({ board, mapId }) => mapId === "missing-map" ? null : { contractVersion: "1" as const, board, ...(mapId ? { mapId } : {}), ruleVersion: "leaderboard.v1", items: [{ rank: 1, score: 500, reachedAt: 100, player: { playerKey: "key-alpha", displayName: "Alpha", equippedTitle: null } }], page: 1, pageSize: 20, total: 1, hasMore: false },
  getPublicLeaderboardPlayer: async ({ playerKey }) => playerKey === "key-alpha" ? { contractVersion: "1" as const, publicProfile: true, player: { displayName: "Alpha", equippedTitle: null }, boards: { mastery: { rank: 1, score: 500 }, achievement: null }, perMapXp: [], mapCount: 0, titles: { map: [], general: [] } } : null,
  getCurrentPlayerLeaderboardRank: async ({ sessionToken, board, mapId }) => sessionToken !== "session-token" ? null : (() => { if (mapId === "missing-map") throw new Error("MAP_NOT_FOUND"); return { contractVersion: "1" as const, board, ...(mapId ? { mapId } : {}), ruleVersion: "leaderboard.v1", rank: 2, score: 300, reachedAt: 90, gapToNextRank: 200 }; })(),
  createPasskeyLoginOptions: async () => ({ contractVersion: "1", challengeId: "00000000-0000-4000-8000-000000000011", options: { challenge: "challenge" } }),
  exchangeBindingClaimSession: async () => ({ contractVersion: "1" as const, status: "authenticated" as const, sessionToken: "claim-session-token" }),
};

const makeServices = (overrides: Partial<PlatformServices> = {}): PlatformServices => new Proxy({ ...defaultServices, ...overrides } as PlatformServices, {
  get(target, property, receiver) {
    if (Reflect.has(target, property)) return Reflect.get(target, property, receiver);
    if (typeof property === "string") return () => { throw new Error(`UNMOCKED_PLATFORM_SERVICE:${property}`); };
    return undefined;
  },
});

const services = makeServices();

const createTestApp = (overrides: Partial<PlatformServices> = {}, authenticate: Authenticator<RuntimeEnv> = auth) => createApp({
  authenticate,
  services: () => makeServices(overrides),
  turnstile: async () => undefined,
});

const app = createTestApp();

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

  it("returns player IDs only with the Bastion build token", async () => {
    const agentApp = createTestApp({
      listAgentPlayerTitleGrants: async () => ({ contractVersion: "1" as const, items: [{ playerId: "1234", playerName: "Player", titleKeys: ["TITLE"], allTitles: false }], page: 1, pageSize: 20, total: 1, hasMore: false }),
    });
    const response = await agentApp.request("http://localhost/v1/agents/player-title-grants?page=1&pageSize=20", { headers: { authorization: "Bearer bastion-token" } }, { ...env, BASTION_BUILD_TOKEN: "bastion-token" });
    expect(response.status).toBe(200);
    expect((await response.json() as { items: Array<{ playerId?: string }> }).items[0].playerId).toBe("1234");
    expect(response.headers.get("Cache-Control")).toBe("private, no-store");
  });

  it("fails closed when map title-holder projection is unavailable", async () => {
    const agentApp = createTestApp({
      getAgentMap: async () => ({ mapId: "map.test", mapName: "测试地图", gameVersion: "2026.07.15", difficultyRating: null, mechanics: [], coverUrl: null, backgroundUrl: null, gameplayRevisions: [] }),
      listAgentMapTitleHolders: async () => { throw new Error("AGENT_MAP_TITLE_PROJECTION_UNAVAILABLE"); },
    });
    const response = await agentApp.request("http://localhost/v1/agents/map-title-holders?mapId=map.test&page=1&pageSize=20", {}, env);
    expect(response.status).toBe(503);
    expect(await response.json()).toMatchObject({ contractVersion: "1", error: { code: "AGENT_MAP_TITLE_PROJECTION_UNAVAILABLE" } });
  });

  it("lists public random events without development records", async () => {
    const eventApp = createTestApp({ listRandomEvents: async () => [{ ...randomEventFixture, effectTags: ["护盾"] }] });
    const response = await eventApp.request("http://localhost/v1/events", {}, env);
    expect(response.status).toBe(200);
    expect((await response.json() as { items: Array<{ name: string }> }).items[0]?.name).toBe("稳住");
    expect(response.headers.get("cache-control")).toBe("public, max-age=300, s-maxage=300");
  });

  it("returns private, no-store for filtered variants, build-token requests, and identity-reading routes", async () => {
    const cache = new FakeCache();
    vi.stubGlobal("caches", { default: cache });
    const cacheApp = createTestApp({
      getCurrentPlayer: async ({ sessionToken }) => sessionToken === "player-session" ? {
        contractVersion: "1" as const,
        player: { playerId: "p1", playerName: "Player", isAdmin: false, publicProfile: true, hideBattleTag: false },
        recentSubmissions: [],
      } : null,
      listChallenges: async () => [],
      listTitles: async () => [],
    }, anonymousAuth);

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

  it("separates public Agents responses from authenticated build reads", async () => {
    const publicResponse = await app.request("http://localhost/v1/agents/events?page=1&pageSize=20", {}, { ...env, BASTION_BUILD_TOKEN: "build-token" });
    const buildResponse = await app.request("http://localhost/v1/agents/events?page=1&pageSize=20", { headers: { authorization: "Bearer build-token" } }, { ...env, BASTION_BUILD_TOKEN: "build-token" });
    expect(publicResponse.headers.get("cache-control")).toBe("public, max-age=300, s-maxage=300");
    expect(publicResponse.headers.get("vary")).toBe("Authorization");
    expect(buildResponse.headers.get("cache-control")).toBe("private, no-store");
  });
  it("requires a maintainer, an idempotency key, and a valid body for batch event updates", async () => {
    const send = (application: typeof app, headers: Record<string, string>, body: unknown) => application.request("http://localhost/v1/admin/events/batch", { method: "POST", headers: { "content-type": "application/json", ...headers }, body: JSON.stringify(body) }, env);
    const valid = { contractVersion: "1", updates: [{ eventId: "event.a", weight: 0.5 }] };
    expect((await send(app, {}, valid)).status).toBe(403);
    const calls: unknown[] = [];
    const maintainerApp = createApp({ authenticate: async () => ({ actorType: "user" as const, subject: "admin", roles: ["maintainer"], provider: "test" }), services: () => ({ ...services, batchUpdateAdminRandomEvents: async (input, _auth, key) => { calls.push([input.updates, key]); return []; } }) });
    expect((await send(maintainerApp, {}, valid)).status).toBe(422);
    expect((await send(maintainerApp, { "idempotency-key": "k" }, { contractVersion: "1", updates: [{ eventId: "event.a" }] })).status).toBe(422);
    expect((await send(maintainerApp, { "idempotency-key": "k" }, { contractVersion: "1", updates: [{ eventId: "event.a", weight: 1 }, { eventId: "event.a", weight: 2 }] })).status).toBe(422);
    expect((await send(maintainerApp, { "idempotency-key": "k" }, valid)).status).toBe(200);
    expect(calls).toEqual([[[{ eventId: "event.a", weight: 0.5 }], "k"]]);
    const missing = createApp({ authenticate: async () => ({ actorType: "user" as const, subject: "admin", roles: ["maintainer"], provider: "test" }), services: () => services });
    expect((await send(missing, { "idempotency-key": "k" }, valid)).status).toBe(404);
  });
  it("reports health without external services and identifies its deployment revision", async () => {
    const response = await app.request("http://localhost/health", {}, { ...env, DEPLOYMENT_REVISION: "sha-0123456789abcdef" });
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ service: "api", status: "ok", deploymentRevision: "sha-0123456789abcdef" });
    expect(response.headers.get("cache-control")).toBe("private, no-store");
  });

  describe("X-Request-ID middleware", () => {

    it("marks administrative responses as private and no-store", async () => {
      const response = await app.request("http://localhost/v1/admin/events", {}, env);
      expect(response.status).toBe(403);
      expect(response.headers.get("cache-control")).toBe("private, no-store");
    });

  });

  it("limits invitation creation and claim decisions to maintainers", async () => {
    const body = JSON.stringify({ contractVersion: "1", playerName: "Player", playerId: "1234" });
    expect((await app.request("http://localhost/v1/admin/binding-invites", { method: "POST", headers: { "content-type": "application/json", "idempotency-key": "invite-1" }, body }, env)).status).toBe(403);
    const adminApp = createTestApp({}, authenticateAsMaintainer);
    expect((await adminApp.request("http://localhost/v1/admin/binding-invites", { method: "POST", headers: { "content-type": "application/json", "idempotency-key": "invite-1" }, body }, env)).status).toBe(201);
    expect((await adminApp.request("http://localhost/v1/admin/binding-claims/00000000-0000-0000-0000-000000000008/decision", { method: "POST", headers: { "content-type": "application/json", "idempotency-key": "claim-1" }, body: JSON.stringify({ contractVersion: "1", decision: "approved" }) }, env)).status).toBe(204);
  });

  it("lists issued invitation status only for maintainers", async () => {
    expect((await app.request("http://localhost/v1/admin/binding-invites", {}, env)).status).toBe(403);
    const adminApp = createTestApp({}, authenticateAsMaintainer);
    const response = await adminApp.request("http://localhost/v1/admin/binding-invites", {}, env);
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ items: [{ playerName: "Player", status: "active" }] });
  });

  it("lists binding claims only for maintainers", async () => {
    expect((await app.request("http://localhost/v1/admin/binding-claims", {}, env)).status).toBe(403);
    const adminApp = createTestApp({ listAdminBindingClaims: async () => ({ contractVersion: "1", items: [{ claimId: "c1", playerName: "Player", playerId: "1234", status: "expired" as const, createdAt: 1, invitedBy: "admin" }] }) }, authenticateAsMaintainer);
    const response = await adminApp.request("http://localhost/v1/admin/binding-claims", {}, env);
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ items: [{ claimId: "c1", status: "expired" }] });
  });

  it("returns an active invitation code only to maintainers", async () => {
    const path = "http://localhost/v1/admin/binding-invites/00000000-0000-0000-0000-000000000007/code";
    expect((await app.request(path, {}, env)).status).toBe(403);
    const adminApp = createTestApp({}, authenticateAsMaintainer);
    const response = await adminApp.request(path, {}, env);
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ code: "ABCDEFGHIJKL" });
  });

  it("revokes unused invitations only for maintainers", async () => {
    const body = JSON.stringify({ contractVersion: "1" });
    const path = "http://localhost/v1/admin/binding-invites/00000000-0000-0000-0000-000000000007/revoke";
    expect((await app.request(path, { method: "POST", headers: { "content-type": "application/json", "idempotency-key": "revoke-1" }, body }, env)).status).toBe(403);
    const revoked: Array<{ inviteId: string; reason?: string }> = [];
    const adminApp = createTestApp({ revokeAdminBindingInvite: async (input) => { revoked.push(input); } }, authenticateAsMaintainer);
    expect((await adminApp.request(path, { method: "POST", headers: { "content-type": "application/json", "idempotency-key": "revoke-1" }, body }, env)).status).toBe(204);
    expect(revoked).toEqual([{ inviteId: "00000000-0000-0000-0000-000000000007", contractVersion: "1" }]);
  });

  it("creates a batch of binding invitations for maintainers", async () => {
    const body = JSON.stringify({ contractVersion: "1", invitations: [{ playerName: "Player", playerId: "1234" }, { playerName: "Another", playerId: "5678" }] });
    expect((await app.request("http://localhost/v1/admin/binding-invites/batch", { method: "POST", headers: { "content-type": "application/json", "idempotency-key": "batch-invite-1" }, body }, env)).status).toBe(403);
    const adminApp = createTestApp({}, authenticateAsMaintainer);
    const response = await adminApp.request("http://localhost/v1/admin/binding-invites/batch", { method: "POST", headers: { "content-type": "application/json", "idempotency-key": "batch-invite-1" }, body }, env);
    expect(response.status).toBe(201);
    expect(await response.json()).toMatchObject({ items: [{ code: "ABCDEFGHIJKL" }] });
    const duplicate = JSON.stringify({ contractVersion: "1", invitations: [{ playerName: "Player", playerId: "1234" }, { playerName: "player", playerId: "1234" }] });
    expect((await adminApp.request("http://localhost/v1/admin/binding-invites/batch", { method: "POST", headers: { "content-type": "application/json", "idempotency-key": "batch-invite-duplicate" }, body: duplicate }, env)).status).toBe(422);
  });

  it("returns a claim status only with the claim token", async () => {
    const path = "http://localhost/v1/public/binding-claims/00000000-0000-0000-0000-000000000008";
    expect((await app.request(path, {}, env)).status).toBe(422);
    const response = await app.request(path, { headers: { "x-claim-token": "a".repeat(64) } }, env);
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ contractVersion: "1", status: "pending_confirmation", expiresAt: 1, historicalMigration: { status: "not_requested", requestedCount: 0, restoredCount: 0 } });
  });

  it("returns only public submission status fields", async () => {
    const response = await app.request("http://localhost/v1/submissions/00000000-0000-0000-0000-000000000003");
    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toBe("private, no-store");
    expect(await response.json()).toEqual({ contractVersion: "1", submissionId: "00000000-0000-0000-0000-000000000003", status: "processing", mapName: "Test Map", createdAt: 1, updatedAt: 1 });
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
    const verifiedApp = createTestApp({
      getQqLoginStatus: async () => ({ contractVersion: "1", status: "verified", environment: "production", sessionToken: "a".repeat(64) }),
    });
    const response = await verifiedApp.request("https://api.owbastion.com/v1/auth/qq/login-attempt/00000000-0000-0000-0000-000000000005", { headers: { "x-login-attempt-token": "a".repeat(64) } }, env);
    expect(response.headers.get("set-cookie")).toContain("Secure");
    expect(response.headers.get("access-control-allow-origin")).toBe("https://owbastion.com");
  });

  it("sets a secure Portal session only after Passkey verification from the Portal origin", async () => {
    const completed: Array<{ challengeId: string; origin: string; rpId: string }> = [];
    const verifiedApp = createTestApp({
      completePasskeyLogin: async (input) => { completed.push({ challengeId: input.challengeId, origin: input.origin, rpId: input.rpId }); return { sessionToken: "a".repeat(64) }; },
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
    const adminApp = createTestApp({
      createAdminPasskeyRecovery: async (input, auth, idempotencyKey) => {
        issued.push({ input, auth, idempotencyKey });
        return { token: "r".repeat(64), expiresAt: 1_800_000_000_000 };
      },
    }, async () => ({ actorType: "user" as const, subject: "admin.1", roles: ["maintainer"], provider: "test" }));
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

  describe("Turnstile guard on unauthenticated writes", () => {
    const turnstileEnv = { ...env, TURNSTILE_SECRET_KEY: "test-secret" };
    const loginAttemptBody = JSON.stringify({ contractVersion: "1", provider: "qq" });
    const jsonHeaders = { "content-type": "application/json" };
    const guardedApp = (overrides: Partial<PlatformServices> = {}) => createApp({ authenticate: auth, services: () => makeServices(overrides) });

    it("rejects the three endpoints without a token before any service call", async () => {
      const createQqLoginAttempt = vi.fn();
      const redeemBindingInvite = vi.fn();
      const createPasskeyLoginOptions = vi.fn();
      const siteverify = vi.fn();
      vi.stubGlobal("fetch", siteverify);
      const guarded = guardedApp({ createQqLoginAttempt, redeemBindingInvite, createPasskeyLoginOptions });
      const requests: Array<[string, RequestInit]> = [
        ["http://localhost/v1/auth/qq/login-attempt", { method: "POST", headers: jsonHeaders, body: loginAttemptBody }],
        ["http://localhost/v1/public/binding-invites/redeem", { method: "POST", headers: jsonHeaders, body: JSON.stringify({ contractVersion: "1", code: "ABCDEFGHIJKL" }) }],
        ["https://api.owbastion.com/v1/auth/passkeys/login/options", { method: "POST", headers: { ...jsonHeaders, origin: "https://owbastion.com" }, body: JSON.stringify({ contractVersion: "1" }) }],
      ];
      for (const [url, init] of requests) {
        const response = await guarded.request(url, init, turnstileEnv);
        expect(response.status).toBe(422);
        expect(await response.json()).toMatchObject({ error: { code: "TURNSTILE_TOKEN_REQUIRED" } });
      }
      expect(siteverify).not.toHaveBeenCalled();
      for (const service of [createQqLoginAttempt, redeemBindingInvite, createPasskeyLoginOptions]) expect(service).not.toHaveBeenCalled();
    });

    it("fails closed when the Turnstile secret is not configured", async () => {
      const createQqLoginAttempt = vi.fn();
      const siteverify = vi.fn();
      vi.stubGlobal("fetch", siteverify);
      const response = await guardedApp({ createQqLoginAttempt }).request("http://localhost/v1/auth/qq/login-attempt", { method: "POST", headers: { ...jsonHeaders, "cf-turnstile-response": "widget-token" }, body: loginAttemptBody }, env);
      expect(response.status).toBe(503);
      expect(await response.json()).toMatchObject({ error: { code: "TURNSTILE_UNAVAILABLE" } });
      expect(siteverify).not.toHaveBeenCalled();
      expect(createQqLoginAttempt).not.toHaveBeenCalled();
    });

    it("rejects a token the verifier refuses without writing", async () => {
      vi.stubGlobal("fetch", vi.fn(async () => Response.json({ success: false })));
      const createQqLoginAttempt = vi.fn();
      const response = await guardedApp({ createQqLoginAttempt }).request("http://localhost/v1/auth/qq/login-attempt", { method: "POST", headers: { ...jsonHeaders, "cf-turnstile-response": "stale-token" }, body: loginAttemptBody }, turnstileEnv);
      expect(response.status).toBe(403);
      expect(await response.json()).toMatchObject({ error: { code: "TURNSTILE_VERIFICATION_FAILED" } });
      expect(createQqLoginAttempt).not.toHaveBeenCalled();
    });

    it("fails closed when the verifier is unreachable", async () => {
      vi.stubGlobal("fetch", vi.fn(async () => { throw new Error("network down"); }));
      const redeemBindingInvite = vi.fn();
      const response = await guardedApp({ redeemBindingInvite }).request("http://localhost/v1/public/binding-invites/redeem", { method: "POST", headers: { ...jsonHeaders, "cf-turnstile-response": "widget-token" }, body: JSON.stringify({ contractVersion: "1", code: "ABCDEFGHIJKL" }) }, turnstileEnv);
      expect(response.status).toBe(503);
      expect(await response.json()).toMatchObject({ error: { code: "TURNSTILE_UNAVAILABLE" } });
      expect(redeemBindingInvite).not.toHaveBeenCalled();
    });

  });

  it("requires a valid portal session and returns only player-facing fields", async () => {
    const unauthenticated = await app.request("http://localhost/v1/me", {}, env);
    expect(unauthenticated.status).toBe(401);

    const response = await app.request("http://localhost/v1/me", { headers: { cookie: "owb_session=session-token" } }, env);
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      contractVersion: "1",
      player: { playerId: "1234", playerName: "Player", isAdmin: false, publicProfile: true, hideBattleTag: false },
      recentSubmissions: [{ submissionId: "00000000-0000-0000-0000-000000000003", status: "processing", mapName: "Test Map", createdAt: 2, updatedAt: 3 }],
    });
  });

  it("lets only the signed-in player update their public-profile visibility", async () => {
    expect((await app.request("http://localhost/v1/me/profile/visibility", { method: "PUT", headers: { "content-type": "application/json", "idempotency-key": "vis-unauth" }, body: JSON.stringify({ contractVersion: "1", publicProfile: false, hideBattleTag: false }) }, env)).status).toBe(401);
    expect((await app.request("http://localhost/v1/me/profile/visibility", { method: "PUT", headers: { "content-type": "application/json", cookie: "owb_session=session-token" }, body: JSON.stringify({ contractVersion: "1", publicProfile: false, hideBattleTag: false }) }, env)).status).toBe(422);
    expect((await app.request("http://localhost/v1/me/profile/visibility", { method: "PUT", headers: { "content-type": "application/json", cookie: "owb_session=session-token", "idempotency-key": "vis-bad" }, body: JSON.stringify({ contractVersion: "1", publicProfile: "no" }) }, env)).status).toBe(422);
    const response = await app.request("http://localhost/v1/me/profile/visibility", { method: "PUT", headers: { "content-type": "application/json", cookie: "owb_session=session-token", "idempotency-key": "vis-off" }, body: JSON.stringify({ contractVersion: "1", publicProfile: false, hideBattleTag: false }) }, env);
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(await response.json()).toEqual({ contractVersion: "1", publicProfile: false, hideBattleTag: false });
    expect((await app.request("http://localhost/v1/me/profile/visibility", { method: "PUT", headers: { "content-type": "application/json", cookie: "owb_session=other-token", "idempotency-key": "vis-other" }, body: JSON.stringify({ contractVersion: "1", publicProfile: false, hideBattleTag: false }) }, env)).status).toBe(401);
  });

  it("returns only the signed-in player's active mastery projections", async () => {
    const calls: Array<{ sessionToken: string; mapId?: string; gameplayRevisionId?: string; page: number; pageSize: number }> = [];
    const masteryApp = createTestApp({
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

  it("returns only the signed-in player's per-day activity counts", async () => {
    expect((await app.request("http://localhost/v1/me/activity", {}, env)).status).toBe(401);
    const response = await app.request("http://localhost/v1/me/activity", { headers: { cookie: "owb_session=session-token" } }, env);
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    const body = await response.json() as Record<string, unknown>;
    expect(body).toMatchObject({ contractVersion: "1", days: [{ date: "2026-10-06", runCount: 2 }, { date: "2026-10-07", runCount: 1 }] });
    expect(JSON.stringify(body)).not.toMatch(/playerAccount|matchCode|submission|revision|runId|mapId|evidence|ocr|audit|risk|qq/i);
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
    const reviewApp = createTestApp({
      getPlayerReview: async (target, currentAuth) => { calls.push({ operation: "read", subject: currentAuth.subject, target }); return { ...review, status: currentStatus }; },
      upsertReview: async (input, currentAuth, key) => { calls.push({ operation: "upsert", subject: currentAuth.subject, target: input, key }); return review; },
      withdrawReview: async (input, currentAuth, key) => { currentStatus = "withdrawn"; calls.push({ operation: "withdraw", subject: currentAuth.subject, target: input, key }); return { ...review, status: "withdrawn" as const, withdrawnAt: 3 }; },
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

  it("limits review identity and moderation operations to maintainers", async () => {
    const reviewId = "00000000-0000-4000-8000-000000000003";
    const adminReview = { reviewId, targetType: "map" as const, targetId: "map.test", gameplayRevisionId: "revision.test", targetName: "地图", playerAccountId: "11111111-1111-4111-8111-111111111111", playerId: "1234", playerName: "Player", sourceLabel: null, rating: 4 as const, comment: null, anonymous: true, commentStatus: "visible" as const, status: "active" as const, createdAt: 1, updatedAt: 2, withdrawnAt: null, invalidatedAt: null, invalidatedBy: null, invalidationReason: null };
    const detail = { contractVersion: "1" as const, review: adminReview, audit: [{ operation: "review.create", actorType: "user", actorId: "1234", reason: null, createdAt: 1 }] };
    const calls: Array<{ operation: string; input: unknown; key: string }> = [];
    const reviewApp = createTestApp({
      listAdminReviews: async (input) => ({ contractVersion: "1" as const, items: [adminReview], page: input.page, pageSize: input.pageSize, total: 1, hasMore: false }),
      getAdminReview: async () => detail,
      hideReviewComment: async (input, _auth, key) => { calls.push({ operation: "comment", input, key }); return { ...adminReview, commentStatus: "hidden" as const }; },
      invalidateReview: async (input, _auth, key) => { calls.push({ operation: "state", input, key }); return { ...adminReview, status: "invalidated" as const }; },
    }, authenticateAsMaintainer);
    const unauthenticated = createTestApp({}, anonymousAuth);
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
    const masteryApp = createTestApp({
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
    }, authenticateAsMaintainer);
    const unauthenticated = createTestApp({}, anonymousAuth);
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
    const publicApp = createTestApp({
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

  it("does not reveal another player's submission", async () => {
    const privateApp = createTestApp({
      getPlayerSubmission: async () => { throw new Error("SUBMISSION_NOT_FOUND"); },
    });
    const response = await privateApp.request("http://localhost/v1/me/submissions/00000000-0000-0000-0000-000000000003", { headers: { cookie: "owb_session=session-token" } }, env);
    expect(response.status).toBe(404);
    expect((await response.json() as { error: { code: string } }).error.code).toBe("SUBMISSION_NOT_FOUND");
  });

  it("limits historical title migration to maintainers and requires idempotency", async () => {
    const createAdminTitleGrant = async () => {};
    const adminApp = createTestApp({ createAdminTitleGrant }, authenticateAsMaintainer);
    const body = JSON.stringify({ contractVersion: "1", playerAccountId: "11111111-1111-4111-8111-111111111111", historicalTitleGrantId: "22222222-2222-4222-8222-222222222222" });
    expect((await adminApp.request("http://localhost/v1/admin/title-grants", { method: "POST", headers: { "content-type": "application/json" }, body }, env)).status).toBe(422);
    expect((await adminApp.request("http://localhost/v1/admin/title-grants", { method: "POST", headers: { "content-type": "application/json", "idempotency-key": "title-grant-1" }, body }, env)).status).toBe(204);
  });

  it("exposes manual title grants only to maintainers", async () => {
    const manualGrant = { contractVersion: "1" as const, grantId: "00000000-0000-4000-8000-000000000009", titleKey: "PIONEER", titleName: "开拓者", mapId: null, slot: null, alreadyOwned: true };
    const adminApp = createTestApp({ createAdminManualTitleGrant: async () => manualGrant }, authenticateAsMaintainer);
    const body = JSON.stringify({ contractVersion: "1", playerAccountId: "11111111-1111-4111-8111-111111111111", titleKey: "PIONEER", reason: "申诉纠正" });
    expect((await app.request("http://localhost/v1/admin/title-grants/manual", { method: "POST", headers: { "content-type": "application/json", "idempotency-key": "manual-1" }, body }, env)).status).toBe(403);
    const response = await adminApp.request("http://localhost/v1/admin/title-grants/manual", { method: "POST", headers: { "content-type": "application/json", "idempotency-key": "manual-1" }, body }, env);
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual(manualGrant);
  });

  it("restores administrator-revoked title grants only for maintainers", async () => {
    const requests: unknown[] = [];
    const adminApp = createTestApp({
      restoreAdminTitleGrant: async (input, _auth, idempotencyKey) => { requests.push({ input, idempotencyKey }); },
    }, authenticateAsMaintainer);
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
    const adminApp = createTestApp({
      createAdminManualTitleGrantBatch: async (input, _auth, idempotencyKey) => {
        const serialized = JSON.stringify(input);
        const existing = requestByKey.get(idempotencyKey);
        if (existing && existing !== serialized) throw new Error("IDEMPOTENCY_CONFLICT");
        if (!existing) { requestByKey.set(idempotencyKey, serialized); requests.push({ input, idempotencyKey }); }
        return batchResponse;
      },
    }, authenticateAsMaintainer);
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

  it("limits achievement management to maintainers and validates lifecycle updates", async () => {
    const updates: unknown[] = [];
    const catalogUpdates: unknown[] = [];
    const adminApp = createTestApp({
      listAdminChallenges: async ({ family, status }) => ({ contractVersion: "1", items: family === "achievement" && status === "active" ? [{ challengeId: "title.flawless", family: "achievement", type: "title_achievement", kind: "title_achievement", titleKey: "FLAWLESS", titleName: "完美无缺", icon: "zap", category: "极限操作系列", categoryOverride: null, condition: "单局跳过英雄次数为 0 且通关。", evidenceRule: "完整截图", gameVersion: "2026.07.15", status: "active", submissionMode: "manual", introducedVersion: "2026.07.15", retiredVersion: null }] : family === undefined ? [{ challengeId: "title.INTERNAL", family: "title_catalog", type: "title_catalog", titleKey: "INTERNAL", titleName: "内部称号", icon: "wrench", category: "开发保留", condition: "开发/管理用途。", lifecycle: "active", publicVisibility: true, availability: "active", scope: "global", displayKind: "fixed", gameVersion: "2026.07.15", hasChallenge: false }] : [] }),
      updateAdminChallenge: async (input) => { if (input.family !== "achievement") throw new Error("CHALLENGE_NOT_FOUND"); updates.push(input); return { challengeId: input.challengeId, family: "achievement", type: "title_achievement", kind: "title_achievement", titleKey: "FLAWLESS", titleName: "完美无缺", icon: "zap", category: input.categoryOverride ?? "极限操作系列", categoryOverride: input.categoryOverride, condition: input.condition, evidenceRule: input.evidenceRule, gameVersion: "2026.07.15", status: input.status, submissionMode: input.submissionMode, introducedVersion: "2026.07.15", retiredVersion: input.status === "active" ? input.retiredVersion ?? null : null } as const; },
      updateAdminCatalogTitle: async (input) => { catalogUpdates.push(input); return { contractVersion: "1", previousLifecycle: "active", title: { titleKey: input.titleKey, label: "内部称号", icon: "wrench", iconUrl: null, category: "开发保留", scope: "global", displayKind: "fixed", color: null, publicVisibility: true, lifecycle: input.lifecycle ?? "active", gameVersion: null, developerOnly: true, status: "ended", acquisition: { kind: "none" } } }; },
    }, authenticateAsMaintainer);
    expect((await app.request("http://localhost/v1/admin/achievements", {}, env)).status).toBe(403);
    const anonymousApp = createTestApp({}, anonymousAuth);
    expect((await anonymousApp.request("http://localhost/v1/admin/achievements", {}, env)).status).toBe(401);
    const listed = await adminApp.request("http://localhost/v1/admin/achievements?type=title_achievement&status=active", {}, env);
    expect(listed.status).toBe(200);
    expect(listed.headers.get("cache-control")).toBe("private, no-store");
    const denied = await app.request("http://localhost/v1/admin/achievements", {}, env);
    expect(denied.headers.get("cache-control")).toBe("private, no-store");
    expect(await listed.json()).toMatchObject({ items: [{ family: "achievement", categoryOverride: null }] });
    const retirement = { contractVersion: "1", saveMode: "in_place", condition: "单局跳过英雄次数为 0 且通关。", evidenceRule: "完整截图", submissionMode: "manual", categoryOverride: "极限操作系列", status: "archived" };
    expect((await adminApp.request("http://localhost/v1/admin/achievements/title.flawless", { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify(retirement) }, env)).status).toBe(422);
    const updated = await adminApp.request("http://localhost/v1/admin/achievements/title.flawless", { method: "PUT", headers: { "content-type": "application/json", "idempotency-key": "achievement-1" }, body: JSON.stringify(retirement) }, env);
    expect(updated.status).toBe(200);
    expect(await updated.json()).toMatchObject({ challengeId: "title.flawless", family: "achievement", status: "archived", retiredVersion: null });
    expect(updates).toMatchObject([{ challengeId: "title.flawless", status: "archived" }]);
    const catalog = await adminApp.request("http://localhost/v1/admin/achievements", {}, env);
    expect(await catalog.json()).toMatchObject({ items: [{ family: "title_catalog", titleKey: "INTERNAL", hasChallenge: false }] });
    const titleStatus = await adminApp.request("http://localhost/v1/admin/titles/INTERNAL", { method: "PUT", headers: { "content-type": "application/json", "idempotency-key": "title-catalog-1" }, body: JSON.stringify({ contractVersion: "1", lifecycle: "draft" }) }, env);
    expect(titleStatus.status).toBe(200);
    expect(catalogUpdates).toMatchObject([{ titleKey: "INTERNAL", lifecycle: "draft" }]);
  });

  it("publishes map catalogs while protecting player-only catalogs", async () => {
    const requestedFamilies: Array<string | undefined> = [];
    const catalogServices = makeServices({
      listMaps: async () => [{ mapId: "map.samoa", mapName: "萨摩亚", gameVersion: "2026.07.15", difficultyRating: "T3", mechanics: ["动态掩体"], coverUrl: null, backgroundUrl: null }],
        listChallenges: async (input) => {
        requestedFamilies.push(input?.family);
        if (input?.family === "achievement") return [{ challengeId: "title.flawless", family: "achievement", type: "title_achievement", kind: "title_achievement", titleKey: "FLAWLESS", titleName: "完美无缺", icon: "zap", category: "极限操作系列", condition: "单局跳过英雄次数为 0 且通关。", evidenceRule: "完整截图", gameVersion: "2026.07.15", status: "active", submissionMode: "manual" }];
        return [{ challengeId: "map.samoa.conqueror", family: "map", gameplayRevisionId: "revision:map.samoa:initial", type: "map_completion", kind: "difficulty_completion", name: "征服者", mapId: "map.samoa", mapName: "萨摩亚", difficulty: "传奇", gameVersion: "2026.07.15", status: "active" }];
      },
      listTitles: async ({ mapId }) => mapId ? [{ titleKey: "PIONEER", label: "开拓者", icon: "trophy", category: "社区贡献系列", condition: "地图挑战", lifecycle: "active", publicVisibility: true, availability: "active", scope: "map", displayKind: "map_pioneer", mapId, slot: "pioneer", pioneerPrefixes: ["萨摩亚"], color: { kind: "heroColor" as const, index: 12 }, gameVersion: "2026.07.15" }] : [{ titleKey: "ALL_IN_ONE", label: "万象归一", icon: "trophy", category: "地图精通系列", condition: "获得所有地图征服者头衔", lifecycle: "active", publicVisibility: true, availability: "active", scope: "global", displayKind: "fixed", color: null, gameVersion: "2026.07.15" }],
    });
    const catalogApp = createApp({ authenticate: anonymousAuth, services: () => catalogServices });
    expect((await catalogApp.request("http://localhost/v1/maps", {}, env)).status).toBe(200);
    expect((await catalogApp.request("http://localhost/v1/challenges?family=map", {}, env)).status).toBe(200);
    expect((await catalogApp.request("http://localhost/v1/titles", {}, env)).status).toBe(401);

    const adminCatalogApp = createApp({
      authenticate: authenticateAsMaintainer,
      services: () => makeServices({ ...catalogServices, updateAdminMapMetadata: async (input) => ({ mapId: input.mapId, mapName: input.mapName, gameVersion: input.gameVersion, difficultyRating: input.difficultyRating, mechanics: input.mechanics, coverUrl: input.coverUrl, backgroundUrl: input.backgroundUrl }) }),
    });
    expect((await adminCatalogApp.request("http://localhost/v1/admin/maps", {}, env)).status).toBe(200);
    const adminMapTitles = await adminCatalogApp.request("http://localhost/v1/admin/titles?mapId=map.samoa", {}, env);
    expect(adminMapTitles.status).toBe(200);
    expect(await adminMapTitles.json()).toMatchObject({ contractVersion: "1", items: [{ titleKey: "PIONEER", scope: "map", mapId: "map.samoa" }] });
    expect((await adminCatalogApp.request("http://localhost/v1/admin/maps/map.samoa/metadata", { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify({ contractVersion: "1", difficultyRating: "T3", mechanics: ["动态掩体"] }) }, env)).status).toBe(422);
    const createMapRequest = (body: unknown, key?: string) => adminCatalogApp.request("http://localhost/v1/admin/maps", { method: "POST", headers: { "content-type": "application/json", ...(key ? { "idempotency-key": key } : {}) }, body: JSON.stringify(body) }, env);
    expect((await createMapRequest({ contractVersion: "1", mapName: "新地图" })).status).toBe(422);
    expect((await createMapRequest({ contractVersion: "1", mapName: "新地图", mapId: "Bad Id" }, "map-create-1")).status).toBe(422);
    expect((await createMapRequest({ contractVersion: "1", mapName: "新地图" }, "map-create-2")).status).toBe(409);
    const metadataUpdate = await adminCatalogApp.request("http://localhost/v1/admin/maps/map.samoa/metadata", { method: "PUT", headers: { "content-type": "application/json", "idempotency-key": "map-metadata-1" }, body: JSON.stringify({ contractVersion: "1", mapName: "萨摩亚", gameVersion: "2026.08.13", difficultyRating: "T3", mechanics: ["动态掩体"], coverUrl: null, backgroundUrl: null }) }, env);
    expect(metadataUpdate.status).toBe(200);
    expect(await metadataUpdate.json()).toMatchObject({ mapId: "map.samoa", gameVersion: "2026.08.13", difficultyRating: "T3", mechanics: ["动态掩体"] });

    const revisionRequests: Array<{ operation: string; input: Record<string, unknown> }> = [];
    const editorRevision = {
      revisionId: "revision:map.samoa:rework",
      mapId: "map.samoa",
      lifecycle: "preparing" as const,
      mapVariant: null,
      mode: null,
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
      authenticate: authenticateAsMaintainer,
      services: () => makeServices({
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

    const playerCatalogApp = createApp({ authenticate: anonymousAuth, services: () => catalogServices });
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

  it("rejects a challenge selector in player upload requests", async () => {
    const createSession = vi.fn(async () => services.createPlayerUploadSession({ contractVersion: "1", contentType: "image/png", byteSize: 1, sha256: "a".repeat(64) }, "session-token"));
    const uploadApp = createTestApp({ createPlayerUploadSession: createSession }, anonymousAuth);
    const response = await uploadApp.request("http://localhost/v1/player/uploads/session", {
      method: "POST",
      headers: { cookie: "owb_session=session-token", "content-type": "application/json" },
      body: JSON.stringify({ contractVersion: "1", challengeId: "title.SKY", contentType: "image/png", byteSize: 1, sha256: "a".repeat(64) }),
    }, env);
    expect(response.status).toBe(422);
    expect(await response.json()).toMatchObject({ error: { code: "INVALID_REQUEST" } });
    expect(createSession).not.toHaveBeenCalled();
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

  });

  it("requires maintainer access for review previews", async () => {
    const response = await app.request("http://localhost/v1/admin/submissions/00000000-0000-4000-8000-000000000000/review/preview", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ contractVersion: "1" }) }, env);
    expect([401, 403]).toContain(response.status);
  });

  it("protects administrative player data with the platform session", async () => {
    const adminServices = makeServices({ getPortalSessionIdentity: async ({ sessionToken }) => sessionToken === "admin-session" ? { player: { playerId: "1234", isAdmin: true } } : null });
    const adminApp = createApp({ authenticate: anonymousAuth, services: () => adminServices });
    const denied = await adminApp.request("http://localhost/v1/admin/player-accounts", {}, env);
    expect(denied.status).toBe(401);
    const allowed = await adminApp.request("http://localhost/v1/admin/player-accounts", { headers: { cookie: "owb_session=admin-session" } }, env);
    expect(allowed.status).toBe(200);
    expect(await allowed.json()).toMatchObject({ contractVersion: "1", items: [], page: 1 });
  });

  it("keeps local development login disabled unless explicitly enabled", async () => {
    const localServices = makeServices({
      ...services,
      listLocalDevAccounts: async () => [{ accountId: "local-player-account", playerId: "local-player", playerName: "Local Player", isAdmin: false }],
      createLocalDevSession: async () => ({ sessionToken: "local-session" }),
      getPortalSessionIdentity: async ({ sessionToken }) => sessionToken === "local-session" ? { player: { playerId: "local-player", isAdmin: false } } : null,
      getCurrentPlayer: async ({ sessionToken }) => sessionToken === "local-session" ? { contractVersion: "1", player: { playerId: "local-player", playerName: "Local Player", isAdmin: false, publicProfile: true, hideBattleTag: false }, recentSubmissions: [] } : null,
    });
    const localApp = createApp({ authenticate: anonymousAuth, services: () => localServices });
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

  it("returns 401 for manual review request without session", async () => {
    const response = await app.request("http://localhost/v1/player/submissions/00000000-0000-4000-8000-000000000001/manual-review", { method: "POST", headers: { origin: "https://owbastion.com" } }, env);
    expect(response.status).toBe(401);
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

describe("player handle routes", () => {
  const json = { "content-type": "application/json" };
  const state = { contractVersion: "1" as const, handle: null, pending: null, rejected: null };
  const mapped = (code: string) => async () => { throw new Error(code); };

  it("lets only a signed-in Player read, request, and withdraw, with an idempotency key and mapped rule errors", async () => {
    const request = vi.fn(async (_input: { sessionToken: string; handle: string }, _key: string) => state);
    const handleApp = createTestApp({
      getCurrentPlayerHandle: async ({ sessionToken }) => sessionToken === "session-token" ? state : null,
      requestCurrentPlayerHandle: request,
      withdrawCurrentPlayerHandleRequest: mapped("HANDLE_REQUEST_NOT_FOUND"),
    });
    expect((await handleApp.request("http://localhost/v1/me/handle", {}, env)).status).toBe(401);
    const signedIn = { ...json, cookie: "owb_session=session-token" };
    const read = await handleApp.request("http://localhost/v1/me/handle", { headers: signedIn }, env);
    expect(read.status).toBe(200);
    expect(read.headers.get("cache-control")).toBe("private, no-store");
    const put = (headers: Record<string, string>, body: unknown) => handleApp.request("http://localhost/v1/me/handle", { method: "PUT", headers, body: JSON.stringify(body) }, env);
    expect((await put({ ...json }, { contractVersion: "1", handle: "tester" })).status).toBe(401);
    expect((await put(signedIn, { contractVersion: "1", handle: "tester" })).status).toBe(422);
    expect((await put({ ...signedIn, "idempotency-key": "h1" }, { contractVersion: "1" })).status).toBe(422);
    expect((await put({ ...signedIn, "idempotency-key": "h1" }, { contractVersion: "1", handle: "tester" })).status).toBe(200);
    expect(request).toHaveBeenCalledWith({ sessionToken: "session-token", handle: "tester" }, "h1");
    expect((await handleApp.request("http://localhost/v1/me/handle/request", { method: "DELETE", headers: { ...signedIn, "idempotency-key": "w1" } }, env)).status).toBe(404);
    for (const [code, status] of [["HANDLE_TAKEN", 409], ["HANDLE_UNCHANGED", 409], ["HANDLE_RESERVED", 422], ["HANDLE_INVALID_LENGTH", 422], ["HANDLE_INVALID_CHARACTERS", 422], ["HANDLE_ALL_DIGITS", 422], ["IDEMPOTENCY_CONFLICT", 409], ["UNAUTHENTICATED", 401]] as const) {
      const failing = createTestApp({ requestCurrentPlayerHandle: mapped(code), getPortalSessionIdentity: async () => ({ player: { playerId: "1", isAdmin: false } }) });
      const response = await failing.request("http://localhost/v1/me/handle", { method: "PUT", headers: { ...signedIn, "idempotency-key": "k" }, body: JSON.stringify({ contractVersion: "1", handle: "tester" }) }, env);
      expect(response.status, code).toBe(status);
      expect(await response.json()).toMatchObject({ error: { code } });
    }
  });

  it("restricts the review queue and decisions to maintainers and requires idempotency keys", async () => {
    const approve = vi.fn(async (_input: { handleId: string }, _auth: unknown, _key: string) => undefined);
    const clear = vi.fn(async (_input: { playerAccountId: string }, _auth: unknown, _key: string) => undefined);
    const overrides = {
      listAdminPlayerHandles: async ({ status, page, pageSize }: { status: "pending" | "active"; page: number; pageSize: number }) => ({ contractVersion: "1" as const, status, items: [], page, pageSize, total: 0, hasMore: false }),
      approveAdminPlayerHandleRequest: approve,
      rejectAdminPlayerHandleRequest: mapped("HANDLE_REQUEST_NOT_FOUND"),
      clearAdminPlayerHandle: clear,
    };
    const base = "http://localhost/v1/admin/player-handles";
    const player = createTestApp(overrides);
    expect((await player.request(base, {}, env)).status).toBe(403);
    expect((await player.request(`${base}/r1/approve`, { method: "POST", headers: { "idempotency-key": "a" } }, env)).status).toBe(403);
    expect((await player.request("http://localhost/v1/admin/player-accounts/p1/handle", { method: "DELETE", headers: { "idempotency-key": "c" } }, env)).status).toBe(403);
    const maintainer = createTestApp(overrides, authenticateAsMaintainer);
    expect((await maintainer.request(base, {}, env)).status).toBe(200);
    expect((await maintainer.request(`${base}?status=active`, {}, env)).status).toBe(200);
    expect((await maintainer.request(`${base}?status=rejected`, {}, env)).status).toBe(422);
    expect((await maintainer.request(`${base}/r1/approve`, { method: "POST" }, env)).status).toBe(422);
    expect((await maintainer.request(`${base}/r1/approve`, { method: "POST", headers: { "idempotency-key": "a1" } }, env)).status).toBe(204);
    expect(approve).toHaveBeenCalledWith({ handleId: "r1" }, expect.objectContaining({ subject: "admin" }), "a1");
    expect((await maintainer.request(`${base}/r1/reject`, { method: "POST", headers: { "idempotency-key": "r1" } }, env)).status).toBe(404);
    expect((await maintainer.request("http://localhost/v1/admin/player-accounts/p1/handle", { method: "DELETE", headers: { "idempotency-key": "c1" } }, env)).status).toBe(204);
    expect(clear).toHaveBeenCalledWith({ playerAccountId: "p1" }, expect.objectContaining({ subject: "admin" }), "c1");
  });

  it("serves public profiles by normalized handle without a session and 404s everything else", async () => {
    const lookup = vi.fn(async ({ handle }: { handle: string }) => handle === "tester" ? { contractVersion: "1" as const, publicProfile: true, handle, player: { displayName: "Tester", equippedTitle: null }, boards: { mastery: null, achievement: null }, perMapXp: [], mapCount: 0, titles: { map: [], general: [] }, activity: [{ date: "2026-10-07", runCount: 2 }] } : null);
    const publicApp = createTestApp({ getPublicPlayerByHandle: lookup });
    const response = await publicApp.request("http://localhost/v1/public/players/TESTER", {}, env);
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(publicPlayerProfileSchema.parse(await response.json()).activity).toEqual([{ date: "2026-10-07", runCount: 2 }]);
    expect(lookup).toHaveBeenCalledWith({ handle: "tester" });
    expect((await publicApp.request("http://localhost/v1/public/players/nobody", {}, env)).status).toBe(404);
    await publicApp.request(`http://localhost/v1/public/players/${encodeURIComponent("速通达人")}`, {}, env);
    expect(lookup).toHaveBeenLastCalledWith({ handle: "速通达人" });
  });
});
