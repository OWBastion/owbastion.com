import { createHash } from "node:crypto";
import { DatabaseSync } from "node:sqlite";
import { describe, expect, it } from "vitest";
import { createPlatformServices } from "./index";

const hash = (value: unknown) => createHash("sha256").update(JSON.stringify(value)).digest("hex");
const createD1 = () => {
  const sqlite = new DatabaseSync(":memory:");
  sqlite.exec(`
    CREATE TABLE player_accounts (id TEXT PRIMARY KEY, player_id TEXT NOT NULL, player_name TEXT NOT NULL, normalized_player_name TEXT NOT NULL, is_admin INTEGER NOT NULL DEFAULT 0, status TEXT NOT NULL, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL);
    CREATE TABLE bindings (id TEXT PRIMARY KEY, identity_id TEXT, player_account_id TEXT NOT NULL, provider TEXT NOT NULL, group_open_id TEXT NOT NULL, member_open_id TEXT NOT NULL, status TEXT NOT NULL, revoked_at INTEGER, revoked_by TEXT, created_at INTEGER NOT NULL);
    CREATE TABLE qq_sessions (id TEXT PRIMARY KEY, attempt_id TEXT NOT NULL, group_open_id TEXT NOT NULL, member_open_id TEXT NOT NULL, environment TEXT NOT NULL, token_hash TEXT NOT NULL, expires_at INTEGER NOT NULL, created_at INTEGER NOT NULL);
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
      sqlite.prepare("INSERT INTO player_accounts VALUES (?, ?, ?, ?, 0, 'active', ?, ?)").run(id, id, id, id, now, now);
      sqlite.prepare("INSERT INTO bindings (id, identity_id, player_account_id, provider, group_open_id, member_open_id, status, created_at) VALUES (?, NULL, ?, 'qq', 'group', ?, 'active', ?)").run(`binding.${id}`, id, member, now);
      sqlite.prepare("INSERT INTO qq_sessions VALUES (?, 'attempt', 'group', ?, 'production', ?, ?, ?)").run(`session.${id}`, member, hash(`token.${id}`), now + 60_000, now);
    }
    const grantIds = Array.from({ length: 11 }, (_, index) => `00000000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`);
    for (const [index, grantId] of grantIds.entries()) {
      const key = `TITLE_${index}`;
      sqlite.prepare("INSERT INTO title_catalog VALUES (?, ?, 'award', NULL, NULL, '测试', '条件', 'active', 'global', 'fixed', NULL, 'test')").run(key, key);
      sqlite.prepare("INSERT INTO player_title_grants VALUES (?, 'player.one', ?, NULL, NULL, NULL, 'active', 'manual', ?, 'admin', ?, NULL, NULL, NULL)").run(grantId, key, `source.${index}`, now);
    }
    const otherGrant = "10000000-0000-4000-8000-000000000001";
    sqlite.prepare("INSERT INTO player_title_grants VALUES (?, 'player.other', 'TITLE_0', NULL, NULL, NULL, 'active', 'manual', 'other', 'admin', ?, NULL, NULL, NULL)").run(otherGrant, now);
    const services = createPlatformServices(database);
    await expect(services.listCurrentPlayerTitles({ sessionToken: "token.player.zero" })).resolves.toEqual([]);
    await expect(services.replaceCurrentPlayerEquippedTitles({ sessionToken: "token.player.one", grantIds: [grantIds[0]!] }, "one")).resolves.toMatchObject({ grantIds: [grantIds[0]] });
    await expect(services.replaceCurrentPlayerEquippedTitles({ sessionToken: "token.player.one", grantIds: [grantIds[0]!] }, "one")).resolves.toMatchObject({ grantIds: [grantIds[0]] });
    expect(sqlite.prepare("SELECT COUNT(*) AS count FROM audit_events").get()).toEqual({ count: 1 });
    await expect(services.replaceCurrentPlayerEquippedTitles({ sessionToken: "token.player.one", grantIds: grantIds.slice(0, 10) }, "ten")).resolves.toMatchObject({ grantIds: grantIds.slice(0, 10) });
    await expect(services.replaceCurrentPlayerEquippedTitles({ sessionToken: "token.player.one", grantIds }, "eleven")).rejects.toThrow("EQUIPPED_TITLE_LIMIT_EXCEEDED");
    await expect(services.replaceCurrentPlayerEquippedTitles({ sessionToken: "token.player.one", grantIds: [otherGrant] }, "foreign")).rejects.toThrow("EQUIPPED_TITLE_GRANT_INVALID");
    expect(sqlite.prepare("SELECT COUNT(*) AS count FROM player_equipped_titles WHERE player_account_id = 'player.one'").get()).toEqual({ count: 10 });
  });
});
