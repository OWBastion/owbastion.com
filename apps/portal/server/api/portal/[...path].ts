import { proxyResponseBody, proxyUnavailable, requestIdForEvent, setRequestId, upstreamRequestId } from "../../utils/request-tracing";

export default defineEventHandler(async (event) => {
  const config = useRuntimeConfig();
  const path = event.context.params?.path ?? "";
  const request = event.node.req;
  const requestId = requestIdForEvent(event);
  setRequestId(event, requestId);
  const incomingUrl = getRequestURL(event);
  const target = new URL(`/` + path, config.public.apiBaseUrl);
  target.search = incomingUrl.search;
  const headers: Record<string, string> = { accept: "application/json", "user-agent": "OWBastion-Portal/1.0" };

  for (const name of ["cookie", "origin", "idempotency-key", "content-type", "x-login-attempt-token", "x-claim-token"]) {
    const value = request.headers[name];
    const headerValue = Array.isArray(value) ? value[0] : value;
    if (headerValue) headers[name] = headerValue;
  }

  const method = request.method ?? "GET";
  const body = method === "GET" || method === "HEAD" ? undefined : JSON.stringify(await readBody(event));
  headers["x-request-id"] = requestId;
  let response: Response;
  try { response = await fetch(target, { method, headers, body }); }
  catch (error) { return proxyUnavailable(event, requestId, `portal:${method}:${path}`, error); }
  const responseId = upstreamRequestId(response, requestId);
  setRequestId(event, responseId);
  const setCookie = response.headers.get("set-cookie");
  if (setCookie) setResponseHeader(event, "set-cookie", setCookie);
  return proxyResponseBody(event, response, responseId);
});
