import { describe, expect, it } from "vitest";
import type { PlatformServices } from "@owbastion/domain";
import { createApp, type RuntimeEnv } from "./app";

const env = {} as RuntimeEnv;
const item = { kind: "pioneer" as const, titleKey: "PIONEER", titleName: "开拓者", mapId: "map.samoa", mapName: "萨摩亚", startsAt: 1_000, endsAt: 2_000 };

describe("public active challenges", () => {
  it("serves the list anonymously with the catalog contract", async () => {
    const app = createApp({ services: () => ({ listActiveChallenges: async () => [item] }) as unknown as PlatformServices, authenticate: async () => null });
    const response = await app.request("http://localhost/v1/public/active-challenges", {}, env);
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ contractVersion: "1", items: [item] });
  });
});
