import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { createTestD1 } from "../test/d1";
import { createPlatformServices } from "./index";

const hash = (value: unknown) => createHash("sha256").update(JSON.stringify(value)).digest("hex");

const createD1 = () => {
  const testD1 = createTestD1({ batchStatementMethod: "run" });
  testD1.sqlite.exec(`
    CREATE TABLE player_accounts (id TEXT PRIMARY KEY, player_id TEXT NOT NULL, player_name TEXT NOT NULL, normalized_player_name TEXT NOT NULL, is_admin INTEGER NOT NULL DEFAULT 0, status TEXT NOT NULL, public_profile INTEGER NOT NULL DEFAULT 1, public_handle TEXT, banned_at INTEGER, banned_by TEXT, ban_reason TEXT, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL);
    CREATE TABLE portal_sessions (id TEXT PRIMARY KEY, player_account_id TEXT NOT NULL, token_hash TEXT NOT NULL, expires_at INTEGER NOT NULL);
    CREATE TABLE submissions (id TEXT PRIMARY KEY, player_account_id TEXT NOT NULL, status TEXT NOT NULL, map_name TEXT, challenge_id TEXT, difficulty TEXT, review_reason TEXT, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL);
    CREATE TABLE idempotency_keys (id TEXT PRIMARY KEY, actor_id TEXT NOT NULL, operation TEXT NOT NULL, request_hash TEXT NOT NULL, response_json TEXT NOT NULL, created_at INTEGER NOT NULL);
    CREATE TABLE audit_events (id TEXT PRIMARY KEY, correlation_id TEXT NOT NULL, actor_type TEXT NOT NULL, actor_id TEXT NOT NULL, operation TEXT NOT NULL, entity_type TEXT NOT NULL, entity_id TEXT NOT NULL, payload_json TEXT NOT NULL, created_at INTEGER NOT NULL);
  `);
  return testD1;
};

describe("player profile visibility", () => {
  it("validates, normalizes public handles at the contract boundary, enforces unique ownership and protects private profiles", async () => {
    const { sqlite, database } = createD1();
    sqlite.exec("CREATE UNIQUE INDEX player_accounts_public_handle_idx ON player_accounts(public_handle)");
    const now = Date.now();
    for (const id of ["p1", "p2", "banned"]) {
      sqlite.prepare("INSERT INTO player_accounts (id, player_id, player_name, normalized_player_name, is_admin, status, created_at, updated_at) VALUES (?, ?, ?, ?, 0, ?, ?, ?)").run(id, id, id, id, id === "banned" ? "banned" : "active", now, now);
      sqlite.prepare("INSERT INTO portal_sessions VALUES (?, ?, ?, ?)").run(`session.${id}`, id, hash(`token.${id}`), now + 60_000);
    }
    const services = createPlatformServices(database);
    await expect(services.updateCurrentPlayerPublicHandle({ sessionToken: "token.p1", publicHandle: "teakowa" }, "set")).resolves.toEqual({ contractVersion: "1", publicHandle: "teakowa" });
    await expect(services.updateCurrentPlayerPublicHandle({ sessionToken: "token.p1", publicHandle: "teakowa" }, "set")).resolves.toEqual({ contractVersion: "1", publicHandle: "teakowa" });
    await expect(services.updateCurrentPlayerPublicHandle({ sessionToken: "token.p1", publicHandle: "different" }, "set")).rejects.toThrow("IDEMPOTENCY_CONFLICT");
    await expect(services.updateCurrentPlayerPublicHandle({ sessionToken: "token.p2", publicHandle: "teakowa" }, "claim")).rejects.toThrow("PUBLIC_HANDLE_TAKEN");
    await expect(services.updateCurrentPlayerPublicHandle({ sessionToken: "token.p2", publicHandle: "UPPERCASE" }, "invalid")).rejects.toThrow("INVALID_PUBLIC_HANDLE");
    await expect(services.updateCurrentPlayerPublicHandle({ sessionToken: "token.banned", publicHandle: "banned" }, "banned")).rejects.toThrow("UNAUTHENTICATED");
    expect((await services.getCurrentPlayer({ sessionToken: "token.p1" }))?.player.publicHandle).toBe("teakowa");
    expect(sqlite.prepare("SELECT COUNT(*) AS count FROM audit_events WHERE operation = 'player.profile.handle.update'").get()).toEqual({ count: 1 });
    await expect(services.updateCurrentPlayerPublicHandle({ sessionToken: "token.p1", publicHandle: "new-name" }, "rename")).resolves.toMatchObject({ publicHandle: "new-name" });
    expect(sqlite.prepare("SELECT public_handle FROM player_accounts WHERE id = 'p1'").get()).toEqual({ public_handle: "new-name" });
    await expect(services.updateCurrentPlayerPublicHandle({ sessionToken: "token.p2", publicHandle: "teakowa" }, "released")).resolves.toMatchObject({ publicHandle: "teakowa" });
    expect(sqlite.prepare("SELECT COUNT(*) AS count FROM audit_events WHERE operation = 'player.profile.handle.update'").get()).toEqual({ count: 3 });
  });
  it("defaults to public, persists the owner update, audits it, and replays idempotently", async () => {
    const { sqlite, database } = createD1();
    const now = Date.now();
    sqlite.prepare("INSERT INTO player_accounts (id, player_id, player_name, normalized_player_name, is_admin, status, created_at, updated_at) VALUES ('player.one', '1234', 'Player', 'player', 0, 'active', ?, ?)").run(now, now);
    sqlite.prepare("INSERT INTO portal_sessions VALUES ('session.one', 'player.one', ?, ?)").run(hash("token.one"), now + 60_000);
    const services = createPlatformServices(database);

    await expect(services.getCurrentPlayer({ sessionToken: "token.one" })).resolves.toMatchObject({ player: { publicProfile: true } });
    await expect(services.updateCurrentPlayerProfileVisibility({ sessionToken: "token.one", publicProfile: false }, "off")).resolves.toEqual({ contractVersion: "1", publicProfile: false });
    expect(sqlite.prepare("SELECT public_profile FROM player_accounts WHERE id = 'player.one'").get()).toEqual({ public_profile: 0 });
    await expect(services.getCurrentPlayer({ sessionToken: "token.one" })).resolves.toMatchObject({ player: { publicProfile: false } });
    await expect(services.updateCurrentPlayerProfileVisibility({ sessionToken: "token.one", publicProfile: false }, "off")).resolves.toEqual({ contractVersion: "1", publicProfile: false });
    expect(sqlite.prepare("SELECT COUNT(*) AS count FROM audit_events WHERE operation = 'player.profile.visibility.update'").get()).toEqual({ count: 1 });
    await expect(services.updateCurrentPlayerProfileVisibility({ sessionToken: "token.one", publicProfile: true }, "off")).rejects.toThrow("IDEMPOTENCY_CONFLICT");
    await expect(services.updateCurrentPlayerProfileVisibility({ sessionToken: "token.one", publicProfile: true }, "on")).resolves.toEqual({ contractVersion: "1", publicProfile: true });
    expect(sqlite.prepare("SELECT public_profile FROM player_accounts WHERE id = 'player.one'").get()).toEqual({ public_profile: 1 });
    await expect(services.updateCurrentPlayerProfileVisibility({ sessionToken: "token.missing", publicProfile: false }, "nobody")).rejects.toThrow("UNAUTHENTICATED");
    expect(sqlite.prepare("SELECT COUNT(*) AS count FROM audit_events").get()).toEqual({ count: 2 });
    const audit = sqlite.prepare("SELECT actor_type, actor_id, entity_type, entity_id, payload_json FROM audit_events WHERE operation = 'player.profile.visibility.update' ORDER BY created_at").all();
    expect(audit[0]).toMatchObject({ actor_type: "user", actor_id: "player.one", entity_type: "player_accounts", entity_id: "player.one" });
  });

  it("does not resolve visibility writes for another Player's session or a banned account", async () => {
    const { sqlite, database } = createD1();
    const now = Date.now();
    for (const [id, status] of [["player.one", "active"], ["player.banned", "banned"]] as const) {
      sqlite.prepare("INSERT INTO player_accounts (id, player_id, player_name, normalized_player_name, is_admin, status, created_at, updated_at) VALUES (?, ?, ?, ?, 0, ?, ?, ?)").run(id, id, id, id, status, now, now);
      sqlite.prepare("INSERT INTO portal_sessions VALUES (?, ?, ?, ?)").run(`session.${id}`, id, hash(`token.${id}`), now + 60_000);
    }
    const services = createPlatformServices(database);
    await expect(services.updateCurrentPlayerProfileVisibility({ sessionToken: "token.player.banned", publicProfile: false }, "banned-off")).rejects.toThrow("UNAUTHENTICATED");
    await expect(services.updateCurrentPlayerProfileVisibility({ sessionToken: "token.player.one", publicProfile: false }, "self-off")).resolves.toEqual({ contractVersion: "1", publicProfile: false });
    expect(sqlite.prepare("SELECT public_profile FROM player_accounts WHERE id = 'player.banned'").get()).toEqual({ public_profile: 1 });
    expect(sqlite.prepare("SELECT public_profile FROM player_accounts WHERE id = 'player.one'").get()).toEqual({ public_profile: 0 });
  });
});
