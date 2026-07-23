import { normalizeRequestId } from "~/utils/request-id";

export type PortalErrorData = {
  code?: string;
  message?: string;
  requestId?: string;
};

export type PortalErrorDetails = {
  message: string;
  code?: string;
  requestId?: string;
  statusCode?: number;
  isServerError: boolean;
  description: string;
};

type ErrorResponse = {
  status?: number;
  headers?: Headers | Record<string, string | undefined>;
  _data?: unknown;
};

type ErrorLike = {
  message?: unknown;
  requestId?: unknown;
  statusCode?: unknown;
  data?: unknown;
  response?: ErrorResponse;
};

const record = (value: unknown): Record<string, unknown> | undefined => value && typeof value === "object" ? value as Record<string, unknown> : undefined;

const errorData = (error: ErrorLike) => {
  const data = record(error.data) ?? record(error.response?._data);
  return record(data?.error) as PortalErrorData | undefined;
};

const responseRequestId = (response?: ErrorResponse) => {
  if (!response?.headers) return undefined;
  if (response.headers instanceof Headers) return response.headers.get("x-request-id") ?? undefined;
  return response.headers["x-request-id"] ?? response.headers["X-Request-ID"];
};

export const portalErrorDetails = (error: unknown, fallback = "请求失败，请稍后重试。", context: { requestId?: string } = {}): PortalErrorDetails => {
  const cause = record(error) as ErrorLike | undefined;
  const data = cause ? errorData(cause) : undefined;
  const statusCode = typeof cause?.statusCode === "number" ? cause.statusCode : cause?.response?.status;
  const requestId = normalizeRequestId(data?.requestId) ?? normalizeRequestId(responseRequestId(cause?.response)) ?? normalizeRequestId(typeof cause?.requestId === "string" ? cause.requestId : undefined) ?? normalizeRequestId(context.requestId);
  const message = typeof data?.message === "string" && data.message ? data.message : typeof cause?.message === "string" && cause.message ? cause.message : fallback;
  const code = typeof data?.code === "string" ? data.code : undefined;
  const isServerError = Boolean(data || statusCode || requestId);
  return { message, code, requestId, statusCode, isServerError, description: requestId ? `${message} 请求编号：${requestId}` : message };
};

export const recordPortalError = (error: unknown, context: { operation: string; phase?: string; requestId?: string } & Record<string, unknown>, fallback?: string) => {
  const details = portalErrorDetails(error, fallback, context);
  console.error(JSON.stringify({
    layer: "portal",
    event: "request_failed",
    operation: context.operation,
    ...(context.phase ? { phase: context.phase } : {}),
    ...(details.requestId ? { requestId: details.requestId } : {}),
    ...(details.code ? { code: details.code } : {}),
    ...(details.statusCode ? { statusCode: details.statusCode } : {}),
    message: details.message,
  }));
  return details;
};
