import { Hono } from "hono";
import {
  qqBindingRequestSchema,
  submissionRequestSchema,
  qqLoginAttemptRequestSchema,
  qqLoginVerifyRequestSchema,
  qqGroupAccessRequestSchema,
  qqGroupRegistrationRequestSchema,
  adminPlayerStatusRequestSchema,
  adminSubmissionReviewRequestSchema,
  adminTitleGrantRequestSchema,
  adminTitleGrantBulkRequestSchema,
  adminTitleGrantRevokeRequestSchema,
  adminChallengeUpdateRequestSchema,
  adminCatalogTitleUpdateRequestSchema,
  adminMapMetadataUpdateRequestSchema,
  adminRandomEventCreateRequestSchema, adminRandomEventUpdateRequestSchema, adminRandomEventImportRequestSchema,
  playerUploadSessionRequestSchema,
  adminBindingInviteRequestSchema, adminBindingInviteBatchRequestSchema, adminBindingInviteRevokeRequestSchema, bindingInviteRedeemRequestSchema, adminBindingClaimDecisionRequestSchema,
  releaseDraftCreateRequestSchema, releaseDraftItemRequestSchema, releaseChangeSetCreateRequestSchema, releaseChangeSetFromDraftRequestSchema, releaseBuildResultRequestSchema,
} from "@owbastion/contracts";
import type { Authenticator, PlatformServices } from "@owbastion/domain";

export type RuntimeEnv = {
  DB: D1Database;
  CACHE?: KVNamespace;
  EVIDENCE_BUCKET?: R2Bucket;
  QQBOT_API_TOKEN?: string;
  LOGIN_SESSION_TTL_MS?: string;
  PORTAL_ORIGIN?: string;
  LOCAL_DEV_AUTH?: string;
  UPLOAD_ORIGIN?: string;
  OCRKIT_BASE_URL?: string;
  OCRKIT_API_TOKEN?: string;
  OCRKIT_EVIDENCE_BUCKET?: string;
  OCR_QUEUE?: Queue;
  QQ_POLICY_QUEUE?: Queue;
  QQBOT_POLICY_WEBHOOK_URL?: string;
  QQBOT_POLICY_WEBHOOK_SECRET?: string;
  BINDING_INVITE_CODE_ENCRYPTION_KEY?: string;
  BASTION_BUILD_TOKEN?: string;
  BASTION_BUILD_DISPATCH_URL?: string;
  BASTION_BUILD_DISPATCH_TOKEN?: string;
};

type AppDependencies = {
  authenticate: Authenticator<RuntimeEnv>;
  services: (env: RuntimeEnv, requestId?: string) => PlatformServices;
};

const requestIdPattern = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;
const requestId = (request: Request) => {
  const incoming = request.headers.get("x-request-id")?.trim();
  return incoming && requestIdPattern.test(incoming) ? incoming : crypto.randomUUID();
};

const errorResponse = (c: any, status: 400 | 401 | 403 | 404 | 409 | 422 | 500 | 503, code: string, message: string) =>
  c.json({ contractVersion: "1", error: { code, message, requestId: c.get?.("requestId") ?? requestId(c.req.raw) } }, status);

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

export const createApp = (dependencies: AppDependencies) => {
  const app = new Hono<{ Bindings: RuntimeEnv; Variables: { requestId: string } }>();
  const services = (c: any) => dependencies.services(c.env, c.get("requestId"));
  app.use("*", async (c, next) => {
    const startedAt = Date.now();
    const currentRequestId = requestId(c.req.raw);
    c.set("requestId", currentRequestId);
    c.header("x-request-id", currentRequestId);
    try {
      await next();
    } finally {
      console.log(JSON.stringify({ layer: "api", event: "request_completed", requestId: currentRequestId, method: c.req.method, route: c.req.path, status: c.res.status, durationMs: Date.now() - startedAt }));
    }
  });
  app.onError((error, c) => {
    const currentRequestId = c.get("requestId");
    console.error(JSON.stringify({ layer: "api", event: "request_exception", requestId: currentRequestId, method: c.req.method, route: c.req.path, error: error instanceof Error ? error.stack ?? error.message : String(error) }));
    return errorResponse(c, 500, "INTERNAL_ERROR", "The request could not be completed");
  });
  app.notFound((c) => errorResponse(c, 404, "NOT_FOUND", "The requested resource does not exist"));
  const allowPortal = (c: any) => {
    const requestOrigin = c.req.header("origin");
    const localOrigin = c.env.LOCAL_DEV_AUTH === "true" && requestOrigin && /^http:\/\/(localhost|127\.0\.0\.1|0\.0\.0\.0):3000$/.test(requestOrigin) ? requestOrigin : undefined;
    c.header("Access-Control-Allow-Origin", localOrigin ?? c.env.PORTAL_ORIGIN ?? "https://owbastion.com");
    c.header("Access-Control-Allow-Credentials", "true");
    c.header("Access-Control-Allow-Headers", "content-type, x-login-attempt-token, x-claim-token, idempotency-key, x-request-id");
    c.header("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS");
  };
  const allowAgents = (c: any) => c.header("Cache-Control", "public, max-age=60, s-maxage=60");

  app.get("/health", (c) =>
    c.json({
      service: "api",
      status: "ok",
    }),
  );

  app.options("/v1/auth/qq/login-attempt", (c) => { allowPortal(c); return c.body(null, 204); });
  app.options("/v1/public/binding-invites/redeem", (c) => { allowPortal(c); return c.body(null, 204); });
  app.options("/v1/public/binding-claims/:claimId", (c) => { allowPortal(c); return c.body(null, 204); });
  app.options("/v1/auth/qq/login-attempt/:attemptId", (c) => { allowPortal(c); return c.body(null, 204); });
  app.options("/v1/auth/logout", (c) => { allowPortal(c); return c.body(null, 204); });
  app.options("/v1/me", (c) => { allowPortal(c); return c.body(null, 204); });
  app.options("/v1/me/titles", (c) => { allowPortal(c); return c.body(null, 204); });
  app.options("/v1/me/submissions/:submissionId", (c) => { allowPortal(c); return c.body(null, 204); });
  app.options("/v1/me/submissions/:submissionId/evidence", (c) => { allowPortal(c); return c.body(null, 204); });
  app.options("/v1/public/achievements", (c) => { allowPortal(c); return c.body(null, 204); });
  app.options("/v1/__local/accounts", (c) => { allowPortal(c); return c.body(null, 204); });
  app.options("/v1/__local/login", (c) => { allowPortal(c); return c.body(null, 204); });
  app.options("/v1/uploads/:uploadId", (c) => { allowPortal(c); return c.body(null, 204); });

  const requireMaintainer = async (c: any) => {
    let auth = await dependencies.authenticate(c.req.raw, c.env);
    if (!auth) {
      const sessionToken = portalSessionToken(c.req.raw);
      const player = sessionToken ? await services(c).getCurrentPlayer({ sessionToken }) : null;
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
    const player = await services(c).getCurrentPlayer({ sessionToken });
    if (!player) return { error: errorResponse(c, 401, "UNAUTHENTICATED", "Authentication is required") };
    return { sessionToken, player };
  };

  const requireBastion = (c: any) => {
    const token = c.env.BASTION_BUILD_TOKEN;
    const authorization = c.req.header("authorization");
    if (!token || authorization !== `Bearer ${token}`) return { error: errorResponse(c, 401, "UNAUTHENTICATED", "Bastion authentication is required") };
    return { auth: { actorType: "service" as const, subject: "bastion", roles: ["bastion:build"], provider: "bastion-service-token" } };
  };

  app.post("/v1/public/binding-invites/redeem", async (c) => {
    allowPortal(c);
    const parsed = bindingInviteRedeemRequestSchema.safeParse(await parseBody(c.req.raw));
    if (!parsed.success) return errorResponse(c, 422, "INVALID_REQUEST", "The request does not match contract v1");
    try { return c.json(await services(c).redeemBindingInvite(parsed.data), 201); }
    catch (error) { if (error instanceof Error && error.message === "INVITE_INVALID") return errorResponse(c, 422, "INVITE_INVALID", "The invitation cannot be used"); throw error; }
  });

  app.get("/v1/public/binding-claims/:claimId", async (c) => {
    allowPortal(c);
    const claimId = c.req.param("claimId");
    const claimToken = c.req.header("x-claim-token");
    if (!/^[0-9a-f-]{36}$/.test(claimId) || !claimToken) return errorResponse(c, 422, "INVALID_CLAIM", "The binding claim is invalid");
    try { return c.json(await services(c).getBindingClaimStatus({ claimId, claimToken })); }
    catch (error) {
      if (error instanceof Error && error.message === "BINDING_CLAIM_NOT_FOUND") return errorResponse(c, 404, "BINDING_CLAIM_NOT_FOUND", "The binding claim does not exist");
      if (error instanceof Error && error.message === "BINDING_CLAIM_FORBIDDEN") return errorResponse(c, 403, "BINDING_CLAIM_FORBIDDEN", "The binding claim token is invalid");
      throw error;
    }
  });

  app.post("/v1/admin/binding-invites", async (c) => {
    const access = await requireMaintainer(c); if (access.error) return access.error;
    const idempotencyKey = c.req.header("idempotency-key"); if (!idempotencyKey) return errorResponse(c, 422, "IDEMPOTENCY_KEY_REQUIRED", "Idempotency-Key is required");
    const parsed = adminBindingInviteRequestSchema.safeParse(await parseBody(c.req.raw)); if (!parsed.success) return errorResponse(c, 422, "INVALID_REQUEST", "The request does not match contract v1");
    return c.json(await services(c).createAdminBindingInvite(parsed.data, access.auth!, idempotencyKey), 201);
  });

  app.get("/v1/admin/releases/overview", async (c) => {
    const access = await requireMaintainer(c); if (access.error) return access.error;
    return c.json(await services(c).getReleaseOverview());
  });

  app.post("/v1/admin/releases/drafts", async (c) => {
    const access = await requireMaintainer(c); if (access.error) return access.error;
    const idempotencyKey = c.req.header("idempotency-key"); if (!idempotencyKey) return errorResponse(c, 422, "IDEMPOTENCY_KEY_REQUIRED", "Idempotency-Key is required");
    const parsed = releaseDraftCreateRequestSchema.safeParse(await parseBody(c.req.raw)); if (!parsed.success) return errorResponse(c, 422, "INVALID_REQUEST", "The request does not match contract v1");
    return c.json(await services(c).createReleaseDraft(parsed.data, access.auth!, idempotencyKey), 201);
  });

  app.post("/v1/admin/releases/drafts/from-catalog", async (c) => {
    const access = await requireMaintainer(c); if (access.error) return access.error;
    const idempotencyKey = c.req.header("idempotency-key"); if (!idempotencyKey) return errorResponse(c, 422, "IDEMPOTENCY_KEY_REQUIRED", "Idempotency-Key is required");
    const parsed = releaseDraftCreateRequestSchema.safeParse(await parseBody(c.req.raw)); if (!parsed.success) return errorResponse(c, 422, "INVALID_REQUEST", "The request does not match contract v1");
    try { return c.json(await services(c).createReleaseDraftFromCatalog(parsed.data, access.auth!, idempotencyKey), 201); }
    catch (error) { if (error instanceof Error && error.message === "RELEASE_CATALOG_PROVIDER_UNAVAILABLE") return errorResponse(c, 503, "RELEASE_CATALOG_PROVIDER_UNAVAILABLE", "The working catalog is unavailable"); throw error; }
  });

  app.get("/v1/admin/releases/drafts/:draftId", async (c) => {
    const access = await requireMaintainer(c); if (access.error) return access.error;
    try { return c.json(await services(c).getReleaseDraft({ draftId: c.req.param("draftId") })); }
    catch (error) { if (error instanceof Error && error.message === "DRAFT_NOT_FOUND") return errorResponse(c, 404, "DRAFT_NOT_FOUND", "The draft does not exist"); throw error; }
  });

  app.put("/v1/admin/releases/drafts/:draftId/items", async (c) => {
    const access = await requireMaintainer(c); if (access.error) return access.error;
    const idempotencyKey = c.req.header("idempotency-key"); if (!idempotencyKey) return errorResponse(c, 422, "IDEMPOTENCY_KEY_REQUIRED", "Idempotency-Key is required");
    const parsed = releaseDraftItemRequestSchema.safeParse(await parseBody(c.req.raw)); if (!parsed.success) return errorResponse(c, 422, "INVALID_REQUEST", "The request does not match contract v1");
    try { return c.json(await services(c).putReleaseDraftItem({ ...parsed.data, draftId: c.req.param("draftId") }, access.auth!, idempotencyKey), 201); }
    catch (error) { if (error instanceof Error && error.message === "DRAFT_NOT_FOUND") return errorResponse(c, 404, "DRAFT_NOT_FOUND", "The draft does not exist"); throw error; }
  });

  app.post("/v1/admin/releases/change-sets", async (c) => {
    const access = await requireMaintainer(c); if (access.error) return access.error;
    const idempotencyKey = c.req.header("idempotency-key"); if (!idempotencyKey) return errorResponse(c, 422, "IDEMPOTENCY_KEY_REQUIRED", "Idempotency-Key is required");
    const parsed = releaseChangeSetCreateRequestSchema.safeParse(await parseBody(c.req.raw)); if (!parsed.success) return errorResponse(c, 422, "INVALID_REQUEST", "The request does not match contract v1");
    try { return c.json(await services(c).createReleaseChangeSet(parsed.data, access.auth!, idempotencyKey), 201); }
    catch (error) { const code = error instanceof Error ? error.message : "CHANGE_SET_FAILED"; if (["DRAFT_NOT_FOUND", "DRAFT_ITEMS_NOT_FOUND"].includes(code)) return errorResponse(c, 422, code, "The draft items are invalid"); throw error; }
  });

  app.post("/v1/admin/releases/drafts/:draftId/change-set", async (c) => {
    const access = await requireMaintainer(c); if (access.error) return access.error;
    const idempotencyKey = c.req.header("idempotency-key"); if (!idempotencyKey) return errorResponse(c, 422, "IDEMPOTENCY_KEY_REQUIRED", "Idempotency-Key is required");
    const parsed = releaseChangeSetFromDraftRequestSchema.safeParse(await parseBody(c.req.raw)); if (!parsed.success) return errorResponse(c, 422, "INVALID_REQUEST", "The request does not match contract v1");
    try { return c.json(await services(c).createReleaseChangeSetFromDraft({ ...parsed.data, draftId: c.req.param("draftId") }, access.auth!, idempotencyKey), 201); }
    catch (error) { const code = error instanceof Error ? error.message : "CHANGE_SET_FAILED"; if (code === "DRAFT_NOT_FOUND") return errorResponse(c, 404, code, "The draft does not exist"); if (code === "DRAFT_NO_CHANGES") return errorResponse(c, 409, code, "The working catalog has no changes compared with Current"); throw error; }
  });

  app.post("/v1/admin/releases/change-sets/:changeSetId/candidate", async (c) => {
    const access = await requireMaintainer(c); if (access.error) return access.error;
    const idempotencyKey = c.req.header("idempotency-key"); if (!idempotencyKey) return errorResponse(c, 422, "IDEMPOTENCY_KEY_REQUIRED", "Idempotency-Key is required");
    try { return c.json(await services(c).createReleaseCandidate({ changeSetId: c.req.param("changeSetId") }, access.auth!, idempotencyKey), 201); }
    catch (error) { const code = error instanceof Error ? error.message : "CANDIDATE_FAILED"; if (["CHANGE_SET_NOT_FOUND", "CHANGE_SET_EMPTY"].includes(code)) return errorResponse(c, 422, code, "The change set cannot produce a candidate"); throw error; }
  });

  app.get("/v1/admin/releases/candidates/:candidateId", async (c) => {
    const access = await requireMaintainer(c); if (access.error) return access.error;
    try { return c.json(await services(c).getReleaseCandidate({ candidateId: c.req.param("candidateId") })); }
    catch (error) { if (error instanceof Error && error.message === "CANDIDATE_NOT_FOUND") return errorResponse(c, 404, "CANDIDATE_NOT_FOUND", "The candidate does not exist"); throw error; }
  });

  app.post("/v1/admin/releases/candidates/:candidateId/build", async (c) => {
    const access = await requireMaintainer(c); if (access.error) return access.error;
    const idempotencyKey = c.req.header("idempotency-key"); if (!idempotencyKey) return errorResponse(c, 422, "IDEMPOTENCY_KEY_REQUIRED", "Idempotency-Key is required");
    try { return c.json(await services(c).startReleaseBuild({ candidateId: c.req.param("candidateId") }, access.auth!, idempotencyKey), 201); }
    catch (error) { const code = error instanceof Error ? error.message : "BUILD_START_FAILED"; if (["BUILD_ALREADY_RUNNING", "CANDIDATE_NOT_BUILDABLE", "BUILD_DISPATCH_FAILED"].includes(code)) return errorResponse(c, code === "BUILD_DISPATCH_FAILED" ? 503 : 409, code, "The Bastion build could not be started"); throw error; }
  });

  app.get("/v1/internal/bastion/candidates/:candidateId", async (c) => {
    const access = requireBastion(c); if (access.error) return access.error;
    try { return c.json(await services(c).getReleaseCandidate({ candidateId: c.req.param("candidateId") })); }
    catch (error) { if (error instanceof Error && error.message === "CANDIDATE_NOT_FOUND") return errorResponse(c, 404, "CANDIDATE_NOT_FOUND", "The candidate does not exist"); throw error; }
  });

  app.post("/v1/internal/bastion/build-results", async (c) => {
    const access = requireBastion(c); if (access.error) return access.error;
    const parsed = releaseBuildResultRequestSchema.safeParse(await parseBody(c.req.raw)); if (!parsed.success) return errorResponse(c, 422, "INVALID_REQUEST", "The request does not match contract v1");
    try { return c.json(await services(c).receiveReleaseBuildResult(parsed.data)); }
    catch (error) { const code = error instanceof Error ? error.message : "BUILD_RESULT_FAILED"; if (["BUILD_NOT_FOUND", "BUILD_SNAPSHOT_MISMATCH", "BUILD_RESULT_CONFLICT"].includes(code)) return errorResponse(c, 409, code, "The Bastion build result cannot be applied"); throw error; }
  });

  app.post("/v1/admin/binding-invites/batch", async (c) => {
    const access = await requireMaintainer(c); if (access.error) return access.error;
    const idempotencyKey = c.req.header("idempotency-key"); if (!idempotencyKey) return errorResponse(c, 422, "IDEMPOTENCY_KEY_REQUIRED", "Idempotency-Key is required");
    const parsed = adminBindingInviteBatchRequestSchema.safeParse(await parseBody(c.req.raw)); if (!parsed.success) return errorResponse(c, 422, "INVALID_REQUEST", "The request does not match contract v1");
    return c.json(await services(c).createAdminBindingInviteBatch(parsed.data, access.auth!, idempotencyKey), 201);
  });

  app.get("/v1/admin/binding-invites", async (c) => {
    const access = await requireMaintainer(c); if (access.error) return access.error;
    return c.json(await services(c).listAdminBindingInvites(access.auth!));
  });

  app.get("/v1/admin/binding-invites/:inviteId/code", async (c) => {
    const access = await requireMaintainer(c); if (access.error) return access.error;
    try { return c.json(await services(c).getAdminBindingInviteCode({ inviteId: c.req.param("inviteId") }, access.auth!)); }
    catch (error) { if (error instanceof Error && error.message === "BINDING_INVITE_CODE_UNAVAILABLE") return errorResponse(c, 422, "BINDING_INVITE_CODE_UNAVAILABLE", "The invitation code cannot be retrieved"); throw error; }
  });

  app.post("/v1/admin/binding-invites/:inviteId/revoke", async (c) => {
    const access = await requireMaintainer(c); if (access.error) return access.error;
    const idempotencyKey = c.req.header("idempotency-key"); if (!idempotencyKey) return errorResponse(c, 422, "IDEMPOTENCY_KEY_REQUIRED", "Idempotency-Key is required");
    const parsed = adminBindingInviteRevokeRequestSchema.safeParse(await parseBody(c.req.raw)); if (!parsed.success) return errorResponse(c, 422, "INVALID_REQUEST", "The request does not match contract v1");
    try { await services(c).revokeAdminBindingInvite({ ...parsed.data, inviteId: c.req.param("inviteId") }, access.auth!, idempotencyKey); return c.body(null, 204); }
    catch (error) { if (error instanceof Error && error.message === "BINDING_INVITE_NOT_REVOCABLE") return errorResponse(c, 422, "BINDING_INVITE_NOT_REVOCABLE", "The invitation cannot be revoked"); throw error; }
  });

  app.get("/v1/admin/binding-claims", async (c) => { const access = await requireMaintainer(c); if (access.error) return access.error; return c.json(await services(c).listAdminBindingClaims(access.auth!)); });
  app.post("/v1/admin/binding-claims/:claimId/decision", async (c) => {
    const access = await requireMaintainer(c); if (access.error) return access.error;
    const idempotencyKey = c.req.header("idempotency-key"); if (!idempotencyKey) return errorResponse(c, 422, "IDEMPOTENCY_KEY_REQUIRED", "Idempotency-Key is required");
    const parsed = adminBindingClaimDecisionRequestSchema.safeParse(await parseBody(c.req.raw)); if (!parsed.success) return errorResponse(c, 422, "INVALID_REQUEST", "The request does not match contract v1");
    try { await services(c).decideAdminBindingClaim({ ...parsed.data, claimId: c.req.param("claimId") }, access.auth!, idempotencyKey); return c.body(null, 204); }
    catch (error) { if (error instanceof Error && error.message === "BINDING_CLAIM_NOT_REVIEWABLE") return errorResponse(c, 422, "BINDING_CLAIM_NOT_REVIEWABLE", "The claim cannot be reviewed"); throw error; }
  });

  app.post("/v1/auth/qq/login-attempt", async (c) => {
    allowPortal(c);
    const parsed = qqLoginAttemptRequestSchema.safeParse(await parseBody(c.req.raw));
    if (!parsed.success) return errorResponse(c, 422, "INVALID_REQUEST", "The request does not match contract v1");
    return c.json(await services(c).createQqLoginAttempt(parsed.data), 201);
  });

  app.get("/v1/__local/accounts", async (c) => {
    allowPortal(c);
    if (c.env.LOCAL_DEV_AUTH !== "true") return errorResponse(c, 404, "NOT_FOUND", "The local development API is disabled");
    return c.json({ contractVersion: "1" as const, accounts: await services(c).listLocalDevAccounts() });
  });

  app.post("/v1/__local/login", async (c) => {
    allowPortal(c);
    if (c.env.LOCAL_DEV_AUTH !== "true") return errorResponse(c, 404, "NOT_FOUND", "The local development API is disabled");
    const body = await parseBody(c.req.raw) as { accountId?: unknown };
    if (typeof body?.accountId !== "string") return errorResponse(c, 422, "INVALID_REQUEST", "The local account is required");
    try {
      const result = await services(c).createLocalDevSession({ accountId: body.accountId });
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
      const result = await services(c).getQqLoginStatus({ attemptId, attemptToken });
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
      return c.json(await services(c).verifyQqLogin(parsed.data, auth, idempotencyKey));
    } catch (error) {
      const code = error instanceof Error ? error.message : "LOGIN_FAILED";
      if (code === "LOGIN_CODE_INVALID") {
        try { return c.json(await services(c).verifyBindingClaim(parsed.data, auth, idempotencyKey)); }
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
      await services(c).registerQqGroup(parsed.data, auth, idempotencyKey, c.get("requestId"));
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
    const player = await services(c).getCurrentPlayer({ sessionToken });
    if (!player) return errorResponse(c, 401, "UNAUTHENTICATED", "Authentication is required");
    return c.json(player);
  });

  app.get("/v1/me/titles", async (c) => {
    allowPortal(c);
    const sessionToken = portalSessionToken(c.req.raw);
    if (!sessionToken) return errorResponse(c, 401, "UNAUTHENTICATED", "Authentication is required");
    const items = await services(c).listCurrentPlayerTitles({ sessionToken });
    if (!items) return errorResponse(c, 401, "UNAUTHENTICATED", "Authentication is required");
    return c.json({ contractVersion: "1", items });
  });

  app.get("/v1/me/submissions/:submissionId", async (c) => {
    const access = await requirePortalPlayer(c);
    if (access.error) return access.error;
    try {
      return c.json(await services(c).getPlayerSubmission({ submissionId: c.req.param("submissionId") }, access.sessionToken!));
    } catch (error) {
      if (error instanceof Error && error.message === "SUBMISSION_NOT_FOUND") return errorResponse(c, 404, "SUBMISSION_NOT_FOUND", "The submission does not exist");
      throw error;
    }
  });

  app.get("/v1/me/submissions/:submissionId/evidence", async (c) => {
    const access = await requirePortalPlayer(c);
    if (access.error) return access.error;
    try {
      const evidence = await services(c).getPlayerEvidence({ submissionId: c.req.param("submissionId") }, access.sessionToken!);
      return new Response(evidence.body, { headers: { "content-type": evidence.contentType, "cache-control": "private, no-store" } });
    } catch (error) {
      if (error instanceof Error && ["SUBMISSION_NOT_FOUND", "EVIDENCE_NOT_FOUND"].includes(error.message)) return errorResponse(c, 404, "SUBMISSION_NOT_FOUND", "The submission does not exist");
      throw error;
    }
  });

  app.post("/v1/auth/logout", async (c) => {
    allowPortal(c);
    const sessionToken = portalSessionToken(c.req.raw);
    if (sessionToken) await services(c).logoutPortalSession({ sessionToken });
    c.header("Set-Cookie", sessionCookie(c.req.raw, "", 0));
    return c.body(null, 204);
  });

  app.get("/v1/public/achievements", async (c) => {
    allowPortal(c);
    return c.json({ contractVersion: "1", items: await services(c).listChallenges({ family: "achievement" }) });
  });

  app.get("/v1/public/achievement-icons/:titleKey", async (c) => {
    allowPortal(c);
    const icon = await services(c).getPublicTitleIcon({ titleKey: c.req.param("titleKey") });
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
      return c.json({ contractVersion: "1", items: await services(c).listChallenges({ family: "map" }) });
    }
    const access = await requirePortalPlayer(c);
    if (access.error) return access.error;
    return c.json({ contractVersion: "1", items: await services(c).listChallenges({ family: family as "map" | "achievement" | undefined }) });
  });

  app.get("/v1/titles", async (c) => {
    const access = await requirePortalPlayer(c);
    if (access.error) return access.error;
    return c.json({ contractVersion: "1", items: await services(c).listTitles({ mapId: c.req.query("mapId") || undefined }) });
  });

  app.get("/v1/maps", async (c) => {
    allowPortal(c);
    return c.json({ contractVersion: "1", items: await services(c).listMaps() });
  });

  app.get("/v1/events", async (c) => {
    allowPortal(c); const status = c.req.query("status");
    if (status && status !== "implemented" && status !== "removed") return errorResponse(c, 422, "INVALID_REQUEST", "The event status is invalid");
    return c.json({ contractVersion: "1", items: await services(c).listRandomEvents({ query: c.req.query("query")?.trim() || undefined, category: c.req.query("category")?.trim() || undefined, rarity: c.req.query("rarity")?.trim() || undefined, status: status as "implemented" | "removed" | undefined }) });
  });
  app.get("/v1/events/:eventId", async (c) => { allowPortal(c); const event = await services(c).getRandomEvent({ eventId: c.req.param("eventId") }); return event ? c.json({ contractVersion: "1", item: event }) : errorResponse(c, 404, "EVENT_NOT_FOUND", "The event does not exist"); });

  app.get("/v1/agents/events", async (c) => {
    allowAgents(c); const page = agentPage(c); if (!page) return errorResponse(c, 422, "INVALID_REQUEST", "The pagination parameters are invalid");
    return c.json({ ...await services(c).listAgentEvents({ ...page, query: c.req.query("q")?.trim() || undefined, category: c.req.query("category")?.trim() || undefined, rarity: c.req.query("rarity")?.trim() || undefined }) });
  });
  app.get("/v1/agents/events/:eventId", async (c) => { allowAgents(c); const event = await services(c).getAgentEvent({ eventId: c.req.param("eventId") }); return event ? c.json({ contractVersion: "1", item: event }) : errorResponse(c, 404, "EVENT_NOT_FOUND", "The event does not exist"); });
  app.get("/v1/agents/maps", async (c) => {
    allowAgents(c); const page = agentPage(c); if (!page) return errorResponse(c, 422, "INVALID_REQUEST", "The pagination parameters are invalid");
    return c.json(await services(c).listAgentMaps({ ...page, query: c.req.query("q")?.trim() || undefined, mechanic: c.req.query("mechanic")?.trim() || undefined }));
  });
  app.get("/v1/agents/maps/:mapId", async (c) => { allowAgents(c); const map = await services(c).getAgentMap({ mapId: c.req.param("mapId") }); return map ? c.json({ contractVersion: "1", item: map }) : errorResponse(c, 404, "MAP_NOT_FOUND", "The map does not exist"); });
  app.get("/v1/agents/achievements", async (c) => {
    allowAgents(c); const page = agentPage(c); const status = c.req.query("status"); if (!page || (status && status !== "active" && status !== "sunsetting")) return errorResponse(c, 422, "INVALID_REQUEST", "The request parameters are invalid");
    return c.json(await services(c).listAgentAchievements({ ...page, query: c.req.query("q")?.trim() || undefined, status: status as "active" | "sunsetting" | undefined }));
  });
  app.get("/v1/agents/achievements/:achievementId", async (c) => { allowAgents(c); const achievement = await services(c).getAgentAchievement({ challengeId: c.req.param("achievementId") }); return achievement ? c.json({ contractVersion: "1", item: achievement }) : errorResponse(c, 404, "ACHIEVEMENT_NOT_FOUND", "The achievement does not exist"); });
  app.get("/v1/agents/titles", async (c) => {
    allowAgents(c); const page = agentPage(c); const scope = c.req.query("scope"); if (!page || (scope && scope !== "global" && scope !== "map")) return errorResponse(c, 422, "INVALID_REQUEST", "The request parameters are invalid");
    return c.json(await services(c).listAgentTitles({ ...page, query: c.req.query("q")?.trim() || undefined, category: c.req.query("category")?.trim() || undefined, scope: scope as "global" | "map" | undefined, mapId: c.req.query("mapId")?.trim() || undefined }));
  });
  app.get("/v1/agents/titles/:titleKey", async (c) => { allowAgents(c); const title = await services(c).getAgentTitle({ titleKey: c.req.param("titleKey") }); return title ? c.json({ contractVersion: "1", item: title }) : errorResponse(c, 404, "TITLE_NOT_FOUND", "The title does not exist"); });
  app.get("/v1/agents/search", async (c) => {
    allowAgents(c); const page = agentPage(c); const query = c.req.query("q")?.trim(); const kind = c.req.query("kind"); if (!page || !query || (kind && !["event", "map", "achievement", "title"].includes(kind))) return errorResponse(c, 422, "INVALID_REQUEST", "The search parameters are invalid");
    return c.json(await services(c).searchAgentContent({ ...page, query, kind: kind as "event" | "map" | "achievement" | "title" | undefined }));
  });

  app.post("/v1/player/uploads/session", async (c) => {
    const access = await requirePortalPlayer(c);
    if (access.error) return access.error;
    const parsed = playerUploadSessionRequestSchema.safeParse(await parseBody(c.req.raw));
    if (!parsed.success) return errorResponse(c, 422, "INVALID_REQUEST", "The request does not match contract v1");
    try { return c.json(await services(c).createPlayerUploadSession(parsed.data, access.sessionToken!), 201); }
    catch (error) {
      const code = error instanceof Error ? error.message : "UPLOAD_SESSION_FAILED";
      if (code === "CHALLENGE_NOT_FOUND") return errorResponse(c, 422, code, "The challenge is not available");
      if (code === "CHALLENGE_AUTOMATIC") return errorResponse(c, 422, code, "该称号由系统自动发放，无需提交截图。");
      if (code === "PLAYER_BANNED") return errorResponse(c, 403, code, "The player account is banned");
      console.error("[player upload session] failed", { requestId: requestId(c.req.raw), error: error instanceof Error ? error.stack ?? error.message : String(error) });
      return errorResponse(c, 500, "UPLOAD_SESSION_FAILED", "The screenshot upload session could not be created");
    }
  });

  app.put("/v1/uploads/:uploadId", async (c) => {
    const access = await requirePortalPlayer(c);
    if (access.error) return access.error;
    try { await services(c).uploadEvidence({ uploadId: c.req.param("uploadId"), body: await c.req.raw.arrayBuffer(), contentType: c.req.header("content-type") ?? "" }, access.sessionToken!); return c.body(null, 204); }
    catch (error) { const code = error instanceof Error ? error.message : "UPLOAD_FAILED"; if (["UPLOAD_SESSION_INVALID", "UPLOAD_METADATA_MISMATCH", "UPLOAD_HASH_MISMATCH"].includes(code)) return errorResponse(c, 422, code, "The upload is invalid or expired"); if (code === "PLAYER_BANNED") return errorResponse(c, 403, code, "The player account is banned"); if (code === "EVIDENCE_BUCKET_UNAVAILABLE") return errorResponse(c, 503, code, "Screenshot storage is unavailable"); return errorResponse(c, 500, code, "The screenshot upload failed"); }
  });

  app.post("/v1/player/uploads/:uploadId/complete", async (c) => {
    const access = await requirePortalPlayer(c);
    if (access.error) return access.error;
    try { return c.json(await services(c).completePlayerUpload({ uploadId: c.req.param("uploadId") }, access.sessionToken!, c.get("requestId"))); }
    catch (error) {
      if (error instanceof Error && error.message === "UPLOAD_SESSION_INVALID") return errorResponse(c, 422, "UPLOAD_SESSION_INVALID", "The upload is invalid or expired");
      console.error("[player upload complete] failed", { uploadId: c.req.param("uploadId"), requestId: requestId(c.req.raw), error: error instanceof Error ? error.stack ?? error.message : String(error) });
      return errorResponse(c, 500, "UPLOAD_COMPLETE_FAILED", "The screenshot submission could not be completed");
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
      await services(c).upsertQqGroupAccess(parsed.data, auth, idempotencyKey, c.get("requestId"));
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
      const player = sessionToken ? await services(c).getCurrentPlayer({ sessionToken }) : null;
      if (player?.player.isAdmin) auth = { actorType: "user", subject: player.player.playerId, roles: ["maintainer"], provider: "portal-session" };
    }
    if (!auth) return errorResponse(c, 401, "UNAUTHENTICATED", "Authentication is required");
    if (!auth.roles.includes("maintainer") && !auth.roles.includes("channel:read")) return errorResponse(c, 403, "FORBIDDEN", "The actor cannot read group access");
    return c.json({ contractVersion: "1", items: await services(c).listQqGroupAccess(auth) });
  });

  app.get("/v1/admin/player-accounts", async (c) => {
    const access = await requireMaintainer(c);
    if (access.error) return access.error;
    const page = Math.max(1, Number(c.req.query("page") ?? 1) || 1);
    const pageSize = Math.min(50, Math.max(1, Number(c.req.query("pageSize") ?? 25) || 25));
    const status = c.req.query("status");
    if (status && status !== "active" && status !== "banned") return errorResponse(c, 422, "INVALID_REQUEST", "The status is invalid");
    return c.json(await services(c).listAdminPlayers({ query: c.req.query("query")?.trim() || undefined, status: status as "active" | "banned" | undefined, page, pageSize }, access.auth!));
  });

  app.get("/v1/admin/achievements", async (c) => {
    const access = await requireMaintainer(c);
    if (access.error) return access.error;
    const type = c.req.query("type");
    const status = c.req.query("status");
    const family = type === "map_completion" || type === "map" ? "map" : type === "title_achievement" || type === "achievement" ? "achievement" : undefined;
    if (type && !family) return errorResponse(c, 422, "INVALID_REQUEST", "The achievement type is invalid");
    if (status && !["scheduled", "active", "sunsetting", "retired"].includes(status)) return errorResponse(c, 422, "INVALID_REQUEST", "The achievement status is invalid");
    return c.json(await services(c).listAdminChallenges({ family: family as "map" | "achievement" | undefined, status }, access.auth!));
  });

  app.get("/v1/admin/maps", async (c) => {
    const access = await requireMaintainer(c);
    if (access.error) return access.error;
    return c.json({ contractVersion: "1", items: await services(c).listMaps({ source: "working" }) });
  });

  app.get("/v1/admin/events", async (c) => { const access = await requireMaintainer(c); if (access.error) return access.error; return c.json({ contractVersion: "1", items: await services(c).listRandomEvents({ query: c.req.query("query")?.trim() || undefined, category: c.req.query("category")?.trim() || undefined, rarity: c.req.query("rarity")?.trim() || undefined, includeArchived: c.req.query("archived") === "true", source: "working" }) }); });
  app.post("/v1/admin/events", async (c) => { const access = await requireMaintainer(c); if (access.error) return access.error; const key = c.req.header("idempotency-key"); if (!key) return errorResponse(c, 422, "IDEMPOTENCY_KEY_REQUIRED", "Idempotency-Key is required"); const parsed = adminRandomEventCreateRequestSchema.safeParse(await parseBody(c.req.raw)); if (!parsed.success) return errorResponse(c, 422, "INVALID_REQUEST", "The request does not match contract v1"); try { return c.json(await services(c).createAdminRandomEvent(parsed.data, access.auth!, key), 201); } catch (error) { const code = error instanceof Error ? error.message : "EVENT_CREATE_FAILED"; if (code === "CHALLENGE_NOT_FOUND") return errorResponse(c, 422, code, "The challenge does not exist"); if (code === "IDEMPOTENCY_CONFLICT") return errorResponse(c, 409, code, "The idempotency key was used with a different request"); throw error; } });
  app.put("/v1/admin/events/:eventId", async (c) => { const access = await requireMaintainer(c); if (access.error) return access.error; const key = c.req.header("idempotency-key"); if (!key) return errorResponse(c, 422, "IDEMPOTENCY_KEY_REQUIRED", "Idempotency-Key is required"); const parsed = adminRandomEventUpdateRequestSchema.safeParse(await parseBody(c.req.raw)); if (!parsed.success) return errorResponse(c, 422, "INVALID_REQUEST", "The request does not match contract v1"); try { return c.json(await services(c).updateAdminRandomEvent({ ...parsed.data, eventId: c.req.param("eventId") }, access.auth!, key)); } catch (error) { const code = error instanceof Error ? error.message : "EVENT_UPDATE_FAILED"; if (code === "EVENT_NOT_FOUND") return errorResponse(c, 404, code, "The event does not exist"); if (code === "CHALLENGE_NOT_FOUND") return errorResponse(c, 422, code, "The challenge does not exist"); if (code === "IDEMPOTENCY_CONFLICT") return errorResponse(c, 409, code, "The idempotency key was used with a different request"); throw error; } });
  app.delete("/v1/admin/events/:eventId", async (c) => { const access = await requireMaintainer(c); if (access.error) return access.error; const key = c.req.header("idempotency-key"); if (!key) return errorResponse(c, 422, "IDEMPOTENCY_KEY_REQUIRED", "Idempotency-Key is required"); try { await services(c).archiveAdminRandomEvent({ eventId: c.req.param("eventId") }, access.auth!, key); return c.body(null, 204); } catch (error) { const code = error instanceof Error ? error.message : "EVENT_ARCHIVE_FAILED"; if (code === "EVENT_NOT_FOUND") return errorResponse(c, 404, code, "The event does not exist"); if (code === "IDEMPOTENCY_CONFLICT") return errorResponse(c, 409, code, "The idempotency key was used with a different request"); throw error; } });
  app.post("/v1/admin/events/imports/preview", async (c) => { const access = await requireMaintainer(c); if (access.error) return access.error; const parsed = adminRandomEventImportRequestSchema.safeParse(await parseBody(c.req.raw)); if (!parsed.success) return errorResponse(c, 422, "INVALID_REQUEST", "The request does not match contract v1"); return c.json(await services(c).previewAdminRandomEventImport(parsed.data, access.auth!)); });
  app.post("/v1/admin/events/imports", async (c) => { const access = await requireMaintainer(c); if (access.error) return access.error; const key = c.req.header("idempotency-key"); if (!key) return errorResponse(c, 422, "IDEMPOTENCY_KEY_REQUIRED", "Idempotency-Key is required"); const parsed = adminRandomEventImportRequestSchema.safeParse(await parseBody(c.req.raw)); if (!parsed.success) return errorResponse(c, 422, "INVALID_REQUEST", "The request does not match contract v1"); try { return c.json(await services(c).importAdminRandomEvents(parsed.data, access.auth!, key), 201); } catch (error) { const code = error instanceof Error ? error.message : "EVENT_IMPORT_FAILED"; if (["EVENT_IMPORT_INVALID", "EVENT_IMPORT_NAME_CONFLICT", "CHALLENGE_NOT_FOUND"].includes(code)) return errorResponse(c, 422, code, "The import data is invalid"); if (code === "EVENT_IMPORT_DUPLICATE" || code === "IDEMPOTENCY_CONFLICT") return errorResponse(c, 409, code, "The import was already processed"); throw error; } });

  app.put("/v1/admin/maps/:mapId/metadata", async (c) => {
    const access = await requireMaintainer(c);
    if (access.error) return access.error;
    const idempotencyKey = c.req.header("idempotency-key");
    if (!idempotencyKey) return errorResponse(c, 422, "IDEMPOTENCY_KEY_REQUIRED", "Idempotency-Key is required");
    const parsed = adminMapMetadataUpdateRequestSchema.safeParse(await parseBody(c.req.raw));
    if (!parsed.success) return errorResponse(c, 422, "INVALID_REQUEST", "The request does not match contract v1");
    try { return c.json(await services(c).updateAdminMapMetadata({ ...parsed.data, mapId: c.req.param("mapId") }, access.auth!, idempotencyKey)); }
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
      await services(c).updateAdminCatalogTitle({ ...parsed.data, titleKey: c.req.param("titleKey") }, access.auth!, idempotencyKey);
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
      const result = await services(c).uploadAdminTitleIcon({ titleKey: c.req.param("titleKey"), body: await file.arrayBuffer(), contentType: file.type }, access.auth!);
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
    try { return c.json(await services(c).updateAdminChallenge({ ...parsed.data, challengeId: c.req.param("challengeId") }, access.auth!, idempotencyKey)); }
    catch (error) { const code = error instanceof Error ? error.message : "ACHIEVEMENT_UPDATE_FAILED"; if (code === "CHALLENGE_NOT_FOUND") return errorResponse(c, 404, code, "The achievement does not exist"); if (code === "IDEMPOTENCY_CONFLICT") return errorResponse(c, 409, code, "The idempotency key was used with a different request"); throw error; }
  });

  app.get("/v1/admin/player-accounts/:playerAccountId", async (c) => {
    const access = await requireMaintainer(c);
    if (access.error) return access.error;
    try { return c.json(await services(c).getAdminPlayer({ playerAccountId: c.req.param("playerAccountId") }, access.auth!)); }
    catch (error) { if (error instanceof Error && error.message === "PLAYER_NOT_FOUND") return errorResponse(c, 404, "PLAYER_NOT_FOUND", "The player does not exist"); throw error; }
  });

  app.put("/v1/admin/player-accounts/:playerAccountId/status", async (c) => {
    const access = await requireMaintainer(c);
    if (access.error) return access.error;
    const idempotencyKey = c.req.header("idempotency-key");
    if (!idempotencyKey) return errorResponse(c, 422, "IDEMPOTENCY_KEY_REQUIRED", "Idempotency-Key is required");
    const parsed = adminPlayerStatusRequestSchema.safeParse(await parseBody(c.req.raw));
    if (!parsed.success) return errorResponse(c, 422, "INVALID_REQUEST", "The request does not match contract v1");
    try { await services(c).setAdminPlayerStatus({ playerAccountId: c.req.param("playerAccountId"), status: parsed.data.status, reason: parsed.data.reason }, access.auth!, idempotencyKey); return c.body(null, 204); }
    catch (error) { if (error instanceof Error && error.message === "PLAYER_NOT_FOUND") return errorResponse(c, 404, "PLAYER_NOT_FOUND", "The player does not exist"); if (error instanceof Error && error.message === "IDEMPOTENCY_CONFLICT") return errorResponse(c, 409, "IDEMPOTENCY_CONFLICT", "The idempotency key was used with a different request"); throw error; }
  });

  app.delete("/v1/admin/bindings/:bindingId", async (c) => {
    const access = await requireMaintainer(c);
    if (access.error) return access.error;
    const idempotencyKey = c.req.header("idempotency-key");
    if (!idempotencyKey) return errorResponse(c, 422, "IDEMPOTENCY_KEY_REQUIRED", "Idempotency-Key is required");
    try { await services(c).removeAdminBinding({ bindingId: c.req.param("bindingId") }, access.auth!, idempotencyKey); return c.body(null, 204); }
    catch (error) { if (error instanceof Error && error.message === "BINDING_NOT_FOUND") return errorResponse(c, 404, "BINDING_NOT_FOUND", "The binding does not exist"); if (error instanceof Error && error.message === "IDEMPOTENCY_CONFLICT") return errorResponse(c, 409, "IDEMPOTENCY_CONFLICT", "The idempotency key was used with a different request"); throw error; }
  });

  app.get("/v1/admin/title-grants", async (c) => {
    const access = await requireMaintainer(c);
    if (access.error) return access.error;
    return c.json({ contractVersion: "1", items: await services(c).listHistoricalTitleGrants({ query: c.req.query("query")?.trim() || undefined }, access.auth!) });
  });

  app.post("/v1/admin/title-grants", async (c) => {
    const access = await requireMaintainer(c);
    if (access.error) return access.error;
    const idempotencyKey = c.req.header("idempotency-key");
    if (!idempotencyKey) return errorResponse(c, 422, "IDEMPOTENCY_KEY_REQUIRED", "Idempotency-Key is required");
    const parsed = adminTitleGrantRequestSchema.safeParse(await parseBody(c.req.raw));
    if (!parsed.success) return errorResponse(c, 422, "INVALID_REQUEST", "The request does not match contract v1");
    try { await services(c).createAdminTitleGrant(parsed.data, access.auth!, idempotencyKey); return c.body(null, 204); }
    catch (error) { const code = error instanceof Error ? error.message : "TITLE_GRANT_FAILED"; if (["HISTORICAL_TITLE_GRANT_NOT_FOUND", "PLAYER_NOT_FOUND"].includes(code)) return errorResponse(c, 404, code, "The requested record does not exist"); if (code === "HISTORICAL_TITLE_GRANT_CLAIMED") return errorResponse(c, 409, code, "The historical title is already linked"); if (code === "IDEMPOTENCY_CONFLICT") return errorResponse(c, 409, code, "The idempotency key was used with a different request"); throw error; }
  });

  app.post("/v1/admin/title-grants/bulk", async (c) => {
    const access = await requireMaintainer(c);
    if (access.error) return access.error;
    const idempotencyKey = c.req.header("idempotency-key");
    if (!idempotencyKey) return errorResponse(c, 422, "IDEMPOTENCY_KEY_REQUIRED", "Idempotency-Key is required");
    const parsed = adminTitleGrantBulkRequestSchema.safeParse(await parseBody(c.req.raw));
    if (!parsed.success) return errorResponse(c, 422, "INVALID_REQUEST", "The request does not match contract v1");
    try { return c.json(await services(c).createAdminTitleGrantBulk(parsed.data, access.auth!, idempotencyKey)); }
    catch (error) { const code = error instanceof Error ? error.message : "TITLE_GRANT_BULK_FAILED"; if (code === "PLAYER_NOT_FOUND") return errorResponse(c, 404, code, "The requested player does not exist"); if (code === "IDEMPOTENCY_CONFLICT") return errorResponse(c, 409, code, "The idempotency key was used with a different request"); throw error; }
  });

  app.post("/v1/admin/title-grants/:grantId/revoke", async (c) => {
    const access = await requireMaintainer(c);
    if (access.error) return access.error;
    const idempotencyKey = c.req.header("idempotency-key");
    if (!idempotencyKey) return errorResponse(c, 422, "IDEMPOTENCY_KEY_REQUIRED", "Idempotency-Key is required");
    const parsed = adminTitleGrantRevokeRequestSchema.safeParse(await parseBody(c.req.raw));
    if (!parsed.success) return errorResponse(c, 422, "INVALID_REQUEST", "The request does not match contract v1");
    try { await services(c).revokeAdminTitleGrant({ grantId: c.req.param("grantId"), reason: parsed.data.reason }, access.auth!, idempotencyKey); return c.body(null, 204); }
    catch (error) { const code = error instanceof Error ? error.message : "TITLE_GRANT_REVOKE_FAILED"; if (code === "TITLE_GRANT_NOT_FOUND") return errorResponse(c, 404, code, "The title grant does not exist"); if (code === "IDEMPOTENCY_CONFLICT") return errorResponse(c, 409, code, "The idempotency key was used with a different request"); throw error; }
  });

  app.get("/v1/admin/submissions", async (c) => {
    const access = await requireMaintainer(c);
    if (access.error) return access.error;
    const page = Math.max(1, Number(c.req.query("page") ?? 1) || 1);
    const pageSize = Math.min(50, Math.max(1, Number(c.req.query("pageSize") ?? 50) || 50));
    const statuses = c.req.query("status")?.split(",").map((status) => status.trim()).filter(Boolean) ?? [];
    const allowedStatuses = ["received", "evidence_pending", "evidence_stored", "upload_pending", "ocr_pending", "ready_for_review", "ocr_review_required", "approved", "rejected", "resubmission_required"] as const;
    if (statuses.some((status) => !allowedStatuses.includes(status as typeof allowedStatuses[number]))) return errorResponse(c, 422, "INVALID_REQUEST", "The submission status is invalid");
    return c.json(await services(c).listAdminSubmissions({ statuses: statuses as typeof allowedStatuses[number][], page, pageSize }, access.auth!));
  });

  app.get("/v1/admin/submissions/:submissionId", async (c) => {
    const access = await requireMaintainer(c);
    if (access.error) return access.error;
    try { return c.json(await services(c).getAdminSubmission({ submissionId: c.req.param("submissionId") }, access.auth!)); }
    catch (error) { if (error instanceof Error && error.message === "SUBMISSION_NOT_FOUND") return errorResponse(c, 404, "SUBMISSION_NOT_FOUND", "The submission does not exist"); throw error; }
  });

  app.get("/v1/admin/submissions/:submissionId/evidence", async (c) => {
    const access = await requireMaintainer(c);
    if (access.error) return access.error;
    try { const evidence = await services(c).getAdminEvidence({ submissionId: c.req.param("submissionId") }, access.auth!); return new Response(evidence.body, { headers: { "content-type": evidence.contentType, "cache-control": "private, no-store" } }); }
    catch (error) { if (error instanceof Error && error.message === "EVIDENCE_NOT_FOUND") return errorResponse(c, 404, "EVIDENCE_NOT_FOUND", "The evidence does not exist"); throw error; }
  });

  app.post("/v1/admin/submissions/:submissionId/review", async (c) => {
    const access = await requireMaintainer(c);
    if (access.error) return access.error;
    const idempotencyKey = c.req.header("idempotency-key");
    if (!idempotencyKey) return errorResponse(c, 422, "IDEMPOTENCY_KEY_REQUIRED", "Idempotency-Key is required");
    const parsed = adminSubmissionReviewRequestSchema.safeParse(await parseBody(c.req.raw));
    if (!parsed.success) return errorResponse(c, 422, "INVALID_REQUEST", "The request does not match contract v1");
    try { await services(c).reviewSubmission({ submissionId: c.req.param("submissionId"), decision: parsed.data.decision, reason: parsed.data.reason }, access.auth!, idempotencyKey); return c.body(null, 204); }
    catch (error) {
      const code = error instanceof Error ? error.message : "REVIEW_FAILED";
      if (["SUBMISSION_NOT_FOUND", "SUBMISSION_NOT_REVIEWABLE"].includes(code)) return errorResponse(c, 422, code, "The submission cannot be reviewed");
      if (code === "IDEMPOTENCY_CONFLICT") return errorResponse(c, 409, code, "The idempotency key was used with a different request");
      console.error("[admin review] failed", { submissionId: c.req.param("submissionId"), requestId: requestId(c.req.raw), error: error instanceof Error ? error.stack ?? error.message : String(error) });
      return errorResponse(c, 500, "REVIEW_FAILED", "The review could not be completed");
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
      return c.json(await services(c).createSubmission(parsed.data, auth, idempotencyKey), 201);
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
      return c.json(await services(c).getSubmission({ submissionId }, { actorType: "user", subject: "public-status", roles: [], provider: "public" }));
    } catch (error) {
      if (error instanceof Error && error.message === "SUBMISSION_NOT_FOUND") return errorResponse(c, 404, "SUBMISSION_NOT_FOUND", "The submission does not exist");
      throw error;
    }
  });

  return app;
};

export type { AppDependencies };
