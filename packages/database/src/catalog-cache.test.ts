import { describe, expect, it, vi } from "vitest";
import { catalogCacheKey, clearCatalogCache, withCatalogCache } from "./catalog-cache";

type CatalogCache = NonNullable<Parameters<typeof withCatalogCache>[0]>;

const createCache = () => {
  const values = new Map<string, string>();
  const cache = {
    async get<T>(key: string) {
      const value = values.get(key);
      return value ? JSON.parse(value) as T : null;
    },
    async put(key: string, value: string) {
      values.set(key, value);
    },
    async delete(key: string) {
      values.delete(key);
    },
    async list({ prefix }: { prefix?: string } = {}) {
      return { list_complete: true as const, keys: [...values.keys()].filter((key) => !prefix || key.startsWith(prefix)).map((name) => ({ name })) };
    },
  } as CatalogCache;
  return { cache, values };
};

describe("catalog cache", () => {
  it("uses a seven-day default TTL for invalidated catalog data", async () => {
    const { cache } = createCache();
    const put = vi.spyOn(cache, "put");

    await withCatalogCache(cache, catalogCacheKey("events:all"), async () => ["event"]);

    expect(put).toHaveBeenCalledWith(catalogCacheKey("events:all"), JSON.stringify(["event"]), { expirationTtl: 7 * 24 * 60 * 60 });
  });

  it("returns a cached value without loading D1", async () => {
    const { cache } = createCache();
    const load = vi.fn(async () => ["d1"]);
    await withCatalogCache(cache, catalogCacheKey("maps"), load);
    expect(await withCatalogCache(cache, catalogCacheKey("maps"), load)).toEqual(["d1"]);
    expect(load).toHaveBeenCalledOnce();
  });

  it("uses distinct keys for query variants and falls back when KV fails", async () => {
    const { cache } = createCache();
    const mapLoad = vi.fn(async () => ["map"]);
    const titleLoad = vi.fn(async () => ["title"]);
    expect(await withCatalogCache(cache, catalogCacheKey("titles:map.samoa"), titleLoad)).toEqual(["title"]);
    expect(await withCatalogCache(cache, catalogCacheKey("titles:map.kings-row"), mapLoad)).toEqual(["map"]);

    const { cache: brokenCache } = createCache();
    vi.spyOn(brokenCache, "get").mockRejectedValue(new Error("KV unavailable"));
    expect(await withCatalogCache(brokenCache, catalogCacheKey("maps"), mapLoad)).toEqual(["map"]);
  });

  it("includes revision namespace in cache key when provided", () => {
    expect(catalogCacheKey("maps", "26.0714.1:hash123")).toBe("catalog:v2:26.0714.1:hash123:maps");
    expect(catalogCacheKey("maps")).toBe("catalog:v2:maps");
  });

  it("clears all catalog keys including revisioned keys while preserving unrelated keys", async () => {
    const { cache, values } = createCache();
    values.set(catalogCacheKey("maps"), JSON.stringify(["map"]));
    values.set(catalogCacheKey("maps", "v1:hash123"), JSON.stringify(["map_v1"]));
    values.set("other:key", JSON.stringify(["other"]));
    await clearCatalogCache(cache);
    expect(values.has(catalogCacheKey("maps"))).toBe(false);
    expect(values.has(catalogCacheKey("maps", "v1:hash123"))).toBe(false);
    expect(values.has("other:key")).toBe(true);
  });
});
