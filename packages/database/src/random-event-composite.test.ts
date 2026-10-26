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
  CREATE TABLE standalone_modes (mode TEXT PRIMARY KEY NOT NULL, event_weight_total REAL, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL);
  CREATE TABLE random_event_versions (game_version TEXT PRIMARY KEY NOT NULL, availability TEXT NOT NULL DEFAULT 'available', mode TEXT, suspended_at INTEGER, suspended_by TEXT, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL);
  CREATE TABLE random_event_imports (
    id TEXT PRIMARY KEY NOT NULL, source_hash TEXT NOT NULL, file_name TEXT NOT NULL,
    row_count INTEGER NOT NULL, imported_by TEXT NOT NULL, imported_at INTEGER NOT NULL
  );
  CREATE TABLE random_event_map_challenges (event_id TEXT NOT NULL, challenge_id TEXT NOT NULL, PRIMARY KEY (event_id, challenge_id));
  CREATE TABLE random_event_title_challenges (event_id TEXT NOT NULL, challenge_id TEXT NOT NULL, PRIMARY KEY (event_id, challenge_id));
  CREATE TABLE random_event_outcomes (
    event_id TEXT NOT NULL REFERENCES random_events(id) ON DELETE CASCADE, position INTEGER NOT NULL,
    name TEXT NOT NULL, polarity TEXT NOT NULL CHECK (polarity IN ('buff', 'debuff')),
    description TEXT NOT NULL, effect_tags_json TEXT NOT NULL DEFAULT '[]', PRIMARY KEY (event_id, position)
  );
  CREATE TABLE maps (
    id TEXT PRIMARY KEY NOT NULL, name TEXT NOT NULL, game_version TEXT NOT NULL, status TEXT NOT NULL,
    introduced_version TEXT NOT NULL, retired_version TEXT, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL
  );
  CREATE TABLE gameplay_revisions (
    id TEXT PRIMARY KEY NOT NULL, map_id TEXT NOT NULL, lifecycle TEXT NOT NULL, legacy_map_variant TEXT, mode TEXT,
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
    scope TEXT NOT NULL DEFAULT 'global', map_variant TEXT, progress_rule TEXT, replaced_by_challenge_id TEXT REFERENCES title_challenges(id), created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL
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

describe("composite event outcomes", () => {
  const compositeInput = (overrides: Record<string, unknown> = {}) => writeInput({
    name: "命运掷骰",
    category: "复合",
    outcomes: [
      { name: "顺风", polarity: "buff", description: "增益结果", effectTags: ["加速"] },
      { name: "逆风", polarity: "debuff", description: "减益结果", effectTags: ["减速", "标记"] },
    ],
    ...overrides,
  });
  const outcomeRows = (sqlite: DatabaseSync, eventId: string) => sqlite.prepare("SELECT name, polarity, position FROM random_event_outcomes WHERE event_id = ? ORDER BY position").all(eventId);

  it("creates a composite event and exposes its outcomes in write order on every surface", async () => {
    const { database, sqlite } = createD1();
    installSchema(sqlite);
    const services = createPlatformServices(database);

    const created = await services.createAdminRandomEvent(compositeInput(), auth, "outcome-create");
    expect(created.outcomes.map((outcome) => [outcome.position, outcome.name, outcome.polarity])).toEqual([[0, "顺风", "buff"], [1, "逆风", "debuff"]]);
    expect(outcomeRows(sqlite, created.eventId)).toEqual([
      { name: "顺风", polarity: "buff", position: 0 },
      { name: "逆风", polarity: "debuff", position: 1 },
    ]);

    expect((await services.getRandomEvent({ eventId: created.eventId }))?.outcomes.map((outcome) => outcome.name)).toEqual(["顺风", "逆风"]);
    expect((await services.listRandomEvents({})).find((event) => event.eventId === created.eventId)?.outcomes.map((outcome) => outcome.name)).toEqual(["顺风", "逆风"]);
    expect((await services.listAgentEvents({ page: 1, pageSize: 20 })).items.find((event) => event.eventId === created.eventId)?.outcomes.map((outcome) => outcome.name)).toEqual(["顺风", "逆风"]);

    const atomic = await services.createAdminRandomEvent(writeInput({ name: "原子事件" }), auth, "outcome-atomic");
    expect(atomic.outcomes).toEqual([]);
    expect((await services.listRandomEvents({})).find((event) => event.eventId === atomic.eventId)?.outcomes).toEqual([]);
  });

  it("derives the parent tags from the outcome union and annotates them from the glossary", async () => {
    const { database, sqlite } = createD1();
    installSchema(sqlite);
    sqlite.prepare("INSERT INTO effect_glossary_terms (key, name_zh, aliases_json, category, summary, definition, rules_json, source_version, updated_at) VALUES (?,?,?,?,?,?,?,?,?)")
      .run("effect.tag.加速", "加速", "[]", "effect", "加速效果", "定义", "[]", "5.0", 1);
    const services = createPlatformServices(database);

    const created = await services.createAdminRandomEvent(compositeInput({ effectTags: ["不该保留"] }), auth, "tags-union");
    expect(created.effectTags).toEqual(["加速", "减速", "标记"]);
    expect(created.effectAnnotations.map((annotation) => annotation.tag)).toEqual(["加速"]);
    expect(created.weight).toBe(0.4);
    expect(created.rarity).toBe("SSR");
    expect(sqlite.prepare("SELECT effect_tags_json FROM random_events WHERE id = ?").get(created.eventId)).toEqual({ effect_tags_json: '["加速","减速","标记"]' });
  });

  it.each([
    ["no outcomes", { outcomes: [] }],
    ["one outcome", { outcomes: [{ name: "顺风", polarity: "buff", description: "增益结果", effectTags: [] }] }],
    ["only buffs", { outcomes: [
      { name: "顺风", polarity: "buff", description: "增益", effectTags: [] },
      { name: "顺水", polarity: "buff", description: "增益", effectTags: [] },
    ] }],
    ["only debuffs", { outcomes: [
      { name: "逆风", polarity: "debuff", description: "减益", effectTags: [] },
      { name: "逆水", polarity: "debuff", description: "减益", effectTags: [] },
    ] }],
    ["outcomes on an atomic event", { category: "增益", outcomes: [
      { name: "顺风", polarity: "buff", description: "增益", effectTags: [] },
      { name: "逆风", polarity: "debuff", description: "减益", effectTags: [] },
    ] }],
  ])("rejects a create with %s without writing anything", async (_label, overrides) => {
    const { database, sqlite } = createD1();
    installSchema(sqlite);
    const services = createPlatformServices(database);

    await expect(services.createAdminRandomEvent(compositeInput(overrides), auth, "reject-1")).rejects.toThrow("EVENT_OUTCOMES_INVALID");
    expect(sqlite.prepare("SELECT COUNT(*) AS n FROM random_events").get()).toEqual({ n: 0 });
    expect(sqlite.prepare("SELECT COUNT(*) AS n FROM random_event_outcomes").get()).toEqual({ n: 0 });
    expect(sqlite.prepare("SELECT COUNT(*) AS n FROM audit_events").get()).toEqual({ n: 0 });
  });

  it("replaces the outcome set atomically on update and drops removed rows", async () => {
    const { database, sqlite } = createD1();
    installSchema(sqlite);
    const services = createPlatformServices(database);
    const created = await services.createAdminRandomEvent(compositeInput(), auth, "replace-create");

    const updated = await services.updateAdminRandomEvent({ ...compositeInput({
      outcomes: [
        { name: "骤雨", polarity: "debuff", description: "新减益", effectTags: ["减速"] },
        { name: "疾风", polarity: "buff", description: "新增益", effectTags: [] },
        { name: "晴空", polarity: "buff", description: "增益三", effectTags: [] },
      ],
    }), eventId: created.eventId }, auth, "replace-1");
    expect(updated.outcomes.map((outcome) => [outcome.position, outcome.name])).toEqual([[0, "骤雨"], [1, "疾风"], [2, "晴空"]]);
    expect(outcomeRows(sqlite, created.eventId)).toEqual([
      { name: "骤雨", polarity: "debuff", position: 0 },
      { name: "疾风", polarity: "buff", position: 1 },
      { name: "晴空", polarity: "buff", position: 2 },
    ]);
    expect(updated.effectTags).toEqual(["减速"]);

    // A rejected update leaves both the event row and the stored outcomes untouched.
    await expect(services.updateAdminRandomEvent({ ...compositeInput({ name: "坏更新", outcomes: [{ name: "单", polarity: "buff", description: "", effectTags: [] }] }), eventId: created.eventId }, auth, "replace-2")).rejects.toThrow("EVENT_OUTCOMES_INVALID");
    const kept = await services.getRandomEvent({ eventId: created.eventId });
    expect(kept?.name).toBe("命运掷骰");
    expect(kept?.outcomes.map((outcome) => outcome.name)).toEqual(["骤雨", "疾风", "晴空"]);
  });

  it("keeps stored outcomes across an update that omits the field and validates a category change against them", async () => {
    const { database, sqlite } = createD1();
    installSchema(sqlite);
    const services = createPlatformServices(database);
    const created = await services.createAdminRandomEvent(compositeInput(), auth, "keep-create");

    const renamed = await services.updateAdminRandomEvent({ ...writeInput({ name: "掷骰·改", category: "复合" }), eventId: created.eventId }, auth, "keep-1");
    expect(renamed.outcomes.map((outcome) => outcome.name)).toEqual(["顺风", "逆风"]);
    expect(renamed.effectTags).toEqual(["加速", "减速", "标记"]);

    // Changing away from 复合 requires an explicit empty outcome set.
    await expect(services.updateAdminRandomEvent({ ...writeInput({ category: "增益" }), eventId: created.eventId }, auth, "keep-2")).rejects.toThrow("EVENT_OUTCOMES_INVALID");
    const demoted = await services.updateAdminRandomEvent({ ...writeInput({ category: "增益", outcomes: [] }), eventId: created.eventId }, auth, "keep-3");
    expect(demoted.outcomes).toEqual([]);
    expect(outcomeRows(sqlite, created.eventId)).toEqual([]);
  });

  it("rejects batch updates that move a category across 复合 or set tags on a composite event", async () => {
    const { database, sqlite } = createD1();
    installSchema(sqlite);
    const services = createPlatformServices(database);
    const composite = await services.createAdminRandomEvent(compositeInput(), auth, "batch-composite");
    const atomic = await services.createAdminRandomEvent(writeInput({ name: "原子" }), auth, "batch-atomic");

    await expect(services.batchUpdateAdminRandomEvents({ contractVersion: "1", updates: [{ eventId: composite.eventId, category: "增益" }] }, auth, "bc-1")).rejects.toThrow("EVENT_OUTCOMES_INVALID");
    await expect(services.batchUpdateAdminRandomEvents({ contractVersion: "1", updates: [{ eventId: atomic.eventId, category: "复合" }] }, auth, "bc-2")).rejects.toThrow("EVENT_OUTCOMES_INVALID");
    await expect(services.batchUpdateAdminRandomEvents({ contractVersion: "1", updates: [{ eventId: composite.eventId, effectTags: ["加速"] }] }, auth, "bc-3")).rejects.toThrow("EVENT_OUTCOMES_INVALID");
    expect(outcomeRows(sqlite, composite.eventId)).toHaveLength(2);

    // Batch updates on other fields still apply.
    const [renamed] = await services.batchUpdateAdminRandomEvents({ contractVersion: "1", updates: [{ eventId: composite.eventId, weight: 0.5 }] }, auth, "bc-4");
    expect(renamed?.weight).toBe(0.5);
    expect(renamed?.outcomes).toHaveLength(2);
  });

  it("hides archived composite events from default lists but keeps their outcomes when archived is included", async () => {
    const { database, sqlite } = createD1();
    installSchema(sqlite);
    const services = createPlatformServices(database);
    const created = await services.createAdminRandomEvent(compositeInput(), auth, "archive-create");

    await services.archiveAdminRandomEvent({ eventId: created.eventId }, auth, "archive-1");
    expect((await services.listRandomEvents({})).some((event) => event.eventId === created.eventId)).toBe(false);
    const archived = await services.getRandomEvent({ eventId: created.eventId, includeArchived: true });
    expect(archived?.archived).toBe(true);
    expect(archived?.outcomes.map((outcome) => outcome.name)).toEqual(["顺风", "逆风"]);
  });

  it("matches outcome names and descriptions in agent event search", async () => {
    const { database, sqlite } = createD1();
    installSchema(sqlite);
    const services = createPlatformServices(database);
    await services.createAdminRandomEvent(compositeInput(), auth, "search-outcome");
    await services.createAdminRandomEvent(writeInput({ name: "无关事件" }), auth, "search-other");

    expect((await services.listAgentEvents({ query: "顺风", page: 1, pageSize: 20 })).items.map((event) => event.eventId)).toHaveLength(1);
    expect((await services.listAgentEvents({ query: "减益结果", page: 1, pageSize: 20 })).items.map((event) => event.eventId)).toHaveLength(1);
    expect((await services.searchAgentContent({ query: "逆风", kind: "event", page: 1, pageSize: 20 })).items).toEqual([{ kind: "event", id: expect.any(String), name: "命运掷骰", summary: "事件说明" }]);
  });

  it("fails a CSV row with category 复合 at preview and never imports it", async () => {
    const { database, sqlite } = createD1();
    installSchema(sqlite);
    const services = createPlatformServices(database);

    const csv = [csvHeaders, "复合导入,效果说明,复合,SSR,,0.5,30,1.5,,,,,,,5.0,心之钢,开发中", "正常导入,效果说明,增益,SSR,,0.5,30,1.5,,,,,,,5.0,心之钢,开发中"].join("\n");
    const preview = await services.previewAdminRandomEventImport({ contractVersion: "1", fileName: "events.csv", csv });
    expect(preview.validRowCount).toBe(0);
    expect(preview.errors).toEqual([{ row: 2, message: expect.stringContaining("管理端") }]);
    expect(preview.rows).not.toEqual(expect.arrayContaining([expect.objectContaining({ name: "复合导入" })]));

    await expect(services.importAdminRandomEvents({ contractVersion: "1", fileName: "events.csv", csv }, auth, "import-composite")).rejects.toThrow("EVENT_IMPORT_INVALID");
    expect(sqlite.prepare("SELECT COUNT(*) AS n FROM random_events").get()).toEqual({ n: 0 });
  });
});
