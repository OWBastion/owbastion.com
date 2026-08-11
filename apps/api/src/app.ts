import { Hono } from "hono";
import {
  qqBindingRequestSchema,
  submissionRequestSchema,
  qqLoginAttemptRequestSchema,
  qqLoginVerifyRequestSchema,
  qqGroupAccessRequestSchema,
  qqGroupRegistrationRequestSchema,
  adminPlayerStatusRequestSchema,
  adminPlayerIdentityRequestSchema,
  adminSubmissionChallengeRequestSchema,
  adminSubmissionReviewRequestSchema,
  adminSubmissionOcrRetryRequestSchema,
  adminTitleGrantRequestSchema,
  adminTitleGrantBulkRequestSchema,
  adminTitleGrantRevokeRequestSchema,
  adminManualTitleGrantRequestSchema,
  adminChallengeUpdateRequestSchema,
  adminAchievementCreateRequestSchema,
  adminCatalogTitleUpdateRequestSchema,
  adminMapTitleRuleCreateRequestSchema, adminMapTitleRuleUpdateRequestSchema, adminMapTitleRuleExceptionUpsertRequestSchema,
  adminMapMetadataUpdateRequestSchema,
  adminMapRevisionCreateRequestSchema, adminMapRevisionUpdateRequestSchema,
  adminRandomEventCreateRequestSchema, adminRandomEventUpdateRequestSchema, adminRandomEventImportRequestSchema,
  reviewTargetSchema, reviewTargetTypeSchema, playerReviewUpsertRequestSchema, playerReviewWithdrawRequestSchema,
  adminReviewCommentModerationRequestSchema, adminReviewStateModerationRequestSchema,
  adminMasteryRunStateRequestSchema, adminMasteryRunConflictResolutionRequestSchema,
  playerUploadSessionRequestSchema,
  playerSubmissionChallengeRequestSchema,
  adminSubmissionSpotCheckRequestSchema,
  adminBindingInviteRequestSchema, adminBindingInviteBatchRequestSchema, adminBindingInviteRevokeRequestSchema, bindingInviteRedeemRequestSchema, adminBindingClaimDecisionRequestSchema,
} from "@owbastion/contracts";
import type { Authenticator, PlatformServices } from "@owbastion/domain";
import { withPublicCache } from "./public-cache";

export type RuntimeEnv = {
  DB: D1Database;
  EVIDENCE_BUCKET?: R2Bucket;
  QQBOT_API_TOKEN?: string;
  BASTION_BUILD_TOKEN?: string;
  LOGIN_SESSION_TTL_MS?: string;
  PORTAL_ORIGIN?: string;
  LOCAL_DEV_AUTH?: string;
  UPLOAD_ORIGIN?: string;
  EVIDENCE_PUBLIC_ORIGIN?: string;
  OCRKIT_BASE_URL?: string;
  OCRKIT_API_TOKEN?: string;
  OCRKIT_EVIDENCE_BUCKET?: string;
  OCR_QUEUE?: Queue;
  QQ_POLICY_QUEUE?: Queue;
  QQBOT_POLICY_WEBHOOK_URL?: string;
  QQBOT_POLICY_WEBHOOK_SECRET?: string;
  BINDING_INVITE_CODE_ENCRYPTION_KEY?: string;
  OCR_MANUAL_REVIEW_THRESHOLD?: string;
  OCR_AUTO_REVIEW_SAMPLE_RATE?: string;
  MASTERY_MIN_GAME_VERSION?: string;
  MASTERY_SUPPORTED_OCR_LAYOUT_VERSIONS?: string;
  DEPLOYMENT_REVISION?: string;
  PUBLIC_HTTP_CACHE_ENABLED?: string;
};

type AppDependencies = {
  authenticate: Authenticator<RuntimeEnv>;
  services: (env: RuntimeEnv) => PlatformServices;
};

type RequestRouteClass = "admin" | "agents" | "catalog" | "health" | "local" | "portal" | "qq" | "unknown";
type Variables = { requestId: string };

const deploymentRevision = (env?: RuntimeEnv) => env?.DEPLOYMENT_REVISION?.trim() || "unknown";

const routeClassForPath = (pathname: string): RequestRouteClass => {
  if (pathname === "/health") return "health";
  if (pathname.startsWith("/v1/admin/")) return "admin";
  if (pathname.startsWith("/v1/agents/")) return "agents";
  if (pathname.startsWith("/v1/__local/")) return "local";
  if (pathname.startsWith("/v1/qq/")) return "qq";
  if (["/v1/events", "/v1/maps", "/v1/public/achievements"].includes(pathname) || pathname.startsWith("/v1/public/achievement-icons/") || pathname.startsWith("/v1/challenges") || pathname.startsWith("/v1/titles")) return "catalog";
  if (pathname.startsWith("/v1/me") || pathname.startsWith("/v1/player/") || pathname.startsWith("/v1/uploads/") || pathname.startsWith("/v1/auth/") || pathname.startsWith("/v1/public/")) return "portal";
  return "unknown";
};

const cachePolicyForResponse = (cacheControl: string | null) => {
  if (!cacheControl) return "unspecified";
  if (/no-store/i.test(cacheControl)) return "private_no_store";
  if (/immutable/i.test(cacheControl)) return "public_immutable";
  if (/\b(?:s-)?max-age=/i.test(cacheControl)) return "public_ttl";
  return "other";
};

const logServiceOperation = async <T>(c: any, operation: string, action: () => Promise<T>): Promise<T> => {
  const startedAt = Date.now();
  try { return await action(); }
  finally {
    console.log(JSON.stringify({
      layer: "api",
      event: "service_operation_complete",
      deploymentRevision: deploymentRevision(c.env),
      requestId: c.get("requestId"),
      routeClass: routeClassForPath(new URL(c.req.url).pathname),
      operation,
      durationMs: Date.now() - startedAt,
      catalogKvOperationCount: operation.startsWith("catalog_") ? 0 : undefined,
    }));
  }
};

/** Validates an incoming X-Request-ID value, same rules as Portal's normalizeRequestId. */
const normalizeIncomingId = (value: string | null | undefined): string | undefined => {
  const normalized = value?.trim();
  return normalized && /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/.test(normalized) ? normalized : undefined;
};

const errorResponse = (c: any, status: 400 | 401 | 403 | 404 | 409 | 422 | 500 | 503, code: string, message: string) =>
  c.json({ contractVersion: "1", error: { code, message, requestId: c.get("requestId") } }, status);

const parseBody = async (request: Request) => {
  try {
    return await request.json();
  } catch {
    return null;
  }
};

const agentPage = (c: any) => {
  const page = Number(c.req.query("page") ?? "1");
  const pageSize = Number(c.req.query("pageSize") ?? "20");
  if (!Number.isInteger(page) || page < 1 || !Number.isInteger(pageSize) || pageSize < 1 || pageSize > 100) return null;
  return { page, pageSize };
};

const portalSessionToken = (request: Request) => request.headers.get("cookie")?.split(";").map((part) => part.trim()).find((part) => part.startsWith("owb_session="))?.slice("owb_session=".length);

const sessionCookie = (request: Request, value: string, maxAge: number) => `owb_session=${value}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${new URL(request.url).protocol === "https:" ? "; Secure" : ""}`;

const publicCacheKey = (request: Request, query: Record<string, string> = {}) => {
  const url = new URL(request.url);
  const search = new URLSearchParams();
  for (const [name, value] of Object.entries(query).sort(([left], [right]) => left.localeCompare(right))) search.set(name, value);
  url.search = search.toString();
  return new Request(url, { method: "GET" });
};

const hasNoQuery = (request: Request) => new URL(request.url).searchParams.size === 0;

const hasOnlyPaginationQuery = (request: Request) => {
  const params = new URL(request.url).searchParams;
  const names = new Set<string>();
  params.forEach((_value, name) => names.add(name));
  if ([...names].some((name) => name !== "page" && name !== "pageSize")) return false;
  return params.getAll("page").length <= 1 && params.getAll("pageSize").length <= 1;
};

const playerMasteryQuery = (request: Request) => {
  const params = new URL(request.url).searchParams;
  const names = new Set<string>();
  params.forEach((_value, name) => names.add(name));
  if ([...names].some((name) => !["mapId", "gameplayRevisionId", "page", "pageSize"].includes(name))) return null;
  if (["mapId", "gameplayRevisionId", "page", "pageSize"].some((name) => params.getAll(name).length > 1)) return null;
  const mapId = params.get("mapId");
  const gameplayRevisionId = params.get("gameplayRevisionId");
  const page = Number(params.get("page") ?? "1");
  const pageSize = Number(params.get("pageSize") ?? "20");
  if (mapId !== null && (!mapId.trim() || mapId.trim().length > 256)) return null;
  if (gameplayRevisionId !== null && (!gameplayRevisionId.trim() || gameplayRevisionId.trim().length > 256)) return null;
  if (!Number.isInteger(page) || page < 1 || !Number.isInteger(pageSize) || pageSize < 1 || pageSize > 50) return null;
  return { mapId: mapId?.trim() || undefined, gameplayRevisionId: gameplayRevisionId?.trim() || undefined, page, pageSize };
};

const adminMasteryRunQuery = (request: Request) => {
  const params = new URL(request.url).searchParams;
  const allowed = ["playerAccountId", "mapId", "gameplayRevisionId", "difficulty", "status", "acceptanceSource", "runCode", "from", "to", "page", "pageSize"];
  const names = new Set<string>();
  params.forEach((_value, name) => names.add(name));
  if ([...names].some((name) => !allowed.includes(name)) || allowed.some((name) => params.getAll(name).length > 1)) return null;
  const page = Number(params.get("page") ?? "1");
  const pageSize = Number(params.get("pageSize") ?? "20");
  const playerAccountId = params.get("playerAccountId")?.trim() || undefined;
  const mapId = params.get("mapId")?.trim() || undefined;
  const gameplayRevisionId = params.get("gameplayRevisionId")?.trim() || undefined;
  const difficulty = params.get("difficulty")?.trim() || undefined;
  const status = params.get("status")?.trim() || undefined;
  const acceptanceSource = params.get("acceptanceSource")?.trim() || undefined;
  const runCode = params.get("runCode")?.trim() || undefined;
  const fromValue = params.get("from");
  const toValue = params.get("to");
  const from = fromValue === null ? undefined : Number(fromValue);
  const to = toValue === null ? undefined : Number(toValue);
  const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  if (!Number.isInteger(page) || page < 1 || !Number.isInteger(pageSize) || pageSize < 1 || pageSize > 50) return null;
  if (playerAccountId && !uuid.test(playerAccountId)) return null;
  if (mapId && mapId.length > 256) return null;
  if (gameplayRevisionId && gameplayRevisionId.length > 256) return null;
  if (difficulty && !["简单", "一般", "困难", "专家", "传奇", "地狱"].includes(difficulty)) return null;
  if (status && !["active", "invalidated"].includes(status)) return null;
  if (acceptanceSource && !["submission_automatic", "submission_review"].includes(acceptanceSource)) return null;
  if (runCode && !/^[1-9]\d{3}(?:-[1-9]\d{3}){2}$/.test(runCode)) return null;
  if (from !== undefined && (!Number.isInteger(from) || from < 0)) return null;
  if (to !== undefined && (!Number.isInteger(to) || to < 0)) return null;
  if (from !== undefined && to !== undefined && from > to) return null;
  return {
    page,
    pageSize,
    ...(playerAccountId ? { playerAccountId } : {}),
    ...(mapId ? { mapId } : {}),
    ...(gameplayRevisionId ? { gameplayRevisionId } : {}),
    ...(difficulty ? { difficulty: difficulty as "简单" | "一般" | "困难" | "专家" | "传奇" | "地狱" } : {}),
    ...(status ? { status: status as "active" | "invalidated" } : {}),
    ...(acceptanceSource ? { acceptanceSource: acceptanceSource as "submission_automatic" | "submission_review" } : {}),
    ...(runCode ? { runCode } : {}),
    ...(from !== undefined ? { from } : {}),
    ...(to !== undefined ? { to } : {}),
  };
};

export const createApp = (dependencies: AppDependencies) => {
  const app = new Hono<{ Bindings: RuntimeEnv; Variables: Variables }>();

  // Middleware 1: bind and echo X-Request-ID on every response.
  app.use("*", async (c, next) => {
    const id = normalizeIncomingId(c.req.header("x-request-id")) ?? crypto.randomUUID();
    c.set("requestId", id);
    await next();
    c.header("X-Request-ID", c.get("requestId"));
  });

  // Administrative state is always read directly from D1; it must never share
  // an intermediary or browser cache entry with another request.
  app.use("/v1/admin/*", async (c, next) => {
    c.header("Cache-Control", "private, no-store");
    await next();
    c.header("Cache-Control", "private, no-store");
  });

  // Middleware 2: apply private cache policy and emit low-cardinality request telemetry.
  app.use("*", async (c, next) => {
    const start = Date.now();
    await next();
    const routeClass = routeClassForPath(new URL(c.req.url).pathname);
    if (routeClass === "admin" && !c.res.headers.has("cache-control")) c.header("Cache-Control", "private, no-store");
    console.log(JSON.stringify({
      layer: "api",
      event: "request_complete",
      method: c.req.method,
      deploymentRevision: deploymentRevision(c.env),
      routeClass,
      status: c.res.status,
      requestId: c.get("requestId"),
      durationMs: Date.now() - start,
      cachePolicy: cachePolicyForResponse(c.res.headers.get("cache-control")),
      edgeCacheStatus: c.res.headers.get("cf-cache-status") ?? "unavailable",
    }));
  });

  const portalResponseHeaders = (c: any) => {
    const requestOrigin = c.req.header("origin");
    const localOrigin = c.env.LOCAL_DEV_AUTH === "true" && requestOrigin && /^http:\/\/(localhost|127\.0\.0\.1|0\.0\.0\.0):3000$/.test(requestOrigin) ? requestOrigin : undefined;
    return {
      "Access-Control-Allow-Origin": localOrigin ?? c.env.PORTAL_ORIGIN ?? "https://owbastion.com",
      "Access-Control-Allow-Credentials": "true",
      "Access-Control-Allow-Headers": "content-type, x-login-attempt-token, x-claim-token, idempotency-key",
      "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
    };
  };
  const allowPortal = (c: any) => {
    for (const [name, value] of Object.entries(portalResponseHeaders(c))) c.header(name, value);
  };
  const decoratePortalCacheHit = (c: any) => (response: Response) => {
    const decorated = response.clone();
    for (const [name, value] of Object.entries(portalResponseHeaders(c))) decorated.headers.set(name, value);
    return decorated;
  };
  const waitUntil = (c: any) => {
    try {
      const executionContext = c.executionCtx;
      return executionContext?.waitUntil?.bind(executionContext) as ((promise: Promise<unknown>) => void) | undefined;
    } catch {
      return undefined;
    }
  };
  const cachePublicResponse = (c: any, operation: string, cacheKey: Request, eligible: boolean, response: () => Promise<Response> | Response, decorateHit?: (response: Response) => Response) => withPublicCache({
    request: c.req.raw,
    cacheKey,
    enabled: publicCacheEnabled(c),
    eligible,
    operation,
    response,
    decorateHit,
    waitUntil: waitUntil(c),
  });
  const allowAgents = (c: any) => {
    const token = c.env.BASTION_BUILD_TOKEN;
    const authorization = c.req.header("authorization");
    return Boolean(token && authorization === `Bearer ${token}`);
  };
  const publicCacheEnabled = (c: any) => c.env.PUBLIC_HTTP_CACHE_ENABLED !== "false";
  const setPublicCatalogCache = (c: any, enabled = publicCacheEnabled(c)) => {
    c.header("Cache-Control", enabled ? "public, max-age=60, s-maxage=60" : "private, no-store");
  };
  const setAgentsCache = (c: any, includePlayerIds: boolean, cacheable: boolean) => {
    setPublicCatalogCache(c, !includePlayerIds && cacheable && publicCacheEnabled(c));
    c.header("Vary", "Authorization");
  };
  const publicAgentPlayerTitleGrants = (response: Awaited<ReturnType<PlatformServices["listAgentPlayerTitleGrants"]>>, includePlayerIds: boolean) => includePlayerIds ? response : { ...response, items: response.items.map(({ playerId: _playerId, ...item }) => item) };
  const publicAgentMapTitleHolders = (response: Awaited<ReturnType<PlatformServices["listAgentMapTitleHolders"]>>, includePlayerIds: boolean) => includePlayerIds ? response : { ...response, items: response.items.map(({ playerId: _playerId, ...item }) => item) };

  app.get("/health", (c) => {
    c.header("Cache-Control", "private, no-store");
    return c.json({
      service: "api",
      status: "ok",
      deploymentRevision: deploymentRevision(c.env),
    });
  });

  app.options("/v1/auth/qq/login-attempt", (c) => { allowPortal(c); return c.body(null, 204); });
  app.options("/v1/public/binding-invites/redeem", (c) => { allowPortal(c); return c.body(null, 204); });
  app.options("/v1/public/binding-claims/:claimId", (c) => { allowPortal(c); return c.body(null, 204); });
  app.options("/v1/public/binding-claims/:claimId/session", (c) => { allowPortal(c); return c.body(null, 204); });
  app.options("/v1/auth/qq/login-attempt/:attemptId", (c) => { allowPortal(c); return c.body(null, 204); });
  app.options("/v1/auth/logout", (c) => { allowPortal(c); return c.body(null, 204); });
  app.options("/v1/me", (c) => { allowPortal(c); return c.body(null, 204); });
  app.options("/v1/me/mastery", (c) => { allowPortal(c); return c.body(null, 204); });
  app.options("/v1/me/titles", (c) => { allowPortal(c); return c.body(null, 204); });
  app.options("/v1/me/submissions/:submissionId", (c) => { allowPortal(c); return c.body(null, 204); });
  app.options("/v1/me/submissions/:submissionId/evidence", (c) => { allowPortal(c); return c.body(null, 204); });
  app.options("/v1/me/reviews/:targetType/:targetId", (c) => { allowPortal(c); return c.body(null, 204); });
  app.options("/v1/me/reviews/:reviewId/withdraw", (c) => { allowPortal(c); return c.body(null, 204); });
  app.options("/v1/public/reviews/summaries", (c) => { allowPortal(c); return c.body(null, 204); });
  app.options("/v1/public/reviews/:targetType/:targetId/summary", (c) => { allowPortal(c); return c.body(null, 204); });
  app.options("/v1/public/reviews/:targetType/:targetId/comments", (c) => { allowPortal(c); return c.body(null, 204); });
  app.options("/v1/admin/reviews", (c) => { allowPortal(c); return c.body(null, 204); });
  app.options("/v1/admin/reviews/:reviewId", (c) => { allowPortal(c); return c.body(null, 204); });
  app.options("/v1/admin/reviews/:reviewId/comment", (c) => { allowPortal(c); return c.body(null, 204); });
  app.options("/v1/admin/reviews/:reviewId/state", (c) => { allowPortal(c); return c.body(null, 204); });
  app.options("/v1/admin/mastery-runs", (c) => { allowPortal(c); return c.body(null, 204); });
  app.options("/v1/admin/mastery-runs/:masteryRunId", (c) => { allowPortal(c); return c.body(null, 204); });
  app.options("/v1/admin/mastery-runs/:masteryRunId/state", (c) => { allowPortal(c); return c.body(null, 204); });
  app.options("/v1/admin/mastery-runs/:masteryRunId/conflicts/:submissionId", (c) => { allowPortal(c); return c.body(null, 204); });
  app.options("/v1/player/submissions/:submissionId/manual-review", (c) => { allowPortal(c); return c.body(null, 204); });
  app.options("/v1/public/achievements", (c) => { allowPortal(c); return c.body(null, 204); });
  app.options("/v1/__local/accounts", (c) => { allowPortal(c); return c.body(null, 204); });
  app.options("/v1/__local/login", (c) => { allowPortal(c); return c.body(null, 204); });
  app.options("/v1/uploads/:uploadId", (c) => { allowPortal(c); return c.body(null, 204); });

  const requireMaintainer = async (c: any) => {
    let auth = await dependencies.authenticate(c.req.raw, c.env);
    if (!auth) {
      const sessionToken = portalSessionToken(c.req.raw);
      const player = sessionToken ? await dependencies.services(c.env).getCurrentPlayer({ sessionToken }) : null;
      if (player?.player.isAdmin) auth = { actorType: "user", subject: player.player.playerId, roles: ["maintainer"], provider: "portal-session" };
      else if (player) return { error: errorResponse(c, 403, "FORBIDDEN", "The player cannot manage administrative data") };
    }
    if (!auth) return { error: errorResponse(c, 401, "UNAUTHENTICATED", "Authentication is required") };
    if (!auth.roles.includes("maintainer")) return { error: errorResponse(c, 403, "FORBIDDEN", "The actor cannot manage administrative data") };
    return { auth };
  };

  const requirePortalPlayer = async (c: any) => {
    allowPortal(c);
    const sessionToken = portalSessionToken(c.req.raw);
    if (!sessionToken) return { error: errorResponse(c, 401, "UNAUTHENTICATED", "Authentication is required") };
    const player = await dependencies.services(c.env).getCurrentPlayer({ sessionToken });
    if (!player) return { error: errorResponse(c, 401, "UNAUTHENTICATED", "Authentication is required") };
    return { sessionToken, player };
  };

  const portalPlayerAuth = (player: NonNullable<Awaited<ReturnType<PlatformServices["getCurrentPlayer"]>>>) => ({
    actorType: "user" as const,
    subject: player.player.playerId,
    roles: [] as const,
    provider: "portal-session",
  });

  type PlayerReviewRecord = NonNullable<Awaited<ReturnType<PlatformServices["getPlayerReview"]>>>;
  const playerReviewView = (review: PlayerReviewRecord) => ({
    reviewId: review.reviewId,
    targetType: review.targetType,
    targetId: review.targetId,
    rating: review.rating,
    comment: review.comment,
    anonymous: review.anonymous,
    createdAt: review.createdAt,
    updatedAt: review.updatedAt,
  });

  const parseReviewTarget = (c: any) => reviewTargetSchema.safeParse({ targetType: c.req.param("targetType"), targetId: c.req.param("targetId") });

  app.post("/v1/public/binding-invites/redeem", async (c) => {
    allowPortal(c);
    const parsed = bindingInviteRedeemRequestSchema.safeParse(await parseBody(c.req.raw));
    if (!parsed.success) return errorResponse(c, 422, "INVALID_REQUEST", "The request does not match contract v1");
    try { return c.json(await dependencies.services(c.env).redeemBindingInvite(parsed.data), 201); }
    catch (error) { if (error instanceof Error && error.message === "INVITE_INVALID") return errorResponse(c, 422, "INVITE_INVALID", "The invitation cannot be used"); throw error; }
  });

  app.get("/v1/public/binding-claims/:claimId", async (c) => {
    allowPortal(c);
    const claimId = c.req.param("claimId");
    const claimToken = c.req.header("x-claim-token");
    if (!/^[0-9a-f-]{36}$/.test(claimId) || !claimToken) return errorResponse(c, 422, "INVALID_CLAIM", "The binding claim is invalid");
    try { return c.json(await dependencies.services(c.env).getBindingClaimStatus({ claimId, claimToken })); }
    catch (error) {
      if (error instanceof Error && error.message === "BINDING_CLAIM_NOT_FOUND") return errorResponse(c, 404, "BINDING_CLAIM_NOT_FOUND", "The binding claim does not exist");
      if (error instanceof Error && error.message === "BINDING_CLAIM_FORBIDDEN") return errorResponse(c, 403, "BINDING_CLAIM_FORBIDDEN", "The binding claim token is invalid");
      throw error;
    }
  });

  app.post("/v1/public/binding-claims/:claimId/session", async (c) => {
    allowPortal(c);
    const claimId = c.req.param("claimId");
    const claimToken = c.req.header("x-claim-token");
    if (!/^[0-9a-f-]{36}$/.test(claimId) || !claimToken) return errorResponse(c, 422, "INVALID_CLAIM", "The binding claim is invalid");
    try {
      const result = await dependencies.services(c.env).exchangeBindingClaimSession({ claimId, claimToken });
      c.header("Set-Cookie", sessionCookie(c.req.raw, result.sessionToken, 2592000));
      return c.json({ contractVersion: "1" as const, status: result.status });
    } catch (error) {
      if (error instanceof Error && error.message === "BINDING_CLAIM_NOT_FOUND") return errorResponse(c, 404, "BINDING_CLAIM_NOT_FOUND", "The binding claim does not exist");
      if (error instanceof Error && error.message === "BINDING_CLAIM_FORBIDDEN") return errorResponse(c, 403, "BINDING_CLAIM_FORBIDDEN", "The binding claim token is invalid");
      if (error instanceof Error && error.message === "BINDING_CLAIM_NOT_COMPLETE") return errorResponse(c, 409, "BINDING_CLAIM_NOT_COMPLETE", "The binding claim is not complete");
      throw error;
    }
  });

  app.post("/v1/admin/binding-invites", async (c) => {
    const access = await requireMaintainer(c); if (access.error) return access.error;
    const idempotencyKey = c.req.header("idempotency-key"); if (!idempotencyKey) return errorResponse(c, 422, "IDEMPOTENCY_KEY_REQUIRED", "Idempotency-Key is required");
    const parsed = adminBindingInviteRequestSchema.safeParse(await parseBody(c.req.raw)); if (!parsed.success) return errorResponse(c, 422, "INVALID_REQUEST", "The request does not match contract v1");
    try { return c.json(await dependencies.services(c.env).createAdminBindingInvite(parsed.data, access.auth!, idempotencyKey), 201); }
    catch (error) { if (error instanceof Error && error.message === "HISTORICAL_TITLE_GRANT_NOT_AVAILABLE") return errorResponse(c, 409, "HISTORICAL_TITLE_GRANT_NOT_AVAILABLE", "One or more historical titles are no longer unclaimed"); throw error; }
  });

  app.post("/v1/admin/binding-invites/batch", async (c) => {
    const access = await requireMaintainer(c); if (access.error) return access.error;
    const idempotencyKey = c.req.header("idempotency-key"); if (!idempotencyKey) return errorResponse(c, 422, "IDEMPOTENCY_KEY_REQUIRED", "Idempotency-Key is required");
    const parsed = adminBindingInviteBatchRequestSchema.safeParse(await parseBody(c.req.raw)); if (!parsed.success) return errorResponse(c, 422, "INVALID_REQUEST", "The request does not match contract v1");
    try { return c.json(await dependencies.services(c.env).createAdminBindingInviteBatch(parsed.data, access.auth!, idempotencyKey), 201); }
    catch (error) { if (error instanceof Error && error.message === "HISTORICAL_TITLE_GRANT_NOT_AVAILABLE") return errorResponse(c, 409, "HISTORICAL_TITLE_GRANT_NOT_AVAILABLE", "One or more historical titles are no longer unclaimed"); throw error; }
  });

  app.get("/v1/admin/binding-invites", async (c) => {
    const access = await requireMaintainer(c); if (access.error) return access.error;
    return c.json(await dependencies.services(c.env).listAdminBindingInvites(access.auth!));
  });

  app.get("/v1/admin/bindings", async (c) => {
    const access = await requireMaintainer(c); if (access.error) return access.error;
    return c.json(await dependencies.services(c.env).listAdminBindings(access.auth!));
  });

  app.post("/v1/admin/binding-invites/:inviteId/historical-migration/retry", async (c) => {
    const access = await requireMaintainer(c); if (access.error) return access.error;
    const idempotencyKey = c.req.header("idempotency-key"); if (!idempotencyKey) return errorResponse(c, 422, "IDEMPOTENCY_KEY_REQUIRED", "Idempotency-Key is required");
    try { await dependencies.services(c.env).retryHistoricalTitleMigration({ inviteId: c.req.param("inviteId") }, access.auth!, idempotencyKey); return c.body(null, 204); }
    catch (error) { if (error instanceof Error && error.message === "HISTORICAL_MIGRATION_NOT_READY") return errorResponse(c, 409, "HISTORICAL_MIGRATION_NOT_READY", "The binding is not ready for historical title migration"); throw error; }
  });

  app.get("/v1/admin/binding-invites/:inviteId/code", async (c) => {
    const access = await requireMaintainer(c); if (access.error) return access.error;
    try { return c.json(await dependencies.services(c.env).getAdminBindingInviteCode({ inviteId: c.req.param("inviteId") }, access.auth!)); }
    catch (error) { if (error instanceof Error && error.message === "BINDING_INVITE_CODE_UNAVAILABLE") return errorResponse(c, 422, "BINDING_INVITE_CODE_UNAVAILABLE", "The invitation code cannot be retrieved"); throw error; }
  });

  app.post("/v1/admin/binding-invites/:inviteId/revoke", async (c) => {
    const access = await requireMaintainer(c); if (access.error) return access.error;
    const idempotencyKey = c.req.header("idempotency-key"); if (!idempotencyKey) return errorResponse(c, 422, "IDEMPOTENCY_KEY_REQUIRED", "Idempotency-Key is required");
    const parsed = adminBindingInviteRevokeRequestSchema.safeParse(await parseBody(c.req.raw)); if (!parsed.success) return errorResponse(c, 422, "INVALID_REQUEST", "The request does not match contract v1");
    try { await dependencies.services(c.env).revokeAdminBindingInvite({ ...parsed.data, inviteId: c.req.param("inviteId") }, access.auth!, idempotencyKey); return c.body(null, 204); }
    catch (error) { if (error instanceof Error && error.message === "BINDING_INVITE_NOT_REVOCABLE") return errorResponse(c, 422, "BINDING_INVITE_NOT_REVOCABLE", "The invitation cannot be revoked"); throw error; }
  });

  app.get("/v1/admin/binding-claims", async (c) => { const access = await requireMaintainer(c); if (access.error) return access.error; return c.json(await dependencies.services(c.env).listAdminBindingClaims(access.auth!)); });
  app.post("/v1/admin/binding-claims/:claimId/decision", async (c) => {
    const access = await requireMaintainer(c); if (access.error) return access.error;
    const idempotencyKey = c.req.header("idempotency-key"); if (!idempotencyKey) return errorResponse(c, 422, "IDEMPOTENCY_KEY_REQUIRED", "Idempotency-Key is required");
    const parsed = adminBindingClaimDecisionRequestSchema.safeParse(await parseBody(c.req.raw)); if (!parsed.success) return errorResponse(c, 422, "INVALID_REQUEST", "The request does not match contract v1");
    try { await dependencies.services(c.env).decideAdminBindingClaim({ ...parsed.data, claimId: c.req.param("claimId") }, access.auth!, idempotencyKey); return c.body(null, 204); }
    catch (error) { if (error instanceof Error && error.message === "BINDING_CLAIM_NOT_REVIEWABLE") return errorResponse(c, 422, "BINDING_CLAIM_NOT_REVIEWABLE", "The claim cannot be reviewed"); throw error; }
  });

  app.post("/v1/auth/qq/login-attempt", async (c) => {
    allowPortal(c);
    const parsed = qqLoginAttemptRequestSchema.safeParse(await parseBody(c.req.raw));
    if (!parsed.success) return errorResponse(c, 422, "INVALID_REQUEST", "The request does not match contract v1");
    return c.json(await dependencies.services(c.env).createQqLoginAttempt(parsed.data), 201);
  });

  app.get("/v1/__local/accounts", async (c) => {
    allowPortal(c);
    if (c.env.LOCAL_DEV_AUTH !== "true") return errorResponse(c, 404, "NOT_FOUND", "The local development API is disabled");
    return c.json({ contractVersion: "1" as const, accounts: await dependencies.services(c.env).listLocalDevAccounts() });
  });

  app.post("/v1/__local/login", async (c) => {
    allowPortal(c);
    if (c.env.LOCAL_DEV_AUTH !== "true") return errorResponse(c, 404, "NOT_FOUND", "The local development API is disabled");
    const body = await parseBody(c.req.raw) as { accountId?: unknown };
    if (typeof body?.accountId !== "string") return errorResponse(c, 422, "INVALID_REQUEST", "The local account is required");
    try {
      const result = await dependencies.services(c.env).createLocalDevSession({ accountId: body.accountId });
      c.header("Set-Cookie", sessionCookie(c.req.raw, result.sessionToken, 2592000));
      return c.json({ contractVersion: "1" as const, status: "authenticated" as const });
    } catch (error) {
      if (error instanceof Error && error.message === "LOCAL_ACCOUNT_NOT_FOUND") return errorResponse(c, 404, "LOCAL_ACCOUNT_NOT_FOUND", "The local account does not exist");
      throw error;
    }
  });

  app.get("/v1/auth/qq/login-attempt/:attemptId", async (c) => {
    allowPortal(c);
    const attemptId = c.req.param("attemptId");
    const attemptToken = c.req.header("x-login-attempt-token");
    if (!/^[0-9a-f-]{36}$/.test(attemptId) || !attemptToken) return errorResponse(c, 422, "INVALID_LOGIN_ATTEMPT", "The login attempt is invalid");
    try {
      const result = await dependencies.services(c.env).getQqLoginStatus({ attemptId, attemptToken });
      if (result.sessionToken) c.header("Set-Cookie", sessionCookie(c.req.raw, result.sessionToken, 2592000));
      return c.json(result);
    } catch (error) {
      if (error instanceof Error && error.message === "LOGIN_ATTEMPT_NOT_FOUND") return errorResponse(c, 404, "LOGIN_ATTEMPT_NOT_FOUND", "The login attempt does not exist");
      if (error instanceof Error && error.message === "LOGIN_ATTEMPT_FORBIDDEN") return errorResponse(c, 403, "LOGIN_ATTEMPT_FORBIDDEN", "The login attempt token is invalid");
      throw error;
    }
  });

  app.post("/v1/qq/auth/verify", async (c) => {
    const auth = await dependencies.authenticate(c.req.raw, c.env);
    if (!auth) return errorResponse(c, 401, "UNAUTHENTICATED", "Authentication is required");
    if (!auth.roles.includes("channel:write")) return errorResponse(c, 403, "FORBIDDEN", "The actor cannot write channel data");
    const idempotencyKey = c.req.header("idempotency-key");
    if (!idempotencyKey) return errorResponse(c, 422, "IDEMPOTENCY_KEY_REQUIRED", "Idempotency-Key is required");
    const parsed = qqLoginVerifyRequestSchema.safeParse(await parseBody(c.req.raw));
    if (!parsed.success) return errorResponse(c, 422, "INVALID_REQUEST", "The request does not match contract v1");
    try {
      return c.json(await dependencies.services(c.env).verifyQqLogin(parsed.data, auth, idempotencyKey));
    } catch (error) {
      const code = error instanceof Error ? error.message : "LOGIN_FAILED";
      if (code === "LOGIN_CODE_INVALID") {
        try { return c.json(await dependencies.services(c.env).verifyBindingClaim(parsed.data, auth, idempotencyKey)); }
        catch (claimError) {
          const claimCode = claimError instanceof Error ? claimError.message : "LOGIN_FAILED";
          if (["BINDING_CLAIM_CODE_INVALID", "LOGIN_GROUP_NOT_ALLOWED", "INVITE_INVALID"].includes(claimCode)) return errorResponse(c, 422, claimCode, "The verification code cannot be used");
          if (claimCode === "IDEMPOTENCY_CONFLICT") return errorResponse(c, 409, claimCode, "The idempotency key was used with a different request");
          throw claimError;
        }
      }
      if (["LOGIN_CODE_INVALID", "LOGIN_CODE_EXPIRED", "LOGIN_GROUP_NOT_ALLOWED", "LOGIN_BINDING_REQUIRED", "BINDING_CONFLICT", "PLAYER_BANNED"].includes(code)) return errorResponse(c, 422, code, "The login code cannot be used");
      if (code === "IDEMPOTENCY_CONFLICT") return errorResponse(c, 409, code, "The idempotency key was used with a different request");
      throw error;
    }
  });

  app.post("/v1/qq/groups", async (c) => {
    const auth = await dependencies.authenticate(c.req.raw, c.env);
    if (!auth) return errorResponse(c, 401, "UNAUTHENTICATED", "Authentication is required");
    if (!auth.roles.includes("channel:write")) return errorResponse(c, 403, "FORBIDDEN", "The actor cannot write channel data");
    const idempotencyKey = c.req.header("idempotency-key");
    if (!idempotencyKey) return errorResponse(c, 422, "IDEMPOTENCY_KEY_REQUIRED", "Idempotency-Key is required");
    const parsed = qqGroupRegistrationRequestSchema.safeParse(await parseBody(c.req.raw));
    if (!parsed.success) return errorResponse(c, 422, "INVALID_REQUEST", "The request does not match contract v1");
    try {
      await dependencies.services(c.env).registerQqGroup(parsed.data, auth, idempotencyKey);
      return c.body(null, 204);
    } catch (error) {
      if (error instanceof Error && error.message === "IDEMPOTENCY_CONFLICT") return errorResponse(c, 409, error.message, "The idempotency key was used with a different request");
      throw error;
    }
  });

  app.get("/v1/me", async (c) => {
    allowPortal(c);
    const sessionToken = portalSessionToken(c.req.raw);
    if (!sessionToken) return errorResponse(c, 401, "UNAUTHENTICATED", "Authentication is required");
    const player = await dependencies.services(c.env).getCurrentPlayer({ sessionToken });
    if (!player) return errorResponse(c, 401, "UNAUTHENTICATED", "Authentication is required");
    return c.json(player);
  });

  app.get("/v1/me/mastery", async (c) => {
    const access = await requirePortalPlayer(c);
    if (access.error) return access.error;
    c.header("Cache-Control", "private, no-store");
    const query = playerMasteryQuery(c.req.raw);
    if (!query) return errorResponse(c, 422, "INVALID_REQUEST", "The mastery query is invalid");
    const mastery = await dependencies.services(c.env).getCurrentPlayerMastery({ sessionToken: access.sessionToken!, ...query });
    if (!mastery) return errorResponse(c, 401, "UNAUTHENTICATED", "Authentication is required");
    return c.json(mastery);
  });

  app.get("/v1/me/titles", async (c) => {
    allowPortal(c);
    const sessionToken = portalSessionToken(c.req.raw);
    if (!sessionToken) return errorResponse(c, 401, "UNAUTHENTICATED", "Authentication is required");
    const items = await dependencies.services(c.env).listCurrentPlayerTitles({ sessionToken });
    if (!items) return errorResponse(c, 401, "UNAUTHENTICATED", "Authentication is required");
    return c.json({ contractVersion: "1", items });
  });

  app.get("/v1/me/reviews/:targetType/:targetId", async (c) => {
    const access = await requirePortalPlayer(c);
    if (access.error) return access.error;
    c.header("Cache-Control", "private, no-store");
    const target = parseReviewTarget(c);
    if (!target.success) return errorResponse(c, 422, "INVALID_REVIEW_TARGET", "The review target is invalid");
    try {
      const review = await dependencies.services(c.env).getPlayerReview(target.data, portalPlayerAuth(access.player!));
      return c.json({ contractVersion: "1", review: review?.status === "active" ? playerReviewView(review) : null });
    } catch (error) {
      const code = error instanceof Error ? error.message : "PLAYER_REVIEW_READ_FAILED";
      if (code === "PLAYER_NOT_FOUND") return errorResponse(c, 401, "UNAUTHENTICATED", "Authentication is required");
      if (code === "REVIEW_TARGET_NOT_FOUND") return errorResponse(c, 404, code, "The review target does not exist");
      throw error;
    }
  });

  app.put("/v1/me/reviews/:targetType/:targetId", async (c) => {
    const access = await requirePortalPlayer(c);
    if (access.error) return access.error;
    c.header("Cache-Control", "private, no-store");
    const idempotencyKey = c.req.header("idempotency-key");
    if (!idempotencyKey) return errorResponse(c, 422, "IDEMPOTENCY_KEY_REQUIRED", "Idempotency-Key is required");
    const target = parseReviewTarget(c);
    if (!target.success) return errorResponse(c, 422, "INVALID_REVIEW_TARGET", "The review target is invalid");
    const parsed = playerReviewUpsertRequestSchema.safeParse(await parseBody(c.req.raw));
    if (!parsed.success) return errorResponse(c, 422, "INVALID_REQUEST", "The review content does not match contract v1");
    const { contractVersion: _contractVersion, ...reviewInput } = parsed.data;
    try {
      const review = await dependencies.services(c.env).upsertReview({ ...target.data, ...reviewInput, rating: reviewInput.rating as 1 | 2 | 3 | 4 | 5 }, portalPlayerAuth(access.player!), idempotencyKey);
      return c.json({ contractVersion: "1", review: playerReviewView(review) });
    } catch (error) {
      const code = error instanceof Error ? error.message : "PLAYER_REVIEW_UPSERT_FAILED";
      if (code === "PLAYER_NOT_FOUND") return errorResponse(c, 401, "UNAUTHENTICATED", "Authentication is required");
      if (code === "PLAYER_BANNED") return errorResponse(c, 403, code, "The player account is banned");
      if (code === "REVIEW_TARGET_NOT_FOUND") return errorResponse(c, 404, code, "The review target does not exist");
      if (code === "REVIEW_TARGET_NOT_RATEABLE") return errorResponse(c, 409, code, "The review target is closed to new reviews");
      if (code === "REVIEW_INVALIDATED") return errorResponse(c, 409, code, "The review cannot be updated");
      if (["REVIEW_RATING_INVALID", "REVIEW_COMMENT_TOO_LONG"].includes(code)) return errorResponse(c, 422, code, "The review content is invalid");
      if (code === "IDEMPOTENCY_CONFLICT") return errorResponse(c, 409, code, "The idempotency key was used with a different request");
      throw error;
    }
  });

  app.post("/v1/me/reviews/:reviewId/withdraw", async (c) => {
    const access = await requirePortalPlayer(c);
    if (access.error) return access.error;
    c.header("Cache-Control", "private, no-store");
    const idempotencyKey = c.req.header("idempotency-key");
    if (!idempotencyKey) return errorResponse(c, 422, "IDEMPOTENCY_KEY_REQUIRED", "Idempotency-Key is required");
    const reviewId = c.req.param("reviewId");
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(reviewId)) return errorResponse(c, 422, "INVALID_REVIEW_ID", "The review ID is invalid");
    const parsed = playerReviewWithdrawRequestSchema.safeParse(await parseBody(c.req.raw));
    if (!parsed.success) return errorResponse(c, 422, "INVALID_REQUEST", "The request does not match contract v1");
    try {
      await dependencies.services(c.env).withdrawReview({ reviewId }, portalPlayerAuth(access.player!), idempotencyKey);
      return c.json({ contractVersion: "1", review: null });
    } catch (error) {
      const code = error instanceof Error ? error.message : "PLAYER_REVIEW_WITHDRAW_FAILED";
      if (code === "PLAYER_NOT_FOUND") return errorResponse(c, 401, "UNAUTHENTICATED", "Authentication is required");
      if (["REVIEW_NOT_FOUND", "REVIEW_NOT_OWNED"].includes(code)) return errorResponse(c, 404, "REVIEW_NOT_FOUND", "The review does not exist");
      if (code === "REVIEW_INVALIDATED") return errorResponse(c, 409, code, "The review cannot be withdrawn");
      if (code === "IDEMPOTENCY_CONFLICT") return errorResponse(c, 409, code, "The idempotency key was used with a different request");
      throw error;
    }
  });

  app.get("/v1/me/submissions/:submissionId", async (c) => {
    const access = await requirePortalPlayer(c);
    if (access.error) return access.error;
    try {
      return c.json(await dependencies.services(c.env).getPlayerSubmission({ submissionId: c.req.param("submissionId") }, access.sessionToken!));
    } catch (error) {
      if (error instanceof Error && error.message === "SUBMISSION_NOT_FOUND") return errorResponse(c, 404, "SUBMISSION_NOT_FOUND", "The submission does not exist");
      throw error;
    }
  });

  app.get("/v1/me/submissions/:submissionId/evidence", async (c) => {
    const access = await requirePortalPlayer(c);
    if (access.error) return access.error;
    try {
      const evidence = await dependencies.services(c.env).getPlayerEvidence({ submissionId: c.req.param("submissionId") }, access.sessionToken!);
      return new Response(evidence.body, { headers: { "content-type": evidence.contentType, "cache-control": "private, no-store" } });
    } catch (error) {
      if (error instanceof Error && ["SUBMISSION_NOT_FOUND", "EVIDENCE_NOT_FOUND"].includes(error.message)) return errorResponse(c, 404, "SUBMISSION_NOT_FOUND", "The submission does not exist");
      throw error;
    }
  });

  app.post("/v1/auth/logout", async (c) => {
    allowPortal(c);
    const sessionToken = portalSessionToken(c.req.raw);
    if (sessionToken) await dependencies.services(c.env).logoutPortalSession({ sessionToken });
    c.header("Set-Cookie", sessionCookie(c.req.raw, "", 0));
    return c.body(null, 204);
  });

  app.get("/v1/public/achievements", async (c) => {
    allowPortal(c);
    const cacheable = hasNoQuery(c.req.raw);
    setPublicCatalogCache(c, cacheable && publicCacheEnabled(c));
    return cachePublicResponse(c, "catalog_public_achievements", publicCacheKey(c.req.raw), cacheable, async () => c.json({ contractVersion: "1", items: await logServiceOperation(c, "catalog_list_achievements", () => dependencies.services(c.env).listChallenges({ family: "achievement" })) }), decoratePortalCacheHit(c));
  });

  const parsePublicReviewPage = (c: any) => {
    const page = Number(c.req.query("page") ?? "1");
    const pageSize = Number(c.req.query("pageSize") ?? "20");
    return Number.isInteger(page) && page >= 1 && Number.isInteger(pageSize) && pageSize >= 1 && pageSize <= 50 ? { page, pageSize } : null;
  };

  app.get("/v1/public/reviews/summaries", async (c) => {
    allowPortal(c);
    c.header("Cache-Control", "private, no-store");
    const targetType = reviewTargetTypeSchema.safeParse(c.req.query("targetType"));
    const targetIds = (c.req.query("targetIds") ?? "").split(",").map((value: string) => value.trim()).filter(Boolean);
    if (!targetType.success || !targetIds.length || targetIds.length > 100 || new Set(targetIds).size !== targetIds.length || targetIds.some((targetId: string) => !reviewTargetSchema.safeParse({ targetType: targetType.data, targetId }).success)) {
      return errorResponse(c, 422, "INVALID_REQUEST", "The review summary targets are invalid");
    }
    try {
      const items = await logServiceOperation(c, "review_public_summary_batch", () => dependencies.services(c.env).getReviewSummaries({ targetType: targetType.data, targetIds }));
      return c.json({ contractVersion: "1", targetType: targetType.data, items });
    } catch (error) {
      if (error instanceof Error && error.message === "REVIEW_TARGET_NOT_FOUND") return errorResponse(c, 404, error.message, "The review target does not exist");
      throw error;
    }
  });

  app.get("/v1/public/reviews/:targetType/:targetId/summary", async (c) => {
    allowPortal(c);
    c.header("Cache-Control", "private, no-store");
    const target = parseReviewTarget(c);
    if (!target.success) return errorResponse(c, 422, "INVALID_REVIEW_TARGET", "The review target is invalid");
    try {
      const summary = await logServiceOperation(c, "review_public_summary", () => dependencies.services(c.env).getReviewSummary(target.data));
      return c.json({ contractVersion: "1", summary });
    } catch (error) {
      if (error instanceof Error && error.message === "REVIEW_TARGET_NOT_FOUND") return errorResponse(c, 404, error.message, "The review target does not exist");
      throw error;
    }
  });

  app.get("/v1/public/reviews/:targetType/:targetId/comments", async (c) => {
    allowPortal(c);
    c.header("Cache-Control", "private, no-store");
    const target = parseReviewTarget(c);
    const page = parsePublicReviewPage(c);
    if (!target.success || !page) return errorResponse(c, 422, "INVALID_REQUEST", "The review comment request is invalid");
    try {
      const comments = await logServiceOperation(c, "review_public_comments", () => dependencies.services(c.env).listPublicReviewComments({ ...target.data, ...page }));
      return c.json({ contractVersion: "1", ...comments });
    } catch (error) {
      if (error instanceof Error && error.message === "REVIEW_TARGET_NOT_FOUND") return errorResponse(c, 404, error.message, "The review target does not exist");
      throw error;
    }
  });

  app.get("/v1/public/achievement-icons/:titleKey", async (c) => {
    allowPortal(c);
    const icon = await dependencies.services(c.env).getPublicTitleIcon({ titleKey: c.req.param("titleKey") });
    if (!icon) return errorResponse(c, 404, "ICON_NOT_FOUND", "The achievement icon does not exist");
    c.header("Cache-Control", "public, max-age=31536000, immutable");
    if (icon.etag) c.header("ETag", icon.etag);
    return c.body(icon.body, 200, { "Content-Type": icon.contentType });
  });

  app.get("/v1/challenges", async (c) => {
    const family = c.req.query("family");
    if (family && family !== "map" && family !== "achievement") return errorResponse(c, 422, "INVALID_REQUEST", "The challenge family is invalid");
    if (family === "map") {
      allowPortal(c);
      const cacheable = new URL(c.req.url).searchParams.getAll("family").length === 1 && new URL(c.req.url).searchParams.size === 1;
      setPublicCatalogCache(c, cacheable && publicCacheEnabled(c));
      return cachePublicResponse(c, "catalog_map_challenges", publicCacheKey(c.req.raw, { family: "map" }), cacheable, async () => c.json({ contractVersion: "1", items: await logServiceOperation(c, "catalog_list_map_challenges", () => dependencies.services(c.env).listChallenges({ family: "map" })) }), decoratePortalCacheHit(c));
    }
    const access = await requirePortalPlayer(c);
    if (access.error) return access.error;
    return c.json({ contractVersion: "1", items: await logServiceOperation(c, "catalog_list_challenges", () => dependencies.services(c.env).listChallenges({ family: family as "map" | "achievement" | undefined })) });
  });

  app.get("/v1/titles", async (c) => {
    const access = await requirePortalPlayer(c);
    if (access.error) return access.error;
    return c.json({ contractVersion: "1", items: await logServiceOperation(c, "catalog_list_titles", () => dependencies.services(c.env).listTitles({ mapId: c.req.query("mapId") || undefined })) });
  });

  app.get("/v1/maps", async (c) => {
    allowPortal(c);
    const cacheable = hasNoQuery(c.req.raw);
    setPublicCatalogCache(c, cacheable && publicCacheEnabled(c));
    return cachePublicResponse(c, "catalog_maps", publicCacheKey(c.req.raw), cacheable, async () => c.json({ contractVersion: "1", items: await logServiceOperation(c, "catalog_list_maps", () => dependencies.services(c.env).listMaps()) }), decoratePortalCacheHit(c));
  });

  app.get("/v1/events", async (c) => {
    allowPortal(c); const status = c.req.query("status");
    if (status && status !== "implemented" && status !== "removed") return errorResponse(c, 422, "INVALID_REQUEST", "The event status is invalid");
    const cacheable = hasNoQuery(c.req.raw);
    setPublicCatalogCache(c, cacheable && publicCacheEnabled(c));
    return cachePublicResponse(c, "catalog_events", publicCacheKey(c.req.raw), cacheable, async () => c.json({ contractVersion: "1", items: await logServiceOperation(c, "catalog_list_events", () => dependencies.services(c.env).listRandomEvents({ query: c.req.query("query")?.trim() || undefined, category: c.req.query("category")?.trim() || undefined, rarity: c.req.query("rarity")?.trim() || undefined, status: status as "implemented" | "removed" | undefined })) }), decoratePortalCacheHit(c));
  });
  app.get("/v1/events/:eventId", async (c) => {
    allowPortal(c);
    const cacheable = hasNoQuery(c.req.raw);
    setPublicCatalogCache(c, cacheable && publicCacheEnabled(c));
    return cachePublicResponse(c, "catalog_event", publicCacheKey(c.req.raw), cacheable, async () => {
      const event = await logServiceOperation(c, "catalog_get_event", () => dependencies.services(c.env).getRandomEvent({ eventId: c.req.param("eventId") }));
      return event ? c.json({ contractVersion: "1", item: event }) : errorResponse(c, 404, "EVENT_NOT_FOUND", "The event does not exist");
    }, decoratePortalCacheHit(c));
  });

  app.get("/v1/agents/events", async (c) => {
    const includePlayerIds = allowAgents(c); const page = agentPage(c); if (!page) return errorResponse(c, 422, "INVALID_REQUEST", "The pagination parameters are invalid");
    const cacheable = !includePlayerIds && hasOnlyPaginationQuery(c.req.raw) && !c.req.query("q") && !c.req.query("category") && !c.req.query("rarity");
    setAgentsCache(c, includePlayerIds, cacheable);
    return cachePublicResponse(c, "agents_events", publicCacheKey(c.req.raw, { page: String(page.page), pageSize: String(page.pageSize) }), cacheable, async () => c.json({ ...await logServiceOperation(c, "agents_list_events", () => dependencies.services(c.env).listAgentEvents({ ...page, query: c.req.query("q")?.trim() || undefined, category: c.req.query("category")?.trim() || undefined, rarity: c.req.query("rarity")?.trim() || undefined })) }));
  });
  app.get("/v1/agents/events/:eventId", async (c) => {
    const includePlayerIds = allowAgents(c);
    const cacheable = !includePlayerIds && hasNoQuery(c.req.raw);
    setAgentsCache(c, includePlayerIds, cacheable);
    return cachePublicResponse(c, "agents_event", publicCacheKey(c.req.raw), cacheable, async () => {
      const event = await logServiceOperation(c, "agents_get_event", () => dependencies.services(c.env).getAgentEvent({ eventId: c.req.param("eventId") }));
      return event ? c.json({ contractVersion: "1", item: event }) : errorResponse(c, 404, "EVENT_NOT_FOUND", "The event does not exist");
    });
  });
  app.get("/v1/agents/maps", async (c) => {
    const includePlayerIds = allowAgents(c); const page = agentPage(c); if (!page) return errorResponse(c, 422, "INVALID_REQUEST", "The pagination parameters are invalid");
    const cacheable = !includePlayerIds && hasOnlyPaginationQuery(c.req.raw) && !c.req.query("q") && !c.req.query("mechanic");
    setAgentsCache(c, includePlayerIds, cacheable);
    return cachePublicResponse(c, "agents_maps", publicCacheKey(c.req.raw, { page: String(page.page), pageSize: String(page.pageSize) }), cacheable, async () => c.json(await logServiceOperation(c, "agents_list_maps", () => dependencies.services(c.env).listAgentMaps({ ...page, query: c.req.query("q")?.trim() || undefined, mechanic: c.req.query("mechanic")?.trim() || undefined }))));
  });
  app.get("/v1/agents/maps/:mapId", async (c) => {
    const includePlayerIds = allowAgents(c);
    const cacheable = !includePlayerIds && hasNoQuery(c.req.raw);
    setAgentsCache(c, includePlayerIds, cacheable);
    return cachePublicResponse(c, "agents_map", publicCacheKey(c.req.raw), cacheable, async () => {
      const map = await logServiceOperation(c, "agents_get_map", () => dependencies.services(c.env).getAgentMap({ mapId: c.req.param("mapId") }));
      return map ? c.json({ contractVersion: "1", item: map }) : errorResponse(c, 404, "MAP_NOT_FOUND", "The map does not exist");
    });
  });
  app.get("/v1/agents/achievements", async (c) => {
    allowAgents(c); const page = agentPage(c); const status = c.req.query("status"); if (!page || (status && status !== "active" && status !== "sunsetting")) return errorResponse(c, 422, "INVALID_REQUEST", "The request parameters are invalid");
    return c.json(await logServiceOperation(c, "agents_list_achievements", () => dependencies.services(c.env).listAgentAchievements({ ...page, query: c.req.query("q")?.trim() || undefined, status: status as "active" | "sunsetting" | undefined, mapId: c.req.query("mapId")?.trim() || undefined })));
  });
  app.get("/v1/agents/achievements/:achievementId", async (c) => {
    allowAgents(c);
    const achievement = await logServiceOperation(c, "agents_get_achievement", () => dependencies.services(c.env).getAgentAchievement({ challengeId: c.req.param("achievementId"), mapId: c.req.query("mapId")?.trim() || undefined, gameplayRevisionId: c.req.query("gameplayRevisionId")?.trim() || undefined }));
    return achievement ? c.json({ contractVersion: "1", item: achievement }) : errorResponse(c, 404, "ACHIEVEMENT_NOT_FOUND", "The achievement does not exist");
  });
  app.get("/v1/agents/titles", async (c) => {
    allowAgents(c); const page = agentPage(c); const scope = c.req.query("scope"); if (!page || (scope && scope !== "global" && scope !== "map")) return errorResponse(c, 422, "INVALID_REQUEST", "The request parameters are invalid");
    return c.json(await logServiceOperation(c, "agents_list_titles", () => dependencies.services(c.env).listAgentTitles({ ...page, query: c.req.query("q")?.trim() || undefined, category: c.req.query("category")?.trim() || undefined, scope: scope as "global" | "map" | undefined, mapId: c.req.query("mapId")?.trim() || undefined })));
  });
  app.get("/v1/agents/titles/:titleKey", async (c) => {
    allowAgents(c);
    const title = await logServiceOperation(c, "agents_get_title", () => dependencies.services(c.env).getAgentTitle({ titleKey: c.req.param("titleKey") }));
    return title ? c.json({ contractVersion: "1", item: title }) : errorResponse(c, 404, "TITLE_NOT_FOUND", "The title does not exist");
  });
  app.get("/v1/agents/player-title-grants", async (c) => {
    const includePlayerIds = allowAgents(c); const page = agentPage(c); if (!page) return errorResponse(c, 422, "INVALID_REQUEST", "The pagination parameters are invalid"); setAgentsCache(c, includePlayerIds, true);
    return c.json(publicAgentPlayerTitleGrants(await logServiceOperation(c, "agents_list_player_title_grants", () => dependencies.services(c.env).listAgentPlayerTitleGrants(page)), includePlayerIds));
  });
  app.get("/v1/agents/map-title-holders", async (c) => {
    const includePlayerIds = allowAgents(c); const page = agentPage(c); const mapId = c.req.query("mapId")?.trim(); if (!page || !mapId) return errorResponse(c, 422, "INVALID_REQUEST", "The mapId and pagination parameters are required"); setAgentsCache(c, includePlayerIds, true);
    if (!(await dependencies.services(c.env).getAgentMap({ mapId }))) return errorResponse(c, 404, "MAP_NOT_FOUND", "The map does not exist");
    return c.json(publicAgentMapTitleHolders(await logServiceOperation(c, "agents_list_map_title_holders", () => dependencies.services(c.env).listAgentMapTitleHolders({ ...page, mapId })), includePlayerIds));
  });
  app.get("/v1/agents/search", async (c) => {
    allowAgents(c); const page = agentPage(c); const query = c.req.query("q")?.trim(); const kind = c.req.query("kind"); if (!page || !query || (kind && !["event", "map", "achievement", "title"].includes(kind))) return errorResponse(c, 422, "INVALID_REQUEST", "The search parameters are invalid");
    return c.json(await logServiceOperation(c, "agents_search", () => dependencies.services(c.env).searchAgentContent({ ...page, query, kind: kind as "event" | "map" | "achievement" | "title" | undefined })));
  });

  app.post("/v1/player/uploads/session", async (c) => {
    const access = await requirePortalPlayer(c);
    if (access.error) return access.error;
    const parsed = playerUploadSessionRequestSchema.safeParse(await parseBody(c.req.raw));
    if (!parsed.success) return errorResponse(c, 422, "INVALID_REQUEST", "The request does not match contract v1");
    try { return c.json(await dependencies.services(c.env).createPlayerUploadSession(parsed.data, access.sessionToken!), 201); }
    catch (error) { const code = error instanceof Error ? error.message : "UPLOAD_SESSION_FAILED"; if (["CHALLENGE_NOT_FOUND", "GAMEPLAY_REVISION_REQUIRED"].includes(code)) return errorResponse(c, 422, code, "The challenge revision is not available"); if (code === "CHALLENGE_AUTOMATIC") return errorResponse(c, 422, code, "该称号满足条件后自动获得，无需提交截图。"); if (code === "PLAYER_BANNED") return errorResponse(c, 403, code, "The player account is banned"); throw error; }
  });

  app.put("/v1/uploads/:uploadId", async (c) => {
    const access = await requirePortalPlayer(c);
    if (access.error) return access.error;
    try { await dependencies.services(c.env).uploadEvidence({ uploadId: c.req.param("uploadId"), body: await c.req.raw.arrayBuffer(), contentType: c.req.header("content-type") ?? "" }, access.sessionToken!); return c.body(null, 204); }
    catch (error) { const code = error instanceof Error ? error.message : "UPLOAD_FAILED"; if (["UPLOAD_SESSION_INVALID", "UPLOAD_METADATA_MISMATCH", "UPLOAD_HASH_MISMATCH"].includes(code)) return errorResponse(c, 422, code, "The upload is invalid or expired"); throw error; }
  });

  app.post("/v1/player/uploads/:uploadId/complete", async (c) => {
    const access = await requirePortalPlayer(c);
    if (access.error) return access.error;
    try { return c.json(await dependencies.services(c.env).completePlayerUpload({ uploadId: c.req.param("uploadId") }, access.sessionToken!, c.get("requestId"))); }
    catch (error) { if (error instanceof Error && error.message === "UPLOAD_SESSION_INVALID") return errorResponse(c, 422, "UPLOAD_SESSION_INVALID", "The upload is invalid or expired"); throw error; }
  });

  app.post("/v1/player/submissions/:submissionId/challenge", async (c) => {
    const access = await requirePortalPlayer(c);
    if (access.error) return access.error;
    const parsed = playerSubmissionChallengeRequestSchema.safeParse(await parseBody(c.req.raw));
    if (!parsed.success) return errorResponse(c, 422, "INVALID_REQUEST", "The request does not match contract v1");
    try { return c.json(await dependencies.services(c.env).confirmPlayerSubmissionChallenge({ ...parsed.data, submissionId: c.req.param("submissionId") }, access.sessionToken!)); }
    catch (error) {
      const code = error instanceof Error ? error.message : "SUBMISSION_CHALLENGE_FAILED";
      if (["CHALLENGE_NOT_FOUND", "GAMEPLAY_REVISION_REQUIRED", "SUBMISSION_NOT_CONFIRMABLE"].includes(code)) return errorResponse(c, 422, code, "The submission challenge cannot be confirmed");
      throw error;
    }
  });

  app.post("/v1/player/submissions/:submissionId/manual-review", async (c) => {
    const access = await requirePortalPlayer(c);
    if (access.error) return access.error;
    try {
      await dependencies.services(c.env).requestManualReview({ submissionId: c.req.param("submissionId") }, access.sessionToken!);
      return c.body(null, 204);
    } catch (error) {
      const code = error instanceof Error ? error.message : "MANUAL_REVIEW_FAILED";
      if (code === "SUBMISSION_NOT_FOUND") return errorResponse(c, 404, code, "The submission does not exist");
      if (code === "MANUAL_REVIEW_NOT_ELIGIBLE") return errorResponse(c, 409, code, "The submission is not eligible for manual review");
      throw error;
    }
  });

  app.put("/v1/admin/qq/groups/:groupOpenId", async (c) => {
    const access = await requireMaintainer(c);
    if (access.error) return access.error;
    const auth = access.auth!;
    const idempotencyKey = c.req.header("idempotency-key");
    if (!idempotencyKey) return errorResponse(c, 422, "IDEMPOTENCY_KEY_REQUIRED", "Idempotency-Key is required");
    const parsed = qqGroupAccessRequestSchema.safeParse({ ...(await parseBody(c.req.raw) as object), groupOpenId: c.req.param("groupOpenId") });
    if (!parsed.success) return errorResponse(c, 422, "INVALID_REQUEST", "The request does not match contract v1");
    try {
      await dependencies.services(c.env).upsertQqGroupAccess(parsed.data, auth, idempotencyKey);
      return c.body(null, 204);
    } catch (error) {
      if (error instanceof Error && error.message === "IDEMPOTENCY_CONFLICT") return errorResponse(c, 409, error.message, "The idempotency key was used with a different request");
      throw error;
    }
  });

  app.get("/v1/admin/qq/groups", async (c) => {
    let auth = await dependencies.authenticate(c.req.raw, c.env);
    if (!auth) {
      const sessionToken = portalSessionToken(c.req.raw);
      const player = sessionToken ? await dependencies.services(c.env).getCurrentPlayer({ sessionToken }) : null;
      if (player?.player.isAdmin) auth = { actorType: "user", subject: player.player.playerId, roles: ["maintainer"], provider: "portal-session" };
    }
    if (!auth) return errorResponse(c, 401, "UNAUTHENTICATED", "Authentication is required");
    if (!auth.roles.includes("maintainer") && !auth.roles.includes("channel:read")) return errorResponse(c, 403, "FORBIDDEN", "The actor cannot read group access");
    return c.json({ contractVersion: "1", items: await dependencies.services(c.env).listQqGroupAccess(auth) });
  });

  app.get("/v1/admin/player-accounts", async (c) => {
    const access = await requireMaintainer(c);
    if (access.error) return access.error;
    const page = Math.max(1, Number(c.req.query("page") ?? 1) || 1);
    const pageSize = Math.min(50, Math.max(1, Number(c.req.query("pageSize") ?? 25) || 25));
    const status = c.req.query("status");
    if (status && status !== "active" && status !== "banned") return errorResponse(c, 422, "INVALID_REQUEST", "The status is invalid");
    return c.json(await dependencies.services(c.env).listAdminPlayers({ query: c.req.query("query")?.trim() || undefined, status: status as "active" | "banned" | undefined, page, pageSize }, access.auth!));
  });

  app.get("/v1/admin/achievements", async (c) => {
    const access = await requireMaintainer(c);
    if (access.error) return access.error;
    const type = c.req.query("type");
    const status = c.req.query("status");
    const family = type === "map_completion" || type === "map" ? "map" : type === "title_achievement" || type === "achievement" ? "achievement" : undefined;
    if (type && !family) return errorResponse(c, 422, "INVALID_REQUEST", "The achievement type is invalid");
    if (status && !["scheduled", "active", "sunsetting", "retired"].includes(status)) return errorResponse(c, 422, "INVALID_REQUEST", "The achievement status is invalid");
    return c.json(await logServiceOperation(c, "admin_list_achievements", () => dependencies.services(c.env).listAdminChallenges({ family: family as "map" | "achievement" | undefined, status }, access.auth!)));
  });

  app.post("/v1/admin/achievements", async (c) => {
    const access = await requireMaintainer(c);
    if (access.error) return access.error;
    const idempotencyKey = c.req.header("idempotency-key");
    if (!idempotencyKey) return errorResponse(c, 422, "IDEMPOTENCY_KEY_REQUIRED", "Idempotency-Key is required");
    const parsed = adminAchievementCreateRequestSchema.safeParse(await parseBody(c.req.raw));
    if (!parsed.success) return errorResponse(c, 422, "INVALID_REQUEST", "The request does not match contract v1");
    try {
      return c.json(await dependencies.services(c.env).createAdminAchievement(parsed.data, access.auth!, idempotencyKey), 201);
    } catch (error) {
      const code = error instanceof Error ? error.message : "ACHIEVEMENT_CREATE_FAILED";
      if (code === "TITLE_KEY_CONFLICT") return errorResponse(c, 409, code, "The title key already exists");
      if (code === "MAP_NOT_FOUND" || code === "MAP_NOT_ACTIVE") return errorResponse(c, 422, code, "One or more target maps are unavailable");
      if (code === "DEVELOPER_TITLE_CANNOT_BE_A_CHALLENGE") return errorResponse(c, 422, code, "A developer-retained title cannot become a player challenge");
      if (code === "IDEMPOTENCY_CONFLICT") return errorResponse(c, 409, code, "The idempotency key was used with a different request");
      throw error;
    }
  });

  app.get("/v1/admin/maps", async (c) => {
    const access = await requireMaintainer(c);
    if (access.error) return access.error;
    return c.json({ contractVersion: "1", items: await logServiceOperation(c, "admin_list_maps", () => dependencies.services(c.env).listMaps()) });
  });

  app.get("/v1/admin/map-title-rules", async (c) => {
    const access = await requireMaintainer(c);
    if (access.error) return access.error;
    return c.json(await dependencies.services(c.env).listAdminMapTitleRules(access.auth!));
  });
  app.post("/v1/admin/map-title-rules", async (c) => {
    const access = await requireMaintainer(c); if (access.error) return access.error;
    const key = c.req.header("idempotency-key"); if (!key) return errorResponse(c, 422, "IDEMPOTENCY_KEY_REQUIRED", "Idempotency-Key is required");
    const parsed = adminMapTitleRuleCreateRequestSchema.safeParse(await parseBody(c.req.raw));
    if (!parsed.success) return errorResponse(c, 422, "INVALID_REQUEST", "The request does not match contract v1");
    try { return c.json(await dependencies.services(c.env).createAdminMapTitleRule(parsed.data, access.auth!, key), 201); }
    catch (error) { const code = error instanceof Error ? error.message : "MAP_TITLE_RULE_CREATE_FAILED"; if (["MAP_TITLE_NOT_FOUND", "PIONEER_RULE_SCOPE_MUST_BE_EXPLICIT"].includes(code)) return errorResponse(c, 422, code, code === "PIONEER_RULE_SCOPE_MUST_BE_EXPLICIT" ? "Pioneer rules can only use explicit map exceptions" : "The map title is unavailable"); if (["MAP_TITLE_RULE_KIND_CONFLICT", "IDEMPOTENCY_CONFLICT"].includes(code)) return errorResponse(c, 409, code, "The map title rule conflicts with an existing record"); throw error; }
  });
  app.put("/v1/admin/map-title-rules/:ruleId", async (c) => {
    const access = await requireMaintainer(c); if (access.error) return access.error;
    const key = c.req.header("idempotency-key"); if (!key) return errorResponse(c, 422, "IDEMPOTENCY_KEY_REQUIRED", "Idempotency-Key is required");
    const parsed = adminMapTitleRuleUpdateRequestSchema.safeParse(await parseBody(c.req.raw));
    if (!parsed.success) return errorResponse(c, 422, "INVALID_REQUEST", "The request does not match contract v1");
    try { return c.json(await dependencies.services(c.env).updateAdminMapTitleRule({ ...parsed.data, ruleId: c.req.param("ruleId") }, access.auth!, key)); }
    catch (error) { const code = error instanceof Error ? error.message : "MAP_TITLE_RULE_UPDATE_FAILED"; if (code === "MAP_TITLE_RULE_NOT_FOUND") return errorResponse(c, 404, code, "The map title rule does not exist"); if (["MAP_TITLE_NOT_FOUND", "PIONEER_RULE_SCOPE_MUST_BE_EXPLICIT"].includes(code)) return errorResponse(c, 422, code, code === "PIONEER_RULE_SCOPE_MUST_BE_EXPLICIT" ? "Pioneer rules can only use explicit map exceptions" : "The map title is unavailable"); if (["MAP_TITLE_RULE_KIND_CONFLICT", "IDEMPOTENCY_CONFLICT"].includes(code)) return errorResponse(c, 409, code, "The map title rule conflicts with an existing record"); throw error; }
  });
  app.get("/v1/admin/maps/:mapId/map-title-inheritance", async (c) => {
    const access = await requireMaintainer(c); if (access.error) return access.error;
    try { return c.json(await dependencies.services(c.env).listAdminMapTitleInheritance({ mapId: c.req.param("mapId") }, access.auth!)); }
    catch (error) { if (error instanceof Error && error.message === "MAP_NOT_FOUND") return errorResponse(c, 404, "MAP_NOT_FOUND", "The map does not exist"); throw error; }
  });
  app.put("/v1/admin/maps/:mapId/map-title-rules/:ruleId/exception", async (c) => {
    const access = await requireMaintainer(c); if (access.error) return access.error;
    const key = c.req.header("idempotency-key"); if (!key) return errorResponse(c, 422, "IDEMPOTENCY_KEY_REQUIRED", "Idempotency-Key is required");
    const parsed = adminMapTitleRuleExceptionUpsertRequestSchema.safeParse(await parseBody(c.req.raw));
    if (!parsed.success) return errorResponse(c, 422, "INVALID_REQUEST", "The request does not match contract v1");
    try { await dependencies.services(c.env).upsertAdminMapTitleRuleException({ ...parsed.data, mapId: c.req.param("mapId"), ruleId: c.req.param("ruleId") }, access.auth!, key); return c.body(null, 204); }
    catch (error) { const code = error instanceof Error ? error.message : "MAP_TITLE_EXCEPTION_UPDATE_FAILED"; if (["MAP_NOT_FOUND", "MAP_TITLE_RULE_NOT_FOUND"].includes(code)) return errorResponse(c, 404, code, "The map or map title rule does not exist"); if (code === "IDEMPOTENCY_CONFLICT") return errorResponse(c, 409, code, "The idempotency key was used with a different request"); throw error; }
  });

  app.get("/v1/admin/titles", async (c) => {
    const access = await requireMaintainer(c);
    if (access.error) return access.error;
    return c.json({ contractVersion: "1", items: await logServiceOperation(c, "admin_list_titles", () => dependencies.services(c.env).listTitles({ mapId: c.req.query("mapId")?.trim() || undefined })) });
  });

  app.get("/v1/admin/events", async (c) => {
    const access = await requireMaintainer(c);
    if (access.error) return access.error;
    return c.json({
      contractVersion: "1",
      items: await logServiceOperation(c, "admin_list_events", () => dependencies.services(c.env).listRandomEvents({
        query: c.req.query("query")?.trim() || undefined,
        category: c.req.query("category")?.trim() || undefined,
        rarity: c.req.query("rarity")?.trim() || undefined,
        includeArchived: c.req.query("archived") === "true",
      })),
    });
  });
  app.post("/v1/admin/events", async (c) => { const access = await requireMaintainer(c); if (access.error) return access.error; const key = c.req.header("idempotency-key"); if (!key) return errorResponse(c, 422, "IDEMPOTENCY_KEY_REQUIRED", "Idempotency-Key is required"); const parsed = adminRandomEventCreateRequestSchema.safeParse(await parseBody(c.req.raw)); if (!parsed.success) return errorResponse(c, 422, "INVALID_REQUEST", "The request does not match contract v1"); try { return c.json(await dependencies.services(c.env).createAdminRandomEvent(parsed.data, access.auth!, key), 201); } catch (error) { const code = error instanceof Error ? error.message : "EVENT_CREATE_FAILED"; if (code === "CHALLENGE_NOT_FOUND") return errorResponse(c, 422, code, "The challenge does not exist"); if (code === "IDEMPOTENCY_CONFLICT") return errorResponse(c, 409, code, "The idempotency key was used with a different request"); throw error; } });
  app.put("/v1/admin/events/:eventId", async (c) => { const access = await requireMaintainer(c); if (access.error) return access.error; const key = c.req.header("idempotency-key"); if (!key) return errorResponse(c, 422, "IDEMPOTENCY_KEY_REQUIRED", "Idempotency-Key is required"); const parsed = adminRandomEventUpdateRequestSchema.safeParse(await parseBody(c.req.raw)); if (!parsed.success) return errorResponse(c, 422, "INVALID_REQUEST", "The request does not match contract v1"); try { return c.json(await dependencies.services(c.env).updateAdminRandomEvent({ ...parsed.data, eventId: c.req.param("eventId") }, access.auth!, key)); } catch (error) { const code = error instanceof Error ? error.message : "EVENT_UPDATE_FAILED"; if (code === "EVENT_NOT_FOUND") return errorResponse(c, 404, code, "The event does not exist"); if (code === "CHALLENGE_NOT_FOUND") return errorResponse(c, 422, code, "The challenge does not exist"); if (code === "IDEMPOTENCY_CONFLICT") return errorResponse(c, 409, code, "The idempotency key was used with a different request"); throw error; } });
  app.delete("/v1/admin/events/:eventId", async (c) => { const access = await requireMaintainer(c); if (access.error) return access.error; const key = c.req.header("idempotency-key"); if (!key) return errorResponse(c, 422, "IDEMPOTENCY_KEY_REQUIRED", "Idempotency-Key is required"); try { await dependencies.services(c.env).archiveAdminRandomEvent({ eventId: c.req.param("eventId") }, access.auth!, key); return c.body(null, 204); } catch (error) { const code = error instanceof Error ? error.message : "EVENT_ARCHIVE_FAILED"; if (code === "EVENT_NOT_FOUND") return errorResponse(c, 404, code, "The event does not exist"); if (code === "IDEMPOTENCY_CONFLICT") return errorResponse(c, 409, code, "The idempotency key was used with a different request"); throw error; } });
  app.post("/v1/admin/events/imports/preview", async (c) => { const access = await requireMaintainer(c); if (access.error) return access.error; const parsed = adminRandomEventImportRequestSchema.safeParse(await parseBody(c.req.raw)); if (!parsed.success) return errorResponse(c, 422, "INVALID_REQUEST", "The request does not match contract v1"); return c.json(await dependencies.services(c.env).previewAdminRandomEventImport(parsed.data, access.auth!)); });
  app.post("/v1/admin/events/imports", async (c) => { const access = await requireMaintainer(c); if (access.error) return access.error; const key = c.req.header("idempotency-key"); if (!key) return errorResponse(c, 422, "IDEMPOTENCY_KEY_REQUIRED", "Idempotency-Key is required"); const parsed = adminRandomEventImportRequestSchema.safeParse(await parseBody(c.req.raw)); if (!parsed.success) return errorResponse(c, 422, "INVALID_REQUEST", "The request does not match contract v1"); try { return c.json(await dependencies.services(c.env).importAdminRandomEvents(parsed.data, access.auth!, key), 201); } catch (error) { const code = error instanceof Error ? error.message : "EVENT_IMPORT_FAILED"; if (["EVENT_IMPORT_INVALID", "EVENT_IMPORT_NAME_CONFLICT", "CHALLENGE_NOT_FOUND"].includes(code)) return errorResponse(c, 422, code, "The import data is invalid"); if (code === "EVENT_IMPORT_DUPLICATE" || code === "IDEMPOTENCY_CONFLICT") return errorResponse(c, 409, code, "The import was already processed"); throw error; } });

  app.get("/v1/admin/maps/:mapId/editor", async (c) => {
    const access = await requireMaintainer(c);
    if (access.error) return access.error;
    try { return c.json(await logServiceOperation(c, "admin_get_map_editor", () => dependencies.services(c.env).getAdminMapEditor({ mapId: c.req.param("mapId") }, access.auth!))); }
    catch (error) {
      const code = error instanceof Error ? error.message : "MAP_EDITOR_READ_FAILED";
      if (code === "MAP_NOT_FOUND") return errorResponse(c, 404, code, "The map does not exist");
      if (["INVALID_REVISION_LIFECYCLE", "INVALID_MAP_VARIANT", "INVALID_REVISION_ASSIGNMENT", "INVALID_SPATIAL_CONFIG"].includes(code)) return errorResponse(c, 422, code, "The map revision data is invalid");
      throw error;
    }
  });
  app.post("/v1/admin/maps/:mapId/revisions", async (c) => {
    const access = await requireMaintainer(c);
    if (access.error) return access.error;
    const idempotencyKey = c.req.header("idempotency-key");
    if (!idempotencyKey) return errorResponse(c, 422, "IDEMPOTENCY_KEY_REQUIRED", "Idempotency-Key is required");
    const parsed = adminMapRevisionCreateRequestSchema.safeParse(await parseBody(c.req.raw));
    if (!parsed.success) return errorResponse(c, 422, "INVALID_REQUEST", "The request does not match contract v1");
    try { return c.json(await dependencies.services(c.env).createAdminMapRevision({ ...parsed.data, mapId: c.req.param("mapId") }, access.auth!, idempotencyKey), 201); }
    catch (error) {
      const code = error instanceof Error ? error.message : "MAP_REVISION_CREATE_FAILED";
      if (code === "MAP_NOT_FOUND") return errorResponse(c, 404, code, "The map does not exist");
      if (code === "REVISION_SOURCE_NOT_FOUND") return errorResponse(c, 422, code, "The source revision does not belong to this map");
      if (["INVALID_SPATIAL_CONFIG", "INVALID_REVISION_ASSIGNMENT", "DUPLICATE_REVISION_ASSIGNMENT", "REVISION_CHALLENGE_NOT_FOUND", "REVISION_CHALLENGE_NOT_ACTIVE", "REVISION_CHALLENGE_NOT_ASSIGNABLE"].includes(code)) return errorResponse(c, 422, code, "The revision configuration is invalid");
      if (["IDEMPOTENCY_CONFLICT", "LEGACY_VARIANT_CONFLICT"].includes(code)) return errorResponse(c, 409, code, "The revision conflicts with an existing record");
      throw error;
    }
  });
  app.put("/v1/admin/maps/:mapId/revisions/:revisionId", async (c) => {
    const access = await requireMaintainer(c);
    if (access.error) return access.error;
    const idempotencyKey = c.req.header("idempotency-key");
    if (!idempotencyKey) return errorResponse(c, 422, "IDEMPOTENCY_KEY_REQUIRED", "Idempotency-Key is required");
    const parsed = adminMapRevisionUpdateRequestSchema.safeParse(await parseBody(c.req.raw));
    if (!parsed.success) return errorResponse(c, 422, "INVALID_REQUEST", "The request does not match contract v1");
    try { return c.json(await dependencies.services(c.env).updateAdminMapRevision({ ...parsed.data, mapId: c.req.param("mapId"), revisionId: c.req.param("revisionId") }, access.auth!, idempotencyKey)); }
    catch (error) {
      const code = error instanceof Error ? error.message : "MAP_REVISION_UPDATE_FAILED";
      if (code === "REVISION_NOT_FOUND") return errorResponse(c, 404, code, "The map revision does not exist");
      if (["INVALID_REVISION_TRANSITION", "DEFAULT_REVISION_CANNOT_USE_CLASSIC_VARIANT", "INVALID_SPATIAL_CONFIG", "INVALID_REVISION_ASSIGNMENT", "DUPLICATE_REVISION_ASSIGNMENT", "REVISION_CHALLENGE_NOT_FOUND", "REVISION_CHALLENGE_NOT_ACTIVE", "REVISION_CHALLENGE_NOT_ASSIGNABLE"].includes(code)) return errorResponse(c, 422, code, "The revision configuration is invalid");
      if (["DEFAULT_REVISION_CONFLICT", "LEGACY_VARIANT_CONFLICT", "IDEMPOTENCY_CONFLICT"].includes(code)) return errorResponse(c, 409, code, "The revision conflicts with an existing record");
      throw error;
    }
  });

  app.put("/v1/admin/maps/:mapId/metadata", async (c) => {
    const access = await requireMaintainer(c);
    if (access.error) return access.error;
    const idempotencyKey = c.req.header("idempotency-key");
    if (!idempotencyKey) return errorResponse(c, 422, "IDEMPOTENCY_KEY_REQUIRED", "Idempotency-Key is required");
    const parsed = adminMapMetadataUpdateRequestSchema.safeParse(await parseBody(c.req.raw));
    if (!parsed.success) return errorResponse(c, 422, "INVALID_REQUEST", "The request does not match contract v1");
    try { return c.json(await dependencies.services(c.env).updateAdminMapMetadata({ ...parsed.data, mapId: c.req.param("mapId") }, access.auth!, idempotencyKey)); }
    catch (error) {
      const code = error instanceof Error ? error.message : "MAP_METADATA_UPDATE_FAILED";
      if (code === "MAP_NOT_FOUND") return errorResponse(c, 404, code, "The map does not exist");
      if (code === "IDEMPOTENCY_CONFLICT") return errorResponse(c, 409, code, "The idempotency key was used with a different request");
      throw error;
    }
  });

  app.put("/v1/admin/titles/:titleKey", async (c) => {
    const access = await requireMaintainer(c);
    if (access.error) return access.error;
    const idempotencyKey = c.req.header("idempotency-key");
    if (!idempotencyKey) return errorResponse(c, 422, "IDEMPOTENCY_KEY_REQUIRED", "Idempotency-Key is required");
    const parsed = adminCatalogTitleUpdateRequestSchema.safeParse(await parseBody(c.req.raw));
    if (!parsed.success) return errorResponse(c, 422, "INVALID_REQUEST", "The request does not match contract v1");
    try {
      await dependencies.services(c.env).updateAdminCatalogTitle({ ...parsed.data, titleKey: c.req.param("titleKey") }, access.auth!, idempotencyKey);
      return c.body(null, 204);
    } catch (error) {
      const code = error instanceof Error ? error.message : "TITLE_UPDATE_FAILED";
      if (code === "TITLE_NOT_FOUND") return errorResponse(c, 404, code, "The title does not exist");
      if (code === "TITLE_HAS_CHALLENGE") return errorResponse(c, 409, code, "The title has a challenge record");
      if (code === "DEVELOPER_TITLE_CANNOT_BE_A_CHALLENGE") return errorResponse(c, 422, code, "A developer-retained title cannot become a player challenge");
      if (code === "IDEMPOTENCY_CONFLICT") return errorResponse(c, 409, code, "The idempotency key was used with a different request");
      throw error;
    }
  });

  app.post("/v1/admin/titles/:titleKey/icon", async (c) => {
    const access = await requireMaintainer(c);
    if (access.error) return access.error;
    try {
      const form = await c.req.raw.formData();
      const file = form.get("file");
      if (!(file instanceof File)) return errorResponse(c, 422, "ICON_FILE_REQUIRED", "An icon file is required");
      const result = await dependencies.services(c.env).uploadAdminTitleIcon({ titleKey: c.req.param("titleKey"), body: await file.arrayBuffer(), contentType: file.type }, access.auth!);
      return c.json({ contractVersion: "1", ...result });
    } catch (error) {
      const code = error instanceof Error ? error.message : "ICON_UPLOAD_FAILED";
      if (code === "TITLE_NOT_FOUND") return errorResponse(c, 404, code, "The title does not exist");
      if (code === "ICON_FILE_INVALID") return errorResponse(c, 422, code, "仅支持 PNG、JPG、WebP，且文件不能超过 512 KB。");
      if (code === "ICON_BUCKET_UNAVAILABLE") return errorResponse(c, 503, code, "图标存储暂不可用");
      throw error;
    }
  });

  app.put("/v1/admin/achievements/:challengeId", async (c) => {
    const access = await requireMaintainer(c);
    if (access.error) return access.error;
    const idempotencyKey = c.req.header("idempotency-key");
    if (!idempotencyKey) return errorResponse(c, 422, "IDEMPOTENCY_KEY_REQUIRED", "Idempotency-Key is required");
    const body = await parseBody(c.req.raw) as Record<string, unknown> | null;
    const parsed = adminChallengeUpdateRequestSchema.safeParse({ ...body, family: body?.family ?? (c.req.param("challengeId").startsWith("title.") ? "achievement" : "map") });
    if (!parsed.success) return errorResponse(c, 422, "INVALID_REQUEST", "The request does not match contract v1");
    try { return c.json(await dependencies.services(c.env).updateAdminChallenge({ ...parsed.data, challengeId: c.req.param("challengeId") }, access.auth!, idempotencyKey)); }
    catch (error) { const code = error instanceof Error ? error.message : "ACHIEVEMENT_UPDATE_FAILED"; if (code === "CHALLENGE_NOT_FOUND") return errorResponse(c, 404, code, "The achievement does not exist"); if (["MAP_NOT_FOUND", "MAP_NOT_ACTIVE", "INVALID_MAP_SCOPE"].includes(code)) return errorResponse(c, 422, code, "The challenge map scope is invalid"); if (code === "IDEMPOTENCY_CONFLICT") return errorResponse(c, 409, code, "The idempotency key was used with a different request"); throw error; }
  });

  app.get("/v1/admin/player-accounts/:playerAccountId", async (c) => {
    const access = await requireMaintainer(c);
    if (access.error) return access.error;
    try { return c.json(await dependencies.services(c.env).getAdminPlayer({ playerAccountId: c.req.param("playerAccountId") }, access.auth!)); }
    catch (error) { if (error instanceof Error && error.message === "PLAYER_NOT_FOUND") return errorResponse(c, 404, "PLAYER_NOT_FOUND", "The player does not exist"); throw error; }
  });

  app.put("/v1/admin/player-accounts/:playerAccountId/status", async (c) => {
    const access = await requireMaintainer(c);
    if (access.error) return access.error;
    const idempotencyKey = c.req.header("idempotency-key");
    if (!idempotencyKey) return errorResponse(c, 422, "IDEMPOTENCY_KEY_REQUIRED", "Idempotency-Key is required");
    const parsed = adminPlayerStatusRequestSchema.safeParse(await parseBody(c.req.raw));
    if (!parsed.success) return errorResponse(c, 422, "INVALID_REQUEST", "The request does not match contract v1");
    try { await dependencies.services(c.env).setAdminPlayerStatus({ playerAccountId: c.req.param("playerAccountId"), status: parsed.data.status, reason: parsed.data.reason }, access.auth!, idempotencyKey); return c.body(null, 204); }
    catch (error) { if (error instanceof Error && error.message === "PLAYER_NOT_FOUND") return errorResponse(c, 404, "PLAYER_NOT_FOUND", "The player does not exist"); if (error instanceof Error && error.message === "IDEMPOTENCY_CONFLICT") return errorResponse(c, 409, "IDEMPOTENCY_CONFLICT", "The idempotency key was used with a different request"); throw error; }
  });

  app.put("/v1/admin/player-accounts/:playerAccountId/identity", async (c) => {
    const access = await requireMaintainer(c);
    if (access.error) return access.error;
    const idempotencyKey = c.req.header("idempotency-key");
    if (!idempotencyKey) return errorResponse(c, 422, "IDEMPOTENCY_KEY_REQUIRED", "Idempotency-Key is required");
    const parsed = adminPlayerIdentityRequestSchema.safeParse(await parseBody(c.req.raw));
    if (!parsed.success) return errorResponse(c, 422, "INVALID_REQUEST", "The request does not match contract v1");
    try {
      await dependencies.services(c.env).updateAdminPlayerIdentity({ ...parsed.data, playerAccountId: c.req.param("playerAccountId") }, access.auth!, idempotencyKey);
      return c.body(null, 204);
    } catch (error) {
      const code = error instanceof Error ? error.message : "PLAYER_IDENTITY_UPDATE_FAILED";
      if (code === "PLAYER_NOT_FOUND") return errorResponse(c, 404, code, "The player does not exist");
      if (code === "PLAYER_BATTLETAG_CONFLICT") return errorResponse(c, 409, code, "The BattleTag is already used by another player");
      if (code === "IDEMPOTENCY_CONFLICT") return errorResponse(c, 409, code, "The idempotency key was used with a different request");
      throw error;
    }
  });

  app.delete("/v1/admin/bindings/:bindingId", async (c) => {
    const access = await requireMaintainer(c);
    if (access.error) return access.error;
    const idempotencyKey = c.req.header("idempotency-key");
    if (!idempotencyKey) return errorResponse(c, 422, "IDEMPOTENCY_KEY_REQUIRED", "Idempotency-Key is required");
    try { await dependencies.services(c.env).removeAdminBinding({ bindingId: c.req.param("bindingId") }, access.auth!, idempotencyKey); return c.body(null, 204); }
    catch (error) { if (error instanceof Error && error.message === "BINDING_NOT_FOUND") return errorResponse(c, 404, "BINDING_NOT_FOUND", "The binding does not exist"); if (error instanceof Error && error.message === "IDEMPOTENCY_CONFLICT") return errorResponse(c, 409, "IDEMPOTENCY_CONFLICT", "The idempotency key was used with a different request"); throw error; }
  });

  app.get("/v1/admin/title-grants", async (c) => {
    const access = await requireMaintainer(c);
    if (access.error) return access.error;
    const page = Math.max(1, Number(c.req.query("page") ?? "1") || 1);
    const pageSize = Math.min(50, Math.max(1, Number(c.req.query("pageSize") ?? "20") || 20));
    const filter = c.req.query("filter")?.trim() || "all";
    if (filter !== "all" && filter !== "pending" && filter !== "completed") return errorResponse(c, 422, "INVALID_REQUEST", "The filter is invalid");
    return c.json(await dependencies.services(c.env).listHistoricalTitleGrants({ query: c.req.query("query")?.trim() || undefined, filter, page, pageSize }, access.auth!));
  });

  app.get("/v1/admin/title-grants/holder", async (c) => {
    const access = await requireMaintainer(c);
    if (access.error) return access.error;
    const holderName = c.req.query("holderName")?.trim() || "";
    if (!holderName) return errorResponse(c, 422, "INVALID_REQUEST", "holderName is required");
    const page = Math.max(1, Number(c.req.query("page") ?? "1") || 1);
    const pageSize = Math.min(100, Math.max(1, Number(c.req.query("pageSize") ?? "50") || 50));
    const grantStatus = c.req.query("grantStatus")?.trim() || "all";
    if (grantStatus !== "all" && grantStatus !== "unclaimed" && grantStatus !== "active" && grantStatus !== "revoked") return errorResponse(c, 422, "INVALID_REQUEST", "The grantStatus is invalid");
    try {
      return c.json(await dependencies.services(c.env).getHistoricalTitleHolder({ holderName, page, pageSize, grantStatus }, access.auth!));
    } catch (error) {
      if (error instanceof Error && error.message === "HISTORICAL_HOLDER_NOT_FOUND") return errorResponse(c, 404, "HISTORICAL_HOLDER_NOT_FOUND", "The historical holder does not exist");
      throw error;
    }
  });

  app.post("/v1/admin/title-grants", async (c) => {
    const access = await requireMaintainer(c);
    if (access.error) return access.error;
    const idempotencyKey = c.req.header("idempotency-key");
    if (!idempotencyKey) return errorResponse(c, 422, "IDEMPOTENCY_KEY_REQUIRED", "Idempotency-Key is required");
    const parsed = adminTitleGrantRequestSchema.safeParse(await parseBody(c.req.raw));
    if (!parsed.success) return errorResponse(c, 422, "INVALID_REQUEST", "The request does not match contract v1");
    try { await dependencies.services(c.env).createAdminTitleGrant(parsed.data, access.auth!, idempotencyKey); return c.body(null, 204); }
    catch (error) { const code = error instanceof Error ? error.message : "TITLE_GRANT_FAILED"; if (["HISTORICAL_TITLE_GRANT_NOT_FOUND", "PLAYER_NOT_FOUND"].includes(code)) return errorResponse(c, 404, code, "The requested record does not exist"); if (code === "HISTORICAL_TITLE_GRANT_CLAIMED") return errorResponse(c, 409, code, "The historical title is already linked"); if (code === "IDEMPOTENCY_CONFLICT") return errorResponse(c, 409, code, "The idempotency key was used with a different request"); throw error; }
  });

  app.post("/v1/admin/title-grants/bulk", async (c) => {
    const access = await requireMaintainer(c);
    if (access.error) return access.error;
    const idempotencyKey = c.req.header("idempotency-key");
    if (!idempotencyKey) return errorResponse(c, 422, "IDEMPOTENCY_KEY_REQUIRED", "Idempotency-Key is required");
    const parsed = adminTitleGrantBulkRequestSchema.safeParse(await parseBody(c.req.raw));
    if (!parsed.success) return errorResponse(c, 422, "INVALID_REQUEST", "The request does not match contract v1");
    try { return c.json(await dependencies.services(c.env).createAdminTitleGrantBulk(parsed.data, access.auth!, idempotencyKey)); }
    catch (error) { const code = error instanceof Error ? error.message : "TITLE_GRANT_BULK_FAILED"; if (code === "PLAYER_NOT_FOUND") return errorResponse(c, 404, code, "The requested player does not exist"); if (code === "IDEMPOTENCY_CONFLICT") return errorResponse(c, 409, code, "The idempotency key was used with a different request"); throw error; }
  });

  app.post("/v1/admin/title-grants/manual", async (c) => {
    const access = await requireMaintainer(c);
    if (access.error) return access.error;
    const idempotencyKey = c.req.header("idempotency-key");
    if (!idempotencyKey) return errorResponse(c, 422, "IDEMPOTENCY_KEY_REQUIRED", "Idempotency-Key is required");
    const parsed = adminManualTitleGrantRequestSchema.safeParse(await parseBody(c.req.raw));
    if (!parsed.success) return errorResponse(c, 422, "INVALID_REQUEST", "The request does not match contract v1");
    try { return c.json(await dependencies.services(c.env).createAdminManualTitleGrant(parsed.data, access.auth!, idempotencyKey)); }
    catch (error) {
      const code = error instanceof Error ? error.message : "MANUAL_TITLE_GRANT_FAILED";
      if (["PLAYER_NOT_FOUND", "TITLE_NOT_FOUND", "MAP_NOT_FOUND"].includes(code)) return errorResponse(c, 404, code, "The requested player, title, or map does not exist");
      if (["GLOBAL_TITLE_CANNOT_HAVE_MAP", "MAP_TITLE_REQUIRES_MAP", "TITLE_MAP_REWARD_NOT_CONFIGURED"].includes(code)) return errorResponse(c, 422, code, "The title and map combination is invalid");
      if (code === "IDEMPOTENCY_CONFLICT") return errorResponse(c, 409, code, "The idempotency key was used with a different request");
      throw error;
    }
  });

  app.post("/v1/admin/title-grants/:grantId/revoke", async (c) => {
    const access = await requireMaintainer(c);
    if (access.error) return access.error;
    const idempotencyKey = c.req.header("idempotency-key");
    if (!idempotencyKey) return errorResponse(c, 422, "IDEMPOTENCY_KEY_REQUIRED", "Idempotency-Key is required");
    const parsed = adminTitleGrantRevokeRequestSchema.safeParse(await parseBody(c.req.raw));
    if (!parsed.success) return errorResponse(c, 422, "INVALID_REQUEST", "The request does not match contract v1");
    try { await dependencies.services(c.env).revokeAdminTitleGrant({ grantId: c.req.param("grantId"), reason: parsed.data.reason }, access.auth!, idempotencyKey); return c.body(null, 204); }
    catch (error) { const code = error instanceof Error ? error.message : "TITLE_GRANT_REVOKE_FAILED"; if (code === "TITLE_GRANT_NOT_FOUND") return errorResponse(c, 404, code, "The title grant does not exist"); if (code === "IDEMPOTENCY_CONFLICT") return errorResponse(c, 409, code, "The idempotency key was used with a different request"); throw error; }
  });

  app.get("/v1/admin/reviews", async (c) => {
    const access = await requireMaintainer(c);
    if (access.error) return access.error;
    const pageValue = Number(c.req.query("page") ?? 1);
    const pageSizeValue = Number(c.req.query("pageSize") ?? 20);
    const page = Number.isInteger(pageValue) && pageValue > 0 ? pageValue : 0;
    const pageSize = Number.isInteger(pageSizeValue) && pageSizeValue > 0 && pageSizeValue <= 50 ? pageSizeValue : 0;
    const targetTypeValue = c.req.query("targetType");
    const targetType = targetTypeValue ? reviewTargetTypeSchema.safeParse(targetTypeValue) : null;
    const status = c.req.query("status");
    const commentStatus = c.req.query("commentStatus");
    const ratingValue = c.req.query("rating");
    const rating = ratingValue === undefined ? undefined : Number(ratingValue);
    const fromValue = c.req.query("from");
    const toValue = c.req.query("to");
    const from = fromValue === undefined ? undefined : Number(fromValue);
    const to = toValue === undefined ? undefined : Number(toValue);
    const allowedStatuses = ["active", "withdrawn", "invalidated"] as const;
    const allowedCommentStatuses = ["visible", "hidden"] as const;
    const targetId = c.req.query("targetId")?.trim() || undefined;
    if (!page || !pageSize || (targetTypeValue && !targetType?.success) || (status && !allowedStatuses.includes(status as typeof allowedStatuses[number])) || (commentStatus && !allowedCommentStatuses.includes(commentStatus as typeof allowedCommentStatuses[number])) || (rating !== undefined && (!Number.isInteger(rating) || rating < 1 || rating > 5)) || (from !== undefined && (!Number.isInteger(from) || from < 0)) || (to !== undefined && (!Number.isInteger(to) || to < 0)) || (from !== undefined && to !== undefined && from > to) || (targetId && !reviewTargetSchema.shape.targetId.safeParse(targetId).success)) {
      return errorResponse(c, 422, "INVALID_REQUEST", "The review query is invalid");
    }
    return c.json(await dependencies.services(c.env).listAdminReviews({ page, pageSize, ...(targetType?.success ? { targetType: targetType.data } : {}), ...(targetId ? { targetId } : {}), ...(status ? { status: status as typeof allowedStatuses[number] } : {}), ...(commentStatus ? { commentStatus: commentStatus as typeof allowedCommentStatuses[number] } : {}), ...(rating !== undefined ? { rating: rating as 1 | 2 | 3 | 4 | 5 } : {}), ...(from !== undefined ? { from } : {}), ...(to !== undefined ? { to } : {}) }, access.auth!));
  });

  app.get("/v1/admin/reviews/:reviewId", async (c) => {
    const access = await requireMaintainer(c);
    if (access.error) return access.error;
    const reviewId = c.req.param("reviewId");
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(reviewId)) return errorResponse(c, 422, "INVALID_REVIEW_ID", "The review ID is invalid");
    try { return c.json(await dependencies.services(c.env).getAdminReview({ reviewId }, access.auth!)); }
    catch (error) { if (error instanceof Error && error.message === "REVIEW_NOT_FOUND") return errorResponse(c, 404, "REVIEW_NOT_FOUND", "The review does not exist"); if (error instanceof Error && error.message === "REVIEW_TARGET_NOT_FOUND") return errorResponse(c, 404, "REVIEW_TARGET_NOT_FOUND", "The review target does not exist"); throw error; }
  });

  app.post("/v1/admin/reviews/:reviewId/comment", async (c) => {
    const access = await requireMaintainer(c);
    if (access.error) return access.error;
    const reviewId = c.req.param("reviewId");
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(reviewId)) return errorResponse(c, 422, "INVALID_REVIEW_ID", "The review ID is invalid");
    const idempotencyKey = c.req.header("idempotency-key");
    if (!idempotencyKey) return errorResponse(c, 422, "IDEMPOTENCY_KEY_REQUIRED", "Idempotency-Key is required");
    const parsed = adminReviewCommentModerationRequestSchema.safeParse(await parseBody(c.req.raw));
    if (!parsed.success) return errorResponse(c, 422, "INVALID_REQUEST", "The request does not match contract v1");
    try {
      const input = parsed.data.reason === undefined ? { reviewId } : { reviewId, reason: parsed.data.reason };
      if (parsed.data.action === "hide") await dependencies.services(c.env).hideReviewComment(input, access.auth!, idempotencyKey);
      else await dependencies.services(c.env).restoreReviewComment(input, access.auth!, idempotencyKey);
      return c.json(await dependencies.services(c.env).getAdminReview({ reviewId }, access.auth!));
    } catch (error) {
      const code = error instanceof Error ? error.message : "REVIEW_COMMENT_MODERATION_FAILED";
      if (code === "REVIEW_NOT_FOUND") return errorResponse(c, 404, code, "The review does not exist");
      if (code === "REVIEW_COMMENT_NOT_FOUND") return errorResponse(c, 422, code, "The review has no comment");
      if (code === "IDEMPOTENCY_CONFLICT") return errorResponse(c, 409, code, "The idempotency key was used with a different request");
      throw error;
    }
  });

  app.post("/v1/admin/reviews/:reviewId/state", async (c) => {
    const access = await requireMaintainer(c);
    if (access.error) return access.error;
    const reviewId = c.req.param("reviewId");
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(reviewId)) return errorResponse(c, 422, "INVALID_REVIEW_ID", "The review ID is invalid");
    const idempotencyKey = c.req.header("idempotency-key");
    if (!idempotencyKey) return errorResponse(c, 422, "IDEMPOTENCY_KEY_REQUIRED", "Idempotency-Key is required");
    const parsed = adminReviewStateModerationRequestSchema.safeParse(await parseBody(c.req.raw));
    if (!parsed.success) return errorResponse(c, 422, "INVALID_REQUEST", "The request does not match contract v1");
    try {
      const input = parsed.data.reason === undefined ? { reviewId } : { reviewId, reason: parsed.data.reason };
      if (parsed.data.action === "invalidate") await dependencies.services(c.env).invalidateReview(input, access.auth!, idempotencyKey);
      else await dependencies.services(c.env).restoreReview(input, access.auth!, idempotencyKey);
      return c.json(await dependencies.services(c.env).getAdminReview({ reviewId }, access.auth!));
    } catch (error) {
      const code = error instanceof Error ? error.message : "REVIEW_STATE_MODERATION_FAILED";
      if (code === "REVIEW_NOT_FOUND") return errorResponse(c, 404, code, "The review does not exist");
      if (code === "IDEMPOTENCY_CONFLICT") return errorResponse(c, 409, code, "The idempotency key was used with a different request");
      throw error;
    }
  });

  app.get("/v1/admin/mastery-runs", async (c) => {
    const access = await requireMaintainer(c);
    if (access.error) return access.error;
    const query = adminMasteryRunQuery(c.req.raw);
    if (!query) return errorResponse(c, 422, "INVALID_REQUEST", "The mastery run query is invalid");
    return c.json(await dependencies.services(c.env).listAdminMasteryRuns(query, access.auth!));
  });

  app.get("/v1/admin/mastery-runs/:masteryRunId", async (c) => {
    const access = await requireMaintainer(c);
    if (access.error) return access.error;
    const masteryRunId = c.req.param("masteryRunId");
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(masteryRunId)) return errorResponse(c, 422, "INVALID_MASTERY_RUN_ID", "The mastery run ID is invalid");
    try {
      return c.json(await dependencies.services(c.env).getAdminMasteryRun({ masteryRunId }, access.auth!));
    } catch (error) {
      const code = error instanceof Error ? error.message : "MASTERY_RUN_LOOKUP_FAILED";
      if (["MASTERY_RUN_NOT_FOUND", "MASTERY_SUBMISSION_NOT_FOUND"].includes(code)) return errorResponse(c, 404, code, "The mastery run does not exist");
      throw error;
    }
  });

  app.post("/v1/admin/mastery-runs/:masteryRunId/state", async (c) => {
    const access = await requireMaintainer(c);
    if (access.error) return access.error;
    const masteryRunId = c.req.param("masteryRunId");
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(masteryRunId)) return errorResponse(c, 422, "INVALID_MASTERY_RUN_ID", "The mastery run ID is invalid");
    const idempotencyKey = c.req.header("idempotency-key");
    if (!idempotencyKey) return errorResponse(c, 422, "IDEMPOTENCY_KEY_REQUIRED", "Idempotency-Key is required");
    const parsed = adminMasteryRunStateRequestSchema.safeParse(await parseBody(c.req.raw));
    if (!parsed.success) return errorResponse(c, 422, "INVALID_REQUEST", "The request does not match contract v1");
    try {
      return c.json(await dependencies.services(c.env).transitionAdminMasteryRun({ ...parsed.data, masteryRunId }, access.auth!, idempotencyKey));
    } catch (error) {
      const code = error instanceof Error ? error.message : "MASTERY_RUN_STATE_UPDATE_FAILED";
      if (code === "MASTERY_RUN_NOT_FOUND") return errorResponse(c, 404, code, "The mastery run does not exist");
      if (["MASTERY_RUN_CODE_CONFLICT", "IDEMPOTENCY_CONFLICT"].includes(code)) return errorResponse(c, 409, code, code === "IDEMPOTENCY_CONFLICT" ? "The idempotency key was used with a different request" : "Another active run already uses this run code");
      throw error;
    }
  });

  app.post("/v1/admin/mastery-runs/:masteryRunId/conflicts/:submissionId", async (c) => {
    const access = await requireMaintainer(c);
    if (access.error) return access.error;
    const masteryRunId = c.req.param("masteryRunId");
    const submissionId = c.req.param("submissionId");
    const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
    if (!uuid.test(masteryRunId)) return errorResponse(c, 422, "INVALID_MASTERY_RUN_ID", "The mastery run ID is invalid");
    if (!uuid.test(submissionId)) return errorResponse(c, 422, "INVALID_SUBMISSION_ID", "The submission ID is invalid");
    const idempotencyKey = c.req.header("idempotency-key");
    if (!idempotencyKey) return errorResponse(c, 422, "IDEMPOTENCY_KEY_REQUIRED", "Idempotency-Key is required");
    const parsed = adminMasteryRunConflictResolutionRequestSchema.safeParse(await parseBody(c.req.raw));
    if (!parsed.success) return errorResponse(c, 422, "INVALID_REQUEST", "The request does not match contract v1");
    try {
      return c.json(await dependencies.services(c.env).resolveAdminMasteryRunConflict({ ...parsed.data, masteryRunId, submissionId }, access.auth!, idempotencyKey));
    } catch (error) {
      const code = error instanceof Error ? error.message : "MASTERY_RUN_CONFLICT_RESOLUTION_FAILED";
      if (code === "MASTERY_RUN_NOT_FOUND") return errorResponse(c, 404, code, "The mastery run does not exist");
      if (code === "MASTERY_RUN_CONFLICT_NOT_FOUND") return errorResponse(c, 404, code, "The mastery conflict does not exist");
      if (code === "IDEMPOTENCY_CONFLICT") return errorResponse(c, 409, code, "The idempotency key was used with a different request");
      throw error;
    }
  });

  app.get("/v1/admin/submissions", async (c) => {
    const access = await requireMaintainer(c);
    if (access.error) return access.error;
    const page = Math.max(1, Number(c.req.query("page") ?? 1) || 1);
    const pageSize = Math.min(50, Math.max(1, Number(c.req.query("pageSize") ?? 50) || 50));
    const statuses = c.req.query("status")?.split(",").map((status) => status.trim()).filter(Boolean) ?? [];
    const spotCheck = c.req.query("spotCheck");
    const allowedStatuses = ["received", "evidence_pending", "evidence_stored", "upload_pending", "ocr_pending", "awaiting_player_confirmation", "ready_for_review", "ocr_review_required", "approved", "rejected", "resubmission_required"] as const;
    if (statuses.some((status) => !allowedStatuses.includes(status as typeof allowedStatuses[number]))) return errorResponse(c, 422, "INVALID_REQUEST", "The submission status is invalid");
    if (spotCheck && !["pending", "confirmed", "revoked"].includes(spotCheck)) return errorResponse(c, 422, "INVALID_REQUEST", "The spot-check status is invalid");
    return c.json(await dependencies.services(c.env).listAdminSubmissions({ statuses: statuses as typeof allowedStatuses[number][], ...(spotCheck ? { spotCheck: spotCheck as "pending" | "confirmed" | "revoked" } : {}), page, pageSize }, access.auth!));
  });

  app.get("/v1/admin/submissions/:submissionId", async (c) => {
    const access = await requireMaintainer(c);
    if (access.error) return access.error;
    try { return c.json(await dependencies.services(c.env).getAdminSubmission({ submissionId: c.req.param("submissionId") }, access.auth!)); }
    catch (error) { if (error instanceof Error && error.message === "SUBMISSION_NOT_FOUND") return errorResponse(c, 404, "SUBMISSION_NOT_FOUND", "The submission does not exist"); throw error; }
  });

  app.get("/v1/admin/submissions/:submissionId/evidence", async (c) => {
    const access = await requireMaintainer(c);
    if (access.error) return access.error;
    try { const evidence = await dependencies.services(c.env).getAdminEvidence({ submissionId: c.req.param("submissionId") }, access.auth!); return new Response(evidence.body, { headers: { "content-type": evidence.contentType, "cache-control": "private, no-store" } }); }
    catch (error) { if (error instanceof Error && error.message === "EVIDENCE_NOT_FOUND") return errorResponse(c, 404, "EVIDENCE_NOT_FOUND", "The evidence does not exist"); throw error; }
  });

  app.post("/v1/admin/submissions/:submissionId/review", async (c) => {
    const access = await requireMaintainer(c);
    if (access.error) return access.error;
    const idempotencyKey = c.req.header("idempotency-key");
    if (!idempotencyKey) return errorResponse(c, 422, "IDEMPOTENCY_KEY_REQUIRED", "Idempotency-Key is required");
    const parsed = adminSubmissionReviewRequestSchema.safeParse(await parseBody(c.req.raw));
    if (!parsed.success) return errorResponse(c, 422, "INVALID_REQUEST", "The request does not match contract v1");
    try { return c.json(await dependencies.services(c.env).reviewSubmission({ submissionId: c.req.param("submissionId"), decision: parsed.data.decision, reason: parsed.data.reason }, access.auth!, idempotencyKey)); }
    catch (error) { const code = error instanceof Error ? error.message : "REVIEW_FAILED"; if (["SUBMISSION_NOT_FOUND", "SUBMISSION_NOT_REVIEWABLE", "CHALLENGE_REWARD_NOT_CONFIGURED"].includes(code)) return errorResponse(c, 422, code, code === "CHALLENGE_REWARD_NOT_CONFIGURED" ? "The challenge has no configured title reward" : "The submission cannot be reviewed"); if (code === "IDEMPOTENCY_CONFLICT") return errorResponse(c, 409, code, "The idempotency key was used with a different request"); throw error; }
  });

  app.post("/v1/admin/submissions/:submissionId/challenge", async (c) => {
    const access = await requireMaintainer(c);
    if (access.error) return access.error;
    const idempotencyKey = c.req.header("idempotency-key");
    if (!idempotencyKey) return errorResponse(c, 422, "IDEMPOTENCY_KEY_REQUIRED", "Idempotency-Key is required");
    const parsed = adminSubmissionChallengeRequestSchema.safeParse(await parseBody(c.req.raw));
    if (!parsed.success) return errorResponse(c, 422, "INVALID_REQUEST", "The request does not match contract v1");
    try { return c.json(await dependencies.services(c.env).selectAdminSubmissionChallenge({ ...parsed.data, submissionId: c.req.param("submissionId") }, access.auth!, idempotencyKey)); }
    catch (error) {
      const code = error instanceof Error ? error.message : "CHALLENGE_SELECTION_FAILED";
      if (code === "SUBMISSION_NOT_FOUND") return errorResponse(c, 404, code, "The submission does not exist");
      if (["CHALLENGE_NOT_FOUND", "GAMEPLAY_REVISION_REQUIRED", "CHALLENGE_AUTOMATIC", "CHALLENGE_NOT_SELECTABLE", "SUBMISSION_NOT_SELECTABLE", "MAP_REQUIRED", "MAP_NOT_IN_CHALLENGE", "MAP_NOT_ACTIVE", "GLOBAL_CHALLENGE_CANNOT_HAVE_MAP"].includes(code)) return errorResponse(c, 422, code, "The challenge cannot be selected for this submission");
      if (code === "IDEMPOTENCY_CONFLICT") return errorResponse(c, 409, code, "The idempotency key was used with a different request");
      throw error;
    }
  });

  app.post("/v1/admin/submissions/:submissionId/ocr/retry", async (c) => {
    const access = await requireMaintainer(c);
    if (access.error) return access.error;
    const idempotencyKey = c.req.header("idempotency-key");
    if (!idempotencyKey) return errorResponse(c, 422, "IDEMPOTENCY_KEY_REQUIRED", "Idempotency-Key is required");
    const parsed = adminSubmissionOcrRetryRequestSchema.safeParse(await parseBody(c.req.raw));
    if (!parsed.success) return errorResponse(c, 422, "INVALID_REQUEST", "The request does not match contract v1");
    try { return c.json(await dependencies.services(c.env).requestAdminOcr({ submissionId: c.req.param("submissionId") }, access.auth!, idempotencyKey, c.get("requestId"))); }
    catch (error) {
      const code = error instanceof Error ? error.message : "OCR_RETRY_FAILED";
      if (code === "SUBMISSION_NOT_FOUND" || code === "EVIDENCE_NOT_FOUND") return errorResponse(c, 404, code, code === "EVIDENCE_NOT_FOUND" ? "The submission has no evidence" : "The submission does not exist");
      if (code === "OCR_NOT_CONFIGURED") return errorResponse(c, 503, code, "OCRKit is not configured");
      if (code === "IDEMPOTENCY_CONFLICT") return errorResponse(c, 409, code, "The idempotency key was used with a different request");
      throw error;
    }
  });

  app.post("/v1/admin/submissions/:submissionId/spot-check", async (c) => {
    const access = await requireMaintainer(c);
    if (access.error) return access.error;
    const idempotencyKey = c.req.header("idempotency-key");
    if (!idempotencyKey) return errorResponse(c, 422, "IDEMPOTENCY_KEY_REQUIRED", "Idempotency-Key is required");
    const parsed = adminSubmissionSpotCheckRequestSchema.safeParse(await parseBody(c.req.raw));
    if (!parsed.success) return errorResponse(c, 422, "INVALID_REQUEST", "The request does not match contract v1");
    try { return c.json(await dependencies.services(c.env).resolveAdminSubmissionSpotCheck({ ...parsed.data, submissionId: c.req.param("submissionId") }, access.auth!, idempotencyKey)); }
    catch (error) {
      const code = error instanceof Error ? error.message : "SPOT_CHECK_FAILED";
      if (["SUBMISSION_NOT_FOUND", "SPOT_CHECK_NOT_FOUND"].includes(code)) return errorResponse(c, 404, code, "The spot check does not exist");
      if (["SPOT_CHECK_ALREADY_RESOLVED", "TITLE_GRANT_NOT_FOUND"].includes(code)) return errorResponse(c, 409, code, "The spot check cannot be resolved");
      if (code === "IDEMPOTENCY_CONFLICT") return errorResponse(c, 409, code, "The idempotency key was used with a different request");
      throw error;
    }
  });

  app.post("/v1/qq/bindings", async (c) => {
    const auth = await dependencies.authenticate(c.req.raw, c.env);
    if (!auth) return errorResponse(c, 401, "UNAUTHENTICATED", "Authentication is required");
    if (!auth.roles.includes("channel:write")) return errorResponse(c, 403, "FORBIDDEN", "The actor cannot write channel data");
    const idempotencyKey = c.req.header("idempotency-key");
    if (!idempotencyKey) return errorResponse(c, 422, "IDEMPOTENCY_KEY_REQUIRED", "Idempotency-Key is required");
    const parsed = qqBindingRequestSchema.safeParse(await parseBody(c.req.raw));
    if (!parsed.success) return errorResponse(c, 422, "INVALID_REQUEST", "The request does not match contract v1");

    void parsed; void auth; void idempotencyKey;
    return errorResponse(c, 422, "INVITE_REQUIRED", "Use an invitation to request a binding");
  });


  app.post("/v1/submissions", async (c) => {
    const auth = await dependencies.authenticate(c.req.raw, c.env);
    if (!auth) return errorResponse(c, 401, "UNAUTHENTICATED", "Authentication is required");
    if (!auth.roles.includes("channel:write")) return errorResponse(c, 403, "FORBIDDEN", "The actor cannot write channel data");
    const idempotencyKey = c.req.header("idempotency-key");
    if (!idempotencyKey) return errorResponse(c, 422, "IDEMPOTENCY_KEY_REQUIRED", "Idempotency-Key is required");
    const parsed = submissionRequestSchema.safeParse(await parseBody(c.req.raw));
    if (!parsed.success) return errorResponse(c, 422, "INVALID_REQUEST", "The request does not match contract v1");

    try {
      return c.json(await dependencies.services(c.env).createSubmission(parsed.data, auth, idempotencyKey), 201);
    } catch (error) {
      if (error instanceof Error && error.message === "IDEMPOTENCY_CONFLICT") return errorResponse(c, 409, "IDEMPOTENCY_CONFLICT", "The idempotency key was used with a different request");
      if (error instanceof Error && error.message === "BINDING_NOT_FOUND") return errorResponse(c, 422, "BINDING_NOT_FOUND", "The binding does not exist");
      if (error instanceof Error && error.message === "PLAYER_BANNED") return errorResponse(c, 403, "PLAYER_BANNED", "The player account is banned");
      throw error;
    }
  });

  app.get("/v1/submissions/:submissionId", async (c) => {
    c.header("Access-Control-Allow-Origin", "*");
    c.header("Cache-Control", "private, no-store");
    const submissionId = c.req.param("submissionId");
    if (!/^[0-9a-f-]{36}$/.test(submissionId)) return errorResponse(c, 422, "INVALID_SUBMISSION_ID", "The submission ID is invalid");

    try {
      const submission = await dependencies.services(c.env).getSubmission({ submissionId }, { actorType: "user", subject: "public-status", roles: [], provider: "public" });
      return c.json(submission);
    } catch (error) {
      if (error instanceof Error && error.message === "SUBMISSION_NOT_FOUND") return errorResponse(c, 404, "SUBMISSION_NOT_FOUND", "The submission does not exist");
      throw error;
    }
  });

  return app;
};

export type { AppDependencies };
