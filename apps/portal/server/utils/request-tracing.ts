import type { H3Event } from "h3";
import { REQUEST_ID_HEADER, ensureRequestId, normalizeRequestId } from "~/utils/request-id";

const headerValue = (value: string | string[] | undefined) => Array.isArray(value) ? value[0] : value;

export const requestIdForEvent = (event: H3Event) => ensureRequestId(headerValue(event.node.req.headers[REQUEST_ID_HEADER]));

export const setRequestId = (event: H3Event, requestId: string) => setResponseHeader(event, REQUEST_ID_HEADER, requestId);

export const upstreamRequestId = (response: Response, fallback: string) => normalizeRequestId(response.headers.get(REQUEST_ID_HEADER)) ?? fallback;

export const logProxyError = (requestId: string, operation: string, error: unknown, statusCode?: number) => {
  console.error(JSON.stringify({
    layer: "portal-server",
    event: "upstream_request_failed",
    operation,
    requestId,
    ...(statusCode ? { statusCode } : {}),
    error: error instanceof Error ? error.message : String(error),
  }));
};

export const proxyUnavailable = (event: H3Event, requestId: string, operation: string, error: unknown) => {
  logProxyError(requestId, operation, error, 502);
  setRequestId(event, requestId);
  setResponseHeader(event, "content-type", "application/json");
  setResponseStatus(event, 502);
  return { contractVersion: "1" as const, error: { code: "UPSTREAM_UNAVAILABLE", message: "上游服务暂不可用，请稍后重试。", requestId } };
};
