import { describe, expect, it } from "vitest";
import type { PlatformServices } from "@owbastion/domain";
import { createApp, type RuntimeEnv } from "./app";

const env = {} as RuntimeEnv;
const maintainer = { actorType: "user" as const, subject: "admin", roles: ["maintainer"], provider: "test" };
const makeApp = (services: Partial<PlatformServices>) => createApp({ services: () => services as PlatformServices, authenticate: async () => maintainer });
const request = (app: ReturnType<typeof createApp>, key: string, body: unknown) => app.request("http://localhost/v1/admin/player-accounts/player-1/identity", { method: "PUT", headers: { "content-type": "application/json", "idempotency-key": key }, body: JSON.stringify(body) }, env);

describe("admin player BattleTag route", () => {
  it("forwards the full BattleTag and rejects an invalid number", async () => {
    const updates: Array<{ playerAccountId: string; playerName: string; playerId: string; key: string }> = [];
    const app = makeApp({ updateAdminPlayerIdentity: async (input, _auth, key) => { updates.push({ playerAccountId: input.playerAccountId, playerName: input.playerName, playerId: input.playerId, key }); } });
    expect((await request(app, "identity-1", { contractVersion: "1", playerName: "新名称", playerId: "2222" })).status).toBe(204);
    expect(updates).toEqual([{ playerAccountId: "player-1", playerName: "新名称", playerId: "2222", key: "identity-1" }]);
    for (const playerId of ["", "12a", "12345678901"]) expect((await request(app, `identity-invalid-${playerId}`, { contractVersion: "1", playerName: "新名称", playerId })).status).toBe(422);
    expect(updates).toHaveLength(1);
  });

  it("rejects a BattleTag change while an invite or binding claim is pending", async () => {
    const app = makeApp({ updateAdminPlayerIdentity: async () => { throw new Error("PLAYER_BATTLETAG_PENDING_INVITE"); } });
    const response = await request(app, "identity-pending", { contractVersion: "1", playerName: "新名称", playerId: "2222" });
    expect(response.status).toBe(409);
    expect(await response.json()).toMatchObject({ error: { code: "PLAYER_BATTLETAG_PENDING_INVITE" } });
  });
});
