import { describe, expect, it, vi } from "vitest";
import type { Authenticator, PlatformServices } from "@owbastion/domain";
import { createApp, type RuntimeEnv } from "./app";

const env = {} as RuntimeEnv;
const channelAuth = async () => ({ actorType: "service" as const, subject: "qqbot", roles: ["channel:write"], provider: "test" });
const maintainerContext = { actorType: "user" as const, subject: "admin", roles: ["maintainer"], provider: "test" };
const authenticateAsMaintainer = async () => maintainerContext;

// Services this suite does not stub fail loudly instead of silently returning.
const createTestApp = (overrides: Partial<PlatformServices> = {}, authenticate: Authenticator<RuntimeEnv> = channelAuth) => createApp({
  authenticate,
  services: () => new Proxy(overrides as PlatformServices, {
    get: (target, property, receiver) => Reflect.has(target, property) || typeof property !== "string"
      ? Reflect.get(target, property, receiver)
      : () => { throw new Error(`UNMOCKED_PLATFORM_SERVICE:${property}`); },
  }),
  turnstile: async () => undefined,
});

describe("player invitation routes", () => {
  const json = { "content-type": "application/json" };
  const signedIn = { ...json, cookie: "owb_session=session-token" };
  const identity = { getPortalSessionIdentity: async () => ({ player: { playerId: "1", isAdmin: false } }) } as Partial<PlatformServices>;
  const page = { contractVersion: "1" as const, items: [], page: 1, pageSize: 20, total: 0, hasMore: false };
  const invitationId = "00000000-0000-4000-8000-000000000497";
  const mapped = (code: string) => async () => { throw new Error(code); };
  const post = (target: ReturnType<typeof createTestApp>, path: string, headers: Record<string, string>, body?: unknown) =>
    target.request(`http://localhost${path}`, { method: "POST", headers, body: body === undefined ? undefined : JSON.stringify(body) }, env);

  it("serves only a signed-in Player, with pagination bounds, idempotency keys, and mapped rule errors", async () => {
    const create = vi.fn(async (_input: unknown, _key: string) => ({ invitationId, code: "FRIENDS", status: "available" as const, maxUses: 2, usedCount: 0, expiresAt: 2, createdAt: 1, revokedAt: null }));
    const read = vi.fn(async (_input: { sessionToken: string; page: number; pageSize: number }) => ({ ...page, policy: null, quota: null, eligibility: null, createBlockedReason: "disabled" as const }));
    const playerApp = createTestApp({ ...identity, getCurrentPlayerInvitations: async (input) => input.sessionToken === "session-token" ? read(input) : null, createCurrentPlayerInvitation: create });
    expect((await playerApp.request("http://localhost/v1/me/invitations", {}, env)).status).toBe(401);
    expect((await playerApp.request("http://localhost/v1/me/invitations?pageSize=21", { headers: signedIn }, env)).status).toBe(422);
    expect((await playerApp.request("http://localhost/v1/me/invitations?page=1&page=2", { headers: signedIn }, env)).status).toBe(422);
    const response = await playerApp.request("http://localhost/v1/me/invitations?pageSize=5", { headers: signedIn }, env);
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(read).toHaveBeenCalledWith({ sessionToken: "session-token", page: 1, pageSize: 5 });

    const body = { contractVersion: "1", code: "friends", maxUses: 2, validityDays: 7 };
    expect((await post(playerApp, "/v1/me/invitations", signedIn, body)).status).toBe(422);
    expect((await post(playerApp, "/v1/me/invitations", { ...signedIn, "idempotency-key": "k" }, { ...body, targetBattleTag: "Someone#1" })).status).toBe(422);
    expect((await post(playerApp, "/v1/me/invitations", { ...signedIn, "idempotency-key": "k" }, { ...body, maxUses: 0 })).status).toBe(422);
    expect((await post(playerApp, "/v1/me/invitations", { ...signedIn, "idempotency-key": "k" }, body)).status).toBe(201);
    expect(create).toHaveBeenCalledWith({ sessionToken: "session-token", code: "friends", maxUses: 2, validityDays: 7 }, "k");

    for (const [code, status] of [
      ["PLAYER_INVITATION_CODE_INVALID", 422], ["PLAYER_INVITATION_CODE_RESERVED", 422], ["PLAYER_INVITATION_LIMIT_EXCEEDED", 422], ["PLAYER_INVITATION_CODE_TAKEN", 409],
      ["PLAYER_INVITATION_QUOTA_EXHAUSTED", 409], ["PLAYER_INVITATION_DISABLED", 403], ["PLAYER_INVITATION_NOT_ELIGIBLE", 403], ["IDEMPOTENCY_CONFLICT", 409], ["UNAUTHENTICATED", 401],
    ] as const) {
      const failing = createTestApp({ ...identity, createCurrentPlayerInvitation: mapped(code) });
      const failed = await post(failing, "/v1/me/invitations", { ...signedIn, "idempotency-key": "k" }, body);
      expect(failed.status, code).toBe(status);
      expect(await failed.json()).toMatchObject({ error: { code } });
    }
    expect((await post(playerApp, "/v1/me/invitations/not-a-uuid/revoke", { ...signedIn, "idempotency-key": "k" })).status).toBe(404);
  });

  it("starts a registration publicly and maps identity refusals to conflicts", async () => {
    const redeem = vi.fn(async (_input: unknown) => ({ contractVersion: "1" as const, claimId: invitationId, claimToken: "t".repeat(32), code: "ABC234", playerName: "New", playerId: "1", expiresAt: 5 }));
    const publicApp = createTestApp({ redeemPlayerInvitation: redeem });
    const body = { contractVersion: "1", code: "friends", playerName: "New", playerId: "1" };
    expect((await post(publicApp, "/v1/public/player-invitations/redeem", json, { ...body, playerId: "x" })).status).toBe(422);
    expect((await post(publicApp, "/v1/public/player-invitations/redeem", json, body)).status).toBe(201);
    expect(redeem).toHaveBeenCalledWith(body);
    for (const [code, status] of [["INVITE_INVALID", 422], ["PLAYER_INVITATION_ACCOUNT_EXISTS", 409], ["PLAYER_INVITATION_LEGACY_CANDIDATE", 409]] as const) {
      const response = await post(createTestApp({ redeemPlayerInvitation: mapped(code) }), "/v1/public/player-invitations/redeem", json, body);
      expect(response.status, code).toBe(status);
    }
  });

  it("restricts policy, overrides, overview, detail, and revocation to maintainers", async () => {
    const policy = { enabled: true, period: "week", maxCodesCreatedPerPeriod: 3, maxRegistrationsPerPeriod: 5, maxUsesPerCode: 5, maxValidityDays: 30, minAccountAgeDays: 0, minApprovedSubmissions: 0, eligibilityMode: "any" } as const;
    const setPolicy = vi.fn(async (_input: unknown, _auth: unknown, _key: string) => ({ contractVersion: "1" as const, policy, updatedAt: 1 }));
    const setOverride = vi.fn(async (_input: unknown, _auth: unknown, _key: string) => undefined);
    const overview = vi.fn(async (_input: unknown, _auth: unknown) => ({ ...page, pageSize: 50 }));
    const revoke = vi.fn(async (_input: unknown, _auth: unknown, _key: string) => undefined);
    const services: Partial<PlatformServices> = {
      getAdminPlayerInvitationPolicy: async () => ({ contractVersion: "1" as const, policy: null, updatedAt: null }),
      setAdminPlayerInvitationPolicy: setPolicy, setAdminPlayerInvitationOverride: setOverride, clearAdminPlayerInvitationOverride: async () => undefined,
      listAdminInvitations: overview, revokeAdminPlayerInvitation: revoke, getAdminPlayerInvitation: mapped("PLAYER_INVITATION_NOT_FOUND"),
    };
    const nonMaintainer = createTestApp(services);
    expect((await nonMaintainer.request("http://localhost/v1/admin/player-invitations/policy", {}, env)).status).toBe(403);
    expect((await nonMaintainer.request("http://localhost/v1/admin/invitations", {}, env)).status).toBe(403);

    const maintainer = createTestApp(services, authenticateAsMaintainer);
    const send = (method: string, path: string, headers: Record<string, string>, body?: unknown) =>
      maintainer.request(`http://localhost${path}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) }, env);
    expect((await maintainer.request("http://localhost/v1/admin/player-invitations/policy", {}, env)).status).toBe(200);
    expect((await send("PUT", "/v1/admin/player-invitations/policy", json, { contractVersion: "1", policy })).status).toBe(422);
    expect((await send("PUT", "/v1/admin/player-invitations/policy", { ...json, "idempotency-key": "p" }, { contractVersion: "1", policy: { ...policy, maxUsesPerCode: 0 } })).status).toBe(422);
    expect((await send("PUT", "/v1/admin/player-invitations/policy", { ...json, "idempotency-key": "p" }, { contractVersion: "1", policy })).status).toBe(200);
    expect(setPolicy).toHaveBeenCalledWith({ policy }, maintainerContext, "p");

    const override = { enabled: false, maxCodesCreatedPerPeriod: null, maxRegistrationsPerPeriod: null, maxUsesPerCode: null, maxValidityDays: null, minAccountAgeDays: null, minApprovedSubmissions: null, eligibilityMode: null };
    expect((await send("PUT", "/v1/admin/player-invitations/overrides/player-1", { ...json, "idempotency-key": "o" }, { contractVersion: "1", override })).status).toBe(204);
    expect(setOverride).toHaveBeenCalledWith({ playerAccountId: "player-1", override }, maintainerContext, "o");
    expect((await send("DELETE", "/v1/admin/player-invitations/overrides/player-1", { "idempotency-key": "d" })).status).toBe(204);

    expect((await send("GET", "/v1/admin/invitations?type=bogus", {})).status).toBe(422);
    expect((await send("GET", "/v1/admin/invitations?unknown=1", {})).status).toBe(422);
    expect((await send("GET", "/v1/admin/invitations?type=player&status=active&issuer=ali&from=1&to=9&page=2&pageSize=10", {})).status).toBe(200);
    expect(overview).toHaveBeenCalledWith({ type: "player", status: "active", issuer: "ali", from: 1, to: 9, page: 2, pageSize: 10 }, maintainerContext);

    expect((await send("GET", "/v1/admin/player-invitations/not-a-uuid", {})).status).toBe(404);
    expect((await send("GET", `/v1/admin/player-invitations/${invitationId}`, {})).status).toBe(404);
    expect((await send("POST", `/v1/admin/player-invitations/${invitationId}/revoke`, {})).status).toBe(422);
    expect((await send("POST", `/v1/admin/player-invitations/${invitationId}/revoke`, { "idempotency-key": "r" })).status).toBe(204);
    expect(revoke).toHaveBeenCalledWith({ invitationId }, maintainerContext, "r");
  });
});
