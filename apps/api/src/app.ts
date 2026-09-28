import { Hono } from "hono";
import {
  qqLoginAttemptRequestSchema,
  qqLoginVerifyRequestSchema,
  passkeyLoginOptionsRequestSchema,
  passkeyLoginVerifyRequestSchema,
  passkeyRegistrationVerifyRequestSchema,
  passkeyAuthenticatedRegistrationOptionsRequestSchema,
  passkeyPublicRegistrationOptionsRequestSchema,
  passkeyPublicRegistrationVerifyRequestSchema,
  adminPasskeyRecoveryRequestSchema,
  qqGroupAccessRequestSchema,
  qqGroupRegistrationRequestSchema,
  adminScreenshotSetCreateRequestSchema,
  adminScreenshotSetFinalizeRequestSchema,
  adminScreenshotSetDiscardRequestSchema,
  screenshotSetStatusSchema,
  reviewTargetSchema, reviewTargetTypeSchema, playerReviewUpsertRequestSchema, playerReviewWithdrawRequestSchema,
  playerUploadSessionRequestSchema,
  ocrAccuracyFeedbackRequestSchema,
  playerEquippedTitlesRequestSchema, adminPlayerEquippedTitlesRequestSchema,
} from "@owbastion/contracts";
import type { Authenticator, PlatformServices } from "@owbastion/domain";
import { withPublicCache } from "./public-cache";
import { isUuid, maintainerRoute, parseBody, type AdminMutation, type AdminMutationOptions } from "./routes/route-contract";
import { registerAgentRoutes } from "./routes/agents";
import { registerAdminVerifiedRunRoutes } from "./routes/admin-verified-runs";
import { registerAdminReviewWorkflowRoutes } from "./routes/admin-review-workflow";
import { registerAdminCatalogRoutes } from "./routes/admin-catalog";
import { registerAdminPlayerManagementRoutes } from "./routes/admin-player-management";
import { registerBindingInviteRoutes } from "./routes/binding-invites";
import { hasOnlyUniqueQueryNames } from "./query-params";

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
  const page = Number(params.get("page") ?? "1");
  const pageSize = Number(params.get("pageSize") ?? "20");
  if (mapId !== null && (!mapId.trim() || mapId.trim().length > 256)) return null;
  if (gameplayRevisionId !== null && (!gameplayRevisionId.trim() || gameplayRevisionId.trim().length > 256)) return null;
  if (!Number.isInteger(page) || page < 1 || !Number.isInteger(pageSize) || pageSize < 1 || pageSize > 50) return null;
  return { mapId: mapId?.trim() || undefined, gameplayRevisionId: gameplayRevisionId?.trim() || undefined, page, pageSize };
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
  const passkeyOrigin = (c: any) => {
    const requestOrigin = c.req.header("origin");
    const configuredOrigin = c.env.PORTAL_ORIGIN ?? "https://owbastion.com";
    const localOrigin = c.env.LOCAL_DEV_AUTH === "true" && requestOrigin && /^http:\/\/(localhost|127\.0\.0\.1|0\.0\.0\.0):3000$/.test(requestOrigin) ? requestOrigin : undefined;
    const expectedOrigin = localOrigin ?? new URL(configuredOrigin).origin;
    if (!requestOrigin || requestOrigin !== expectedOrigin) return null;
    const parsed = new URL(expectedOrigin);
    return { origin: expectedOrigin, rpId: parsed.hostname };
  };
  const passkeyError = (c: any, error: unknown) => {
    const code = error instanceof Error ? error.message : "PASSKEY_VERIFICATION_FAILED";
    if (["PASSKEY_CHALLENGE_INVALID", "PASSKEY_CHALLENGE_REPLAYED", "PASSKEY_CREDENTIAL_INVALID", "PASSKEY_REGISTRATION_INVALID", "PASSKEY_AUTHENTICATION_INVALID", "PASSKEY_RECOVERY_INVALID"].includes(code)) return errorResponse(c, 422, "PASSKEY_VERIFICATION_FAILED", "The passkey response cannot be verified");
    if (code === "PASSKEY_LAST_CREDENTIAL") return errorResponse(c, 409, code, "Keep at least one passkey on this account");
    if (code === "PASSKEY_NOT_FOUND") return errorResponse(c, 404, code, "The passkey does not exist");
    if (code === "PLAYER_NOT_FOUND") return errorResponse(c, 404, code, "The player account does not exist");
    if (code === "IDEMPOTENCY_CONFLICT") return errorResponse(c, 409, code, "The idempotency key was used with a different request");
    if (code === "BINDING_INVITE_CODE_ENCRYPTION_NOT_CONFIGURED") return errorResponse(c, 503, code, "Passkey recovery is not configured");
    return null;
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
  const setPublicCatalogCache = (c: any, enabled = publicCacheEnabled(c)) => {
    c.header("Cache-Control", enabled ? "public, max-age=300, s-maxage=300" : "private, no-store");
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
      const code = error instanceof Error ? error.message : undefined;
      const mapped = code ? options.errors?.[code] ?? (code === "IDEMPOTENCY_CONFLICT" ? idempotencyConflict : undefined) : undefined;
      if (code && mapped) return errorResponse(c, mapped.status, code, mapped.message);
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



  const requirePortalPlayer = async (c: any) => {
    allowPortal(c);
    c.header("Cache-Control", "private, no-store");
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
    gameplayRevisionId: review.gameplayRevisionId,
    rating: review.rating,
    comment: review.comment,
    anonymous: review.anonymous,
    createdAt: review.createdAt,
    updatedAt: review.updatedAt,
  });

  const parseReviewTarget = (c: any) => {
    const base = { targetType: c.req.param("targetType"), targetId: c.req.param("targetId") };
    return reviewTargetSchema.safeParse(base.targetType === "map" ? { ...base, gameplayRevisionId: c.req.query("gameplayRevisionId") } : base);
  };

  registerBindingInviteRoutes(app, { services: dependencies.services, requireMaintainer, errorResponse, errorGroup, adminMutation, allowPortal, sessionCookie });

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

  app.post("/v1/auth/qq/login-attempt", async (c) => {
    allowPortal(c);
    const parsed = qqLoginAttemptRequestSchema.safeParse(await parseBody(c.req.raw));
    if (!parsed.success) return errorResponse(c, 422, "INVALID_REQUEST", "The request does not match contract v1");
    return c.json(await dependencies.services(c.env).createQqLoginAttempt(parsed.data), 201);
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


  app.post("/v1/auth/passkeys/login/options", async (c) => {
    allowPortal(c);
    const origin = passkeyOrigin(c);
    if (!origin) return errorResponse(c, 403, "ORIGIN_NOT_ALLOWED", "The request origin is not allowed");
    const parsed = passkeyLoginOptionsRequestSchema.safeParse(await parseBody(c.req.raw));
    if (!parsed.success) return errorResponse(c, 422, "INVALID_REQUEST", "The request does not match contract v1");
    return c.json(await dependencies.services(c.env).createPasskeyLoginOptions({ rpId: origin.rpId }), 201);
  });

  app.post("/v1/auth/passkeys/login/verify", async (c) => {
    allowPortal(c);
    const origin = passkeyOrigin(c);
    if (!origin) return errorResponse(c, 403, "ORIGIN_NOT_ALLOWED", "The request origin is not allowed");
    const parsed = passkeyLoginVerifyRequestSchema.safeParse(await parseBody(c.req.raw));
    if (!parsed.success) return errorResponse(c, 422, "INVALID_REQUEST", "The request does not match contract v1");
    try {
      const result = await dependencies.services(c.env).completePasskeyLogin({ ...parsed.data, ...origin });
      c.header("Set-Cookie", sessionCookie(c.req.raw, result.sessionToken, 2592000));
      return c.json({ contractVersion: "1" as const, status: "authenticated" as const });
    } catch (error) { return passkeyError(c, error) ?? (() => { throw error; })(); }
  });

  app.get("/v1/me/passkeys", async (c) => {
    const access = await requirePortalPlayer(c);
    if (access.error) return access.error;
    const result = await dependencies.services(c.env).listCurrentPlayerPasskeys({ sessionToken: access.sessionToken! });
    return result ? c.json(result) : errorResponse(c, 401, "UNAUTHENTICATED", "Authentication is required");
  });

  app.post("/v1/me/passkeys/registration/options", async (c) => {
    const origin = passkeyOrigin(c);
    if (!origin) return errorResponse(c, 403, "ORIGIN_NOT_ALLOWED", "The request origin is not allowed");
    const access = await requirePortalPlayer(c);
    if (access.error) return access.error;
    const parsed = passkeyAuthenticatedRegistrationOptionsRequestSchema.safeParse(await parseBody(c.req.raw));
    if (!parsed.success) return errorResponse(c, 422, "INVALID_REQUEST", "The request does not match contract v1");
    try { return c.json(await dependencies.services(c.env).createCurrentPlayerPasskeyRegistrationOptions({ ...parsed.data, sessionToken: access.sessionToken!, rpId: origin.rpId }), 201); }
    catch (error) { return passkeyError(c, error) ?? (() => { throw error; })(); }
  });

  app.post("/v1/me/passkeys/registration/verify", async (c) => {
    const origin = passkeyOrigin(c);
    if (!origin) return errorResponse(c, 403, "ORIGIN_NOT_ALLOWED", "The request origin is not allowed");
    const access = await requirePortalPlayer(c);
    if (access.error) return access.error;
    const parsed = passkeyRegistrationVerifyRequestSchema.safeParse(await parseBody(c.req.raw));
    if (!parsed.success) return errorResponse(c, 422, "INVALID_REQUEST", "The request does not match contract v1");
    try {
      await dependencies.services(c.env).completeCurrentPlayerPasskeyRegistration({ ...parsed.data, sessionToken: access.sessionToken!, ...origin });
      return c.body(null, 204);
    } catch (error) { return passkeyError(c, error) ?? (() => { throw error; })(); }
  });

  app.delete("/v1/me/passkeys/:passkeyId", async (c) => {
    const origin = passkeyOrigin(c);
    if (!origin) return errorResponse(c, 403, "ORIGIN_NOT_ALLOWED", "The request origin is not allowed");
    const access = await requirePortalPlayer(c);
    if (access.error) return access.error;
    const passkeyId = c.req.param("passkeyId");
    if (!/^[0-9a-f-]{36}$/i.test(passkeyId)) return errorResponse(c, 422, "INVALID_PASSKEY", "The passkey id is invalid");
    try {
      await dependencies.services(c.env).removeCurrentPlayerPasskey({ sessionToken: access.sessionToken!, passkeyId });
      return c.json({ contractVersion: "1" as const, removed: true as const });
    } catch (error) { return passkeyError(c, error) ?? (() => { throw error; })(); }
  });

  app.post("/v1/admin/player-accounts/:playerAccountId/passkey-recovery", maintainerRoute(requireMaintainer, async (c, auth) => {
    const origin = passkeyOrigin(c);
    if (!origin) return errorResponse(c, 403, "ORIGIN_NOT_ALLOWED", "The request origin is not allowed");
    const idempotencyKey = c.req.header("idempotency-key");
    if (!idempotencyKey) return errorResponse(c, 422, "IDEMPOTENCY_KEY_REQUIRED", "Idempotency-Key is required");
    const parsed = adminPasskeyRecoveryRequestSchema.safeParse(await parseBody(c.req.raw));
    if (!parsed.success) return errorResponse(c, 422, "INVALID_REQUEST", "The request does not match contract v1");
    try {
      const result = await dependencies.services(c.env).createAdminPasskeyRecovery({ ...parsed.data, playerAccountId: c.req.param("playerAccountId")! }, auth, idempotencyKey);
      const recoveryUrl = new URL("/recover", origin.origin);
      recoveryUrl.hash = new URLSearchParams({ token: result.token }).toString();
      return c.json({ contractVersion: "1" as const, recoveryUrl: recoveryUrl.toString(), expiresAt: result.expiresAt }, 201);
    } catch (error) { return passkeyError(c, error) ?? (() => { throw error; })(); }
  }));

  app.post("/v1/public/passkeys/recovery/options", async (c) => {
    allowPortal(c);
    const origin = passkeyOrigin(c);
    if (!origin) return errorResponse(c, 403, "ORIGIN_NOT_ALLOWED", "The request origin is not allowed");
    const parsed = passkeyPublicRegistrationOptionsRequestSchema.safeParse(await parseBody(c.req.raw));
    if (!parsed.success) return errorResponse(c, 422, "INVALID_REQUEST", "The request does not match contract v1");
    try { return c.json(await dependencies.services(c.env).createPasskeyRecoveryOptions({ ...parsed.data, rpId: origin.rpId }), 201); }
    catch (error) { return passkeyError(c, error) ?? (() => { throw error; })(); }
  });

  app.post("/v1/public/passkeys/recovery/verify", async (c) => {
    allowPortal(c);
    const origin = passkeyOrigin(c);
    if (!origin) return errorResponse(c, 403, "ORIGIN_NOT_ALLOWED", "The request origin is not allowed");
    const parsed = passkeyPublicRegistrationVerifyRequestSchema.safeParse(await parseBody(c.req.raw));
    if (!parsed.success) return errorResponse(c, 422, "INVALID_REQUEST", "The request does not match contract v1");
    try {
      const result = await dependencies.services(c.env).completePasskeyRecoveryRegistration({ ...parsed.data, ...origin });
      c.header("Set-Cookie", sessionCookie(c.req.raw, result.sessionToken, 2592000));
      return c.json({ contractVersion: "1" as const, status: "authenticated" as const });
    } catch (error) { return passkeyError(c, error) ?? (() => { throw error; })(); }
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
    const access = await requirePortalPlayer(c);
    if (access.error) return access.error;
    return c.json(access.player);
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
      const code = error instanceof Error ? error.message : "EQUIPPED_TITLES_UPDATE_FAILED";
      if (code === "UNAUTHENTICATED") return errorResponse(c, 401, code, "Authentication is required");
      if (["EQUIPPED_TITLE_GRANT_INVALID", "EQUIPPED_TITLE_LIMIT_EXCEEDED"].includes(code)) return errorResponse(c, 422, code, "The selected titles cannot be equipped");
      if (code === "IDEMPOTENCY_CONFLICT") return errorResponse(c, 409, code, "The idempotency key was used with a different request");
      throw error;
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
      const code = error instanceof Error ? error.message : "EQUIPPED_TITLES_UPDATE_FAILED";
      if (code === "PLAYER_NOT_FOUND") return errorResponse(c, 404, code, "The player does not exist");
      if (["EQUIPPED_TITLE_GRANT_INVALID", "EQUIPPED_TITLE_LIMIT_EXCEEDED"].includes(code)) return errorResponse(c, 422, code, "The selected titles cannot be equipped");
      if (code === "IDEMPOTENCY_CONFLICT") return errorResponse(c, 409, code, "The idempotency key was used with a different request");
      throw error;
    }
  }));

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
    if (!isUuid(reviewId)) return errorResponse(c, 422, "INVALID_REVIEW_ID", "The review ID is invalid");
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

  // Screenshot-level accuracy marking (#253): one accurate/inaccurate mark per
  // recognition result; the latest value wins. No transcription is accepted.
  app.post("/v1/me/submissions/:submissionId/ocr-feedback", async (c) => {
    const access = await requirePortalPlayer(c);
    if (access.error) return access.error;
    c.header("Cache-Control", "private, no-store");
    const idempotencyKey = c.req.header("idempotency-key");
    if (!idempotencyKey) return errorResponse(c, 422, "IDEMPOTENCY_KEY_REQUIRED", "Idempotency-Key is required");
    const parsed = ocrAccuracyFeedbackRequestSchema.safeParse(await parseBody(c.req.raw));
    if (!parsed.success) return errorResponse(c, 422, "INVALID_REQUEST", "The request does not match contract v1");
    try {
      const response = await dependencies.services(c.env).submitPlayerOcrFeedback({ ...parsed.data, submissionId: c.req.param("submissionId") }, access.sessionToken!, idempotencyKey);
      return c.json(response);
    } catch (error) {
      const code = error instanceof Error ? error.message : "OCR_FEEDBACK_SUBMIT_FAILED";
      if (code === "UNAUTHENTICATED") return errorResponse(c, 401, "UNAUTHENTICATED", "Authentication is required");
      if (code === "SUBMISSION_NOT_FOUND") return errorResponse(c, 404, "SUBMISSION_NOT_FOUND", "The submission does not exist");
      if (["OCR_FEEDBACK_UNAVAILABLE", "OCR_RESULT_NOT_FOUND"].includes(code)) return errorResponse(c, 409, code, "Feedback is unavailable for this submission");
      if (code === "OCR_PROMPT_STALE") return errorResponse(c, 409, code, "The recognition is no longer current; refresh the submission");
      if (code === "IDEMPOTENCY_CONFLICT") return errorResponse(c, 409, code, "The idempotency key was used with a different request");
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
    return cachePublicResponse(c, {
      operation: "catalog_public_achievements",
      cacheKey: publicCacheKey(c.req.raw),
      eligible: cacheable,
      identityIndependent: true,
      response: async () => c.json({ contractVersion: "1", items: await logServiceOperation(c, "catalog_list_achievements", () => dependencies.services(c.env).listChallenges({ family: "achievement" })) }),
      decorateHit: decoratePortalCacheHit(c),
    });
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
    const gameplayRevisionIds = (c.req.query("gameplayRevisionIds") ?? "").split(",").map((value: string) => value.trim()).filter(Boolean);
    const uniqueTargets = targetType.success && targetType.data === "map"
      ? new Set(targetIds.map((targetId: string, index: number) => JSON.stringify([targetId, gameplayRevisionIds[index]]))).size === targetIds.length
      : new Set(targetIds).size === targetIds.length;
    const validIds = targetIds.length > 0 && targetIds.length <= 100 && uniqueTargets;
    const targets = targetType.success && targetType.data === "map" && gameplayRevisionIds.length === targetIds.length
      ? targetIds.map((targetId: string, index: number) => ({ targetType: "map", targetId, gameplayRevisionId: gameplayRevisionIds[index] }))
      : [];
    const targetsValid = targetType.success && (targetType.data === "map"
      ? targets.length === targetIds.length && targets.every((target) => reviewTargetSchema.safeParse(target).success)
      : targetIds.every((targetId: string) => reviewTargetSchema.safeParse({ targetType: "event", targetId }).success));
    if (!targetType.success || !validIds || !targetsValid || targetType.data === "event" && gameplayRevisionIds.length > 0) {
      return errorResponse(c, 422, "INVALID_REQUEST", "The review summary targets are invalid");
    }
    try {
      const items = await logServiceOperation(c, "review_public_summary_batch", () => dependencies.services(c.env).getReviewSummaries(
        targetType.data === "map" ? { targetType: "map", targets: targets.map(({ targetId, gameplayRevisionId }) => ({ targetId, gameplayRevisionId: gameplayRevisionId! })) } : { targetType: "event", targetIds },
      ));
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

  app.get("/v1/challenges", async (c) => {
    const family = c.req.query("family");
    if (family && family !== "map" && family !== "achievement") return errorResponse(c, 422, "INVALID_REQUEST", "The challenge family is invalid");
    if (family === "map") {
      allowPortal(c);
      const cacheable = new URL(c.req.url).searchParams.getAll("family").length === 1 && new URL(c.req.url).searchParams.size === 1;
      setPublicCatalogCache(c, cacheable && publicCacheEnabled(c));
      return cachePublicResponse(c, {
        operation: "catalog_map_challenges",
        cacheKey: publicCacheKey(c.req.raw, { family: "map" }),
        eligible: cacheable,
        identityIndependent: true,
        response: async () => c.json({ contractVersion: "1", items: await logServiceOperation(c, "catalog_list_map_challenges", () => dependencies.services(c.env).listChallenges({ family: "map" })) }),
        decorateHit: decoratePortalCacheHit(c),
      });
    }
    const access = await requirePortalPlayer(c);
    if (access.error) return access.error;
    c.header("Cache-Control", "private, no-store");
    return c.json({ contractVersion: "1", items: await logServiceOperation(c, "catalog_list_challenges", () => dependencies.services(c.env).listChallenges({ family: family as "map" | "achievement" | undefined })) });
  });

  app.get("/v1/titles", async (c) => {
    const access = await requirePortalPlayer(c);
    if (access.error) return access.error;
    c.header("Cache-Control", "private, no-store");
    return c.json({ contractVersion: "1", items: await logServiceOperation(c, "catalog_list_titles", () => dependencies.services(c.env).listTitles({ mapId: c.req.query("mapId") || undefined })) });
  });

  app.get("/v1/maps", async (c) => {
    allowPortal(c);
    const cacheable = hasNoQuery(c.req.raw);
    setPublicCatalogCache(c, cacheable && publicCacheEnabled(c));
    return cachePublicResponse(c, {
      operation: "catalog_maps",
      cacheKey: publicCacheKey(c.req.raw),
      eligible: cacheable,
      identityIndependent: true,
      response: async () => c.json({ contractVersion: "1", items: await logServiceOperation(c, "catalog_list_maps", () => dependencies.services(c.env).listMaps()) }),
      decorateHit: decoratePortalCacheHit(c),
    });
  });

  app.get("/v1/events", async (c) => {
    allowPortal(c); const status = c.req.query("status");
    if (status && status !== "implemented" && status !== "removed") return errorResponse(c, 422, "INVALID_REQUEST", "The event status is invalid");
    const cacheable = hasNoQuery(c.req.raw);
    setPublicCatalogCache(c, cacheable && publicCacheEnabled(c));
    return cachePublicResponse(c, {
      operation: "catalog_events",
      cacheKey: publicCacheKey(c.req.raw),
      eligible: cacheable,
      identityIndependent: true,
      response: async () => c.json({ contractVersion: "1", items: await logServiceOperation(c, "catalog_list_events", () => dependencies.services(c.env).listRandomEvents({ query: c.req.query("query")?.trim() || undefined, category: c.req.query("category")?.trim() || undefined, rarity: c.req.query("rarity")?.trim() || undefined, status: status as "implemented" | "removed" | undefined })) }),
      decorateHit: decoratePortalCacheHit(c),
    });
  });
  app.get("/v1/events/:eventId", async (c) => {
    allowPortal(c);
    const cacheable = hasNoQuery(c.req.raw);
    setPublicCatalogCache(c, cacheable && publicCacheEnabled(c));
    return cachePublicResponse(c, {
      operation: "catalog_event",
      cacheKey: publicCacheKey(c.req.raw),
      eligible: cacheable,
      identityIndependent: true,
      response: async () => {
        const event = await logServiceOperation(c, "catalog_get_event", () => dependencies.services(c.env).getRandomEvent({ eventId: c.req.param("eventId") }));
        return event ? c.json({ contractVersion: "1", item: event }) : errorResponse(c, 404, "EVENT_NOT_FOUND", "The event does not exist");
      },
      decorateHit: decoratePortalCacheHit(c),
    });
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
    catch (error) { if (error instanceof Error && error.message === "UPLOAD_SESSION_INVALID") return errorResponse(c, 422, "UPLOAD_SESSION_INVALID", "The upload is invalid or expired"); if (error instanceof Error && error.message === "UPLOAD_COMPLETION_IN_PROGRESS") return errorResponse(c, 409, error.message, "Upload completion is already in progress"); throw error; }
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

  app.put("/v1/admin/qq/groups/:groupOpenId", maintainerRoute(requireMaintainer, async (c, auth) => {
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
      if (error instanceof Error && error.message === "SUBMISSION_NOT_FOUND") return errorResponse(c, 404, "SUBMISSION_NOT_FOUND", "The submission does not exist");
      throw error;
    }
  });

  return app;
};

export type { AppDependencies };
