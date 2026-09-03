import { DatabaseSync } from "node:sqlite";
import { describe, expect, it } from "vitest";
import { createPlatformServices } from "./index";

const createD1 = () => {
  const sqlite = new DatabaseSync(":memory:");
  sqlite.exec("PRAGMA foreign_keys = ON;");
  const wrap = (sql: string) => {
    let bound: unknown[] = [];
    const statement = {
      bind(...params: unknown[]) { bound = params; return statement; },
      async first<T>() { return (sqlite.prepare(sql).get(...bound) as T | undefined) ?? null; },
      async all<T>() { const results = sqlite.prepare(sql).all(...bound) as T[]; return { results, success: true, meta: {} }; },
      async run() { const result = sqlite.prepare(sql).run(...bound); return { success: true, meta: { changes: Number(result.changes ?? 0) } }; },
      async raw<T extends unknown[] = unknown[]>() { const prepared = sqlite.prepare(sql); prepared.setReturnArrays(true); return prepared.all(...bound) as T[]; },
    };
    return statement;
  };
  const database = {
    prepare(sql: string) { return wrap(sql); },
    async batch(statements: Array<ReturnType<typeof wrap>>) { return Promise.all(statements.map((statement) => statement.run())); },
    async exec(sql: string) { sqlite.exec(sql); return []; },
    withSession() { return database; },
  } as unknown as D1Database;
  return { database, sqlite };
};

const installSchema = (sqlite: DatabaseSync) => sqlite.exec(`
  CREATE TABLE random_events (
    id TEXT PRIMARY KEY NOT NULL, name TEXT NOT NULL, category TEXT NOT NULL, rarity TEXT NOT NULL,
    description TEXT NOT NULL, duration_seconds INTEGER, cooldown_seconds REAL, weight REAL,
    game_version TEXT NOT NULL, effect_tags_json TEXT NOT NULL DEFAULT '[]', release_status TEXT NOT NULL,
    archived_at INTEGER, archived_by TEXT, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL
  );
  CREATE TABLE random_event_versions (
    game_version TEXT PRIMARY KEY NOT NULL, availability TEXT NOT NULL DEFAULT 'available',
    suspended_at INTEGER, suspended_by TEXT, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL
  );
  CREATE TABLE random_event_map_challenges (event_id TEXT NOT NULL, challenge_id TEXT NOT NULL, PRIMARY KEY (event_id, challenge_id));
  CREATE TABLE random_event_title_challenges (event_id TEXT NOT NULL, challenge_id TEXT NOT NULL, PRIMARY KEY (event_id, challenge_id));
  CREATE TABLE maps (
    id TEXT PRIMARY KEY NOT NULL, name TEXT NOT NULL, game_version TEXT NOT NULL, status TEXT NOT NULL,
    introduced_version TEXT NOT NULL, retired_version TEXT, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL
  );
  CREATE TABLE gameplay_revisions (
    id TEXT PRIMARY KEY NOT NULL, map_id TEXT NOT NULL, lifecycle TEXT NOT NULL, legacy_map_variant TEXT,
    copied_from_revision_id TEXT, reset_reason TEXT, game_version TEXT NOT NULL, spatial_config_json TEXT,
    created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL
  );
  CREATE TABLE gameplay_revision_challenge_assignments (
    id TEXT PRIMARY KEY NOT NULL, gameplay_revision_id TEXT NOT NULL, map_id TEXT NOT NULL, challenge_family TEXT NOT NULL,
    challenge_id TEXT NOT NULL, enabled INTEGER NOT NULL DEFAULT 1, condition TEXT, evidence_rule TEXT,
    submission_mode TEXT, slot TEXT, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL
  );
  CREATE TABLE achievement_challenges (
    id TEXT PRIMARY KEY NOT NULL, map_id TEXT NOT NULL, type TEXT NOT NULL, name TEXT NOT NULL, difficulty TEXT,
    condition TEXT NOT NULL, evidence_rule TEXT NOT NULL, submission_mode TEXT NOT NULL, reward_title_key TEXT,
    game_version TEXT NOT NULL, status TEXT NOT NULL, introduced_version TEXT NOT NULL, retired_version TEXT,
    created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL
  );
  CREATE TABLE map_title_rule_compat (
    legacy_challenge_id TEXT NOT NULL, rule_id TEXT NOT NULL, map_id TEXT NOT NULL,
    is_standard_instance INTEGER NOT NULL DEFAULT 1, created_at INTEGER NOT NULL,
    PRIMARY KEY (legacy_challenge_id, map_id)
  );
  CREATE TABLE title_catalog (
    key TEXT PRIMARY KEY NOT NULL, label TEXT NOT NULL, icon TEXT NOT NULL DEFAULT 'award', icon_url TEXT,
    icon_object_key TEXT, category TEXT NOT NULL, condition TEXT NOT NULL, availability TEXT NOT NULL,
    scope TEXT NOT NULL, display_kind TEXT NOT NULL, color_json TEXT NOT NULL DEFAULT 'null', game_version TEXT NOT NULL
  );
  CREATE TABLE title_challenges (
    id TEXT PRIMARY KEY NOT NULL, title_key TEXT NOT NULL, category_override TEXT, condition TEXT NOT NULL,
    evidence_rule TEXT NOT NULL, submission_mode TEXT NOT NULL, game_version TEXT NOT NULL, status TEXT NOT NULL,
    introduced_version TEXT NOT NULL, retired_version TEXT, starts_at INTEGER, ends_at INTEGER,
    scope TEXT NOT NULL DEFAULT 'global', map_variant TEXT, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL
  );
  CREATE TABLE achievement_challenge_maps (challenge_id TEXT NOT NULL, map_id TEXT NOT NULL, PRIMARY KEY (challenge_id, map_id));
  CREATE TABLE effect_glossary_terms (
    key TEXT PRIMARY KEY NOT NULL, name_zh TEXT NOT NULL, aliases_json TEXT NOT NULL DEFAULT '[]', category TEXT NOT NULL,
    summary TEXT NOT NULL, definition TEXT NOT NULL, rules_json TEXT NOT NULL DEFAULT '[]', source_version TEXT NOT NULL, updated_at INTEGER NOT NULL
  );
  CREATE TABLE idempotency_keys (id TEXT PRIMARY KEY NOT NULL, actor_id TEXT NOT NULL, operation TEXT NOT NULL, request_hash TEXT NOT NULL, response_json TEXT NOT NULL, created_at INTEGER NOT NULL);
  CREATE TABLE audit_events (id TEXT PRIMARY KEY NOT NULL, correlation_id TEXT NOT NULL, actor_type TEXT NOT NULL, actor_id TEXT NOT NULL, operation TEXT NOT NULL, entity_type TEXT NOT NULL, entity_id TEXT NOT NULL, payload_json TEXT NOT NULL, created_at INTEGER NOT NULL);
`);

describe("random-event version availability", () => {
  it("filters suspended versions and restores the unchanged event projection", async () => {
    const { database, sqlite } = createD1();
    installSchema(sqlite);
    sqlite.exec("INSERT INTO random_events (id, name, category, rarity, description, duration_seconds, cooldown_seconds, weight, game_version, release_status, created_at, updated_at) VALUES ('event.suspended', '挂起事件', '增益', 'R', '原始说明', 30, 0.32, 0.7, '26.0901.1', 'implemented', 1, 1), ('event.available', '可用事件', '机制', 'SR', '另一说明', 60, 1, 2, '26.0902.1', 'implemented', 1, 1);");
    const services = createPlatformServices(database);
    const auth = { actorType: "user" as const, subject: "admin", roles: ["maintainer"], provider: "test" };

    await services.updateAdminRandomEventVersion({ contractVersion: "1", gameVersion: "26.0901.1", availability: "suspended" }, auth, "suspend-1");
    await expect(services.updateAdminRandomEventVersion({ contractVersion: "1", gameVersion: "26.0901.1", availability: "suspended" }, auth, "suspend-1")).resolves.toEqual({ gameVersion: "26.0901.1", availability: "suspended", eventCount: 1 });
    await expect(services.updateAdminRandomEventVersion({ contractVersion: "1", gameVersion: "26.0901.1", availability: "available" }, auth, "suspend-1")).rejects.toThrow("IDEMPOTENCY_CONFLICT");
    await expect(services.getAgentEvent({ eventId: "event.suspended" })).resolves.toBeNull();
    await expect(services.getAgentEvent({ eventId: "event.available" })).resolves.toMatchObject({ eventId: "event.available", weight: 2 });
    await expect(services.listAgentEvents({ page: 1, pageSize: 10 })).resolves.toMatchObject({ total: 1, items: [{ eventId: "event.available" }] });

    const restored = await services.updateAdminRandomEventVersion({ contractVersion: "1", gameVersion: "26.0901.1", availability: "available" }, auth, "restore-1");
    expect(restored).toEqual({ gameVersion: "26.0901.1", availability: "available", eventCount: 1 });
    await expect(services.getAgentEvent({ eventId: "event.suspended" })).resolves.toMatchObject({ eventId: "event.suspended", description: "原始说明", durationSeconds: 30, cooldownSeconds: 0.32, weight: 0.7 });
    expect(await services.listAdminRandomEventVersions(auth)).toEqual({ contractVersion: "1", items: [
      { gameVersion: "26.0902.1", availability: "available", eventCount: 1 },
      { gameVersion: "26.0901.1", availability: "available", eventCount: 1 },
    ] });
    expect(sqlite.prepare("SELECT COUNT(*) AS count FROM audit_events WHERE operation = 'admin.random-event-version.availability'").get()).toEqual({ count: 2 });
    expect(sqlite.prepare("SELECT COUNT(*) AS count FROM idempotency_keys WHERE operation = 'admin.random-event-version.availability'").get()).toEqual({ count: 2 });
  });
});
