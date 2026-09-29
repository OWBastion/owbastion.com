import { Hono } from "hono";
import {
  qqGroupAccessRequestSchema,
  qqGroupRegistrationRequestSchema,
  adminScreenshotSetCreateRequestSchema,
  adminScreenshotSetFinalizeRequestSchema,
  adminScreenshotSetDiscardRequestSchema,
  screenshotSetStatusSchema,
  playerUploadSessionRequestSchema,
  ocrAccuracyFeedbackRequestSchema,
  playerEquippedTitlesRequestSchema, adminPlayerEquippedTitlesRequestSchema,
} from "@owbastion/contracts";
import type { Authenticator, PlatformServices } from "@owbastion/domain";
import { withPublicCache } from "./public-cache";
import { maintainerRoute, parseBody, routeErrorResponse, type AdminMutation, type AdminMutationOptions, type ApiContext, type RouteErrorMap } from "./routes/route-contract";
import { registerAgentRoutes } from "./routes/agents";
import { registerAdminVerifiedRunRoutes } from "./routes/admin-verified-runs";
import { registerAdminReviewWorkflowRoutes } from "./routes/admin-review-workflow";
import { registerAdminCatalogRoutes } from "./routes/admin-catalog";
import { registerAdminPlayerManagementRoutes } from "./routes/admin-player-management";
import { registerBindingInviteRoutes } from "./routes/binding-invites";
import { registerPortalAuthenticationRoutes } from "./routes/portal-authentication";
import { registerPublicCatalogRoutes } from "./routes/public-catalog";
import { registerReviewRoutes } from "./routes/reviews";
import { hasOnlyUniqueQueryNames, parsePagination } from "./query-params";

export type RuntimeEnv = {
  DB: D1Database;
  EVIDENCE_BUCKET?: R2Bucket;
  QQBOT_API_TOKEN?: string;
  BASTION_BUILD_TOKEN?: string;
  PORTAL_ORIGIN?: string;
  LOCAL_DEV_AUTH?: string;
  UPLOAD_ORIGIN?: string;
  EVIDENCE_PUBLIC_ORIGIN?: string;
  OCRKIT_BASE_URL?: string;
  OCRKIT_API_TOKEN?: string;
  OCRKIT_SNAPSHOT_TOKEN?: string;
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

type RequestRouteClass = "admin" | "agents" | "catalog" | "health" | "local" | "ocrkit" | "portal" | "qq" | "unknown";
type Variables = { requestId: string };

// Constant-time Bearer comparison for private service tokens: a plain ===
// leaks match progress through early-exit timing.
const bearerTokenMatches = (authorization: string | undefined, secret: string) => {
  if (!authorization) return false;
  const provided = new TextEncoder().encode(authorization);
  const expected = new TextEncoder().encode(`Bearer ${secret}`);
  if (provided.length !== expected.length) return false;
  let difference = 0;
  for (let index = 0; index < provided.length; index += 1) difference |= provided[index]! ^ expected[index]!;
  return difference === 0;
};

const deploymentRevision = (env?: RuntimeEnv) => env?.DEPLOYMENT_REVISION?.trim() || "unknown";

const routeClassForPath = (pathname: string): RequestRouteClass => {
  if (pathname === "/health") return "health";
  if (pathname.startsWith("/v1/admin/")) return "admin";
  if (pathname.startsWith("/v1/agents/")) return "agents";
  if (pathname.startsWith("/v1/__local/")) return "local";
  if (pathname.startsWith("/v1/ocrkit/")) return "ocrkit";
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

const errorGroup = (status: 404 | 409 | 422 | 503, message: string, ...codes: string[]) =>
  Object.fromEntries(codes.map((code) => [code, { status, message }]));
const idempotencyConflict = { status: 409, message: "The idempotency key was used with a different request" } as const;
const idempotencyErrors: RouteErrorMap = { IDEMPOTENCY_CONFLICT: idempotencyConflict };
const unauthenticatedErrors: RouteErrorMap = { UNAUTHENTICATED: { status: 401, message: "Authentication is required" } };
const submissionNotFoundErrors: RouteErrorMap = errorGroup(404, "The submission does not exist", "SUBMISSION_NOT_FOUND");
const equippedTitleErrors: RouteErrorMap = {
  ...errorGroup(422, "The selected titles cannot be equipped", "EQUIPPED_TITLE_GRANT_INVALID", "EQUIPPED_TITLE_LIMIT_EXCEEDED"),
  ...idempotencyErrors,
};
const ocrFeedbackErrors: RouteErrorMap = {
  ...unauthenticatedErrors,
  ...submissionNotFoundErrors,
  ...errorGroup(409, "Feedback is unavailable for this submission", "OCR_FEEDBACK_UNAVAILABLE", "OCR_RESULT_NOT_FOUND", "OCR_RESULT_INVALID"),
  OCR_PROMPT_STALE: { status: 409, message: "The recognition prompt is no longer current; refresh the submission" },
  ...errorGroup(422, "The feedback content is invalid", "OCR_FEEDBACK_FIELD_UNSAFE", "OCR_FEEDBACK_FIELD_NOT_PROMPTED", "OCR_FEEDBACK_PROPOSED_VALUE_REQUIRED", "OCR_FEEDBACK_PROPOSED_VALUE_TOO_LONG"),
  ...idempotencyErrors,
};
const playerUploadSessionErrors: RouteErrorMap = {
  ...errorGroup(422, "The challenge revision is not available", "CHALLENGE_NOT_FOUND", "GAMEPLAY_REVISION_REQUIRED"),
  CHALLENGE_AUTOMATIC: { status: 422, message: "该称号满足条件后自动获得，无需提交截图。" },
  PLAYER_BANNED: { status: 403, message: "The player account is banned" },
};
const invalidUploadErrors: RouteErrorMap = errorGroup(422, "The upload is invalid or expired", "UPLOAD_SESSION_INVALID", "UPLOAD_METADATA_MISMATCH", "UPLOAD_HASH_MISMATCH");
const uploadCompletionErrors: RouteErrorMap = {
  UPLOAD_SESSION_INVALID: { status: 422, message: "The upload is invalid or expired" },
  UPLOAD_COMPLETION_IN_PROGRESS: { status: 409, message: "Upload completion is already in progress" },
};
const manualReviewErrors: RouteErrorMap = {
  ...submissionNotFoundErrors,
  ...errorGroup(409, "The submission is not eligible for manual review", "MANUAL_REVIEW_NOT_ELIGIBLE"),
};
const respondToMappedError = (context: ApiContext, error: unknown, errors: RouteErrorMap): Response => {
  const response = routeErrorResponse(context, error, errors, errorResponse);
  if (response) return response;
  throw error;
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

const playerMasteryQuery = (request: Request) => {
  const params = new URL(request.url).searchParams;
  if (!hasOnlyUniqueQueryNames(params, ["mapId", "gameplayRevisionId", "page", "pageSize"])) return null;
  const mapId = params.get("mapId");
  const gameplayRevisionId = params.get("gameplayRevisionId");
  if (mapId !== null && (!mapId.trim() || mapId.trim().length > 256)) return null;
  if (gameplayRevisionId !== null && (!gameplayRevisionId.trim() || gameplayRevisionId.trim().length > 256)) return null;
  const pagination = parsePagination(params, 50);
  return pagination ? { mapId: mapId?.trim() || undefined, gameplayRevisionId: gameplayRevisionId?.trim() || undefined, ...pagination } : null;
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
    const headers = new Headers(response.headers);
    for (const [name, value] of Object.entries(portalResponseHeaders(c))) headers.set(name, value);
    return new Response(response.clone().body, { status: response.status, statusText: response.statusText, headers });
  };
  const waitUntil = (c: any) => {
    try {
      const executionContext = c.executionCtx;
      return executionContext?.waitUntil?.bind(executionContext) as ((promise: Promise<unknown>) => void) | undefined;
    } catch {
      return undefined;
    }
  };
  const cachePublicResponse = (c: any, {
    operation,
    cacheKey,
    eligible,
    identityIndependent = false,
    response,
    decorateHit,
  }: {
    operation: string;
    cacheKey: Request;
    eligible: boolean;
    identityIndependent?: boolean;
    response: () => Promise<Response> | Response;
    decorateHit?: (response: Response) => Response;
  }) => withPublicCache({
    request: c.req.raw,
    cacheKey,
    enabled: publicCacheEnabled(c),
    eligible,
    identityIndependent,
    operation,
    response,
    decorateHit,
    waitUntil: waitUntil(c),
  });

  const publicCacheEnabled = (c: any) => c.env.PUBLIC_HTTP_CACHE_ENABLED !== "false";
  const cachedCatalogResponse = (c: any, {
    operation,
    query = {},
    eligible = hasNoQuery(c.req.raw),
    response,
  }: {
    operation: string;
    query?: Record<string, string>;
    eligible?: boolean;
    response: () => Promise<Response> | Response;
  }) => {
    c.header("Cache-Control", eligible && publicCacheEnabled(c) ? "public, max-age=300, s-maxage=300" : "private, no-store");
    return cachePublicResponse(c, {
      operation,
      cacheKey: publicCacheKey(c.req.raw, query),
      eligible,
      identityIndependent: true,
      response,
      decorateHit: decoratePortalCacheHit(c),
    });
  };
  app.get("/health", (c) => {
    c.header("Cache-Control", "private, no-store");
    return c.json({
      service: "api",
      status: "ok",
      deploymentRevision: deploymentRevision(c.env),
    });
  });

  app.on("OPTIONS", [
    "/v1/auth/*", "/v1/public/*", "/v1/admin/*", "/v1/me/*",
    "/v1/player/*", "/v1/__local/*", "/v1/uploads/*",
  ], (c) => { allowPortal(c); return c.body(null, 204); });
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

  // Private service boundary for OCRKit screenshot-set consumption (#255). The
  // token is a secret, never a committed variable; without it the endpoints are
  // closed.
  const allowOcrkit = (c: any) => {
    const token = c.env.OCRKIT_SNAPSHOT_TOKEN;
    return Boolean(token && bearerTokenMatches(c.req.header("authorization"), token));
  };

  const adminMutation: AdminMutation = async <T = undefined>(c: any, options: AdminMutationOptions<T>) => {
    const access = await requireMaintainer(c);
    if (access.error) return access.error;
    const earlyResponse = options.before?.();
    if (earlyResponse) return earlyResponse;
    const idempotencyKey = c.req.header("idempotency-key");
    if (!idempotencyKey) return errorResponse(c, 422, "IDEMPOTENCY_KEY_REQUIRED", "Idempotency-Key is required");
    const body = options.schema ? await parseBody(c.req.raw) : undefined;
    const parsed = options.schema?.safeParse(options.prepare ? options.prepare(body) : body);
    if (parsed && !parsed.success) return errorResponse(c, 422, "INVALID_REQUEST", options.invalidMessage ?? "The request does not match contract v1");
    try {
      const result = await options.action(parsed?.success ? parsed.data : undefined as T, access.auth!, idempotencyKey);
      return options.noContent ? c.body(null, 204) : c.json(result, options.status ?? 200);
    } catch (error) {
      const response = routeErrorResponse(c, error, {
        ...options.errors,
        IDEMPOTENCY_CONFLICT: options.errors?.IDEMPOTENCY_CONFLICT ?? idempotencyConflict,
      }, errorResponse);
      if (response) return response;
      throw error;
    }
  };

  registerAdminVerifiedRunRoutes(app, {
    services: dependencies.services,
    requireMaintainer,
    errorResponse,
    errorGroup,
    adminMutation,
  });



  type PortalPlayerAccess =
    | { error: Response; sessionToken?: undefined; player?: undefined }
    | { error?: undefined; sessionToken: string; player: NonNullable<Awaited<ReturnType<PlatformServices["getCurrentPlayer"]>>> };
  const requirePortalPlayer = async (c: any): Promise<PortalPlayerAccess> => {
    allowPortal(c);
    c.header("Cache-Control", "private, no-store");
    const sessionToken = portalSessionToken(c.req.raw);
    if (!sessionToken) return { error: errorResponse(c, 401, "UNAUTHENTICATED", "Authentication is required") };
    const player = await dependencies.services(c.env).getCurrentPlayer({ sessionToken });
    if (!player) return { error: errorResponse(c, 401, "UNAUTHENTICATED", "Authentication is required") };
    return { sessionToken, player };
  };
  type AuthenticatedPortalPlayer = Extract<PortalPlayerAccess, { sessionToken: string }>;
  const portalPlayerRoute = (action: (c: ApiContext, access: AuthenticatedPortalPlayer) => Promise<any> | any) => async (c: ApiContext) => {
    const access = await requirePortalPlayer(c);
    if (access.error) return access.error;
    return action(c, access);
  };

  registerBindingInviteRoutes(app, { services: dependencies.services, requireMaintainer, errorResponse, errorGroup, adminMutation, allowPortal, sessionCookie });

  registerPortalAuthenticationRoutes(app, {
    services: dependencies.services,
    authenticate: dependencies.authenticate,
    requireMaintainer,
    allowPortal,
    errorResponse,
    sessionCookie,
    requirePortalPlayer,
    portalPlayerRoute,
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
      return respondToMappedError(c, error, idempotencyErrors);
    }
  });

  app.get("/v1/me", portalPlayerRoute((c, access) => {
    return c.json(access.player);
  }));

  app.get("/v1/me/mastery", portalPlayerRoute(async (c, access) => {
    c.header("Cache-Control", "private, no-store");
    const query = playerMasteryQuery(c.req.raw);
    if (!query) return errorResponse(c, 422, "INVALID_REQUEST", "The mastery query is invalid");
    const mastery = await dependencies.services(c.env).getCurrentPlayerMastery({ sessionToken: access.sessionToken, ...query });
    if (!mastery) return errorResponse(c, 401, "UNAUTHENTICATED", "Authentication is required");
    return c.json(mastery);
  }));

  app.get("/v1/me/titles", async (c) => {
    allowPortal(c);
    c.header("Cache-Control", "private, no-store");
    const sessionToken = portalSessionToken(c.req.raw);
    if (!sessionToken) return errorResponse(c, 401, "UNAUTHENTICATED", "Authentication is required");
    const titles = await dependencies.services(c.env).listCurrentPlayerTitles({ sessionToken });
    if (!titles) return errorResponse(c, 401, "UNAUTHENTICATED", "Authentication is required");
    return c.json({ contractVersion: "1", ...titles });
  });
  app.put("/v1/me/titles/equipped", async (c) => {
    allowPortal(c);
    const sessionToken = portalSessionToken(c.req.raw);
    if (!sessionToken) return errorResponse(c, 401, "UNAUTHENTICATED", "Authentication is required");
    const idempotencyKey = c.req.header("idempotency-key");
    if (!idempotencyKey) return errorResponse(c, 422, "IDEMPOTENCY_KEY_REQUIRED", "Idempotency-Key is required");
    const parsed = playerEquippedTitlesRequestSchema.safeParse(await parseBody(c.req.raw));
    if (!parsed.success) return errorResponse(c, 422, "INVALID_REQUEST", "The request does not match contract v1");
    try { return c.json(await dependencies.services(c.env).replaceCurrentPlayerEquippedTitles({ ...parsed.data, sessionToken }, idempotencyKey)); }
    catch (error) {
      return respondToMappedError(c, error, { ...unauthenticatedErrors, ...equippedTitleErrors });
    }
  });

  app.put("/v1/admin/player-accounts/:playerAccountId/titles/equipped", maintainerRoute(requireMaintainer, async (c, auth) => {
    const idempotencyKey = c.req.header("idempotency-key");
    if (!idempotencyKey) return errorResponse(c, 422, "IDEMPOTENCY_KEY_REQUIRED", "Idempotency-Key is required");
    const parsed = adminPlayerEquippedTitlesRequestSchema.safeParse(await parseBody(c.req.raw));
    if (!parsed.success) return errorResponse(c, 422, "INVALID_REQUEST", "The request does not match contract v1");
    try {
      return c.json(await dependencies.services(c.env).replaceAdminPlayerEquippedTitles({ playerAccountId: c.req.param("playerAccountId")!, grantIds: parsed.data.grantIds }, auth, idempotencyKey));
    } catch (error) {
      return respondToMappedError(c, error, {
        PLAYER_NOT_FOUND: { status: 404, message: "The player does not exist" },
        ...equippedTitleErrors,
      });
    }
  }));

  registerReviewRoutes(app, {
    services: dependencies.services,
    requirePortalPlayer,
    allowPortal,
    errorResponse,
    logServiceOperation,
  });

  app.get("/v1/me/submissions/:submissionId", portalPlayerRoute(async (c, access) => {
    try {
      return c.json(await dependencies.services(c.env).getPlayerSubmission({ submissionId: c.req.param("submissionId")! }, access.sessionToken));
    } catch (error) {
      return respondToMappedError(c, error, submissionNotFoundErrors);
    }
  }));

  // Screenshot-level accuracy marking (#253): one accurate/inaccurate mark per
  // recognition result; the latest value wins. No transcription is accepted.
  app.post("/v1/me/submissions/:submissionId/ocr-feedback", portalPlayerRoute(async (c, access) => {
    c.header("Cache-Control", "private, no-store");
    const idempotencyKey = c.req.header("idempotency-key");
    if (!idempotencyKey) return errorResponse(c, 422, "IDEMPOTENCY_KEY_REQUIRED", "Idempotency-Key is required");
    const parsed = ocrAccuracyFeedbackRequestSchema.safeParse(await parseBody(c.req.raw));
    if (!parsed.success) return errorResponse(c, 422, "INVALID_REQUEST", "The request does not match contract v1");
    try {
      const response = await dependencies.services(c.env).submitPlayerOcrFeedback({ ...parsed.data, submissionId: c.req.param("submissionId")! }, access.sessionToken, idempotencyKey);
      return c.json(response);
    } catch (error) {
      return respondToMappedError(c, error, ocrFeedbackErrors);
    }
  }));

  app.post("/v1/auth/logout", async (c) => {
    allowPortal(c);
    const sessionToken = portalSessionToken(c.req.raw);
    if (sessionToken) await dependencies.services(c.env).logoutPortalSession({ sessionToken });
    c.header("Set-Cookie", sessionCookie(c.req.raw, "", 0));
    return c.body(null, 204);
  });

  registerPublicCatalogRoutes(app, {
    services: dependencies.services,
    allowPortal,
    errorResponse,
    requirePortalPlayer,
    logServiceOperation,
    cachedCatalogResponse,
  });

  app.get("/v1/public/achievement-icons/:titleKey/:version", async (c) => {
    allowPortal(c);
    const icon = await dependencies.services(c.env).getPublicTitleIcon({ titleKey: c.req.param("titleKey"), version: c.req.param("version") });
    if (!icon) return errorResponse(c, 404, "ICON_NOT_FOUND", "The achievement icon does not exist");
    c.header("Cache-Control", "public, max-age=31536000, immutable");
    if (icon.etag) c.header("ETag", icon.etag);
    return c.body(icon.body, 200, { "Content-Type": icon.contentType });
  });

  // Legacy/unversioned URLs (issued before per-upload versioning, or held by clients that only
  // ever saw the stable path) keep resolving to the current icon, but with a short TTL rather
  // than `immutable`: the bytes behind this exact URL can change on the next upload.
  app.get("/v1/public/achievement-icons/:titleKey", async (c) => {
    allowPortal(c);
    const icon = await dependencies.services(c.env).getPublicTitleIcon({ titleKey: c.req.param("titleKey") });
    if (!icon) return errorResponse(c, 404, "ICON_NOT_FOUND", "The achievement icon does not exist");
    c.header("Cache-Control", "public, max-age=300");
    if (icon.etag) c.header("ETag", icon.etag);
    return c.body(icon.body, 200, { "Content-Type": icon.contentType });
  });

  registerAgentRoutes(app, {
    services: dependencies.services,
    errorResponse,
    publicCacheKey,
    hasNoQuery,
    logServiceOperation,
    cachePublicResponse,
    bearerTokenMatches,
  });

  app.post("/v1/player/uploads/session", portalPlayerRoute(async (c, access) => {
    const parsed = playerUploadSessionRequestSchema.safeParse(await parseBody(c.req.raw));
    if (!parsed.success) return errorResponse(c, 422, "INVALID_REQUEST", "The request does not match contract v1");
    try { return c.json(await dependencies.services(c.env).createPlayerUploadSession(parsed.data, access.sessionToken), 201); }
    catch (error) { return respondToMappedError(c, error, playerUploadSessionErrors); }
  }));

  app.put("/v1/uploads/:uploadId", portalPlayerRoute(async (c, access) => {
    try { await dependencies.services(c.env).uploadEvidence({ uploadId: c.req.param("uploadId")!, body: await c.req.raw.arrayBuffer(), contentType: c.req.header("content-type") ?? "" }, access.sessionToken); return c.body(null, 204); }
    catch (error) { return respondToMappedError(c, error, invalidUploadErrors); }
  }));

  app.post("/v1/player/uploads/:uploadId/complete", portalPlayerRoute(async (c, access) => {
    try { return c.json(await dependencies.services(c.env).completePlayerUpload({ uploadId: c.req.param("uploadId")! }, access.sessionToken, c.get("requestId"))); }
    catch (error) { return respondToMappedError(c, error, uploadCompletionErrors); }
  }));

  app.post("/v1/player/submissions/:submissionId/manual-review", portalPlayerRoute(async (c, access) => {
    try {
      await dependencies.services(c.env).requestManualReview({ submissionId: c.req.param("submissionId")! }, access.sessionToken);
      return c.body(null, 204);
    } catch (error) {
      return respondToMappedError(c, error, manualReviewErrors);
    }
  }));

  app.put("/v1/admin/qq/groups/:groupOpenId", maintainerRoute(requireMaintainer, async (c, auth) => {
    const idempotencyKey = c.req.header("idempotency-key");
    if (!idempotencyKey) return errorResponse(c, 422, "IDEMPOTENCY_KEY_REQUIRED", "Idempotency-Key is required");
    const parsed = qqGroupAccessRequestSchema.safeParse({ ...(await parseBody(c.req.raw) as object), groupOpenId: c.req.param("groupOpenId") });
    if (!parsed.success) return errorResponse(c, 422, "INVALID_REQUEST", "The request does not match contract v1");
    try {
      await dependencies.services(c.env).upsertQqGroupAccess(parsed.data, auth, idempotencyKey);
      return c.body(null, 204);
    } catch (error) {
      return respondToMappedError(c, error, idempotencyErrors);
    }
  }));

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

  registerAdminPlayerManagementRoutes(app, { services: dependencies.services, requireMaintainer, errorResponse, errorGroup, adminMutation });

  registerAdminCatalogRoutes(app, { services: dependencies.services, requireMaintainer, errorResponse, errorGroup, adminMutation }, logServiceOperation);

  registerAdminReviewWorkflowRoutes(app, { services: dependencies.services, requireMaintainer, errorResponse, errorGroup, adminMutation });

  app.get("/v1/admin/screenshot-sets", async (c) => {
    const access = await requireMaintainer(c);
    if (access.error) return access.error;
    const pageValue = Number(c.req.query("page") ?? 1);
    const pageSizeValue = Number(c.req.query("pageSize") ?? 20);
    const page = Number.isInteger(pageValue) && pageValue > 0 ? pageValue : 0;
    const pageSize = Number.isInteger(pageSizeValue) && pageSizeValue > 0 && pageSizeValue <= 100 ? pageSizeValue : 0;
    const status = c.req.query("status");
    if (!page || !pageSize || (status && !screenshotSetStatusSchema.safeParse(status).success)) return errorResponse(c, 422, "INVALID_REQUEST", "The screenshot set query is invalid");
    return c.json(await dependencies.services(c.env).listAdminScreenshotSets({ page, pageSize, ...(status ? { status: status as "draft" | "finalized" | "discarded" } : {}) }, access.auth!));
  });

  app.get("/v1/admin/screenshot-sets/candidates", async (c) => {
    const access = await requireMaintainer(c);
    if (access.error) return access.error;
    const pageValue = Number(c.req.query("page") ?? 1);
    const pageSizeValue = Number(c.req.query("pageSize") ?? 20);
    const page = Number.isInteger(pageValue) && pageValue > 0 ? pageValue : 0;
    const pageSize = Number.isInteger(pageSizeValue) && pageSizeValue > 0 && pageSizeValue <= 100 ? pageSizeValue : 0;
    if (!page || !pageSize) return errorResponse(c, 422, "INVALID_REQUEST", "The screenshot set candidate query is invalid");
    return c.json(await dependencies.services(c.env).listAdminScreenshotSetCandidates({ page, pageSize }, access.auth!));
  });

  app.post("/v1/admin/screenshot-sets", async (c) => {
    const access = await requireMaintainer(c);
    if (access.error) return access.error;
    const idempotencyKey = c.req.header("idempotency-key");
    if (!idempotencyKey) return errorResponse(c, 422, "IDEMPOTENCY_KEY_REQUIRED", "Idempotency-Key is required");
    const parsed = adminScreenshotSetCreateRequestSchema.safeParse(await parseBody(c.req.raw));
    if (!parsed.success) return errorResponse(c, 422, "INVALID_REQUEST", "The request does not match contract v1");
    try {
      const { contractVersion: _contractVersion, ...input } = parsed.data;
      return c.json(await dependencies.services(c.env).createAdminScreenshotSet(input, access.auth!, idempotencyKey), 201);
    } catch (error) {
      const code = error instanceof Error ? error.message : "SCREENSHOT_SET_CREATE_FAILED";
      if (code === "SCREENSHOT_SET_EXCLUSION_INVALID") return errorResponse(c, 422, code, "An excluded screenshot is not eligible for this set");
      if (code === "IDEMPOTENCY_CONFLICT") return errorResponse(c, 409, code, "The idempotency key was used with a different request");
      throw error;
    }
  });

  app.get("/v1/admin/screenshot-sets/:setId", async (c) => {
    const access = await requireMaintainer(c);
    if (access.error) return access.error;
    const setId = c.req.param("setId");
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(setId)) return errorResponse(c, 422, "INVALID_SCREENSHOT_SET_ID", "The screenshot set ID is invalid");
    try { return c.json(await dependencies.services(c.env).getAdminScreenshotSet({ setId }, access.auth!)); }
    catch (error) { if (error instanceof Error && error.message === "SCREENSHOT_SET_NOT_FOUND") return errorResponse(c, 404, "SCREENSHOT_SET_NOT_FOUND", "The screenshot set does not exist"); throw error; }
  });

  app.post("/v1/admin/screenshot-sets/:setId/finalize", async (c) => {
    const access = await requireMaintainer(c);
    if (access.error) return access.error;
    const setId = c.req.param("setId");
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(setId)) return errorResponse(c, 422, "INVALID_SCREENSHOT_SET_ID", "The screenshot set ID is invalid");
    const idempotencyKey = c.req.header("idempotency-key");
    if (!idempotencyKey) return errorResponse(c, 422, "IDEMPOTENCY_KEY_REQUIRED", "Idempotency-Key is required");
    const parsed = adminScreenshotSetFinalizeRequestSchema.safeParse(await parseBody(c.req.raw));
    if (!parsed.success) return errorResponse(c, 422, "INVALID_REQUEST", "The request does not match contract v1");
    const input = parsed.data.note === undefined ? { setId } : { setId, note: parsed.data.note };
    try {
      return c.json(await dependencies.services(c.env).finalizeAdminScreenshotSet(input, access.auth!, idempotencyKey));
    } catch (error) {
      const code = error instanceof Error ? error.message : "SCREENSHOT_SET_FINALIZE_FAILED";
      if (code === "SCREENSHOT_SET_NOT_FOUND") return errorResponse(c, 404, code, "The screenshot set does not exist");
      if (["SCREENSHOT_SET_ALREADY_FINALIZED", "SCREENSHOT_SET_ALREADY_DISCARDED", "SCREENSHOT_SET_NOT_DRAFT"].includes(code)) return errorResponse(c, 409, code, "The screenshot set is not a draft that can be finalized");
      if (code === "IDEMPOTENCY_CONFLICT") return errorResponse(c, 409, code, "The idempotency key was used with a different request");
      throw error;
    }
  });

  app.post("/v1/admin/screenshot-sets/:setId/discard", async (c) => {
    const access = await requireMaintainer(c);
    if (access.error) return access.error;
    const setId = c.req.param("setId");
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(setId)) return errorResponse(c, 422, "INVALID_SCREENSHOT_SET_ID", "The screenshot set ID is invalid");
    const idempotencyKey = c.req.header("idempotency-key");
    if (!idempotencyKey) return errorResponse(c, 422, "IDEMPOTENCY_KEY_REQUIRED", "Idempotency-Key is required");
    const parsed = adminScreenshotSetDiscardRequestSchema.safeParse(await parseBody(c.req.raw));
    if (!parsed.success) return errorResponse(c, 422, "INVALID_REQUEST", "The request does not match contract v1");
    const input = parsed.data.note === undefined ? { setId } : { setId, note: parsed.data.note };
    try {
      return c.json(await dependencies.services(c.env).discardAdminScreenshotSet(input, access.auth!, idempotencyKey));
    } catch (error) {
      const code = error instanceof Error ? error.message : "SCREENSHOT_SET_DISCARD_FAILED";
      if (code === "SCREENSHOT_SET_NOT_FOUND") return errorResponse(c, 404, code, "The screenshot set does not exist");
      if (["SCREENSHOT_SET_ALREADY_FINALIZED", "SCREENSHOT_SET_ALREADY_DISCARDED", "SCREENSHOT_SET_NOT_DRAFT"].includes(code)) return errorResponse(c, 409, code, "The screenshot set is not a draft that can be discarded");
      if (code === "IDEMPOTENCY_CONFLICT") return errorResponse(c, 409, code, "The idempotency key was used with a different request");
      throw error;
    }
  });

  app.get("/v1/ocrkit/screenshot-sets/:version", async (c) => {
    if (!allowOcrkit(c)) return errorResponse(c, 401, "UNAUTHENTICATED", "Authentication is required");
    c.header("Cache-Control", "private, no-store");
    const version = Number(c.req.param("version"));
    if (!Number.isInteger(version) || version < 1) return errorResponse(c, 422, "INVALID_SCREENSHOT_SET_VERSION", "The screenshot set version is invalid");
    try {
      return c.json(await dependencies.services(c.env).getOcrkitScreenshotSet({ version }));
    } catch (error) {
      const code = error instanceof Error ? error.message : "OCRKIT_SCREENSHOT_SET_READ_FAILED";
      if (code === "SCREENSHOT_SET_NOT_FOUND") return errorResponse(c, 404, code, "The screenshot set does not exist");
      if (code === "SCREENSHOT_SET_NOT_FINALIZED") return errorResponse(c, 409, code, "The screenshot set is not finalized");
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
      return respondToMappedError(c, error, submissionNotFoundErrors);
    }
  });

  return app;
};

export type { AppDependencies };
