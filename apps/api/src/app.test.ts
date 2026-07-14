import { describe, expect, it } from "vitest";
import type { PlatformServices } from "@owbastion/domain";
import { createApp, type RuntimeEnv } from "./app";

const auth = async () => ({ actorType: "service" as const, subject: "qqbot", roles: ["channel:write"], provider: "test" });

const services: PlatformServices = {
  createBinding: async () => ({ contractVersion: "1", bindingId: "00000000-0000-0000-0000-000000000001", identityId: "00000000-0000-0000-0000-000000000002", provider: "qq", groupOpenId: "group-1", memberOpenId: "member-1", playerName: "Player", playerId: "1234" }),
  createSubmission: async () => ({ contractVersion: "1", submissionId: "00000000-0000-0000-0000-000000000003", status: "evidence_pending", mapName: "Test Map", attachmentIds: ["00000000-0000-0000-0000-000000000004"] }),
  getSubmission: async () => ({ contractVersion: "1", submissionId: "00000000-0000-0000-0000-000000000003", status: "ocr_pending", mapName: "Test Map", createdAt: 1, updatedAt: 1 }),
  createQqLoginAttempt: async () => ({ contractVersion: "1", attemptId: "00000000-0000-0000-0000-000000000005", attemptToken: "a".repeat(64), code: "ABC234", expiresAt: 1 }),
  getQqLoginStatus: async () => ({ contractVersion: "1", status: "pending" }),
  verifyQqLogin: async () => ({ contractVersion: "1", status: "verified", environment: "test" }),
  upsertQqGroupAccess: async () => {},
  getCurrentPlayer: async ({ sessionToken }) => sessionToken === "session-token" ? {
    contractVersion: "1",
    player: { playerId: "1234", playerName: "Player", bindingStatus: "bound" },
    recentSubmissions: [{ submissionId: "00000000-0000-0000-0000-000000000003", status: "ocr_pending", mapName: "Test Map", createdAt: 2, updatedAt: 3 }],
  } : null,
  logoutPortalSession: async () => {},
};

const app = createApp({
  authenticate: auth,
  services: () => services,
});

const env = {} as RuntimeEnv;

describe("API", () => {
  it("reports health without external services", async () => {
    const response = await app.request("http://localhost/health", {}, env);
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ service: "api", status: "ok" });
  });

  it("validates and authenticates binding creation", async () => {
    const response = await app.request("http://localhost/v1/qq/bindings", { method: "POST", headers: { "idempotency-key": "binding-1", "content-type": "application/json" }, body: JSON.stringify({ contractVersion: "1", provider: "qq", groupOpenId: "group-1", memberOpenId: "member-1", playerName: "Player", playerId: "1234" }) }, env);
    expect(response.status).toBe(201);
    expect((await response.json() as { provider: string }).provider).toBe("qq");
  });

  it("rejects requests without an idempotency key", async () => {
    const response = await app.request("http://localhost/v1/qq/bindings", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ contractVersion: "1", provider: "qq", groupOpenId: "group-1", memberOpenId: "member-1", playerName: "Player", playerId: "1234" }) }, env);
    expect(response.status).toBe(422);
    expect((await response.json() as { error: { code: string } }).error.code).toBe("IDEMPOTENCY_KEY_REQUIRED");
  });

  it("returns only public submission status fields", async () => {
    const response = await app.request("http://localhost/v1/submissions/00000000-0000-0000-0000-000000000003");
    expect(response.status).toBe(200);
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
    const response = await verifiedApp.request("https://api.owbastion.codes/v1/auth/qq/login-attempt/00000000-0000-0000-0000-000000000005", { headers: { "x-login-attempt-token": "a".repeat(64) } }, env);
    expect(response.headers.get("set-cookie")).toContain("Secure");
    expect(response.headers.get("access-control-allow-origin")).toBe("https://owbastion.codes");
  });

  it("requires a valid portal session and returns only player-facing fields", async () => {
    const unauthenticated = await app.request("http://localhost/v1/me", {}, env);
    expect(unauthenticated.status).toBe(401);

    const response = await app.request("http://localhost/v1/me", { headers: { cookie: "owb_session=session-token" } }, env);
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      contractVersion: "1",
      player: { playerId: "1234", playerName: "Player", bindingStatus: "bound" },
      recentSubmissions: [{ submissionId: "00000000-0000-0000-0000-000000000003", status: "ocr_pending", mapName: "Test Map", createdAt: 2, updatedAt: 3 }],
    });
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
});
