/**
 * KV read-through cache for catalog-shaped D1 reads.
 *
 * Keys live under a per-scope version token; writes detected on the wrapped
 * D1Database bump the scope token, so readers pick up committed catalog
 * changes within one KV propagation window instead of a fixed TTL. The entry
 * TTL only reclaims keys abandoned by version bumps and bounds staleness for
 * writes that bypass the Worker entirely (migrations, wrangler d1 execute).
 *
 * Platform services are created per request (often several times), so the
 * isolate keeps a small shared state per KV namespace: the version token is
 * reused for VERSION_MEMO_MS, and entries — immutable once keyed by a version
 * token — are kept in a bounded in-memory copy. Only plain data is shared
 * across requests; in-flight promises stay per instance.
 */
export type PlatformCacheScope = "catalog" | "grants";

const VERSION_KEYS: Record<PlatformCacheScope, string> = {
  catalog: "owb:v1:ver:catalog",
  grants: "owb:v1:ver:grants",
};
const ENTRY_TTL_SECONDS = 6 * 60 * 60;
// Bounded well inside KV's own cross-location propagation window, so it adds
// no new class of staleness; a writer's isolate sees its bump immediately.
const VERSION_MEMO_MS = 10_000;
// After a KV failure (e.g. a daily quota block) skip KV briefly instead of
// spending further operations that are likely to fail.
const KV_BYPASS_MS = 30_000;
const ENTRY_MEMORY_MAX_BYTES = 8 * 1024 * 1024;

const logCacheEvent = (event: string, fields: Record<string, unknown>) => {
  try {
    console.warn(JSON.stringify({ layer: "cache", event, ...fields }));
  } catch {
    // Logging must never break the request path.
  }
};

type Loader<T> = () => Promise<T>;

export type PlatformCache = {
  cached: <T>(scope: PlatformCacheScope, name: string, loader: Loader<T>) => Promise<T>;
  invalidate: (scope: PlatformCacheScope) => Promise<void>;
};

type IsolateCacheState = {
  versions: Map<PlatformCacheScope, { token: string; readAt: number }>;
  entries: Map<string, string>;
  entryBytes: number;
  bypassUntil: number;
};

const isolateStates = new WeakMap<KVNamespace, IsolateCacheState>();

const isolateStateFor = (kv: KVNamespace): IsolateCacheState => {
  let state = isolateStates.get(kv);
  if (!state) {
    state = { versions: new Map(), entries: new Map(), entryBytes: 0, bypassUntil: 0 };
    isolateStates.set(kv, state);
  }
  return state;
};

const rememberEntry = (state: IsolateCacheState, key: string, serialized: string) => {
  if (serialized.length > ENTRY_MEMORY_MAX_BYTES) return;
  const previous = state.entries.get(key);
  if (previous !== undefined) {
    state.entries.delete(key);
    state.entryBytes -= previous.length;
  }
  state.entries.set(key, serialized);
  state.entryBytes += serialized.length;
  for (const [oldestKey, oldest] of state.entries) {
    if (state.entryBytes <= ENTRY_MEMORY_MAX_BYTES) break;
    state.entries.delete(oldestKey);
    state.entryBytes -= oldest.length;
  }
};

const recallEntry = (state: IsolateCacheState, key: string): string | undefined => {
  const serialized = state.entries.get(key);
  if (serialized === undefined) return undefined;
  state.entries.delete(key);
  state.entries.set(key, serialized);
  return serialized;
};

const errorMessage = (error: unknown) => error instanceof Error ? error.message : String(error);

export const createPlatformCache = (kv?: KVNamespace): PlatformCache => {
  const shared = kv ? isolateStateFor(kv) : undefined;
  // Pinned per instance so one request reads a single consistent version.
  const versions = new Map<PlatformCacheScope, string | null>();
  const memos = new Map<PlatformCacheScope, Map<string, Promise<unknown>>>();
  const bumped = new Set<PlatformCacheScope>();

  const enterBypass = (state: IsolateCacheState) => {
    state.bypassUntil = Date.now() + KV_BYPASS_MS;
    state.versions.clear();
  };

  /** Resolves the scope token, or null when KV must be skipped for this read. */
  const versionOf = async (scope: PlatformCacheScope): Promise<string | null> => {
    if (versions.has(scope)) return versions.get(scope)!;
    if (!kv || !shared) return null;
    const now = Date.now();
    let version: string | null;
    const memo = shared.versions.get(scope);
    if (shared.bypassUntil > now) {
      version = null;
    } else if (memo && now - memo.readAt < VERSION_MEMO_MS) {
      version = memo.token;
    } else {
      try {
        version = (await kv.get(VERSION_KEYS[scope])) ?? "0";
        shared.versions.set(scope, { token: version, readAt: now });
      } catch (error) {
        // Never look up or write entries under an unknown token; fall back to
        // the loader and stop spending KV operations for a short window.
        version = null;
        enterBypass(shared);
        logCacheEvent("version_read_failed", { scope, error: errorMessage(error) });
      }
    }
    versions.set(scope, version);
    return version;
  };

  const cached = <T>(scope: PlatformCacheScope, name: string, loader: Loader<T>): Promise<T> => {
    if (!kv || !shared) return loader();
    let scopeMemos = memos.get(scope);
    if (!scopeMemos) {
      scopeMemos = new Map();
      memos.set(scope, scopeMemos);
    }
    const memoized = scopeMemos.get(name);
    if (memoized) return memoized as Promise<T>;
    const promise = (async () => {
      const version = await versionOf(scope);
      if (version === null) return loader();
      const key = `owb:v1:${scope}:${version}:${name}`;
      // Entries are immutable under a version token, so the isolate copy needs
      // no freshness check. It is stored serialized so requests never share
      // (or mutate) one object.
      const remembered = recallEntry(shared, key);
      if (remembered !== undefined) return (JSON.parse(remembered) as { v: T }).v;
      let kvAvailable = shared.bypassUntil <= Date.now();
      if (kvAvailable) {
        try {
          const stored = await kv.get(key, "text");
          if (stored !== null) {
            rememberEntry(shared, key, stored);
            return (JSON.parse(stored) as { v: T }).v;
          }
        } catch (error) {
          kvAvailable = false;
          enterBypass(shared);
          logCacheEvent("entry_read_failed", { scope, name, error: errorMessage(error) });
        }
      }
      const value = await loader();
      const serialized = JSON.stringify({ v: value });
      rememberEntry(shared, key, serialized);
      if (kvAvailable) {
        try {
          await kv.put(key, serialized, { expirationTtl: ENTRY_TTL_SECONDS });
        } catch (error) {
          enterBypass(shared);
          logCacheEvent("entry_write_failed", { scope, name, error: errorMessage(error) });
        }
      }
      return value;
    })();
    scopeMemos.set(name, promise);
    promise.catch(() => scopeMemos.delete(name));
    return promise;
  };

  const invalidate = async (scope: PlatformCacheScope): Promise<void> => {
    if (!kv || !shared || bumped.has(scope)) return;
    bumped.add(scope);
    memos.delete(scope);
    const token = `${Date.now().toString(36)}.${crypto.randomUUID()}`;
    try {
      // Attempted even during a read bypass: a published bump is what lets
      // other isolates observe the write.
      await kv.put(VERSION_KEYS[scope], token);
      versions.set(scope, token);
      shared.versions.set(scope, { token, readAt: Date.now() });
    } catch (error) {
      bumped.delete(scope);
      // This isolate must not keep serving the pre-write version it memoized.
      versions.set(scope, null);
      shared.versions.delete(scope);
      enterBypass(shared);
      logCacheEvent("version_bump_failed", { scope, error: errorMessage(error) });
    }
  };

  return { cached, invalidate };
};

const CATALOG_TABLES = new Set([
  "maps",
  "map_metadata",
  "gameplay_revisions",
  "gameplay_revision_challenge_assignments",
  "map_title_rules",
  "map_title_rule_exceptions",
  "map_title_rule_compat",
  "map_title_rewards",
  "title_catalog",
  "title_challenges",
  "achievement_challenges",
  "achievement_challenge_maps",
  "random_events",
  "random_event_versions",
  "random_event_map_challenges",
  "random_event_title_challenges",
  "random_event_imports",
  "effect_glossary_terms",
]);
const GRANT_TABLES = new Set([
  "player_accounts",
  "player_title_grants",
  "player_title_entitlements",
  "player_equipped_titles",
]);
const WRITE_TARGET_RE = /\b(?:insert|replace)\s+(?:or\s+\w+\s+)?into\s+["'`[]?(\w+)|\bupdate\b(?:\s+or\s+\w+)?\s+["'`[]?(\w+)|\bdelete\s+from\s+["'`[]?(\w+)/gi;

const scopesTouchedBy = (sql: string): PlatformCacheScope[] => {
  const scopes = new Set<PlatformCacheScope>();
  WRITE_TARGET_RE.lastIndex = 0;
  let match = WRITE_TARGET_RE.exec(sql);
  while (match) {
    const table = (match[1] ?? match[2] ?? match[3] ?? "").toLowerCase();
    if (CATALOG_TABLES.has(table)) scopes.add("catalog");
    if (GRANT_TABLES.has(table)) scopes.add("grants");
    match = WRITE_TARGET_RE.exec(sql);
  }
  // Grant-scoped projections join catalog tables (title_catalog, gameplay_revisions),
  // so a catalog change must rebuild them too.
  if (scopes.has("catalog")) scopes.add("grants");
  return [...scopes];
};

type WrappedStatement = D1PreparedStatement & { __sql: string; __inner: D1PreparedStatement };

/**
 * Wraps a D1Database so that every successful write to a cached table bumps
 * the matching cache scope version. Read statements pass through untouched.
 */
export const instrumentDatabase = (database: D1Database, cache: PlatformCache): D1Database => {
  const invalidateFor = async (sql: string) => {
    for (const scope of scopesTouchedBy(sql)) await cache.invalidate(scope);
  };

  const wrapStatement = (statement: D1PreparedStatement, sql: string): WrappedStatement => {
    const wrapped: WrappedStatement = {
      __sql: sql,
      __inner: statement,
      bind(...values: unknown[]) {
        return wrapStatement(statement.bind(...values), sql) as D1PreparedStatement;
      },
      async run<T = unknown>() {
        const result = await statement.run<T>();
        await invalidateFor(sql);
        return result;
      },
      async all<T = unknown>() {
        const result = await statement.all<T>();
        await invalidateFor(sql);
        return result;
      },
      async first<T = unknown>(column?: string) {
        const result = column === undefined ? await statement.first<T>() : await statement.first<T>(column);
        await invalidateFor(sql);
        return result;
      },
      async raw<T extends unknown[] = unknown[]>(options?: { columnNames?: boolean }) {
        const result = await (statement.raw as (opts?: { columnNames?: boolean }) => Promise<T[]>)(options);
        await invalidateFor(sql);
        return result;
      },
    } as WrappedStatement;
    return wrapped;
  };

  return {
    prepare(sql: string) {
      return wrapStatement(database.prepare(sql), sql);
    },
    async batch<T = unknown>(statements: D1PreparedStatement[]) {
      const inner = statements.map((statement) => (statement as WrappedStatement).__inner ?? statement);
      const results = await database.batch<T>(inner as [D1PreparedStatement, ...D1PreparedStatement[]]);
      for (const statement of statements) {
        const sql = (statement as WrappedStatement).__sql;
        if (sql) await invalidateFor(sql);
      }
      return results;
    },
    async exec(sql: string) {
      const result = await database.exec(sql);
      await invalidateFor(sql);
      return result;
    },
    withSession(constraintOrBookmark?: string) {
      return instrumentDatabase(database.withSession(constraintOrBookmark) as unknown as D1Database, cache) as unknown as D1DatabaseSession;
    },
  } as unknown as D1Database;
};
