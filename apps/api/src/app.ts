import { Hono } from "hono";
import {
  qqBindingRequestSchema,
  submissionRequestSchema,
  qqLoginAttemptRequestSchema,
  qqLoginVerifyRequestSchema,
  qqGroupAccessRequestSchema,
  adminPlayerStatusRequestSchema,
} from "@owbastion/contracts";
import type { Authenticator, PlatformServices } from "@owbastion/domain";

export type RuntimeEnv = {
  DB: D1Database;
  EVIDENCE_BUCKET?: R2Bucket;
  QQBOT_API_TOKEN?: string;
  LOGIN_SESSION_TTL_MS?: string;
  PORTAL_ORIGIN?: string;
  ADMIN_EMAILS?: string;
  LOCAL_DEV_AUTH?: string;
};

type AppDependencies = {
  authenticate: Authenticator<RuntimeEnv>;
  services: (env: RuntimeEnv) => PlatformServices;
};

const requestId = (request: Request) => request.headers.get("x-request-id") ?? crypto.randomUUID();

const errorResponse = (c: any, status: 400 | 401 | 403 | 404 | 409 | 422 | 500, code: string, message: string) =>
  c.json({ contractVersion: "1", error: { code, message, requestId: requestId(c.req.raw) } }, status);

const parseBody = async (request: Request) => {
  try {
    return await request.json();
  } catch {
    return null;
  }
};

const portalSessionToken = (request: Request) => request.headers.get("cookie")?.split(";").map((part) => part.trim()).find((part) => part.startsWith("owb_session="))?.slice("owb_session=".length);

const sessionCookie = (request: Request, value: string, maxAge: number) => `owb_session=${value}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${new URL(request.url).protocol === "https:" ? "; Secure" : ""}`;

export const createApp = (dependencies: AppDependencies) => {
  const app = new Hono<{ Bindings: RuntimeEnv }>();
  const allowPortal = (c: any) => {
    const requestOrigin = c.req.header("origin");
    const localOrigin = c.env.LOCAL_DEV_AUTH === "true" && requestOrigin && /^http:\/\/(localhost|127\.0\.0\.1|0\.0\.0\.0):3000$/.test(requestOrigin) ? requestOrigin : undefined;
    c.header("Access-Control-Allow-Origin", localOrigin ?? c.env.PORTAL_ORIGIN ?? "https://owbastion.com");
    c.header("Access-Control-Allow-Credentials", "true");
    c.header("Access-Control-Allow-Headers", "content-type, x-login-attempt-token");
    c.header("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS");
  };

  app.get("/health", (c) =>
    c.json({
      service: "api",
      status: "ok",
    }),
  );

  app.options("/v1/auth/qq/login-attempt", (c) => { allowPortal(c); return c.body(null, 204); });
  app.options("/v1/auth/qq/login-attempt/:attemptId", (c) => { allowPortal(c); return c.body(null, 204); });
  app.options("/v1/auth/logout", (c) => { allowPortal(c); return c.body(null, 204); });
  app.options("/v1/me", (c) => { allowPortal(c); return c.body(null, 204); });
  app.options("/v1/__local/accounts", (c) => { allowPortal(c); return c.body(null, 204); });
  app.options("/v1/__local/login", (c) => { allowPortal(c); return c.body(null, 204); });

  const requireMaintainer = async (c: any) => {
    const auth = await dependencies.authenticate(c.req.raw, c.env);
    if (!auth && c.env.LOCAL_DEV_AUTH === "true") {
      const sessionToken = portalSessionToken(c.req.raw);
      if (sessionToken) {
        const player = await dependencies.services(c.env).getCurrentPlayer({ sessionToken });
        if (player?.player.playerId === "local-admin") return { auth: { actorType: "user" as const, subject: "local-admin", roles: ["maintainer"], provider: "local-dev" } };
        if (player) return { error: errorResponse(c, 403, "FORBIDDEN", "The local account cannot manage administrative data") };
      }
    }
    if (!auth) return { error: errorResponse(c, 401, "UNAUTHENTICATED", "Authentication is required") };
    if (!auth.roles.includes("maintainer")) return { error: errorResponse(c, 403, "FORBIDDEN", "The actor cannot manage administrative data") };
    return { auth };
  };

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
      if (["LOGIN_CODE_INVALID", "LOGIN_CODE_EXPIRED", "LOGIN_GROUP_NOT_ALLOWED", "LOGIN_BINDING_REQUIRED", "PLAYER_BANNED"].includes(code)) return errorResponse(c, 422, code, "The login code cannot be used");
      if (code === "IDEMPOTENCY_CONFLICT") return errorResponse(c, 409, code, "The idempotency key was used with a different request");
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

  app.post("/v1/auth/logout", async (c) => {
    allowPortal(c);
    const sessionToken = portalSessionToken(c.req.raw);
    if (sessionToken) await dependencies.services(c.env).logoutPortalSession({ sessionToken });
    c.header("Set-Cookie", sessionCookie(c.req.raw, "", 0));
    return c.body(null, 204);
  });

  app.put("/v1/admin/qq/groups/:groupOpenId", async (c) => {
    const access = await requireMaintainer(c);
    if (access.error) return access.error;
    const auth = access.auth!;
    const parsed = qqGroupAccessRequestSchema.safeParse({ ...(await parseBody(c.req.raw) as object), groupOpenId: c.req.param("groupOpenId") });
    if (!parsed.success) return errorResponse(c, 422, "INVALID_REQUEST", "The request does not match contract v1");
    await dependencies.services(c.env).upsertQqGroupAccess(parsed.data, auth);
    return c.body(null, 204);
  });

  app.get("/v1/admin/qq/groups", async (c) => {
    let auth = await dependencies.authenticate(c.req.raw, c.env);
    if (!auth && c.env.LOCAL_DEV_AUTH === "true") {
      const sessionToken = portalSessionToken(c.req.raw);
      if (sessionToken) {
        const player = await dependencies.services(c.env).getCurrentPlayer({ sessionToken });
        if (player?.player.playerId === "local-admin") auth = { actorType: "user" as const, subject: "local-admin", roles: ["maintainer"], provider: "local-dev" };
      }
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

  app.delete("/v1/admin/bindings/:bindingId", async (c) => {
    const access = await requireMaintainer(c);
    if (access.error) return access.error;
    const idempotencyKey = c.req.header("idempotency-key");
    if (!idempotencyKey) return errorResponse(c, 422, "IDEMPOTENCY_KEY_REQUIRED", "Idempotency-Key is required");
    try { await dependencies.services(c.env).removeAdminBinding({ bindingId: c.req.param("bindingId") }, access.auth!, idempotencyKey); return c.body(null, 204); }
    catch (error) { if (error instanceof Error && error.message === "BINDING_NOT_FOUND") return errorResponse(c, 404, "BINDING_NOT_FOUND", "The binding does not exist"); if (error instanceof Error && error.message === "IDEMPOTENCY_CONFLICT") return errorResponse(c, 409, "IDEMPOTENCY_CONFLICT", "The idempotency key was used with a different request"); throw error; }
  });

  app.post("/v1/qq/bindings", async (c) => {
    const auth = await dependencies.authenticate(c.req.raw, c.env);
    if (!auth) return errorResponse(c, 401, "UNAUTHENTICATED", "Authentication is required");
    if (!auth.roles.includes("channel:write")) return errorResponse(c, 403, "FORBIDDEN", "The actor cannot write channel data");
    const idempotencyKey = c.req.header("idempotency-key");
    if (!idempotencyKey) return errorResponse(c, 422, "IDEMPOTENCY_KEY_REQUIRED", "Idempotency-Key is required");
    const parsed = qqBindingRequestSchema.safeParse(await parseBody(c.req.raw));
    if (!parsed.success) return errorResponse(c, 422, "INVALID_REQUEST", "The request does not match contract v1");

    try {
      return c.json(await dependencies.services(c.env).createBinding(parsed.data, auth, idempotencyKey), 201);
    } catch (error) {
      if (error instanceof Error && error.message === "IDEMPOTENCY_CONFLICT") return errorResponse(c, 409, "IDEMPOTENCY_CONFLICT", "The idempotency key was used with a different request");
      if (error instanceof Error && error.message === "BINDING_CONFLICT") return errorResponse(c, 409, "BINDING_CONFLICT", "The QQ identity is already bound to another player");
      if (error instanceof Error && error.message === "PLAYER_BANNED") return errorResponse(c, 403, "PLAYER_BANNED", "The player account is banned");
      throw error;
    }
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
    const submissionId = c.req.param("submissionId");
    if (!/^[0-9a-f-]{36}$/.test(submissionId)) return errorResponse(c, 422, "INVALID_SUBMISSION_ID", "The submission ID is invalid");
    try {
      return c.json(await dependencies.services(c.env).getSubmission({ submissionId }, { actorType: "user", subject: "public-status", roles: [], provider: "public" }));
    } catch (error) {
      if (error instanceof Error && error.message === "SUBMISSION_NOT_FOUND") return errorResponse(c, 404, "SUBMISSION_NOT_FOUND", "The submission does not exist");
      throw error;
    }
  });

  return app;
};

export type { AppDependencies };
