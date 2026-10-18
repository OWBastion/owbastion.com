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
    CREATE TABLE player_accounts (id TEXT PRIMARY KEY, player_id TEXT NOT NULL, player_name TEXT NOT NULL, normalized_player_name TEXT NOT NULL, is_admin INTEGER NOT NULL DEFAULT 0, status TEXT NOT NULL DEFAULT 'active', public_profile INTEGER NOT NULL DEFAULT 1, banned_at INTEGER, banned_by TEXT, ban_reason TEXT, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL);
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

  it("replaces an earlier pending request and lets the Player withdraw it", async () => {
    const { request, state, services, sqlite, count } = fixture();
    await request("one", "first1");
    await request("one", "second");
    await expect(state("one")).resolves.toMatchObject({ pending: { handle: "second" } });
    expect(sqlite.prepare("SELECT COUNT(*) AS n FROM player_handles").get()).toEqual({ n: 1 });
    // The replaced handle is free again.
    await expect(request("two", "first1")).resolves.toMatchObject({ pending: { handle: "first1" } });
    await expect(services.withdrawCurrentPlayerHandleRequest({ sessionToken: "token.one" }, "w1")).resolves.toMatchObject({ pending: null, handle: null });
    await expect(services.withdrawCurrentPlayerHandleRequest({ sessionToken: "token.one" }, "w1")).resolves.toMatchObject({ pending: null });
    await expect(services.withdrawCurrentPlayerHandleRequest({ sessionToken: "token.one" }, "w2")).rejects.toThrow("HANDLE_REQUEST_NOT_FOUND");
    expect(count("player.handle.withdraw")).toBe(1);
    await expect(request("three", "second")).resolves.toMatchObject({ pending: { handle: "second" } });
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

  it("releases the previous handle immediately when a change is approved", async () => {
    const { request, state, approve, services, sqlite } = fixture();
    await request("one", "oldone"); await approve("one");
    await request("one", "newone");
    await expect(state("one")).resolves.toMatchObject({ handle: "oldone", pending: { handle: "newone" } });
    await approve("one");
    await expect(state("one")).resolves.toMatchObject({ handle: "newone", pending: null });
    expect(sqlite.prepare("SELECT handle FROM player_handles WHERE status = 'active'").all()).toEqual([{ handle: "newone" }]);
    await expect(request("two", "oldone")).resolves.toMatchObject({ pending: { handle: "oldone" } });
    await expect(request("one", "newone", "again-1")).rejects.toThrow("HANDLE_UNCHANGED");
    await expect(services.listAdminPlayerHandles({ status: "pending", page: 1, pageSize: 10 }, admin)).resolves.toMatchObject({ total: 1, items: [{ handle: "oldone", currentHandle: null, playerName: "Player two" }] });
  });

  it("lists pending requests with the current handle and active handles for clearing", async () => {
    const { request, approve, services } = fixture();
    await request("one", "first1"); await approve("one");
    await request("one", "second"); await request("two", "other1");
    const pending = await services.listAdminPlayerHandles({ status: "pending", page: 1, pageSize: 1 }, admin);
    expect(pending).toMatchObject({ status: "pending", total: 2, hasMore: true, items: [{ handle: "second", currentHandle: "first1", playerAccountId: "one" }] });
    await expect(services.listAdminPlayerHandles({ status: "active", page: 1, pageSize: 10 }, admin)).resolves.toMatchObject({ total: 1, items: [{ handle: "first1", currentHandle: null, playerName: "Player one" }] });
  });

  it("lets a maintainer clear an active handle, after which the Player may request again", async () => {
    const { request, state, approve, services, count } = fixture();
    await request("one", "badone"); await approve("one");
    await services.clearAdminPlayerHandle({ playerAccountId: "one" }, admin, "clear-1");
    await services.clearAdminPlayerHandle({ playerAccountId: "one" }, admin, "clear-1");
    await expect(services.clearAdminPlayerHandle({ playerAccountId: "one" }, admin, "clear-2")).rejects.toThrow("HANDLE_NOT_FOUND");
    expect(count("admin.player.handle.clear")).toBe(1);
    await expect(state("one")).resolves.toMatchObject({ handle: null });
    await expect(request("one", "goodone")).resolves.toMatchObject({ pending: { handle: "goodone" } });
  });

  it("makes decisions idempotent and rejects decisions on requests that are no longer pending", async () => {
    const { request, services, pendingId, count } = fixture();
    await request("one", "decided");
    const requestId = await pendingId("one");
    await services.approveAdminPlayerHandleRequest({ handleId: requestId }, admin, "a1");
    await services.approveAdminPlayerHandleRequest({ handleId: requestId }, admin, "a1");
    expect(count("admin.player.handle.approve")).toBe(1);
    await expect(services.approveAdminPlayerHandleRequest({ handleId: requestId }, admin, "a2")).rejects.toThrow("HANDLE_REQUEST_NOT_FOUND");
    await expect(services.rejectAdminPlayerHandleRequest({ handleId: requestId }, admin, "r1")).rejects.toThrow("HANDLE_REQUEST_NOT_FOUND");
    await expect(services.approveAdminPlayerHandleRequest({ handleId: "missing" }, admin, "a3")).rejects.toThrow("HANDLE_REQUEST_NOT_FOUND");
  });

  it("replays identical requests and flags a reused key with different input", async () => {
    const { request, count } = fixture();
    const first = await request("one", "sparky", "key-1");
    await expect(request("one", "sparky", "key-1")).resolves.toEqual(first);
    expect(count("player.handle.request")).toBe(1);
    await expect(request("one", "other22", "key-1")).rejects.toThrow("IDEMPOTENCY_CONFLICT");
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

  it("requires a signed-in Player for the Player endpoints", async () => {
    const { services, sqlite } = fixture();
    sqlite.prepare("UPDATE player_accounts SET status = 'banned' WHERE id = 'three'").run();
    await expect(services.getCurrentPlayerHandle({ sessionToken: "token.nobody" })).resolves.toBeNull();
    await expect(services.requestCurrentPlayerHandle({ sessionToken: "token.nobody", handle: "valid1" }, "k")).rejects.toThrow("UNAUTHENTICATED");
    await expect(services.requestCurrentPlayerHandle({ sessionToken: "token.three", handle: "valid1" }, "k")).rejects.toThrow("UNAUTHENTICATED");
    await expect(services.withdrawCurrentPlayerHandleRequest({ sessionToken: "token.nobody" }, "k")).rejects.toThrow("UNAUTHENTICATED");
  });
});
