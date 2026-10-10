import { describe, expect, it } from "vitest";
import { createPlatformServices } from "./index";
import { createD1 } from "./ocr-test-harness";

const fixture = () => {
  const harness = createD1();
  harness.sqlite.exec(`
    CREATE TABLE player_accounts (
      id TEXT PRIMARY KEY, player_id TEXT NOT NULL, player_name TEXT NOT NULL,
      normalized_player_name TEXT NOT NULL, is_admin INTEGER NOT NULL DEFAULT 0,
      status TEXT NOT NULL, banned_at INTEGER, banned_by TEXT, ban_reason TEXT,
      created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL
    );
    CREATE TABLE bindings (
      id TEXT PRIMARY KEY, identity_id TEXT NOT NULL, player_account_id TEXT NOT NULL,
      provider TEXT NOT NULL, group_open_id TEXT NOT NULL, member_open_id TEXT NOT NULL,
      status TEXT NOT NULL, revoked_at INTEGER, revoked_by TEXT, created_at INTEGER NOT NULL
    );
    CREATE TABLE submissions (id TEXT PRIMARY KEY, player_account_id TEXT NOT NULL, status TEXT NOT NULL);
    INSERT INTO submissions VALUES ('s1', 'alpha', 'ready_for_review'), ('s2', 'alpha', 'ocr_review_required'), ('s3', 'alpha', 'approved'), ('s4', 'beta', 'awaiting_player_confirmation');
    CREATE UNIQUE INDEX bindings_single_active_player_idx ON bindings(player_account_id) WHERE status = 'active';
    INSERT INTO player_accounts VALUES
      ('alpha', '101', 'Alpha', 'alpha', 0, 'active', NULL, NULL, NULL, 1, 40),
      ('beta', '202', 'Beta', 'beta', 0, 'banned', 1, 'admin', NULL, 1, 30),
      ('gamma', '303', 'Gamma', 'gamma', 0, 'active', NULL, NULL, NULL, 1, 20),
      ('delta', '404', 'Delta', 'delta', 0, 'active', NULL, NULL, NULL, 1, 10);
    INSERT INTO bindings VALUES
      ('alpha-1', 'identity-a1', 'alpha', 'qq', 'shared-group', 'member-alpha', 'active', NULL, NULL, 1),
      ('alpha-old', 'identity-a3', 'alpha', 'qq', 'retired-group', 'retired-alpha', 'revoked', 1, 'admin', 1),
      ('beta-1', 'identity-b', 'beta', 'qq', 'shared-group', 'member-beta', 'active', NULL, NULL, 1),
      ('delta-old', 'identity-d', 'delta', 'qq', 'retired-group', 'retired-delta', 'revoked', 1, 'admin', 1);
  `);
  return { ...harness, services: createPlatformServices(harness.database) };
};

describe("admin player directory", () => {
  it("preserves pagination, total and active binding counts without duplicating players", async () => {
    const { services } = fixture();
    const first = await services.listAdminPlayers({ page: 1, pageSize: 2 });
    expect(first).toMatchObject({ page: 1, pageSize: 2, total: 4, hasMore: true });
    expect(first.items.map(({ playerAccountId, bindingCount }) => ({ playerAccountId, bindingCount }))).toEqual([
      { playerAccountId: "alpha", bindingCount: 1 }, { playerAccountId: "beta", bindingCount: 1 },
    ]);
    const last = await services.listAdminPlayers({ page: 2, pageSize: 2 });
    expect(last).toMatchObject({ total: 4, hasMore: false });
    expect(last.items.map(({ playerAccountId, bindingCount }) => ({ playerAccountId, bindingCount }))).toEqual([
      { playerAccountId: "gamma", bindingCount: 0 }, { playerAccountId: "delta", bindingCount: 0 },
    ]);
    expect(first.items.map((item) => item.pendingSubmissionCount)).toEqual([2, 0]);
    expect(await services.listAdminPlayers({ page: 3, pageSize: 2 })).toMatchObject({ items: [], total: 4, hasMore: false });
  });

  it("combines status with fuzzy player and active QQ searches, excluding revoked QQ matches", async () => {
    const { services } = fixture();
    for (const query of ["lph", "01", "member-al", "shared-gr"]) {
      const result = await services.listAdminPlayers({ page: 1, pageSize: 10, status: "active", query });
      expect(result.total).toBe(1);
      expect(result.items.map((item) => item.playerAccountId)).toEqual(["alpha"]);
      expect(result.items[0]!.bindingCount).toBe(1);
    }
    expect(await services.listAdminPlayers({ page: 1, pageSize: 10, query: "retired-" })).toMatchObject({ items: [], total: 0, hasMore: false });
    const banned = await services.listAdminPlayers({ page: 1, pageSize: 10, status: "banned", query: "shared" });
    expect(banned.total).toBe(1);
    expect(banned.items.map((item) => item.playerAccountId)).toEqual(["beta"]);
  });

  it("keeps database statement count bounded as the result page grows", async () => {
    const { services, sqlite, preparedStatementCount, resetPreparedStatementCount } = fixture();
    const insert = sqlite.prepare("INSERT INTO player_accounts VALUES (?, ?, ?, ?, 0, 'active', NULL, NULL, NULL, 1, ?)");
    for (let index = 0; index < 40; index += 1) insert.run(`scale-${index}`, `id-${index}`, `Player ${index}`, `player ${index}`, 100 + index);
    for (const query of [undefined, "Player"]) {
      resetPreparedStatementCount();
      const small = await services.listAdminPlayers({ page: 1, pageSize: 1, query });
      const smallCount = preparedStatementCount();
      resetPreparedStatementCount();
      const large = await services.listAdminPlayers({ page: 1, pageSize: 40, query });
      expect(small.items).toHaveLength(1);
      expect(large.items).toHaveLength(40);
      expect(preparedStatementCount()).toBe(smallCount);
      expect(preparedStatementCount()).toBeLessThanOrEqual(query ? 5 : 4);
    }
  });
});
