import { describe, expect, it } from "vitest";
import type { Authenticator, PlatformServices } from "@owbastion/domain";
import { createApp, type RuntimeEnv } from "./app";

const env = {} as RuntimeEnv;
const channelAuth = async () => ({ actorType: "service" as const, subject: "qqbot", roles: ["channel:write"], provider: "test" });

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
  it("serves invitations only to a signed-in Player", async () => {
    const app = createTestApp({});
    expect((await app.request("http://localhost/v1/me/invitations", {}, env)).status).toBe(401);
  });

  it("restricts invitation policy and overview to maintainers", async () => {
    const nonMaintainer = createTestApp({});
    expect((await nonMaintainer.request("http://localhost/v1/admin/player-invitations/policy", {}, env)).status).toBe(403);
    expect((await nonMaintainer.request("http://localhost/v1/admin/invitations", {}, env)).status).toBe(403);
  });
});
