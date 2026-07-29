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

export const getCatalogCacheRevision = async (cache: KVNamespace | undefined, domain: CatalogCacheDomain): Promise<string> => {
  void cache;
  void domain;
  return "initial";
};

export const bumpCatalogCacheRevision = async (cache: KVNamespace | undefined, domains: CatalogCacheDomain | CatalogCacheDomain[]) => {
  void cache;
  void domains;
};

export const withCatalogCache = async <T>(cache: KVNamespace | undefined, key: string, load: () => Promise<T>, expirationTtl = catalogCacheTtlSeconds): Promise<T> => {
  void cache;
  void key;
  void expirationTtl;
  return load();
};
