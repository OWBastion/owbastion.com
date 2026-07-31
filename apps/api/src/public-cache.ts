type CacheStatus = "HIT" | "MISS" | "BYPASS" | "READ_FAILURE" | "WRITE_FAILURE";

type PublicCacheOptions = {
  request: Request;
  cacheKey: Request;
  enabled: boolean;
  eligible: boolean;
  operation: string;
  response: () => Promise<Response> | Response;
  decorateHit?: (response: Response) => Response;
  waitUntil?: (promise: Promise<unknown>) => void;
};

const logCacheStatus = (operation: string, status: CacheStatus) => {
  console.log(JSON.stringify({ layer: "api", event: "public_cache", operation, status }));
};

const isPublicJson = (response: Response) => response.ok && response.headers.get("content-type")?.toLowerCase().startsWith("application/json") === true;

const canonicalResponse = (response: Response) => {
  const headers = new Headers(response.headers);
  for (const name of ["access-control-allow-origin", "access-control-allow-credentials", "access-control-allow-headers", "access-control-allow-methods", "set-cookie"]) headers.delete(name);
  return new Response(response.clone().body, { status: response.status, statusText: response.statusText, headers });
};

const defaultCache = (): Cache | undefined => {
  const storage = (globalThis as typeof globalThis & { caches?: { default?: Cache } }).caches;
  return storage?.default;
};

export const withPublicCache = async ({ request, cacheKey, enabled, eligible, operation, response, decorateHit, waitUntil }: PublicCacheOptions): Promise<Response> => {
  if (!enabled || !eligible || request.method !== "GET" || request.headers.has("authorization") || request.headers.has("cookie")) {
    logCacheStatus(operation, "BYPASS");
    const generated = await response();
    generated.headers.set("Cache-Control", "private, no-store");
    return generated;
  }

  const cache = defaultCache();
  if (!cache) {
    logCacheStatus(operation, "BYPASS");
    return response();
  }

  let cached: Response | undefined;
  try {
    cached = await cache.match(cacheKey) ?? undefined;
  } catch {
    logCacheStatus(operation, "READ_FAILURE");
    return response();
  }

  if (cached && isPublicJson(cached)) {
    logCacheStatus(operation, "HIT");
    return decorateHit ? decorateHit(cached) : cached;
  }

  logCacheStatus(operation, "MISS");
  const generated = await response();
  if (!generated.ok) generated.headers.set("Cache-Control", "private, no-store");
  if (!isPublicJson(generated)) return generated;

  const write = cache.put(cacheKey, canonicalResponse(generated)).catch(() => {
    logCacheStatus(operation, "WRITE_FAILURE");
  });
  if (waitUntil) waitUntil(write);
  else await write;
  return generated;
};
