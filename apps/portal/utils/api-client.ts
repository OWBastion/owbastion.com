import { createRequestId, REQUEST_ID_HEADER } from "./request-id";
import { recordPortalError } from "./portal-error";

type ApiFetcher = <T>(request: string, options?: Parameters<typeof $fetch<T>>[1]) => Promise<T>;

export function createApiClient(basePath: string, requestFetch: ApiFetcher, cache?: RequestCache) {
  return async <T>(path: string, options: Parameters<typeof $fetch<T>>[1] = {}) => {
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
