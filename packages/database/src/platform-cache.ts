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
  cachedTtl: <T>(name: string, ttlSeconds: number, loader: Loader<T>) => Promise<T>;
  invalidate: (scope: PlatformCacheScope) => Promise<void>;
};

type IsolateCacheState = {
  versions: Map<PlatformCacheScope, { token: string; readAt: number }>;
  entries: Map<string, string>;
  entryBytes: number;
  bypassUntil: number;
  // Bumped each time a version bump settles, so a version read that began
  // earlier cannot write its older token over the newer one.
  generations: Map<PlatformCacheScope, number>;
  // Scopes whose write committed but whose version bump failed: the published
  // token is still the pre-write one, so reads skip the cache until a bump lands.
  unbumped: Set<PlatformCacheScope>;
};

const isolateStates = new WeakMap<KVNamespace, IsolateCacheState>();

const isolateStateFor = (kv: KVNamespace): IsolateCacheState => {
  let state = isolateStates.get(kv);
  if (!state) {
    state = { versions: new Map(), entries: new Map(), entryBytes: 0, bypassUntil: 0, generations: new Map(), unbumped: new Set() };
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

const forgetEntry = (state: IsolateCacheState, key: string) => {
  const previous = state.entries.get(key);
  if (previous === undefined) return;
  state.entries.delete(key);
  state.entryBytes -= previous.length;
};

const errorMessage = (error: unknown) => error instanceof Error ? error.message : String(error);

export const createPlatformCache = (kv?: KVNamespace): PlatformCache => {
  const shared = kv ? isolateStateFor(kv) : undefined;
  // Pinned per instance so one request reads a single consistent version.
  const versions = new Map<PlatformCacheScope, string | null>();
  const memos = new Map<string, Map<string, Promise<unknown>>>();

  const enterBypass = (state: IsolateCacheState) => {
    state.bypassUntil = Date.now() + KV_BYPASS_MS;
    state.versions.clear();
  };

  /** Publishes a fresh scope token; returns it, or null when KV rejected the write. */
  const bump = async (scope: PlatformCacheScope): Promise<string | null> => {
    const token = `${Date.now().toString(36)}.${crypto.randomUUID()}`;
    try {
      await kv!.put(VERSION_KEYS[scope], token);
      shared!.versions.set(scope, { token, readAt: Date.now() });
      shared!.unbumped.delete(scope);
      return token;
    } catch (error) {
      shared!.versions.delete(scope);
      shared!.unbumped.add(scope);
      enterBypass(shared!);
      logCacheEvent("version_bump_failed", { scope, error: errorMessage(error) });
      return null;
    } finally {
      shared!.generations.set(scope, (shared!.generations.get(scope) ?? 0) + 1);
    }
  };

  /** Resolves the scope token, or null when KV must be skipped for this read. */
  const versionOf = async (scope: PlatformCacheScope): Promise<string | null> => {
    if (versions.has(scope)) return versions.get(scope)!;
    if (!kv || !shared) return null;
    const now = Date.now();
    let version: string | null;
    const memo = shared.versions.get(scope);
    const generation = shared.generations.get(scope) ?? 0;
    if (shared.bypassUntil > now) {
      version = null;
    } else if (shared.unbumped.has(scope)) {
      version = await bump(scope);
    } else if (memo && now - memo.readAt < VERSION_MEMO_MS) {
      version = memo.token;
    } else {
      try {
        version = (await kv.get(VERSION_KEYS[scope])) ?? "0";
        // A bump that settled during the read is newer than this token.
        if ((shared.generations.get(scope) ?? 0) === generation) shared.versions.set(scope, { token: version, readAt: now });
      } catch (error) {
        // Never look up or write entries under an unknown token; fall back to
        // the loader and stop spending KV operations for a short window.
        version = null;
        enterBypass(shared);
        logCacheEvent("version_read_failed", { scope, error: errorMessage(error) });
      }
    }
    // The writing instance already pinned its post-write token; keep it.
    if (!versions.has(scope)) versions.set(scope, version);
    return versions.get(scope)!;
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

  // Fixed-TTL entries for volatile reads whose freshness contract is a short
  // wall-clock window instead of version-bump invalidation. The stored `exp`
  // is authoritative so KV's own lazy expiry cannot stretch the window.
  const cachedTtl = <T>(name: string, ttlSeconds: number, loader: Loader<T>): Promise<T> => {
    if (!kv || !shared) return loader();
    let scopeMemos = memos.get("ttl");
    if (!scopeMemos) {
      scopeMemos = new Map();
      memos.set("ttl", scopeMemos);
    }
    const memoized = scopeMemos.get(name);
    if (memoized) return memoized as Promise<T>;
    const promise = (async () => {
      const key = `owb:v1:ttl:${name}`;
      const now = Date.now();
      const live = (stored: string | null | undefined): { v: T } | undefined => {
        if (stored === null || stored === undefined) return undefined;
        try {
          const entry = JSON.parse(stored) as { v: T; exp: number };
          return entry.exp > now ? entry : undefined;
        } catch {
          return undefined;
        }
      };
      const remembered = recallEntry(shared, key);
      const rememberedEntry = live(remembered);
      if (rememberedEntry) return rememberedEntry.v;
      if (remembered !== undefined) forgetEntry(shared, key);
      let kvAvailable = shared.bypassUntil <= now;
      if (kvAvailable) {
        try {
          const stored = await kv.get(key, "text");
          const entry = live(stored);
          if (entry) {
            rememberEntry(shared, key, stored!);
            return entry.v;
          }
        } catch (error) {
          kvAvailable = false;
          enterBypass(shared);
          logCacheEvent("entry_read_failed", { scope: "ttl", name, error: errorMessage(error) });
        }
      }
      const value = await loader();
      const serialized = JSON.stringify({ v: value, exp: Date.now() + ttlSeconds * 1000 });
      rememberEntry(shared, key, serialized);
      if (kvAvailable) {
        try {
          await kv.put(key, serialized, { expirationTtl: Math.max(ttlSeconds, 60) });
        } catch (error) {
          enterBypass(shared);
          logCacheEvent("entry_write_failed", { scope: "ttl", name, error: errorMessage(error) });
        }
      }
      return value;
    })();
    scopeMemos.set(name, promise);
    promise.catch(() => scopeMemos.delete(name));
    return promise;
  };

  const invalidate = async (scope: PlatformCacheScope): Promise<void> => {
    // Bump on every write, not once per instance: a second write after reads
    // cached the intermediate state would otherwise leave stale entries valid
    // for the full entry TTL. Batch callers coalesce to one bump per scope.
    if (!kv || !shared) return;
    memos.delete(scope);
    // Attempted even during a read bypass: a published bump is what lets other
    // isolates observe the write. On failure the scope is marked unbumped, so
    // reads skip the cache and retry the bump instead of returning to the
    // pre-write token once the bypass window ends.
    versions.set(scope, await bump(scope));
  };

  return { cached, cachedTtl, invalidate };
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
  "standalone_modes",
  "random_event_map_challenges",
  "random_event_title_challenges",
  "random_event_outcomes",
  "random_event_imports",
  "effect_glossary_terms",
]);
const GRANT_TABLES = new Set([
  "mastery_runs",
  "player_accounts",
  "player_title_grants",
  "player_title_entitlements",
  "player_equipped_titles",
  "player_title_wear",
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

type WrappedStatement = D1PreparedStatement & { __scopes: PlatformCacheScope[]; __inner: D1PreparedStatement };

/**
 * Wraps a D1Database so that every successful write to a cached table bumps
 * the matching cache scope version. Read statements pass through untouched.
 */
export const instrumentDatabase = (database: D1Database, cache: PlatformCache): D1Database => {
  const invalidate = async (scopes: Iterable<PlatformCacheScope>) => {
    await Promise.all([...scopes].map((scope) => cache.invalidate(scope)));
  };
  // A write that throws may still have committed (for example a timeout), so
  // the scopes are bumped on failure too; the cost is only extra cache misses.
  const afterWrite = async <R>(scopes: Iterable<PlatformCacheScope>, write: () => Promise<R>): Promise<R> => {
    try {
      return await write();
    } finally {
      await invalidate(scopes);
    }
  };

  // A statement's write targets are fixed by its SQL, so they are parsed once at prepare time.
  const wrapStatement = (statement: D1PreparedStatement, scopes: PlatformCacheScope[]): WrappedStatement => {
    const wrapped: WrappedStatement = {
      __scopes: scopes,
      __inner: statement,
      bind(...values: unknown[]) {
        return wrapStatement(statement.bind(...values), scopes) as D1PreparedStatement;
      },
      run<T = unknown>() {
        return afterWrite(scopes, () => statement.run<T>());
      },
      all<T = unknown>() {
        return afterWrite(scopes, () => statement.all<T>());
      },
      first<T = unknown>(column?: string) {
        return afterWrite(scopes, () => column === undefined ? statement.first<T>() : statement.first<T>(column));
      },
      raw<T extends unknown[] = unknown[]>(options?: { columnNames?: boolean }) {
        return afterWrite(scopes, () => (statement.raw as (opts?: { columnNames?: boolean }) => Promise<T[]>)(options));
      },
    } as WrappedStatement;
    return wrapped;
  };

  return {
    prepare(sql: string) {
      return wrapStatement(database.prepare(sql), scopesTouchedBy(sql));
    },
    async batch<T = unknown>(statements: D1PreparedStatement[]) {
      const inner = statements.map((statement) => (statement as WrappedStatement).__inner ?? statement);
      return afterWrite(new Set(statements.flatMap((statement) => (statement as WrappedStatement).__scopes ?? [])), () => database.batch<T>(inner as [D1PreparedStatement, ...D1PreparedStatement[]]));
    },
    async exec(sql: string) {
      return afterWrite(scopesTouchedBy(sql), () => database.exec(sql));
    },
    withSession(constraintOrBookmark?: string) {
      return instrumentDatabase(database.withSession(constraintOrBookmark) as unknown as D1Database, cache) as unknown as D1DatabaseSession;
    },
  } as unknown as D1Database;
};
