import { proxyResponseBody, proxyUnavailable, requestIdForEvent, setRequestId, upstreamRequestId } from "../../utils/request-tracing";

export default defineEventHandler(async (event) => {
  const config = useRuntimeConfig();
  const rawPath = event.context.params?.path ?? "";
  const path = rawPath.startsWith("v1/") ? rawPath.slice(3) : rawPath;
  const search = getRequestURL(event).search;
  const requestId = requestIdForEvent(event);
  setRequestId(event, requestId);
  const headers: Record<string, string> = { accept: "application/json", "user-agent": "OWBastion-Portal/1.0" };
  for (const name of ["cookie", "idempotency-key", "content-type"]) {
    const value = getRequestHeader(event, name);
    if (value) headers[name] = value;
  }
  const method = event.method;
  const contentType = getRequestHeader(event, "content-type");
  const body = method === "GET" || method === "HEAD" || method === "DELETE" ? undefined : typeof contentType === "string" && contentType.startsWith("multipart/form-data") ? await readRawBody(event) : JSON.stringify(await readBody(event));
  headers["x-request-id"] = requestId;
  let response: Response;
  try { response = await fetch(new URL(`/v1/admin/${path}${search}`, config.public.apiBaseUrl), { method, headers, body }); }
  catch (error) { return proxyUnavailable(event, requestId, `admin:${method}:${path}`, error); }
  const responseId = upstreamRequestId(response, requestId);
  setRequestId(event, responseId);
  setResponseHeader(event, "cache-control", "private, no-store");
  return proxyResponseBody(event, response, responseId);
});
