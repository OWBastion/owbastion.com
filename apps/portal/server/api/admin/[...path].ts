import { proxyUnavailable, requestIdForEvent, setRequestId, upstreamRequestId } from "../../utils/request-tracing";

export default defineEventHandler(async (event) => {
  const config = useRuntimeConfig();
  const rawPath = event.context.params?.path ?? "";
  const path = rawPath.startsWith("v1/") ? rawPath.slice(3) : rawPath;
  const search = getRequestURL(event).search;
  const request = event.node.req;
  const requestId = requestIdForEvent(event);
  setRequestId(event, requestId);
  const headers: Record<string, string> = { accept: "application/json" };
  for (const name of ["cookie", "idempotency-key", "content-type"]) {
    const value = request.headers[name];
    const headerValue = Array.isArray(value) ? value[0] : value;
    if (headerValue) headers[name] = headerValue;
  }
  if (request.headers.cookie) headers.cookie = request.headers.cookie;
  const method = request.method ?? "GET";
  const contentType = request.headers["content-type"];
  const body = method === "GET" || method === "HEAD" || method === "DELETE" ? undefined : typeof contentType === "string" && contentType.startsWith("multipart/form-data") ? await readRawBody(event) : JSON.stringify(await readBody(event));
  headers["x-request-id"] = requestId;
  let response: Response;
  try { response = await fetch(new URL(`/v1/admin/${path}${search}`, config.public.apiBaseUrl), { method, headers, body }); }
  catch (error) { return proxyUnavailable(event, requestId, `admin:${method}:${path}`, error); }
  const responseId = upstreamRequestId(response, requestId);
  setRequestId(event, responseId);
  setResponseStatus(event, response.status);
  const responseContentType = response.headers.get("content-type");
  if (responseContentType) setResponseHeader(event, "content-type", responseContentType);
  if (response.status === 204) return null;
  const responseText = await response.text();
  try {
    return JSON.parse(responseText);
  } catch {
    setResponseHeader(event, "content-type", "application/json");
    return { contractVersion: "1", error: { code: `UPSTREAM_${response.status}`, message: responseText.trim() || "上游 API 返回了无效响应。", requestId: responseId } };
  }
});
