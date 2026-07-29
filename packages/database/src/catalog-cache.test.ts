import { describe, expect, it, vi } from "vitest";
import { bumpCatalogCacheRevision, catalogCacheKey, catalogRevisionCacheKey, getCatalogCacheRevision, withCatalogCache } from "./catalog-cache";

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
  it("always reads catalog data from D1", async () => {
    const { cache } = createCache();
    const put = vi.spyOn(cache, "put");

    await withCatalogCache(cache, catalogCacheKey("events", "all"), async () => ["event"]);

    expect(put).not.toHaveBeenCalled();
  });

  it("does not read catalog revisions from KV", async () => {
    const { cache, values } = createCache();
    const put = vi.spyOn(cache, "put");
    await bumpCatalogCacheRevision(cache, "events");
    expect(values.get(catalogRevisionCacheKey("events"))).toBeUndefined();
    expect(await getCatalogCacheRevision(cache, "events")).toBe("initial");
    expect(await getCatalogCacheRevision(cache, "maps")).toBe("initial");
    expect(put).not.toHaveBeenCalled();
  });

  it("does not read stale catalog values from KV", async () => {
    const { cache } = createCache();
    const load = vi.fn(async () => ["d1"]);
    await withCatalogCache(cache, catalogCacheKey("maps", "maps"), load);
    expect(await withCatalogCache(cache, catalogCacheKey("maps", "maps"), load)).toEqual(["d1"]);
    expect(load).toHaveBeenCalledTimes(2);
  });

  it("does not depend on KV availability", async () => {
    const { cache: brokenCache } = createCache();
    vi.spyOn(brokenCache, "get").mockRejectedValue(new Error("KV unavailable"));
    expect(await withCatalogCache(brokenCache, catalogCacheKey("maps", "maps"), async () => ["map"])).toEqual(["map"]);
  });

  it("does not write revisions during invalidation", async () => {
    const { cache } = createCache();
    const put = vi.spyOn(cache, "put");

    await bumpCatalogCacheRevision(cache, ["events", "maps"]);

    expect(put).not.toHaveBeenCalled();
  });

});
