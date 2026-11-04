import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { createTestD1 } from "../test/d1";
import { playerHandlesSchema } from "../test/schema";
import { createPlatformServices } from "./index";

const hash = (value: unknown) => createHash("sha256").update(JSON.stringify(value)).digest("hex");
const admin = { actorType: "user", subject: "admin.one", scopes: [] } as never;

const fixture = () => {
  const { sqlite, database } = createTestD1({ foreignKeys: true, batchMode: "immediate" });
  sqlite.exec(`
    CREATE TABLE player_accounts (id TEXT PRIMARY KEY, player_id TEXT NOT NULL, player_name TEXT NOT NULL, normalized_player_name TEXT NOT NULL, is_admin INTEGER NOT NULL DEFAULT 0, status TEXT NOT NULL DEFAULT 'active', public_profile INTEGER NOT NULL DEFAULT 1, hide_battletag INTEGER NOT NULL DEFAULT 0, banned_at INTEGER, banned_by TEXT, ban_reason TEXT, leaderboard_key TEXT, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL);
    CREATE TABLE portal_sessions (id TEXT PRIMARY KEY, player_account_id TEXT NOT NULL, token_hash TEXT NOT NULL, expires_at INTEGER NOT NULL);
    CREATE TABLE idempotency_keys (id TEXT PRIMARY KEY, actor_id TEXT NOT NULL, operation TEXT NOT NULL, request_hash TEXT NOT NULL, response_json TEXT NOT NULL, created_at INTEGER NOT NULL);
    CREATE TABLE audit_events (id TEXT PRIMARY KEY, correlation_id TEXT NOT NULL, actor_type TEXT NOT NULL, actor_id TEXT NOT NULL, operation TEXT NOT NULL, entity_type TEXT NOT NULL, entity_id TEXT NOT NULL, payload_json TEXT NOT NULL, created_at INTEGER NOT NULL);
  `);
  sqlite.exec(playerHandlesSchema);
  const now = Date.now();
  for (const id of ["one", "two", "three"]) {
    sqlite.prepare("INSERT INTO player_accounts (id, player_id, player_name, normalized_player_name, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)").run(id, id, `Player ${id}`, `player ${id}`, now, now);
    sqlite.prepare("INSERT INTO portal_sessions VALUES (?, ?, ?, ?)").run(`session.${id}`, id, hash(`token.${id}`), now + 60_000);
  }
  const services = createPlatformServices(database);
  const request = (who: string, handle: string, key = `req-${who}-${handle}`) => services.requestCurrentPlayerHandle({ sessionToken: `token.${who}`, handle }, key);
  const state = (who: string) => services.getCurrentPlayerHandle({ sessionToken: `token.${who}` });
  const pendingId = async (who: string) => (await state(who))!.pending!.requestId;
  const approve = async (who: string, key = `approve-${who}-${Math.random()}`) => services.approveAdminPlayerHandleRequest({ handleId: await pendingId(who) }, admin, key);
  const count = (operation: string) => (sqlite.prepare("SELECT COUNT(*) AS n FROM audit_events WHERE operation = ?").get(operation) as { n: number }).n;
  return { sqlite, services, request, state, pendingId, approve, count };
};

describe("player handle requests", () => {
  it("keeps a pending request separate from the active handle until a maintainer approves it", async () => {
    const { request, state, approve, services, count } = fixture();
    await expect(state("one")).resolves.toEqual({ contractVersion: "1", handle: null, pending: null, rejected: null });
    const pending = await request("one", "Teakowa");
    expect(pending).toMatchObject({ handle: null, pending: { handle: "teakowa" } });
    await expect(services.getPublicPlayerByHandle({ handle: "teakowa" })).resolves.toBeNull();
    await approve("one");
    await expect(state("one")).resolves.toMatchObject({ handle: "teakowa", pending: null });
    expect(count("player.handle.request")).toBe(1);
    expect(count("admin.player.handle.approve")).toBe(1);
  });

  it("reject keeps the current handle, frees the requested one, and shows the Player the decision", async () => {
    const { request, state, services, approve, pendingId } = fixture();
    await request("one", "keeper"); await approve("one");
    await request("one", "wanted");
    await services.rejectAdminPlayerHandleRequest({ handleId: await pendingId("one") }, admin, "reject-1");
    await expect(state("one")).resolves.toMatchObject({ handle: "keeper", pending: null, rejected: { handle: "wanted" } });
    await expect(request("two", "wanted")).resolves.toMatchObject({ pending: { handle: "wanted" } });
    await request("one", "another");
    await expect(state("one")).resolves.toMatchObject({ rejected: null, pending: { handle: "another" } });
  });

  it("rejects an ID already held or reserved by another Player, including NFKC and case collisions", async () => {
    const { request, approve } = fixture();
    await request("one", "abc123");
    await expect(request("two", "ABC123")).rejects.toThrow("HANDLE_TAKEN");
    await expect(request("two", "ＡＢＣ１２３")).rejects.toThrow("HANDLE_TAKEN");
    await approve("one");
    await expect(request("two", "Abc123")).rejects.toThrow("HANDLE_TAKEN");
    await expect(request("one", "ABC123")).rejects.toThrow("HANDLE_UNCHANGED");
  });

  it("lets exactly one of several concurrent requests for the same normalized ID win", async () => {
    const { request, sqlite } = fixture();
    const outcomes = await Promise.allSettled([request("one", "Racer1"), request("two", "racer1"), request("three", "ＲＡＣＥＲ１")]);
    expect(outcomes.filter((outcome) => outcome.status === "fulfilled")).toHaveLength(1);
    expect(outcomes.filter((outcome) => outcome.status === "rejected").map((outcome) => (outcome as PromiseRejectedResult).reason.message)).toEqual(["HANDLE_TAKEN", "HANDLE_TAKEN"]);
    expect(sqlite.prepare("SELECT COUNT(*) AS n FROM player_handles WHERE handle = 'racer1'").get()).toEqual({ n: 1 });
  });

  it.each([
    ["has a symbol", "ab_c", "HANDLE_INVALID_CHARACTERS"],
    ["has a space", "ab c", "HANDLE_INVALID_CHARACTERS"],
    ["has an emoji", "ab😀", "HANDLE_INVALID_CHARACTERS"],
    ["has a CJK extension character", "ab𠀀", "HANDLE_INVALID_CHARACTERS"],
    ["is too short", "a", "HANDLE_INVALID_LENGTH"],
    ["is too long", "abcdefghij", "HANDLE_INVALID_LENGTH"],
    ["is all digits", "123456", "HANDLE_ALL_DIGITS"],
    ["is all full-width digits", "１２３４", "HANDLE_ALL_DIGITS"],
    ["is a reserved term", "admin", "HANDLE_RESERVED"],
    ["contains a reserved term", "xxAdminxx", "HANDLE_RESERVED"],
    ["is a route-reserved term", "me", "HANDLE_RESERVED"],
    ["contains a reserved Chinese term", "超级管理员", "HANDLE_RESERVED"],
    ["contains 官方", "我是官方号", "HANDLE_RESERVED"],
  ])("rejects an ID that %s", async (_label, handle, code) => {
    const { request, sqlite } = fixture();
    await expect(request("one", handle)).rejects.toThrow(code);
    expect(sqlite.prepare("SELECT COUNT(*) AS n FROM player_handles").get()).toEqual({ n: 0 });
  });

  it.each(["ab", "teakowa", "速通达人", "ow速通", "a1b2c3d4e", "九个汉字九个汉字九"])("accepts %s", async (handle) => {
    const { request } = fixture();
    await expect(request("one", handle)).resolves.toMatchObject({ pending: { handle } });
  });

});
