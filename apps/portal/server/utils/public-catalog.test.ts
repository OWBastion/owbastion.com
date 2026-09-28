import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

type CacheOptions = { maxAge?: number; swr?: boolean; name?: string };

const installCatalogRuntime = () => {
  const entries = new Map<string, { value: unknown; cachedAt: number }>();
  let cacheOptions: CacheOptions | undefined;

  vi.stubGlobal("cachedFunction", (resolve: (...args: string[]) => Promise<unknown>, options: CacheOptions) => {
    cacheOptions = options;
    return async (...args: string[]) => {
      const key = JSON.stringify(args);
      const entry = entries.get(key);
      if (entry && Date.now() - entry.cachedAt <= (options.maxAge ?? 0) * 1000) return entry.value;

      const refresh = resolve(...args).then((value) => {
        entries.set(key, { value, cachedAt: Date.now() });
        return value;
      });
      // Model Nitro's default SWR branch so removing `swr: false` returns stale data here.
      if (entry && options.swr !== false) {
        void refresh.catch(() => {});
        return entry.value;
      }
      return refresh;
    };
  });
  vi.stubGlobal("useRuntimeConfig", () => ({ public: { apiBaseUrl: "http://catalog-upstream.test" } }));
  vi.stubGlobal("createError", (input: { statusCode: number; statusMessage?: string; data?: unknown }) => {
    const error = new Error(input.statusMessage ?? "error") as Error & { statusCode: number; data?: unknown };
    error.statusCode = input.statusCode;
    error.data = input.data;
    return error;
  });

  return { cacheOptions: () => cacheOptions };
};

const jsonResponse = (body: unknown) => new Response(JSON.stringify(body), { status: 200, headers: { "content-type": "application/json" } });

describe("getPublicCatalog freshness bound", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.useFakeTimers();
    vi.setSystemTime(0);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("blocks for a fresh upstream payload after maxAge", async () => {
    const runtime = installCatalogRuntime();
    let resolveRefresh!: (response: Response) => void;
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(jsonResponse({ items: ["before-edit"] }))
      .mockImplementationOnce(() => new Promise<Response>((resolve) => { resolveRefresh = resolve; }));
    vi.stubGlobal("fetch", fetchMock);

    const { getPublicCatalog } = await import("./public-catalog");

    await expect(getPublicCatalog("maps")).resolves.toMatchObject({ items: ["before-edit"] });
    expect(fetchMock).toHaveBeenCalledTimes(1);

    vi.setSystemTime(299_000);
    await expect(getPublicCatalog("maps")).resolves.toMatchObject({ items: ["before-edit"] });
    expect(fetchMock).toHaveBeenCalledTimes(1);

    vi.setSystemTime(300_001);
    const refreshed = getPublicCatalog("maps");
    expect(fetchMock).toHaveBeenCalledTimes(2);
    resolveRefresh(jsonResponse({ items: ["after-edit"] }));
    await expect(refreshed).resolves.toMatchObject({ items: ["after-edit"] });
    expect(runtime.cacheOptions()).toMatchObject({ name: "public-catalog", maxAge: 300, swr: false });
  });
});
