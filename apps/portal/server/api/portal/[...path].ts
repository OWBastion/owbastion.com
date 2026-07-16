export default defineEventHandler(async (event) => {
  const config = useRuntimeConfig();
  const path = event.context.params?.path ?? "";
  const request = event.node.req;
  const incomingUrl = getRequestURL(event);
  const target = new URL(`/` + path, config.public.apiBaseUrl);
  target.search = incomingUrl.search;
  const headers: Record<string, string> = { accept: "application/json" };

  for (const name of ["cookie", "idempotency-key", "content-type", "x-login-attempt-token"]) {
    const value = request.headers[name];
    const headerValue = Array.isArray(value) ? value[0] : value;
    if (headerValue) headers[name] = headerValue;
  }

  const method = request.method ?? "GET";
  const body = method === "GET" || method === "HEAD" ? undefined : JSON.stringify(await readBody(event));
  const response = await fetch(target, { method, headers, body });
  const setCookie = response.headers.get("set-cookie");
  if (setCookie) setResponseHeader(event, "set-cookie", setCookie);
  const contentType = response.headers.get("content-type");
  if (contentType) setResponseHeader(event, "content-type", contentType);
  setResponseStatus(event, response.status);
  if (response.status === 204) return null;
  return await response.json();
});
