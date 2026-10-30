import { describe, expect, it } from "vitest";
import type { Authenticator, PlatformServices } from "@owbastion/domain";
import { createApp, type RuntimeEnv } from "./app";

const env = {} as RuntimeEnv;
const channelAuth: Authenticator<RuntimeEnv> = async () => ({ actorType: "service", subject: "qqbot", roles: ["channel:write"], provider: "test" });

const createTestApp = (overrides: Partial<PlatformServices>, authenticate: Authenticator<RuntimeEnv> = channelAuth) => createApp({
  authenticate,
  services: () => overrides as PlatformServices,
  turnstile: async () => undefined,
});

describe("QQ group lifecycle routes", () => {
  const post = (target: ReturnType<typeof createTestApp>, path: string, body: unknown, key?: string) =>
    target.request(`http://localhost${path}`, { method: "POST", headers: { "content-type": "application/json", ...(key ? { "idempotency-key": key } : {}) }, body: JSON.stringify(body) }, env);

  it("requires idempotency for group registration", async () => {
    const registrations: Array<{ input: unknown; key: string }> = [];
    const app = createTestApp({ registerQqGroup: async (input, _auth, key) => { registrations.push({ input, key }); } });
    const body = { contractVersion: "1", groupOpenId: "group-1", status: "pending", occurredAt: 1 };
    expect((await post(app, "/v1/qq/groups", body)).status).toBe(422);
    expect((await post(app, "/v1/qq/groups", body, "group-event-1")).status).toBe(204);
    expect(registrations).toEqual([{ input: body, key: "group-event-1" }]);
  });

  it("requires channel write access, idempotency, and a valid body for member left reports", async () => {
    const reports: Array<{ input: unknown; key: string }> = [];
    const app = createTestApp({ reportQqGroupMemberLeft: async (input, _auth, key) => { reports.push({ input, key }); } });
    const body = { contractVersion: "1", groupOpenId: "group-1", memberOpenId: "member-1", occurredAt: 1 };
    expect((await post(app, "/v1/qq/group-members/left", body)).status).toBe(422);
    expect((await post(app, "/v1/qq/group-members/left", { ...body, memberOpenId: "" }, "left-bad")).status).toBe(422);
    expect((await post(app, "/v1/qq/group-members/left", body, "left-1")).status).toBe(204);
    expect(reports).toEqual([{ input: body, key: "left-1" }]);
    const readOnly = createTestApp({}, async () => ({ actorType: "user", subject: "reader", roles: [], provider: "test" }));
    expect((await post(readOnly, "/v1/qq/group-members/left", body, "left-2")).status).toBe(403);
    const anonymous = createTestApp({}, async () => null);
    expect((await post(anonymous, "/v1/qq/group-members/left", body, "left-3")).status).toBe(401);
  });
});
