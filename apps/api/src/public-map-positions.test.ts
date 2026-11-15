import { describe, expect, it } from "vitest";
import type { PlatformServices } from "@owbastion/domain";
import { publicMapPositionsResponseSchema, type PublicMapPositions } from "@owbastion/contracts";
import { createApp, type RuntimeEnv } from "./app";

const env = {} as RuntimeEnv;
const item: PublicMapPositions = { mapId: "map.hanamura", gameplayRevisionId: "revision:map.hanamura:initial", stages: [{ points: [{ kind: "bastion", position: [1, 2, 3] }] }] };
const appWith = (getPublicMapPositions: PlatformServices["getPublicMapPositions"]) =>
  createApp({ services: () => ({ getPublicMapPositions }) as unknown as PlatformServices, authenticate: async () => null });

describe("public map positions", () => {
  it("serves a map's positions anonymously with the public contract", async () => {
    const requested: string[] = [];
    const response = await appWith(async ({ mapId }) => { requested.push(mapId); return item; }).request("http://localhost/v1/maps/map.hanamura/positions", {}, env);
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toContain("public");
    expect(publicMapPositionsResponseSchema.parse(await response.json())).toEqual({ contractVersion: "1", item });
    expect(requested).toEqual(["map.hanamura"]);
  });

  it("returns 404 for a map that is not public", async () => {
    const response = await appWith(async () => null).request("http://localhost/v1/maps/map.retired/positions", {}, env);
    expect(response.status).toBe(404);
    expect(await response.json()).toMatchObject({ error: { code: "MAP_NOT_FOUND" } });
  });
});
