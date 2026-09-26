import { vi } from "vitest";

type ApiHandler = (path: string, options?: any) => unknown;
type OtherFetchHandler = (url: string, options?: any) => unknown;

export function installApiTestFetch(handlers: { admin?: ApiHandler; portal?: ApiHandler; other?: OtherFetchHandler }) {
  const fetch = vi.fn((input: unknown, options?: any) => {
    const url = input instanceof URL ? input.toString() : String(input);
    const scopes = [
      { prefix: "/api/admin", handler: handlers.admin },
      { prefix: "/api/portal", handler: handlers.portal },
    ] as const;

    for (const { prefix, handler } of scopes) {
      if (url !== prefix && !url.startsWith(prefix + "/")) continue;
      if (!handler) return Promise.reject(new Error(`Unexpected request without a ${prefix} test handler: ${url}`));
      return Promise.resolve(handler(url.slice(prefix.length), options));
    }

    if (handlers.other) return Promise.resolve(handlers.other(url, options));
    return Promise.reject(new Error(`Unexpected Portal fetch: ${url}`));
  });

  vi.stubGlobal("$fetch", fetch);
  return fetch;
}
