const catalogCachePrefix = "catalog:v2:";
export const catalogCacheTtlSeconds = 24 * 60 * 60;

export const catalogCacheKey = (suffix: string) => `${catalogCachePrefix}${suffix}`;

export const withCatalogCache = async <T>(cache: KVNamespace | undefined, key: string, load: () => Promise<T>, expirationTtl = catalogCacheTtlSeconds): Promise<T> => {
  if (cache) {
    try {
      const cached = await cache.get<T>(key, "json");
      if (cached !== null) return cached;
    } catch {
      // KV is an optional derived-data optimization; D1 remains authoritative.
    }
  }

  const value = await load();
  if (cache) {
    try {
      await cache.put(key, JSON.stringify(value), { expirationTtl });
    } catch {
      // A cache write failure must not fail an otherwise successful D1 read.
    }
  }
  return value;
};

export const clearCatalogCache = async (cache: KVNamespace | undefined) => {
  if (!cache) return;
  try {
    let cursor: string | undefined;
    do {
      const result = await cache.list({ prefix: catalogCachePrefix, cursor });
      await Promise.all(result.keys.map(({ name }) => cache.delete(name)));
      if (result.list_complete) return;
      cursor = result.cursor;
    } while (cursor);
  } catch {
    // TTL remains the fallback when invalidation is unavailable.
  }
};
