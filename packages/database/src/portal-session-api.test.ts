import { afterEach, describe, expect, it } from "vitest";
import { createPlatformServices } from "./index";
import { createD1, installSchema } from "./ocr-test-harness";
import { hashRequest } from "./portal-session";
import { createApp, type RuntimeEnv } from "../../../apps/api/src/app";

const databases: Array<ReturnType<typeof createD1>["sqlite"]> = [];
afterEach(() => { for (const db of databases.splice(0)) db.close(); });

const setup = async () => {
  const { sqlite, database } = createD1();
  databases.push(sqlite);
  installSchema(sqlite);
  const timestamp = Date.now();
  for (const [id, admin] of [["admin", 1], ["player", 0]] as const) {
    sqlite.prepare("INSERT INTO player_accounts (id, player_id, player_name, normalized_player_name, is_admin, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)")
      .run(id, id, id, id, admin, timestamp, timestamp);
    sqlite.prepare("INSERT INTO portal_sessions (id, player_account_id, token_hash, expires_at, created_at) VALUES (?, ?, ?, ?, ?)")
      .run(id, id, await hashRequest(id), timestamp + 60_000, timestamp);
    sqlite.prepare("INSERT INTO submissions (id, player_account_id, status, challenge_type, map_name, source_provider, source_conversation_id, source_message_id, created_at, updated_at) VALUES (?, ?, 'ocr_pending', 'custom', 'Test Map', 'portal', 'fixture', ?, ?, ?)")
      .run(`submission.${id}`, id, id, timestamp, timestamp);
  }
  const queries: string[] = [];
  const prepare = database.prepare.bind(database);
  database.prepare = (sql) => {
    const statement = prepare(sql);
    for (const method of ["first", "all", "run", "raw"] as const) {
      const execute = statement[method].bind(statement);
      Object.defineProperty(statement, method, { value: (...args: unknown[]) => {
        queries.push(sql);
        return Reflect.apply(execute, statement, args);
      } });
    }
    return statement;
  };
  const app = createApp({ authenticate: async () => null, services: () => createPlatformServices(database) });
  const request = (path: string, token?: string) => app.request(`http://localhost${path}`, {
    headers: token ? { cookie: `owb_session=${token}` } : {},
  }, {} as RuntimeEnv);
  return { sqlite, queries, request };
};

const expectNoProfileReads = (queries: string[]) => {
  expect(queries.filter((sql) => /\b(?:submissions|submission_outcomes)\b/i.test(sql))).toEqual([]);
};

describe("Portal API session authentication", () => {
  it("keeps administrator and player authentication free of submission projections", async () => {
    const { request, queries } = await setup();
    const admin = await request("/v1/admin/map-title-rules", "admin");
    expect(admin.status).toBe(200);
    expect(admin.headers.get("cache-control")).toBe("private, no-store");
    expectNoProfileReads(queries);
    queries.length = 0;
    const player = await request("/v1/me/mastery", "player");
    expect(player.status).toBe(200);
    expect(player.headers.get("cache-control")).toBe("private, no-store");
    expectNoProfileReads(queries);
    queries.length = 0;
    expect((await request("/v1/admin/qq/groups", "admin")).status).toBe(200);
    expectNoProfileReads(queries);
  });

  it("preserves full current-player data and submission ownership", async () => {
    const { request } = await setup();
    const me = await request("/v1/me", "player");
    expect(me.status).toBe(200);
    expect(me.headers.get("cache-control")).toBe("private, no-store");
    expect(await me.json()).toEqual({ contractVersion: "1", player: { playerId: "player", playerName: "player", isAdmin: false }, recentSubmissions: [
      { submissionId: "submission.player", status: "processing", resubmissionRequired: false, mapName: "Test Map", createdAt: expect.any(Number), updatedAt: expect.any(Number) },
    ] });
    expect((await request("/v1/me/submissions/submission.admin", "player")).status).toBe(404);
    expect((await request("/v1/me/submissions/submission.player", "player")).status).toBe(200);
  });

  it("rejects missing, invalid, expired, deleted and banned sessions", async () => {
    const { request, sqlite } = await setup();
    for (const path of ["/v1/admin/map-title-rules", "/v1/me/mastery"]) {
      expect((await request(path)).status).toBe(401);
      expect((await request(path, "wrong")).status).toBe(401);
    }
    sqlite.prepare("UPDATE portal_sessions SET expires_at = 0 WHERE id = 'admin'").run();
    expect((await request("/v1/admin/map-title-rules", "admin")).status).toBe(401);
    sqlite.prepare("UPDATE player_accounts SET status = 'banned' WHERE id = 'player'").run();
    expect((await request("/v1/me/mastery", "player")).status).toBe(401);
    expect((await request("/v1/admin/map-title-rules", "player")).status).toBe(401);
    sqlite.prepare("DELETE FROM portal_sessions WHERE id = 'player'").run();
    sqlite.prepare("UPDATE player_accounts SET status = 'active' WHERE id = 'player'").run();
    expect((await request("/v1/me/mastery", "player")).status).toBe(401);
  });

  it("observes role, ban and session changes on the next request without sharing users", async () => {
    const { request, sqlite } = await setup();
    expect((await request("/v1/admin/map-title-rules", "admin")).status).toBe(200);
    expect((await request("/v1/admin/map-title-rules", "player")).status).toBe(403);
    sqlite.prepare("UPDATE player_accounts SET is_admin = 0 WHERE id = 'admin'").run();
    expect((await request("/v1/admin/map-title-rules", "admin")).status).toBe(403);
    sqlite.prepare("UPDATE player_accounts SET is_admin = 1 WHERE id = 'player'").run();
    expect((await request("/v1/admin/map-title-rules", "player")).status).toBe(200);
    expect((await request("/v1/me/mastery", "player")).status).toBe(200);
    sqlite.prepare("UPDATE player_accounts SET status = 'banned' WHERE id = 'player'").run();
    expect((await request("/v1/me/mastery", "player")).status).toBe(401);
    expect((await request("/v1/me/mastery", "admin")).status).toBe(200);
    sqlite.prepare("DELETE FROM portal_sessions WHERE id = 'admin'").run();
    expect((await request("/v1/me/mastery", "admin")).status).toBe(401);
  });
});
