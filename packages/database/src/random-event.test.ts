import { readFileSync } from "node:fs";
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
    game_version TEXT NOT NULL, event_group TEXT, effect_tags_json TEXT NOT NULL DEFAULT '[]', release_status TEXT NOT NULL,
    archived_at INTEGER, archived_by TEXT, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL
  );
  CREATE TABLE random_event_versions (game_version TEXT PRIMARY KEY NOT NULL, availability TEXT NOT NULL DEFAULT 'available', suspended_at INTEGER, suspended_by TEXT, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL);
  CREATE TABLE random_event_imports (
    id TEXT PRIMARY KEY NOT NULL, source_hash TEXT NOT NULL, file_name TEXT NOT NULL,
    row_count INTEGER NOT NULL, imported_by TEXT NOT NULL, imported_at INTEGER NOT NULL
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
    lifecycle TEXT NOT NULL DEFAULT 'active', public_visibility INTEGER NOT NULL DEFAULT 1,
    scope TEXT NOT NULL, display_kind TEXT NOT NULL, color_json TEXT NOT NULL DEFAULT 'null', game_version TEXT NOT NULL
  );
  CREATE TABLE title_challenges (
    id TEXT PRIMARY KEY NOT NULL, title_key TEXT NOT NULL, category_override TEXT, condition TEXT NOT NULL,
    evidence_rule TEXT NOT NULL, submission_mode TEXT NOT NULL, game_version TEXT NOT NULL, status TEXT NOT NULL,
    introduced_version TEXT NOT NULL, retired_version TEXT, starts_at INTEGER, ends_at INTEGER,
    scope TEXT NOT NULL DEFAULT 'global', map_variant TEXT, progress_rule TEXT, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL
  );
  CREATE TABLE achievement_challenge_maps (challenge_id TEXT NOT NULL, map_id TEXT NOT NULL, PRIMARY KEY (challenge_id, map_id));
  CREATE TABLE effect_glossary_terms (
    key TEXT PRIMARY KEY NOT NULL, name_zh TEXT NOT NULL, aliases_json TEXT NOT NULL DEFAULT '[]', category TEXT NOT NULL,
    summary TEXT NOT NULL, definition TEXT NOT NULL, rules_json TEXT NOT NULL DEFAULT '[]', source_version TEXT NOT NULL, updated_at INTEGER NOT NULL
  );
  CREATE TABLE idempotency_keys (id TEXT PRIMARY KEY NOT NULL, actor_id TEXT NOT NULL, operation TEXT NOT NULL, request_hash TEXT NOT NULL, response_json TEXT NOT NULL, created_at INTEGER NOT NULL);
  CREATE TABLE audit_events (id TEXT PRIMARY KEY NOT NULL, correlation_id TEXT NOT NULL, actor_type TEXT NOT NULL, actor_id TEXT NOT NULL, operation TEXT NOT NULL, entity_type TEXT NOT NULL, entity_id TEXT NOT NULL, payload_json TEXT NOT NULL, created_at INTEGER NOT NULL);
`);

const auth = { actorType: "user" as const, subject: "admin", roles: ["maintainer"], provider: "test" };

const writeInput = (overrides: Record<string, unknown> = {}) => ({
  contractVersion: "1" as const,
  name: "测试事件",
  category: "增益",
  description: "事件说明",
  durationSeconds: 30,
  cooldownSeconds: 0.5,
  weight: 0.4,
  gameVersion: "5.0",
  effectTags: [],
  releaseStatus: "implemented" as const,
  challengeLinks: [],
  ...overrides,
});

const csvHeaders = "事件名称,事件效果,事件类别,稀有度级别,类别概率,内置冷却,持续时间（秒）,权重,组内总权重,组内个数,单次失败率(Q),保底触发率,最终出现概率,全局出现概率,版本,效果类型,事件状态";

describe("random-event rarity derivation", () => {
  it("derives rarity from weight across the admin write path", async () => {
    const { database, sqlite } = createD1();
    installSchema(sqlite);
    const services = createPlatformServices(database);

    const created = await services.createAdminRandomEvent(writeInput({ weight: 0.4 }), auth, "create-1");
    expect(created.rarity).toBe("SSR");
    expect(sqlite.prepare("SELECT rarity FROM random_events WHERE id = ?").get(created.eventId)).toEqual({ rarity: "SSR" });

    const updated = await services.updateAdminRandomEvent({ ...writeInput({ weight: 0.9 }), eventId: created.eventId }, auth, "update-1");
    expect(updated.rarity).toBe("R");
    expect(sqlite.prepare("SELECT rarity FROM random_events WHERE id = ?").get(created.eventId)).toEqual({ rarity: "R" });

    const cleared = await services.updateAdminRandomEvent({ ...writeInput({ weight: null }), eventId: created.eventId }, auth, "update-2");
    expect(cleared.rarity).toBe("");
  });

  it("derives rarity from weight on CSV import instead of trusting the rarity column", async () => {
    const { database, sqlite } = createD1();
    installSchema(sqlite);
    const services = createPlatformServices(database);

    const csv = [csvHeaders, "导入事件,效果说明,增益,SSR,,0.5,30,1.5,,,,,,,5.0,心之钢,已实装"].join("\n");
    const preview = await services.previewAdminRandomEventImport({ contractVersion: "1", fileName: "events.csv", csv });
    expect(preview.errors).toEqual([]);

    const result = await services.importAdminRandomEvents({ contractVersion: "1", fileName: "events.csv", csv }, auth, "import-1");
    expect(result.importedCount).toBe(1);
    expect(sqlite.prepare("SELECT rarity, weight FROM random_events WHERE name = ?").get("导入事件")).toEqual({ rarity: "N", weight: 1.5 });
  });

  it("stores the event group, keeps it when an update omits it, and clears it with null", async () => {
    const { database, sqlite } = createD1();
    installSchema(sqlite);
    const services = createPlatformServices(database);

    const created = await services.createAdminRandomEvent(writeInput({ eventGroup: "赌徒" }), auth, "group-create");
    expect(created.eventGroup).toBe("赌徒");
    expect(sqlite.prepare("SELECT event_group FROM random_events WHERE id = ?").get(created.eventId)).toEqual({ event_group: "赌徒" });

    const kept = await services.updateAdminRandomEvent({ ...writeInput({ name: "改名" }), eventId: created.eventId }, auth, "group-keep");
    expect(kept.eventGroup).toBe("赌徒");

    const cleared = await services.updateAdminRandomEvent({ ...writeInput({ eventGroup: null }), eventId: created.eventId }, auth, "group-clear");
    expect(cleared.eventGroup).toBeNull();

    const plain = await services.createAdminRandomEvent(writeInput({ name: "无组事件" }), auth, "group-none");
    expect(plain.eventGroup).toBeNull();
  });

  it("matches events by group name in search", async () => {
    const { database, sqlite } = createD1();
    installSchema(sqlite);
    const services = createPlatformServices(database);
    await services.createAdminRandomEvent(writeInput({ name: "梭哈", eventGroup: "赌徒" }), auth, "search-a");
    await services.createAdminRandomEvent(writeInput({ name: "先知" }), auth, "search-b");

    const result = await services.listAgentEvents({ query: "赌徒", page: 1, pageSize: 20 });
    expect(result.items.map((event) => event.name)).toEqual(["梭哈"]);
    expect(result.items[0]?.eventGroup).toBe("赌徒");
  });

  it("imports an optional trailing 事件组 column", async () => {
    const { database, sqlite } = createD1();
    installSchema(sqlite);
    const services = createPlatformServices(database);

    const csv = [`${csvHeaders},事件组`, "梭哈,效果说明,机制,,,0.5,30,1.5,,,,,,,5.0,心之钢,已实装,赌徒", "先知,效果说明,机制,,,0.5,30,1.5,,,,,,,5.0,心之钢,已实装,"].join("\n");
    expect((await services.previewAdminRandomEventImport({ contractVersion: "1", fileName: "events.csv", csv })).errors).toEqual([]);
    await services.importAdminRandomEvents({ contractVersion: "1", fileName: "events.csv", csv }, auth, "import-group");
    expect(sqlite.prepare("SELECT name, event_group FROM random_events ORDER BY name").all()).toEqual([{ name: "先知", event_group: null }, { name: "梭哈", event_group: "赌徒" }]);
  });
});

describe("random-event group migration", () => {
  it("backfills only prefixes shared by at least two events", () => {
    const { sqlite } = createD1();
    sqlite.exec("CREATE TABLE random_events (id TEXT PRIMARY KEY, name TEXT NOT NULL)");
    const insert = sqlite.prepare("INSERT INTO random_events (id, name) VALUES (?, ?)");
    ["赌徒：梭哈", "赌徒：心之钢", "作弊：先知", "任务：有福同享", "任务：同行链", "没有前缀", "：空前缀"].forEach((name, index) => insert.run(`e${index}`, name));
    sqlite.exec(readFileSync(new URL("../../../migrations/0095_random_event_group.sql", import.meta.url), "utf8"));
    expect(sqlite.prepare("SELECT name, event_group FROM random_events ORDER BY id").all()).toEqual([
      { name: "赌徒：梭哈", event_group: "赌徒" },
      { name: "赌徒：心之钢", event_group: "赌徒" },
      { name: "作弊：先知", event_group: null },
      { name: "任务：有福同享", event_group: "任务" },
      { name: "任务：同行链", event_group: "任务" },
      { name: "没有前缀", event_group: null },
      { name: "：空前缀", event_group: null },
    ]);
  });
});
