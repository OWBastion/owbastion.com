import { vi } from "vitest";

type ApiHandler = (path: string, options?: any) => unknown;
type OtherFetchHandler = (url: string, options?: any) => unknown;

const applicationOptions = (options?: any) => {
  if (!options) return undefined;
  const normalized = { ...options };
  delete normalized.cache;
  delete normalized.credentials;
  delete normalized.retry;
  delete normalized.timeout;

  const headers = new Headers(options.headers);
  headers.delete("x-request-id");
  if ([...headers].length) {
    normalized.headers = Object.fromEntries([...headers].map(([name, value]) => [
      name === "idempotency-key" ? "Idempotency-Key" : name,
      value,
    ]));
  } else {
    delete normalized.headers;
  }

  return Object.keys(normalized).length ? normalized : undefined;
};

export function installApiTestFetch(handlers: { admin?: ApiHandler; portal?: ApiHandler; other?: OtherFetchHandler }) {
  const fetch = vi.fn((input: unknown, options?: any) => {
    const url = input instanceof URL ? input.toString() : String(input);
    const scopes = [
      { prefix: "/api/admin/v1", handler: handlers.admin },
      { prefix: "/api/portal/v1", handler: handlers.portal },
    ] as const;

    for (const { prefix, handler } of scopes) {
      if (url !== prefix && !url.startsWith(prefix + "/") && !url.startsWith(prefix + "?")) continue;
      if (!handler) return Promise.reject(new Error(`Unexpected request without a ${prefix} test handler: ${url}`));
      const path = "/v1" + url.slice(prefix.length);
      const forwarded = applicationOptions(options);
      return Promise.resolve(forwarded ? handler(path, forwarded) : handler(path));
    }

    if (handlers.other) return Promise.resolve(handlers.other(url, options));
    return Promise.reject(new Error(`Unexpected Portal fetch: ${url}`));
  });

  vi.stubGlobal("$fetch", fetch);
  return fetch;
}
