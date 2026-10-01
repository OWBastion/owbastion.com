import { DatabaseSync } from "node:sqlite";
import { describe, expect, it } from "vitest";
import { createPlatformServices } from "./index";

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
