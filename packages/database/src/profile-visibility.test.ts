import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { createTestD1 } from "../test/d1";
import { createPlatformServices } from "./index";

const hash = (value: unknown) => createHash("sha256").update(JSON.stringify(value)).digest("hex");

const createD1 = () => {
  const testD1 = createTestD1({ batchStatementMethod: "run" });
  testD1.sqlite.exec(`
    CREATE TABLE player_accounts (id TEXT PRIMARY KEY, player_id TEXT NOT NULL, player_name TEXT NOT NULL, normalized_player_name TEXT NOT NULL, is_admin INTEGER NOT NULL DEFAULT 0, status TEXT NOT NULL, public_profile INTEGER NOT NULL DEFAULT 1, hide_battletag INTEGER NOT NULL DEFAULT 0, banned_at INTEGER, banned_by TEXT, ban_reason TEXT, leaderboard_key TEXT, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL);
    CREATE TABLE portal_sessions (id TEXT PRIMARY KEY, player_account_id TEXT NOT NULL, token_hash TEXT NOT NULL, expires_at INTEGER NOT NULL);
    CREATE TABLE submissions (id TEXT PRIMARY KEY, player_account_id TEXT NOT NULL, status TEXT NOT NULL, map_name TEXT, challenge_id TEXT, difficulty TEXT, review_reason TEXT, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL);
    CREATE TABLE idempotency_keys (id TEXT PRIMARY KEY, actor_id TEXT NOT NULL, operation TEXT NOT NULL, request_hash TEXT NOT NULL, response_json TEXT NOT NULL, created_at INTEGER NOT NULL);
    CREATE TABLE audit_events (id TEXT PRIMARY KEY, correlation_id TEXT NOT NULL, actor_type TEXT NOT NULL, actor_id TEXT NOT NULL, operation TEXT NOT NULL, entity_type TEXT NOT NULL, entity_id TEXT NOT NULL, payload_json TEXT NOT NULL, created_at INTEGER NOT NULL);
  `);
  return testD1;
};

describe("player profile visibility", () => {
  it("defaults to public, persists the owner update, audits it, and replays idempotently", async () => {
    const { sqlite, database } = createD1();
    const now = Date.now();
    sqlite.prepare("INSERT INTO player_accounts (id, player_id, player_name, normalized_player_name, is_admin, status, created_at, updated_at) VALUES ('player.one', '1234', 'Player', 'player', 0, 'active', ?, ?)").run(now, now);
    sqlite.prepare("INSERT INTO portal_sessions VALUES ('session.one', 'player.one', ?, ?)").run(hash("token.one"), now + 60_000);
    const services = createPlatformServices(database);

    await expect(services.getCurrentPlayer({ sessionToken: "token.one" })).resolves.toMatchObject({ player: { publicProfile: true } });
    await expect(services.updateCurrentPlayerProfileVisibility({ sessionToken: "token.one", publicProfile: false, hideBattleTag: false }, "off")).resolves.toEqual({ contractVersion: "1", publicProfile: false, hideBattleTag: false });
    expect(sqlite.prepare("SELECT public_profile FROM player_accounts WHERE id = 'player.one'").get()).toEqual({ public_profile: 0 });
    await expect(services.getCurrentPlayer({ sessionToken: "token.one" })).resolves.toMatchObject({ player: { publicProfile: false } });
    await expect(services.updateCurrentPlayerProfileVisibility({ sessionToken: "token.one", publicProfile: false, hideBattleTag: false }, "off")).resolves.toEqual({ contractVersion: "1", publicProfile: false, hideBattleTag: false });
    expect(sqlite.prepare("SELECT COUNT(*) AS count FROM audit_events WHERE operation = 'player.profile.visibility.update'").get()).toEqual({ count: 1 });
    await expect(services.updateCurrentPlayerProfileVisibility({ sessionToken: "token.one", publicProfile: true, hideBattleTag: false }, "off")).rejects.toThrow("IDEMPOTENCY_CONFLICT");
    await expect(services.updateCurrentPlayerProfileVisibility({ sessionToken: "token.one", publicProfile: true, hideBattleTag: false }, "on")).resolves.toEqual({ contractVersion: "1", publicProfile: true, hideBattleTag: false });
    expect(sqlite.prepare("SELECT public_profile FROM player_accounts WHERE id = 'player.one'").get()).toEqual({ public_profile: 1 });
    await expect(services.updateCurrentPlayerProfileVisibility({ sessionToken: "token.missing", publicProfile: false, hideBattleTag: false }, "nobody")).rejects.toThrow("UNAUTHENTICATED");
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
    await expect(services.updateCurrentPlayerProfileVisibility({ sessionToken: "token.player.banned", publicProfile: false, hideBattleTag: false }, "banned-off")).rejects.toThrow("UNAUTHENTICATED");
    await expect(services.updateCurrentPlayerProfileVisibility({ sessionToken: "token.player.one", publicProfile: false, hideBattleTag: false }, "self-off")).resolves.toEqual({ contractVersion: "1", publicProfile: false, hideBattleTag: false });
    expect(sqlite.prepare("SELECT public_profile FROM player_accounts WHERE id = 'player.banned'").get()).toEqual({ public_profile: 1 });
    expect(sqlite.prepare("SELECT public_profile FROM player_accounts WHERE id = 'player.one'").get()).toEqual({ public_profile: 0 });
  });

  it("persists the BattleTag-hiding flag and keeps it visible to the owner", async () => {
    const { sqlite, database } = createD1();
    const now = Date.now();
    sqlite.prepare("INSERT INTO player_accounts (id, player_id, player_name, normalized_player_name, is_admin, status, created_at, updated_at) VALUES ('player.one', '1234', 'Player', 'player', 0, 'active', ?, ?)").run(now, now);
    sqlite.prepare("INSERT INTO portal_sessions VALUES ('session.one', 'player.one', ?, ?)").run(hash("token.one"), now + 60_000);
    const services = createPlatformServices(database);

    await expect(services.getCurrentPlayer({ sessionToken: "token.one" })).resolves.toMatchObject({ player: { hideBattleTag: false } });
    await expect(services.updateCurrentPlayerProfileVisibility({ sessionToken: "token.one", publicProfile: true, hideBattleTag: true }, "hide")).resolves.toEqual({ contractVersion: "1", publicProfile: true, hideBattleTag: true });
    expect(sqlite.prepare("SELECT public_profile, hide_battletag FROM player_accounts WHERE id = 'player.one'").get()).toEqual({ public_profile: 1, hide_battletag: 1 });
    await expect(services.getCurrentPlayer({ sessionToken: "token.one" })).resolves.toMatchObject({ player: { playerName: "Player", playerId: "1234", hideBattleTag: true } });
  });
});
