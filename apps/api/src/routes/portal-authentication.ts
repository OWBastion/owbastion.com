import {
  adminPasskeyRecoveryRequestSchema,
  passkeyAuthenticatedRegistrationOptionsRequestSchema,
  passkeyLoginOptionsRequestSchema,
  passkeyLoginVerifyRequestSchema,
  passkeyPublicRegistrationOptionsRequestSchema,
  passkeyPublicRegistrationVerifyRequestSchema,
  passkeyRegistrationVerifyRequestSchema,
  qqLoginAttemptRequestSchema,
  qqLoginVerifyRequestSchema,
} from "@owbastion/contracts";
import type { Authenticator, PlatformServices } from "@owbastion/domain";
import type { AdminRouteDependencies, ApiApp, ApiContext } from "./route-contract";
import { maintainerRoute, parseBody } from "./route-contract";
import type { RuntimeEnv } from "../app";

type AuthenticatedPortalPlayer = {
  sessionToken: string;
  player: NonNullable<Awaited<ReturnType<PlatformServices["getCurrentPlayer"]>>>;
};
type PortalPlayerAccess =
  | { error: Response; sessionToken?: undefined; player?: undefined }
  | { error?: undefined; sessionToken: string; player: AuthenticatedPortalPlayer["player"] };
type PortalAuthenticationRouteDependencies = Pick<AdminRouteDependencies, "services" | "requireMaintainer" | "errorResponse"> & {
  authenticate: Authenticator<RuntimeEnv>;
  allowPortal: (context: ApiContext) => void;
  sessionCookie: (request: Request, value: string, maxAge: number) => string;
  requirePortalPlayer: (context: ApiContext) => Promise<PortalPlayerAccess>;
  portalPlayerRoute: (
    action: (context: ApiContext, access: AuthenticatedPortalPlayer) => Promise<any> | any,
  ) => (context: ApiContext) => Promise<any>;
};

export const registerPortalAuthenticationRoutes = (app: ApiApp, dependencies: PortalAuthenticationRouteDependencies) => {
  const { allowPortal, requireMaintainer, errorResponse, sessionCookie, requirePortalPlayer, portalPlayerRoute } = dependencies;

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

  app.get("/v1/me/passkeys", portalPlayerRoute(async (c, access) => {
    const result = await dependencies.services(c.env).listCurrentPlayerPasskeys({ sessionToken: access.sessionToken });
    return result ? c.json(result) : errorResponse(c, 401, "UNAUTHENTICATED", "Authentication is required");
  }));

  app.post("/v1/me/passkeys/registration/options", async (c) => {
    const origin = passkeyOrigin(c);
    if (!origin) return errorResponse(c, 403, "ORIGIN_NOT_ALLOWED", "The request origin is not allowed");
    const access = await requirePortalPlayer(c);
    if (access.error) return access.error;
    const parsed = passkeyAuthenticatedRegistrationOptionsRequestSchema.safeParse(await parseBody(c.req.raw));
    if (!parsed.success) return errorResponse(c, 422, "INVALID_REQUEST", "The request does not match contract v1");
    try { return c.json(await dependencies.services(c.env).createCurrentPlayerPasskeyRegistrationOptions({ ...parsed.data, sessionToken: access.sessionToken, rpId: origin.rpId }), 201); }
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
      await dependencies.services(c.env).completeCurrentPlayerPasskeyRegistration({ ...parsed.data, sessionToken: access.sessionToken, ...origin });
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
      await dependencies.services(c.env).removeCurrentPlayerPasskey({ sessionToken: access.sessionToken, passkeyId });
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
};
