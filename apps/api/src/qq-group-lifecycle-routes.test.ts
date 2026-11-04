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
  const post = (target: ReturnType<typeof createTestApp>, path: string, body: unknown, key: string) =>
    target.request(`http://localhost${path}`, { method: "POST", headers: { "content-type": "application/json", "idempotency-key": key }, body: JSON.stringify(body) }, env);

  it("requires channel write access for member left reports", async () => {
    const body = { contractVersion: "1", groupOpenId: "group-1", memberOpenId: "member-1", occurredAt: 1 };
    const readOnly = createTestApp({}, async () => ({ actorType: "user", subject: "reader", roles: [], provider: "test" }));
    expect((await post(readOnly, "/v1/qq/group-members/left", body, "left-2")).status).toBe(403);
    const anonymous = createTestApp({}, async () => null);
    expect((await post(anonymous, "/v1/qq/group-members/left", body, "left-3")).status).toBe(401);
  });
});
