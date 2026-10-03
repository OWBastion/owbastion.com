import type { FetchOptions } from "ofetch";
import { createRequestId, REQUEST_ID_HEADER } from "./request-id";
import { recordPortalError } from "./portal-error";

export type ApiFetcher = <T>(request: string, options?: FetchOptions<"json">) => Promise<T>;

export function createApiClient(basePath: string, requestFetch: ApiFetcher, cache?: RequestCache) {
  return async <T>(path: string, options: FetchOptions<"json"> = {}) => {
    const requestId = createRequestId();
    const headers = new Headers(options?.headers as HeadersInit | undefined);
    if (!headers.has(REQUEST_ID_HEADER)) headers.set(REQUEST_ID_HEADER, requestId);
    try {
      return await requestFetch<T>(`${basePath}${path}`, { ...options, ...(cache ? { cache } : {}), headers, credentials: "include", retry: 0, timeout: 8_000 });
    } catch (error) {
      Object.assign(error as object, { requestId });
      recordPortalError(error, { operation: path, requestId });
      throw error;
    }
  };
}
