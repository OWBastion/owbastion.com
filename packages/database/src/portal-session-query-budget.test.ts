import { DatabaseSync } from "node:sqlite";
import { describe, expect, it } from "vitest";
import { createPlatformServices, resolvePortalSession } from "./index";

/**
 * Minimal D1Database shim over node:sqlite for query-budget tests.
 * Counts statement executions (all / first / run / raw / batch items / exec).
 */
const createCountingD1 = () => {
  const sqlite = new DatabaseSync(":memory:");
  sqlite.exec("PRAGMA foreign_keys = ON;");
  let statementCount = 0;

  const wrapStatement = (sql: string) => {
    let bound: unknown[] = [];
    const statement = {
      bind(...params: unknown[]) {
        bound = params;
        return statement;
      },
      async first<T>() {
        statementCount += 1;
        const row = sqlite.prepare(sql).get(...bound) as T | undefined;
        return row ?? null;
      },
      async all<T>() {
        statementCount += 1;
        const results = sqlite.prepare(sql).all(...bound) as T[];
        return { results, success: true, meta: { changes: 0, duration: 0, size_after: 0, rows_read: results.length, rows_written: 0, last_row_id: 0, changed_db: false } };
      },
      async run() {
        statementCount += 1;
        const info = sqlite.prepare(sql).run(...bound);
        return {
          success: true,
          meta: {
            changes: Number(info.changes ?? 0),
            duration: 0,
            size_after: 0,
            rows_read: 0,
            rows_written: Number(info.changes ?? 0),
            last_row_id: Number(info.lastInsertRowid ?? 0),
            changed_db: true,
          },
        };
      },
      async raw<T extends unknown[] = unknown[]>() {
        statementCount += 1;
        const prepared = sqlite.prepare(sql);
        prepared.setReturnArrays(true);
        return prepared.all(...bound) as T[];
      },
    };
    return statement;
  };

  const database = {
    prepare(sql: string) {
      return wrapStatement(sql);
    },
    async batch(statements: Array<ReturnType<typeof wrapStatement>>) {
      const results = [];
      for (const statement of statements) {
        results.push(await statement.all());
      }
      return results;
    },
    async exec(sql: string) {
      statementCount += 1;
      sqlite.exec(sql);
      return [{ results: [], success: true, meta: { changes: 0, duration: 0, size_after: 0, rows_read: 0, rows_written: 0, last_row_id: 0, changed_db: false } }];
    },
    withSession() {
      return database;
    },
  } as unknown as D1Database;

  return {
    database,
    sqlite,
    resetCount: () => {
      statementCount = 0;
    },
    getCount: () => statementCount,
  };
};

const installSessionSchema = (sqlite: DatabaseSync) => {
  sqlite.exec(`
    CREATE TABLE identities (
      id TEXT PRIMARY KEY NOT NULL,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );
    CREATE TABLE player_accounts (
      id TEXT PRIMARY KEY NOT NULL,
      player_id TEXT NOT NULL,
      player_name TEXT NOT NULL,
      normalized_player_name TEXT NOT NULL,
      is_admin INTEGER NOT NULL DEFAULT 0,
      status TEXT NOT NULL DEFAULT 'active',
      banned_at INTEGER,
      banned_by TEXT,
      ban_reason TEXT,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );
    CREATE TABLE bindings (
      id TEXT PRIMARY KEY NOT NULL,
      identity_id TEXT NOT NULL,
      player_account_id TEXT NOT NULL REFERENCES player_accounts(id),
      provider TEXT NOT NULL,
      group_open_id TEXT NOT NULL,
      member_open_id TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'active',
      revoked_at INTEGER,
      revoked_by TEXT,
      created_at INTEGER NOT NULL
    );
    CREATE UNIQUE INDEX bindings_provider_member_idx ON bindings (provider, member_open_id);
    CREATE TABLE qq_sessions (
      id TEXT PRIMARY KEY NOT NULL,
      attempt_id TEXT NOT NULL,
      group_open_id TEXT NOT NULL,
      member_open_id TEXT NOT NULL,
      environment TEXT NOT NULL,
      token_hash TEXT NOT NULL,
      expires_at INTEGER NOT NULL,
      created_at INTEGER NOT NULL
    );
    CREATE TABLE submissions (
      id TEXT PRIMARY KEY NOT NULL,
      binding_id TEXT NOT NULL REFERENCES bindings(id),
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

const hashToken = async (token: string) => {
  const encoded = new TextEncoder().encode(JSON.stringify(token));
  const digest = await crypto.subtle.digest("SHA-256", encoded);
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
};

describe("Portal session query budget and resolution semantics", () => {
  const setupFixture = async () => {
    const { database, sqlite, resetCount, getCount } = createCountingD1();
    installSessionSchema(sqlite);

    const timestamp = Date.now();
    const futureExpiry = timestamp + 24 * 60 * 60 * 1000;
    const pastExpiry = timestamp - 1000;

    // 1. Regular active player
    sqlite.prepare("INSERT INTO identities (id, created_at, updated_at) VALUES ('id.regular', ?, ?)").run(timestamp, timestamp);
    sqlite.prepare("INSERT INTO player_accounts (id, player_id, player_name, normalized_player_name, is_admin, status, created_at, updated_at) VALUES ('player.regular', '1001', 'RegularPlayer', 'regularplayer', 0, 'active', ?, ?)").run(timestamp, timestamp);
    sqlite.prepare("INSERT INTO bindings (id, identity_id, player_account_id, provider, group_open_id, member_open_id, status, created_at) VALUES ('binding.regular', 'id.regular', 'player.regular', 'qq', 'group.1', 'member.regular', 'active', ?)").run(timestamp);
    sqlite.prepare("INSERT INTO qq_sessions (id, attempt_id, group_open_id, member_open_id, environment, token_hash, expires_at, created_at) VALUES ('session.regular', 'attempt.1', 'group.1', 'member.regular', 'production', ?, ?, ?)").run(await hashToken("token.regular"), futureExpiry, timestamp);

    // 2. Admin active player
    sqlite.prepare("INSERT INTO identities (id, created_at, updated_at) VALUES ('id.admin', ?, ?)").run(timestamp, timestamp);
    sqlite.prepare("INSERT INTO player_accounts (id, player_id, player_name, normalized_player_name, is_admin, status, created_at, updated_at) VALUES ('player.admin', '1002', 'AdminPlayer', 'adminplayer', 1, 'active', ?, ?)").run(timestamp, timestamp);
    sqlite.prepare("INSERT INTO bindings (id, identity_id, player_account_id, provider, group_open_id, member_open_id, status, created_at) VALUES ('binding.admin', 'id.admin', 'player.admin', 'qq', 'group.1', 'member.admin', 'active', ?)").run(timestamp);
    sqlite.prepare("INSERT INTO qq_sessions (id, attempt_id, group_open_id, member_open_id, environment, token_hash, expires_at, created_at) VALUES ('session.admin', 'attempt.2', 'group.1', 'member.admin', 'production', ?, ?, ?)").run(await hashToken("token.admin"), futureExpiry, timestamp);

    // 3. Expired session (regular player)
    sqlite.prepare("INSERT INTO qq_sessions (id, attempt_id, group_open_id, member_open_id, environment, token_hash, expires_at, created_at) VALUES ('session.expired', 'attempt.3', 'group.1', 'member.regular', 'production', ?, ?, ?)").run(await hashToken("token.expired"), pastExpiry, timestamp);

    // 4. Revoked binding player
    sqlite.prepare("INSERT INTO identities (id, created_at, updated_at) VALUES ('id.revoked', ?, ?)").run(timestamp, timestamp);
    sqlite.prepare("INSERT INTO player_accounts (id, player_id, player_name, normalized_player_name, is_admin, status, created_at, updated_at) VALUES ('player.revoked', '1003', 'RevokedPlayer', 'revokedplayer', 0, 'active', ?, ?)").run(timestamp, timestamp);
    sqlite.prepare("INSERT INTO bindings (id, identity_id, player_account_id, provider, group_open_id, member_open_id, status, revoked_at, revoked_by, created_at) VALUES ('binding.revoked', 'id.revoked', 'player.revoked', 'qq', 'group.1', 'member.revoked', 'revoked', ?, 'admin', ?)").run(timestamp, timestamp);
    sqlite.prepare("INSERT INTO qq_sessions (id, attempt_id, group_open_id, member_open_id, environment, token_hash, expires_at, created_at) VALUES ('session.revoked', 'attempt.4', 'group.1', 'member.revoked', 'production', ?, ?, ?)").run(await hashToken("token.revoked"), futureExpiry, timestamp);

    // 5. Banned player
    sqlite.prepare("INSERT INTO identities (id, created_at, updated_at) VALUES ('id.banned', ?, ?)").run(timestamp, timestamp);
    sqlite.prepare("INSERT INTO player_accounts (id, player_id, player_name, normalized_player_name, is_admin, status, banned_at, banned_by, ban_reason, created_at, updated_at) VALUES ('player.banned', '1004', 'BannedPlayer', 'bannedplayer', 0, 'banned', ?, 'admin', 'cheating', ?, ?)").run(timestamp, timestamp, timestamp);
    sqlite.prepare("INSERT INTO bindings (id, identity_id, player_account_id, provider, group_open_id, member_open_id, status, created_at) VALUES ('binding.banned', 'id.banned', 'player.banned', 'qq', 'group.1', 'member.banned', 'active', ?)").run(timestamp);
    sqlite.prepare("INSERT INTO qq_sessions (id, attempt_id, group_open_id, member_open_id, environment, token_hash, expires_at, created_at) VALUES ('session.banned', 'attempt.5', 'group.1', 'member.banned', 'production', ?, ?, ?)").run(await hashToken("token.banned"), futureExpiry, timestamp);

    // 6. Non-qq provider binding
    sqlite.prepare("INSERT INTO identities (id, created_at, updated_at) VALUES ('id.other', ?, ?)").run(timestamp, timestamp);
    sqlite.prepare("INSERT INTO player_accounts (id, player_id, player_name, normalized_player_name, is_admin, status, created_at, updated_at) VALUES ('player.other', '1005', 'OtherProviderPlayer', 'otherproviderplayer', 0, 'active', ?, ?)").run(timestamp, timestamp);
    sqlite.prepare("INSERT INTO bindings (id, identity_id, player_account_id, provider, group_open_id, member_open_id, status, created_at) VALUES ('binding.other', 'id.other', 'player.other', 'wechat', 'group.1', 'member.other', 'active', ?)").run(timestamp);
    sqlite.prepare("INSERT INTO qq_sessions (id, attempt_id, group_open_id, member_open_id, environment, token_hash, expires_at, created_at) VALUES ('session.other', 'attempt.6', 'group.1', 'member.other', 'production', ?, ?, ?)").run(await hashToken("token.other"), futureExpiry, timestamp);

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
    expect(resolved?.binding.id).toBe("binding.regular");

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

    // Revoked binding
    resetCount();
    const revoked = await resolvePortalSession(database, "token.revoked");
    expect(getCount()).toBe(1);
    expect(revoked).toBeNull();

    // Non-qq binding
    resetCount();
    const other = await resolvePortalSession(database, "token.other");
    expect(getCount()).toBe(1);
    expect(other).toBeNull();

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
    const revoked = await services.getCurrentPlayer({ sessionToken: "token.revoked" });
    expect(getCount()).toBe(1);
    expect(revoked).toBeNull();
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

  it("denies player request immediately when binding is revoked (no caching)", async () => {
    const { services, sqlite } = await setupFixture();

    const before = await services.getCurrentPlayer({ sessionToken: "token.regular" });
    expect(before).not.toBeNull();

    // Revoke the binding
    sqlite.prepare("UPDATE bindings SET status = 'revoked' WHERE id = 'binding.regular'").run();

    // Very next request must be denied
    const after = await services.getCurrentPlayer({ sessionToken: "token.regular" });
    expect(after).toBeNull();
  });

  it("denies player request immediately when session expires or is deleted (no caching)", async () => {
    const { services, sqlite } = await setupFixture();

    const before = await services.getCurrentPlayer({ sessionToken: "token.regular" });
    expect(before).not.toBeNull();

    // Expire session
    sqlite.prepare("UPDATE qq_sessions SET expires_at = 0 WHERE id = 'session.regular'").run();

    // Very next request must be denied
    const after = await services.getCurrentPlayer({ sessionToken: "token.regular" });
    expect(after).toBeNull();

    // Restore expiry, verify success, then delete session
    sqlite.prepare("UPDATE qq_sessions SET expires_at = ? WHERE id = 'session.regular'").run(Date.now() + 100_000);
    expect(await services.getCurrentPlayer({ sessionToken: "token.regular" })).not.toBeNull();

    sqlite.prepare("DELETE FROM qq_sessions WHERE id = 'session.regular'").run();
    expect(await services.getCurrentPlayer({ sessionToken: "token.regular" })).toBeNull();
  });
});
