import { describe, expect, it, vi } from "vitest";
import { bumpCatalogCacheRevision, catalogCacheKey, catalogRevisionCacheKey, catalogRevisionCacheTtlSeconds, getCatalogCacheRevision, withCatalogCache } from "./catalog-cache";

type CatalogCache = NonNullable<Parameters<typeof withCatalogCache>[0]>;

const createCache = () => {
  const values = new Map<string, string>();
  const cache = {
    async get<T>(key: string, type?: "json" | "text") {
      const value = values.get(key);
      return value ? (type === "text" ? value : JSON.parse(value)) as T : null;
    },
    async put(key: string, value: string) {
      values.set(key, value);
    },
  } as CatalogCache;
  return { cache, values };
};

describe("catalog cache", () => {
  it("uses a seven-day TTL for catalog data", async () => {
    const { cache } = createCache();
    const put = vi.spyOn(cache, "put");

    await withCatalogCache(cache, catalogCacheKey("events", "all"), async () => ["event"]);

    expect(put).toHaveBeenCalledWith(catalogCacheKey("events", "all"), JSON.stringify(["event"]), { expirationTtl: 7 * 24 * 60 * 60 });
  });

  it("keeps revisions for independent domains", async () => {
    const { cache, values } = createCache();
    const put = vi.spyOn(cache, "put");
    await bumpCatalogCacheRevision(cache, "events");
    const eventsRevision = values.get(catalogRevisionCacheKey("events"));
    expect(eventsRevision).toBeTruthy();
    expect(await getCatalogCacheRevision(cache, "events")).toBe(eventsRevision);
    expect(await getCatalogCacheRevision(cache, "maps")).toBe("initial");
    expect(put).toHaveBeenCalledWith(catalogRevisionCacheKey("events"), eventsRevision, { expirationTtl: catalogRevisionCacheTtlSeconds });
  });

  it("returns a cached value without loading D1", async () => {
    const { cache } = createCache();
    const load = vi.fn(async () => ["d1"]);
    await withCatalogCache(cache, catalogCacheKey("maps", "maps"), load);
    expect(await withCatalogCache(cache, catalogCacheKey("maps", "maps"), load)).toEqual(["d1"]);
    expect(load).toHaveBeenCalledOnce();
  });

  it("falls back when KV fails", async () => {
    const { cache: brokenCache } = createCache();
    vi.spyOn(brokenCache, "get").mockRejectedValue(new Error("KV unavailable"));
    expect(await withCatalogCache(brokenCache, catalogCacheKey("maps", "maps"), async () => ["map"])).toEqual(["map"]);
  });

  it("does not list or delete old catalog keys during invalidation", async () => {
    const { cache } = createCache();
    const list = vi.fn();
    const remove = vi.fn();
    Object.assign(cache, { list, delete: remove });

    await bumpCatalogCacheRevision(cache, ["events", "maps"]);

    expect(list).not.toHaveBeenCalled();
    expect(remove).not.toHaveBeenCalled();
  });

  it("does not fail the write path when revision KV is unavailable", async () => {
    const cache = { put: vi.fn().mockRejectedValue(new Error("KV unavailable")) } as unknown as KVNamespace;
    await expect(bumpCatalogCacheRevision(cache, "titles")).resolves.toBeUndefined();
  });
});
