import { createHash } from "node:crypto";
import { DatabaseSync } from "node:sqlite";
import { describe, expect, it } from "vitest";
import { createPlatformServices } from "./index";

const hash = (value: unknown) => createHash("sha256").update(JSON.stringify(value)).digest("hex");
const createD1 = () => {
  const sqlite = new DatabaseSync(":memory:");
  sqlite.exec(`
    CREATE TABLE player_accounts (id TEXT PRIMARY KEY, player_id TEXT NOT NULL, player_name TEXT NOT NULL, normalized_player_name TEXT NOT NULL, is_admin INTEGER NOT NULL DEFAULT 0, status TEXT NOT NULL, banned_at INTEGER, banned_by TEXT, ban_reason TEXT, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL);
    CREATE TABLE player_title_entitlements (player_account_id TEXT PRIMARY KEY, all_titles INTEGER NOT NULL DEFAULT 1);
    CREATE TABLE bindings (id TEXT PRIMARY KEY, identity_id TEXT, player_account_id TEXT NOT NULL, provider TEXT NOT NULL, group_open_id TEXT NOT NULL, member_open_id TEXT NOT NULL, status TEXT NOT NULL, revoked_at INTEGER, revoked_by TEXT, created_at INTEGER NOT NULL);
    CREATE TABLE portal_sessions (id TEXT PRIMARY KEY, player_account_id TEXT NOT NULL, token_hash TEXT NOT NULL, expires_at INTEGER NOT NULL);
    CREATE TABLE title_catalog (key TEXT PRIMARY KEY, label TEXT NOT NULL, icon TEXT NOT NULL, icon_url TEXT, icon_object_key TEXT, category TEXT NOT NULL, condition TEXT NOT NULL, availability TEXT NOT NULL, scope TEXT NOT NULL, display_kind TEXT NOT NULL, color_json TEXT, game_version TEXT NOT NULL);
    CREATE TABLE gameplay_revisions (id TEXT PRIMARY KEY, map_id TEXT NOT NULL, lifecycle TEXT NOT NULL);
    CREATE TABLE maps (id TEXT PRIMARY KEY, name TEXT NOT NULL);
    CREATE TABLE player_title_grants (id TEXT PRIMARY KEY, player_account_id TEXT NOT NULL, title_key TEXT NOT NULL, map_id TEXT, gameplay_revision_id TEXT, slot TEXT, status TEXT NOT NULL, source_type TEXT NOT NULL, source_id TEXT NOT NULL, granted_by TEXT NOT NULL, granted_at INTEGER NOT NULL, revoked_by TEXT, revoked_at INTEGER, revoke_reason TEXT);
    CREATE TABLE player_equipped_titles (grant_id TEXT PRIMARY KEY, player_account_id TEXT NOT NULL, equipped_at INTEGER NOT NULL);
    CREATE TABLE idempotency_keys (id TEXT PRIMARY KEY, actor_id TEXT NOT NULL, operation TEXT NOT NULL, request_hash TEXT NOT NULL, response_json TEXT NOT NULL, created_at INTEGER NOT NULL);
    CREATE TABLE audit_events (id TEXT PRIMARY KEY, correlation_id TEXT NOT NULL, actor_type TEXT NOT NULL, actor_id TEXT NOT NULL, operation TEXT NOT NULL, entity_type TEXT NOT NULL, entity_id TEXT NOT NULL, payload_json TEXT NOT NULL, created_at INTEGER NOT NULL);
  `);
  const prepare = (query: string) => { let args: unknown[] = []; const statement = { bind(...values: unknown[]) { args = values; return statement; }, async first<T>() { return sqlite.prepare(query).get(...args) as T | undefined ?? null; }, async all<T>() { return { results: sqlite.prepare(query).all(...args) as T[], success: true, meta: {} }; }, async run() { sqlite.prepare(query).run(...args); return { success: true, meta: {} }; }, async raw<T extends unknown[] = unknown[]>() { const queryStatement = sqlite.prepare(query); queryStatement.setReturnArrays(true); return queryStatement.all(...args) as T[]; } }; return statement; };
  return { sqlite, database: { prepare, async batch(statements: Array<ReturnType<typeof prepare>>) { for (const statement of statements) await statement.run(); return []; } } as unknown as D1Database };
};

describe("equipped title selection", () => {
  it("keeps zero titles empty, atomically replaces one and ten titles, rejects over-limit and foreign grants, and replays idempotently", async () => {
    const { sqlite, database } = createD1(); const now = Date.now();
    for (const [id, member] of [["player.zero", "member.zero"], ["player.one", "member.one"], ["player.other", "member.other"]]) {
      sqlite.prepare("INSERT INTO player_accounts (id, player_id, player_name, normalized_player_name, is_admin, status, created_at, updated_at) VALUES (?, ?, ?, ?, 0, 'active', ?, ?)").run(id, id, id, id, now, now);
      sqlite.prepare("INSERT INTO bindings (id, identity_id, player_account_id, provider, group_open_id, member_open_id, status, created_at) VALUES (?, NULL, ?, 'qq', 'group', ?, 'active', ?)").run(`binding.${id}`, id, member, now);
      sqlite.prepare("INSERT INTO portal_sessions VALUES (?, ?, ?, ?)").run(`session.${id}`, id, hash(`token.${id}`), now + 60_000);
    }
    const grantIds = Array.from({ length: 11 }, (_, index) => `00000000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`);
    for (const [index, grantId] of grantIds.entries()) {
      const key = `TITLE_${index}`;
      sqlite.prepare("INSERT INTO title_catalog VALUES (?, ?, 'award', NULL, NULL, '测试', '条件', 'active', 'global', 'fixed', NULL, 'test')").run(key, key);
      sqlite.prepare("INSERT INTO player_title_grants VALUES (?, 'player.one', ?, NULL, NULL, NULL, 'active', 'manual', ?, 'admin', ?, NULL, NULL, NULL)").run(grantId, key, `source.${index}`, now);
    }
    const retiredGrantId = "20000000-0000-4000-8000-000000000001";
    sqlite.prepare("INSERT INTO title_catalog VALUES ('TITLE_RETIRED', '历史称号', 'award', NULL, NULL, '历史', '历史条件', 'retired', 'global', 'fixed', NULL, 'test')").run();
    sqlite.prepare("INSERT INTO player_title_grants VALUES (?, 'player.one', 'TITLE_RETIRED', NULL, NULL, NULL, 'active', 'historical', 'source.retired', 'admin', ?, NULL, NULL, NULL)").run(retiredGrantId, now);
    const otherGrant = "10000000-0000-4000-8000-000000000001";
    sqlite.prepare("INSERT INTO player_title_grants VALUES (?, 'player.other', 'TITLE_0', NULL, NULL, NULL, 'active', 'manual', 'other', 'admin', ?, NULL, NULL, NULL)").run(otherGrant, now);
    const services = createPlatformServices(database);
    await expect(services.listCurrentPlayerTitles({ sessionToken: "token.player.zero" })).resolves.toEqual({ items: [], allTitles: false });
    await expect(services.replaceAdminPlayerEquippedTitles({ playerAccountId: "player.zero", grantIds: [] }, { actorType: "user", subject: "admin", roles: ["maintainer"], provider: "test" }, "admin-empty")).resolves.toMatchObject({ grantIds: [] });
    const migratedTitles = await services.listCurrentPlayerTitles({ sessionToken: "token.player.one" });
    expect(migratedTitles?.items).toHaveLength(12);
    expect(migratedTitles?.items).toEqual(expect.arrayContaining([
      expect.objectContaining({ grantId: retiredGrantId, titleKey: "TITLE_RETIRED" }),
    ]));
    expect(migratedTitles?.items.every((title) => !title.equipped)).toBe(true);
    await expect(services.replaceAdminPlayerEquippedTitles({ playerAccountId: "player.one", grantIds: grantIds.slice(0, 10) }, { actorType: "user", subject: "admin", roles: ["maintainer"], provider: "test" }, "recover")).resolves.toMatchObject({ grantIds: grantIds.slice(0, 10) });
    await expect(services.replaceAdminPlayerEquippedTitles({ playerAccountId: "player.one", grantIds: grantIds.slice(0, 10) }, { actorType: "user", subject: "admin", roles: ["maintainer"], provider: "test" }, "already-recovered")).resolves.toMatchObject({ grantIds: grantIds.slice(0, 10) });
    expect(sqlite.prepare("SELECT COUNT(*) AS count FROM player_equipped_titles WHERE player_account_id = 'player.one'").get()).toEqual({ count: 10 });
    expect(sqlite.prepare("SELECT COUNT(*) AS count FROM audit_events WHERE operation = 'admin.player.title.equipped.replace'").get()).toEqual({ count: 3 });
    await expect(services.replaceCurrentPlayerEquippedTitles({ sessionToken: "token.player.one", grantIds: [grantIds[0]!] }, "one")).resolves.toMatchObject({ grantIds: [grantIds[0]] });
    await expect(services.replaceCurrentPlayerEquippedTitles({ sessionToken: "token.player.one", grantIds: [grantIds[0]!] }, "one")).resolves.toMatchObject({ grantIds: [grantIds[0]] });
    expect(sqlite.prepare("SELECT COUNT(*) AS count FROM audit_events").get()).toEqual({ count: 4 });
    await expect(services.replaceCurrentPlayerEquippedTitles({ sessionToken: "token.player.one", grantIds: grantIds.slice(0, 10) }, "ten")).resolves.toMatchObject({ grantIds: grantIds.slice(0, 10) });
    await expect(services.replaceCurrentPlayerEquippedTitles({ sessionToken: "token.player.one", grantIds }, "eleven")).rejects.toThrow("EQUIPPED_TITLE_LIMIT_EXCEEDED");
    await expect(services.replaceCurrentPlayerEquippedTitles({ sessionToken: "token.player.one", grantIds: [retiredGrantId] }, "retired")).resolves.toMatchObject({ grantIds: [retiredGrantId] });
    await expect(services.listAgentPlayerTitleGrants({ page: 1, pageSize: 20 })).resolves.toEqual(expect.objectContaining({
      items: expect.arrayContaining([expect.objectContaining({ playerId: "player.one", titleKeys: ["TITLE_RETIRED"] })]),
    }));
    await expect(services.replaceCurrentPlayerEquippedTitles({ sessionToken: "token.player.one", grantIds: grantIds.slice(0, 10) }, "restore-after-retired")).resolves.toMatchObject({ grantIds: grantIds.slice(0, 10) });
    await expect(services.replaceCurrentPlayerEquippedTitles({ sessionToken: "token.player.one", grantIds: [otherGrant] }, "foreign")).rejects.toThrow("EQUIPPED_TITLE_GRANT_INVALID");
    expect(sqlite.prepare("SELECT COUNT(*) AS count FROM player_equipped_titles WHERE player_account_id = 'player.one'").get()).toEqual({ count: 10 });
  });

  it("projects an explicit all-title entitlement without equipped rows", async () => {
    const { sqlite, database } = createD1();
    const now = Date.now();
    sqlite.prepare("INSERT INTO player_accounts (id, player_id, player_name, normalized_player_name, is_admin, status, created_at, updated_at) VALUES ('player.all', '9999', 'Developer', 'developer', 0, 'active', ?, ?)").run(now, now);
    sqlite.prepare("INSERT INTO player_title_entitlements VALUES ('player.all', 1)").run();
    sqlite.prepare("INSERT INTO title_catalog VALUES ('TITLE_NEW', '新称号', 'award', NULL, NULL, '测试', '条件', 'active', 'global', 'fixed', NULL, 'test')").run();
    const response = await createPlatformServices(database).listAgentPlayerTitleGrants({ page: 1, pageSize: 20 });
    expect(response.items).toEqual([{ playerId: "9999", playerName: "Developer", titleKeys: [], allTitles: true }]);
  });

  it("rejects map grants from equipment while preserving their player projection", async () => {
    const { sqlite, database } = createD1();
    const now = Date.now();
    sqlite.prepare("INSERT INTO player_accounts (id, player_id, player_name, normalized_player_name, is_admin, status, created_at, updated_at) VALUES ('player.map', 'map-player', 'Map Player', 'map player', 0, 'active', ?, ?)").run(now, now);
    sqlite.prepare("INSERT INTO bindings (id, identity_id, player_account_id, provider, group_open_id, member_open_id, status, created_at) VALUES ('binding.map', NULL, 'player.map', 'qq', 'group', 'member.map', 'active', ?)").run(now);
    sqlite.prepare("INSERT INTO portal_sessions VALUES ('session.map', 'player.map', ?, ?)").run(hash("token.map"), now + 60_000);
    sqlite.prepare("INSERT INTO maps VALUES ('map.test', '测试地图')").run();
    sqlite.prepare("INSERT INTO gameplay_revisions VALUES ('revision:map.test:default', 'map.test', 'default')").run();
    sqlite.prepare("INSERT INTO title_catalog VALUES ('GLOBAL_MAP_TEST', '全局测试称号', 'award', NULL, NULL, '测试', '条件', 'active', 'global', 'fixed', NULL, 'test')").run();
    sqlite.prepare("INSERT INTO title_catalog VALUES ('MAP_TEST', '地图测试称号', 'award', NULL, NULL, '测试', '条件', 'active', 'map', 'map_name_suffix', NULL, 'test')").run();
    sqlite.prepare("INSERT INTO player_title_grants VALUES ('global-map-test', 'player.map', 'GLOBAL_MAP_TEST', NULL, NULL, NULL, 'active', 'manual', 'source.global', 'admin', ?, NULL, NULL, NULL)").run(now);
    sqlite.prepare("INSERT INTO player_title_grants VALUES ('map-test', 'player.map', 'MAP_TEST', 'map.test', 'revision:map.test:default', 'conqueror', 'active', 'manual', 'source.map', 'admin', ?, NULL, NULL, NULL)").run(now);
    sqlite.prepare("INSERT INTO player_equipped_titles VALUES ('map-test', 'player.map', ?)").run(now);
    const services = createPlatformServices(database);

    await expect(services.replaceCurrentPlayerEquippedTitles({ sessionToken: "token.map", grantIds: ["map-test"] }, "map-rejected")).rejects.toThrow("EQUIPPED_TITLE_GRANT_INVALID");
    await expect(services.replaceAdminPlayerEquippedTitles({ playerAccountId: "player.map", grantIds: ["map-test"] }, { actorType: "user", subject: "admin", roles: ["maintainer"], provider: "test" }, "admin-map-rejected")).rejects.toThrow("EQUIPPED_TITLE_GRANT_INVALID");
    await expect(services.replaceCurrentPlayerEquippedTitles({ sessionToken: "token.map", grantIds: ["global-map-test"] }, "global-accepted")).resolves.toMatchObject({ grantIds: ["global-map-test"] });
    await expect(services.listCurrentPlayerTitles({ sessionToken: "token.map" })).resolves.toMatchObject({
      items: expect.arrayContaining([
        expect.objectContaining({ grantId: "map-test", scope: "map", equipped: false }),
        expect.objectContaining({ grantId: "global-map-test", scope: "global", equipped: true }),
      ]),
    });
  });
});
