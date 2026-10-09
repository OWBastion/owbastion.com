import { DatabaseSync } from "node:sqlite";
import { describe, expect, it, vi } from "vitest";
import { createPlatformServices } from "./index";
import { createD1, installSchema as installFullSchema, seedMap, seedRevisionAssignment, seedTitle } from "./ocr-test-harness";

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
        return { success: true, meta: { changes: Number(info.changes ?? 0), duration: 0, size_after: 0, rows_read: 0, rows_written: Number(info.changes ?? 0), last_row_id: Number(info.lastInsertRowid ?? 0), changed_db: true } };
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
      for (const statement of statements) results.push(await statement.all());
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

  return { database, sqlite, resetCount: () => { statementCount = 0; }, getCount: () => statementCount };
};

const createFakeKv = () => {
  const store = new Map<string, string>();
  const kv: KVNamespace = {
    get: async (key: string, options?: unknown) => {
      const raw = store.get(key);
      if (raw === undefined) return null;
      const wantsJson = options === "json" || (typeof options === "object" && options !== null && (options as { type?: string }).type === "json");
      return wantsJson ? JSON.parse(raw) : raw;
    },
    put: async (key: string, value: string) => { store.set(key, value); },
    delete: async (key: string) => { store.delete(key); },
    list: async () => ({ keys: [...store.keys()].map((name) => ({ name })), list_complete: true, cacheStatus: null }),
    getWithMetadata: async (key: string) => ({ value: store.get(key) ?? null, metadata: null, cacheStatus: null }),
  } as unknown as KVNamespace;
  return { kv, store };
};

const installSchema = (sqlite: DatabaseSync) => {
  sqlite.exec(`
    CREATE TABLE maps (
      id TEXT PRIMARY KEY NOT NULL,
      name TEXT NOT NULL,
      game_version TEXT NOT NULL,
      status TEXT NOT NULL,
      introduced_version TEXT NOT NULL,
      retired_version TEXT,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );
    CREATE TABLE gameplay_revisions (
      id TEXT PRIMARY KEY NOT NULL,
      map_id TEXT NOT NULL REFERENCES maps(id),
      lifecycle TEXT NOT NULL,
      legacy_map_variant TEXT,
      mode TEXT,
      game_version TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );
    CREATE TABLE map_metadata (
      map_id TEXT PRIMARY KEY NOT NULL REFERENCES maps(id),
      difficulty_rating TEXT,
      mechanics_json TEXT NOT NULL DEFAULT '[]',
      cover_url TEXT,
      background_url TEXT,
      updated_at INTEGER NOT NULL,
      updated_by TEXT NOT NULL
    );
    CREATE TABLE idempotency_keys (
      id TEXT PRIMARY KEY NOT NULL,
      actor_id TEXT NOT NULL,
      operation TEXT NOT NULL,
      request_hash TEXT NOT NULL,
      response_json TEXT NOT NULL,
      created_at INTEGER NOT NULL
    );
    CREATE TABLE audit_events (
      id TEXT PRIMARY KEY NOT NULL,
      correlation_id TEXT NOT NULL,
      actor_type TEXT NOT NULL,
      actor_id TEXT NOT NULL,
      operation TEXT NOT NULL,
      entity_type TEXT NOT NULL,
      entity_id TEXT NOT NULL,
      payload_json TEXT NOT NULL,
      created_at INTEGER NOT NULL
    );
  `);
};

const seedMaps = (sqlite: DatabaseSync) => {
  const now = Date.now();
  sqlite.prepare("INSERT INTO maps (id, name, game_version, status, introduced_version, created_at, updated_at) VALUES ('map.a', '地图A', '2026.07.15', 'active', '2026.07.15', ?, ?)").run(now, now);
  sqlite.prepare("INSERT INTO gameplay_revisions (id, map_id, lifecycle, game_version, created_at, updated_at) VALUES ('rev.a', 'map.a', 'default', '2026.07.15', ?, ?)").run(now, now);
};

describe("platform cache", () => {
  it("serves repeat catalog reads from KV without new D1 statements", async () => {
    const { database, sqlite, resetCount, getCount } = createCountingD1();
    installSchema(sqlite);
    seedMaps(sqlite);
    const { kv } = createFakeKv();
    const services = createPlatformServices(database, undefined, undefined, undefined, undefined, undefined, undefined, undefined, 1, 0, undefined, undefined, kv);

    resetCount();
    const first = await services.listMaps();
    const coldCount = getCount();
    expect(coldCount).toBeGreaterThan(0);
    expect(first.map((map) => map.mapId)).toEqual(["map.a"]);

    // A fresh services instance (new request) must hit KV, not D1.
    const secondServices = createPlatformServices(database, undefined, undefined, undefined, undefined, undefined, undefined, undefined, 1, 0, undefined, undefined, kv);
    resetCount();
    const second = await secondServices.listMaps();
    expect(getCount()).toBe(0);
    expect(second).toEqual(first);
  });

  it("invalidates cached entries after a catalog write through the wrapped database", async () => {
    const { database, sqlite, resetCount, getCount } = createCountingD1();
    installSchema(sqlite);
    seedMaps(sqlite);
    const { kv } = createFakeKv();
    const services = createPlatformServices(database, undefined, undefined, undefined, undefined, undefined, undefined, undefined, 1, 0, undefined, undefined, kv);

    await services.listMaps();
    // Simulate another worker mutating the catalog: a new instance whose first
    // action is a write must publish a new version token.
    const writerServices = createPlatformServices(database, undefined, undefined, undefined, undefined, undefined, undefined, undefined, 1, 0, undefined, undefined, kv);
    await writerServices.updateAdminMapMetadata(
      { mapId: "map.a", gameVersion: "2026.08.01", difficultyRating: "T1", mechanics: ["机制"], coverUrl: null, backgroundUrl: null },
      { actorType: "user", subject: "admin", roles: ["maintainer"], provider: "portal-session" },
      "key-1",
    );

    resetCount();
    const readerServices = createPlatformServices(database, undefined, undefined, undefined, undefined, undefined, undefined, undefined, 1, 0, undefined, undefined, kv);
    const maps = await readerServices.listMaps();
    expect(getCount()).toBeGreaterThan(0);
    expect(maps[0]?.gameVersion).toBe("2026.08.01");
  });

  it("invalidates again for a second write by the same instance after another request cached the intermediate state", async () => {
    const { database, sqlite } = createCountingD1();
    installSchema(sqlite);
    seedMaps(sqlite);
    const { kv } = createFakeKv();
    const create = () => createPlatformServices(database, undefined, undefined, undefined, undefined, undefined, undefined, undefined, 1, 0, undefined, undefined, kv);
    const auth = { actorType: "user" as const, subject: "admin", roles: ["maintainer" as const], provider: "portal-session" as const };
    const update = (writer: ReturnType<typeof create>, gameVersion: string, key: string) =>
      writer.updateAdminMapMetadata({ mapId: "map.a", gameVersion, difficultyRating: "T1", mechanics: ["机制"], coverUrl: null, backgroundUrl: null }, auth, key);

    const writer = create();
    await update(writer, "2026.08.01", "key-1");
    expect((await create().listMaps())[0]?.gameVersion).toBe("2026.08.01");
    await update(writer, "2026.09.01", "key-2");

    expect((await create().listMaps())[0]?.gameVersion).toBe("2026.09.01");
  });

  it("keeps serving from D1 when KV reads and writes fail", async () => {
    const { database, sqlite } = createCountingD1();
    installSchema(sqlite);
    seedMaps(sqlite);
    const failing = { get: async () => { throw new Error("kv quota"); }, put: async () => { throw new Error("kv quota"); } } as unknown as KVNamespace;
    const services = createPlatformServices(database, undefined, undefined, undefined, undefined, undefined, undefined, undefined, 1, 0, undefined, undefined, failing);
    expect((await services.listMaps()).map((map) => map.mapId)).toEqual(["map.a"]);
  });

  it("does not serve pre-write entries to the writing instance when the version bump fails", async () => {
    const { database, sqlite } = createCountingD1();
    installSchema(sqlite);
    seedMaps(sqlite);
    const { kv, store } = createFakeKv();
    const create = (cache: KVNamespace) => createPlatformServices(database, undefined, undefined, undefined, undefined, undefined, undefined, undefined, 1, 0, undefined, undefined, cache);
    await create(kv).listMaps();
    const writeBlocked = { get: kv.get.bind(kv), put: async (key: string, value: string) => { if (key.includes(":ver:")) throw new Error("kv quota"); await kv.put(key, value); } } as unknown as KVNamespace;
    const writer = create(writeBlocked);
    await writer.updateAdminMapMetadata(
      { mapId: "map.a", gameVersion: "2026.08.01", difficultyRating: "T1", mechanics: ["机制"], coverUrl: null, backgroundUrl: null },
      { actorType: "user", subject: "admin", roles: ["maintainer"], provider: "portal-session" },
      "key-1",
    );
    expect(store.size).toBeGreaterThan(0);
    expect((await writer.listMaps())[0]?.gameVersion).toBe("2026.08.01");
  });

  it("falls back to direct D1 reads when no KV namespace is bound", async () => {
    const { database, sqlite, resetCount, getCount } = createCountingD1();
    installSchema(sqlite);
    seedMaps(sqlite);
    const services = createPlatformServices(database);

    await services.listMaps();
    const first = getCount();
    resetCount();
    await services.listMaps();
    expect(getCount()).toBe(first);
    expect(getCount()).toBeGreaterThan(0);
  });
});

describe("platform cache amplification", () => {
  it("serves a warm composed challenge list with no D1 reads, bounded KV reads, and the same result as uncached", async () => {
    const { database, sqlite } = createD1();
    installFullSchema(sqlite);
    for (let index = 0; index < 12; index += 1) {
      seedMap(sqlite, `map.${index}`);
      seedRevisionAssignment(sqlite, { gameplayRevisionId: `revision:map.${index}:initial`, mapId: `map.${index}`, challengeFamily: "map_title_rule", challengeId: "rule.conqueror" });
    }
    seedTitle(sqlite, "CONQUEROR");
    sqlite.prepare("INSERT INTO map_title_rules (id, title_key, kind, condition, evidence_rule, submission_mode, display_kind, slot, default_scope, status, introduced_version, created_at, updated_at) VALUES ('rule.conqueror', 'CONQUEROR', 'conqueror', '完成地图', '上传截图', 'manual', 'map_name_suffix', 'conqueror', 'all_active', 'active', '2026.07.15', 1, 1)").run();

    const { kv } = createFakeKv();
    let kvReads = 0;
    const countingKv = { ...kv, get: (async (...args: Parameters<KVNamespace["get"]>) => { kvReads += 1; return (kv.get as (...a: unknown[]) => unknown)(...args); }) as KVNamespace["get"] } as KVNamespace;
    const create = (cache?: KVNamespace) => createPlatformServices(database, undefined, undefined, undefined, undefined, undefined, undefined, undefined, 1, 0, undefined, undefined, cache);

    const uncached = await create().listChallenges({ family: "map" });
    expect(uncached.length).toBeGreaterThan(0);
    await create(countingKv).listChallenges({ family: "map" });

    let d1Statements = 0;
    const originalPrepare = database.prepare.bind(database);
    database.prepare = ((sql: string) => { d1Statements += 1; return originalPrepare(sql); }) as D1Database["prepare"];
    kvReads = 0;
    const warm = await create(countingKv).listChallenges({ family: "map" });
    expect(warm).toEqual(uncached);
    expect(d1Statements).toBe(0);
    expect(kvReads).toBeLessThanOrEqual(5);
  });

  it("does not rewrite the Agents map projection entry as the clock advances without crossing a window boundary", async () => {
    const { database, sqlite } = createD1();
    installFullSchema(sqlite);
    seedMap(sqlite, "map.a");
    const store = new Map<string, string>();
    let puts = 0;
    const kv = {
      get: async (key: string, options?: unknown) => { const raw = store.get(key); return raw === undefined ? null : options === "json" ? JSON.parse(raw) : raw; },
      put: async (key: string, value: string) => { puts += 1; store.set(key, value); },
    } as unknown as KVNamespace;
    const create = () => createPlatformServices(database, undefined, undefined, undefined, undefined, undefined, undefined, undefined, 1, 0, undefined, undefined, kv);
    vi.useFakeTimers();
    try {
      vi.setSystemTime(new Date("2026-10-04T00:00:00Z"));
      const first = await create().getAgentMap({ mapId: "map.a" });
      expect(first?.mapId).toBe("map.a");
      puts = 0;
      vi.setSystemTime(new Date("2026-10-04T07:00:00Z"));
      expect(await create().getAgentMap({ mapId: "map.a" })).toEqual(first);
      expect(puts).toBe(0);
    } finally {
      vi.useRealTimers();
    }
  });
});

describe("platform cache isolate reuse", () => {
  const countingKv = (kv: KVNamespace) => {
    const counts = { reads: 0, writes: 0 };
    // A distinct namespace object models a separate isolate over the same store.
    const wrapped = {
      get: (async (...args: Parameters<KVNamespace["get"]>) => { counts.reads += 1; return (kv.get as (...a: unknown[]) => unknown)(...args); }) as KVNamespace["get"],
      put: (async (...args: Parameters<KVNamespace["put"]>) => { counts.writes += 1; return kv.put(...args); }) as KVNamespace["put"],
    } as KVNamespace;
    return { kv: wrapped, counts };
  };
  const servicesFor = (database: D1Database, kv: KVNamespace) => createPlatformServices(database, undefined, undefined, undefined, undefined, undefined, undefined, undefined, 1, 0, undefined, undefined, kv);
  const admin = { actorType: "user" as const, subject: "admin", roles: ["maintainer"], provider: "portal-session" as const };

  it("does not spend KV operations on repeated warm reads across requests in one isolate", async () => {
    const { database, sqlite } = createCountingD1();
    installSchema(sqlite);
    seedMaps(sqlite);
    const { kv: store } = createFakeKv();
    const { kv, counts } = countingKv(store);
    const first = await servicesFor(database, kv).listMaps();
    counts.reads = 0;
    counts.writes = 0;
    for (let request = 0; request < 5; request += 1) expect(await servicesFor(database, kv).listMaps()).toEqual(first);
    expect(counts).toEqual({ reads: 0, writes: 0 });
  });

  it("lets another isolate observe a committed write once its version memo window passes", async () => {
    const { database, sqlite } = createCountingD1();
    installSchema(sqlite);
    seedMaps(sqlite);
    const { kv: store } = createFakeKv();
    const reader = countingKv(store).kv;
    const writer = countingKv(store).kv;
    vi.useFakeTimers();
    try {
      vi.setSystemTime(new Date("2026-10-08T00:00:00Z"));
      expect((await servicesFor(database, reader).listMaps())[0]?.gameVersion).toBe("2026.07.15");
      await servicesFor(database, writer).updateAdminMapMetadata({ mapId: "map.a", gameVersion: "2026.08.01", difficultyRating: "T1", mechanics: [], coverUrl: null, backgroundUrl: null }, admin, "key-iso");
      expect((await servicesFor(database, writer).listMaps())[0]?.gameVersion).toBe("2026.08.01");
      vi.setSystemTime(new Date("2026-10-08T00:00:30Z"));
      expect((await servicesFor(database, reader).listMaps())[0]?.gameVersion).toBe("2026.08.01");
    } finally {
      vi.useRealTimers();
    }
  });

  it("serves D1 and stops calling KV while KV reads fail", async () => {
    const { database, sqlite } = createCountingD1();
    installSchema(sqlite);
    seedMaps(sqlite);
    let calls = 0;
    const failing = {
      get: async () => { calls += 1; throw new Error("KV get() limit exceeded for the day."); },
      put: async () => { calls += 1; throw new Error("KV put() limit exceeded for the day."); },
    } as unknown as KVNamespace;
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    try {
      for (let request = 0; request < 3; request += 1) expect((await servicesFor(database, failing).listMaps()).map((map) => map.mapId)).toEqual(["map.a"]);
      expect(calls).toBe(1);
    } finally {
      warn.mockRestore();
    }
  });

  it("never hands one request an object another request can mutate", async () => {
    const { database, sqlite } = createCountingD1();
    installSchema(sqlite);
    seedMaps(sqlite);
    const { kv } = createFakeKv();
    const first = await servicesFor(database, kv).listMaps();
    first.length = 0;
    expect((await servicesFor(database, kv).listMaps()).map((map) => map.mapId)).toEqual(["map.a"]);
  });
});
