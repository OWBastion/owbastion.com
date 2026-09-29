import {
  playerAccountsSchema,
} from "../test/schema";
import { createTestD1 } from "../test/d1";
import { DatabaseSync } from "node:sqlite";
import { describe, expect, it } from "vitest";
import { createPlatformServices } from "./index";
import { hashRequest, resolvePortalSession } from "./portal-session";

const createCountingD1 = () => createTestD1({ foreignKeys: true, countStatements: true, execReturnsD1Result: true });
const installSessionSchema = (sqlite: DatabaseSync) => {
  sqlite.exec(`
    ${playerAccountsSchema}
    CREATE TABLE portal_sessions (
      id TEXT PRIMARY KEY NOT NULL,
      player_account_id TEXT NOT NULL REFERENCES player_accounts(id),
      token_hash TEXT NOT NULL,
      passkey_challenge_id TEXT,
      expires_at INTEGER NOT NULL,
      created_at INTEGER NOT NULL
    );
    CREATE TABLE submissions (
      id TEXT PRIMARY KEY NOT NULL,
      player_account_id TEXT NOT NULL REFERENCES player_accounts(id),
      status TEXT NOT NULL,
      map_name TEXT NOT NULL,
      challenge_id TEXT,
      difficulty TEXT,
      review_reason TEXT,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );
    CREATE TABLE submission_outcomes (
      submission_id TEXT PRIMARY KEY NOT NULL,
      status TEXT NOT NULL,
      awarded_xp INTEGER NOT NULL DEFAULT 0,
      awarded_at INTEGER NOT NULL,
      invalidation_reason TEXT,
      rule_version TEXT NOT NULL
    );
  `);
};

describe("Portal session query budget and resolution semantics", () => {
  const setupFixture = async () => {
    const { database, sqlite, resetCount, getCount } = createCountingD1();
    installSessionSchema(sqlite);

    const timestamp = Date.now();
    const futureExpiry = timestamp + 24 * 60 * 60 * 1000;
    const pastExpiry = timestamp - 1000;

    // Portal sessions resolve directly to their stable Player Account.
    sqlite.prepare("INSERT INTO player_accounts (id, player_id, player_name, normalized_player_name, is_admin, status, created_at, updated_at) VALUES ('player.regular', '1001', 'RegularPlayer', 'regularplayer', 0, 'active', ?, ?)").run(timestamp, timestamp);
    sqlite.prepare("INSERT INTO portal_sessions (id, player_account_id, token_hash, expires_at, created_at) VALUES ('session.regular', 'player.regular', ?, ?, ?)").run(await hashRequest("token.regular"), futureExpiry, timestamp);

    // 2. Admin active player
    sqlite.prepare("INSERT INTO player_accounts (id, player_id, player_name, normalized_player_name, is_admin, status, created_at, updated_at) VALUES ('player.admin', '1002', 'AdminPlayer', 'adminplayer', 1, 'active', ?, ?)").run(timestamp, timestamp);
    sqlite.prepare("INSERT INTO portal_sessions (id, player_account_id, token_hash, expires_at, created_at) VALUES ('session.admin', 'player.admin', ?, ?, ?)").run(await hashRequest("token.admin"), futureExpiry, timestamp);

    // 3. Expired session (regular player)
    sqlite.prepare("INSERT INTO portal_sessions (id, player_account_id, token_hash, expires_at, created_at) VALUES ('session.expired', 'player.regular', ?, ?, ?)").run(await hashRequest("token.expired"), pastExpiry, timestamp);

    // 4. Player without any QQ binding retains a valid Portal session.
    sqlite.prepare("INSERT INTO player_accounts (id, player_id, player_name, normalized_player_name, is_admin, status, created_at, updated_at) VALUES ('player.revoked', '1003', 'RevokedPlayer', 'revokedplayer', 0, 'active', ?, ?)").run(timestamp, timestamp);
    sqlite.prepare("INSERT INTO portal_sessions (id, player_account_id, token_hash, expires_at, created_at) VALUES ('session.unbound', 'player.revoked', ?, ?, ?)").run(await hashRequest("token.unbound"), futureExpiry, timestamp);

    // 5. Banned player
    sqlite.prepare("INSERT INTO player_accounts (id, player_id, player_name, normalized_player_name, is_admin, status, banned_at, banned_by, ban_reason, created_at, updated_at) VALUES ('player.banned', '1004', 'BannedPlayer', 'bannedplayer', 0, 'banned', ?, 'admin', 'cheating', ?, ?)").run(timestamp, timestamp, timestamp);
    sqlite.prepare("INSERT INTO portal_sessions (id, player_account_id, token_hash, expires_at, created_at) VALUES ('session.banned', 'player.banned', ?, ?, ?)").run(await hashRequest("token.banned"), futureExpiry, timestamp);

    // 6. Another unbound Player Account also resolves without a channel binding.
    sqlite.prepare("INSERT INTO player_accounts (id, player_id, player_name, normalized_player_name, is_admin, status, created_at, updated_at) VALUES ('player.other', '1005', 'OtherProviderPlayer', 'otherproviderplayer', 0, 'active', ?, ?)").run(timestamp, timestamp);
    sqlite.prepare("INSERT INTO portal_sessions (id, player_account_id, token_hash, expires_at, created_at) VALUES ('session.other', 'player.other', ?, ?, ?)").run(await hashRequest("token.other"), futureExpiry, timestamp);

    const services = createPlatformServices(database);
    resetCount();

    return { services, database, sqlite, resetCount, getCount };
  };

  it("resolves portal session in exactly one statement", async () => {
    const { database, resetCount, getCount } = await setupFixture();

    resetCount();
    const resolved = await resolvePortalSession(database, "token.regular");
    expect(getCount()).toBe(1);
    expect(resolved).not.toBeNull();
    expect(resolved?.player.playerId).toBe("1001");
    expect(resolved?.player.playerName).toBe("RegularPlayer");
    expect(resolved?.player.isAdmin).toBe(0);

    resetCount();
    const adminResolved = await resolvePortalSession(database, "token.admin");
    expect(getCount()).toBe(1);
    expect(adminResolved).not.toBeNull();
    expect(adminResolved?.player.playerId).toBe("1002");
    expect(adminResolved?.player.isAdmin).toBe(1);
  });

  it("handles unauthenticated and invalid sessions in exactly one statement", async () => {
    const { database, resetCount, getCount } = await setupFixture();

    // Unknown token
    resetCount();
    const unknown = await resolvePortalSession(database, "token.unknown");
    expect(getCount()).toBe(1);
    expect(unknown).toBeNull();

    // Expired session
    resetCount();
    const expired = await resolvePortalSession(database, "token.expired");
    expect(getCount()).toBe(1);
    expect(expired).toBeNull();

    // Unbinding QQ cannot revoke Portal access.
    resetCount();
    const unbound = await resolvePortalSession(database, "token.unbound");
    expect(getCount()).toBe(1);
    expect(unbound?.player.playerId).toBe("1003");

    // A player account without QQ can authenticate directly.
    resetCount();
    const other = await resolvePortalSession(database, "token.other");
    expect(getCount()).toBe(1);
    expect(other?.player.playerId).toBe("1005");

    // Banned player
    resetCount();
    const banned = await resolvePortalSession(database, "token.banned");
    expect(getCount()).toBe(1);
    expect(banned).toBeNull();
  });

  it("services.getCurrentPlayer terminates early in 1 statement on unauthenticated/banned sessions", async () => {
    const { services, resetCount, getCount } = await setupFixture();

    resetCount();
    const unknown = await services.getCurrentPlayer({ sessionToken: "token.unknown" });
    expect(getCount()).toBe(1);
    expect(unknown).toBeNull();

    resetCount();
    const expired = await services.getCurrentPlayer({ sessionToken: "token.expired" });
    expect(getCount()).toBe(1);
    expect(expired).toBeNull();

    resetCount();
    const banned = await services.getCurrentPlayer({ sessionToken: "token.banned" });
    expect(getCount()).toBe(1);
    expect(banned).toBeNull();

    resetCount();
    const unbound = await services.getCurrentPlayer({ sessionToken: "token.unbound" });
    expect(getCount()).toBe(2);
    expect(unbound?.player.playerId).toBe("1003");
  });

  it("correctly differentiates admin vs non-admin player via services.getCurrentPlayer", async () => {
    const { services, resetCount, getCount } = await setupFixture();

    resetCount();
    const regular = await services.getCurrentPlayer({ sessionToken: "token.regular" });
    // 1 statement for session resolution + 1 statement for recent submissions = 2
    expect(getCount()).toBe(2);
    expect(regular).not.toBeNull();
    expect(regular?.player.isAdmin).toBe(false);
    expect(regular?.player.playerId).toBe("1001");

    resetCount();
    const admin = await services.getCurrentPlayer({ sessionToken: "token.admin" });
    expect(getCount()).toBe(2);
    expect(admin).not.toBeNull();
    expect(admin?.player.isAdmin).toBe(true);
    expect(admin?.player.playerId).toBe("1002");
  });

  it("denies player request immediately when player is banned (no caching)", async () => {
    const { services, sqlite } = await setupFixture();

    const before = await services.getCurrentPlayer({ sessionToken: "token.regular" });
    expect(before).not.toBeNull();

    // Ban the player
    sqlite.prepare("UPDATE player_accounts SET status = 'banned' WHERE id = 'player.regular'").run();

    // Very next request must be denied
    const after = await services.getCurrentPlayer({ sessionToken: "token.regular" });
    expect(after).toBeNull();
  });

  it("allows a Player Account without a QQ binding to keep using the Portal", async () => {
    const { services, sqlite } = await setupFixture();

    expect(sqlite.prepare("SELECT COUNT(*) AS count FROM sqlite_master WHERE type = 'table' AND name = 'bindings'").get()).toEqual({ count: 0 });
    expect((await services.getCurrentPlayer({ sessionToken: "token.regular" }))?.player.playerId).toBe("1001");
  });

  it("denies player request immediately when session expires or is deleted (no caching)", async () => {
    const { services, sqlite } = await setupFixture();

    const before = await services.getCurrentPlayer({ sessionToken: "token.regular" });
    expect(before).not.toBeNull();

    // Expire session
    sqlite.prepare("UPDATE portal_sessions SET expires_at = 0 WHERE id = 'session.regular'").run();

    // Very next request must be denied
    const after = await services.getCurrentPlayer({ sessionToken: "token.regular" });
    expect(after).toBeNull();

    // Restore expiry, verify success, then delete session
    sqlite.prepare("UPDATE portal_sessions SET expires_at = ? WHERE id = 'session.regular'").run(Date.now() + 100_000);
    expect(await services.getCurrentPlayer({ sessionToken: "token.regular" })).not.toBeNull();

    sqlite.prepare("DELETE FROM portal_sessions WHERE id = 'session.regular'").run();
    expect(await services.getCurrentPlayer({ sessionToken: "token.regular" })).toBeNull();
  });
});
