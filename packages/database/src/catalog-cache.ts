export type CatalogCacheDomain = "events" | "maps" | "challenges" | "titles" | "grants";

const catalogCachePrefix = "catalog:v5:";
const catalogRevisionPrefix = "catalog:revision:v1:";
export const catalogCacheTtlSeconds = 7 * 24 * 60 * 60;
export const catalogRevisionCacheTtlSeconds = 30 * 24 * 60 * 60;

export const catalogRevisionCacheKey = (domain: CatalogCacheDomain) => `${catalogRevisionPrefix}${domain}`;

export const catalogCacheKey = (domain: CatalogCacheDomain, suffix: string, revision?: string) => {
  const revSegment = revision ?? "initial";
  return `${catalogCachePrefix}${domain}:${revSegment}:${suffix}`;
};

const cacheEvent = (event: string, domain: CatalogCacheDomain) => {
  console.debug(`[catalog-cache] ${event} domain=${domain}`);
};

export const getCatalogCacheRevision = async (cache: KVNamespace | undefined, domain: CatalogCacheDomain): Promise<string> => {
  if (!cache) return "initial";
  try {
    const revision = await cache.get(catalogRevisionCacheKey(domain), "text");
    return revision ?? "initial";
  } catch {
    cacheEvent("revision_read_failed", domain);
    return "initial";
  }
};

export const bumpCatalogCacheRevision = async (cache: KVNamespace | undefined, domains: CatalogCacheDomain | CatalogCacheDomain[]) => {
  if (!cache) return;
  for (const domain of [...new Set(Array.isArray(domains) ? domains : [domains])]) {
    try {
      await cache.put(catalogRevisionCacheKey(domain), crypto.randomUUID(), { expirationTtl: catalogRevisionCacheTtlSeconds });
      cacheEvent("revision_bumped", domain);
    } catch {
      cacheEvent("revision_write_failed", domain);
    }
  }
};

export const withCatalogCache = async <T>(cache: KVNamespace | undefined, key: string, load: () => Promise<T>, expirationTtl = catalogCacheTtlSeconds): Promise<T> => {
  const domain = key.split(":")[2] as CatalogCacheDomain;
  if (cache) {
    try {
      const cached = await cache.get<T>(key, "json");
      if (cached !== null) {
        cacheEvent("hit", domain);
        return cached;
      }
      cacheEvent("miss", domain);
    } catch {
      cacheEvent("read_failed", domain);
    }
  }

  const value = await load();
  if (cache) {
    try {
      await cache.put(key, JSON.stringify(value), { expirationTtl });
    } catch {
      cacheEvent("write_failed", domain);
    }
  }
  return value;
};
