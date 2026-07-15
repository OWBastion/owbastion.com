export default defineEventHandler(async (event) => {
  const config = useRuntimeConfig();
  const rawPath = event.context.params?.path ?? "";
  const path = rawPath.startsWith("v1/") ? rawPath.slice(3) : rawPath;
  const search = getRequestURL(event).search;
  const request = event.node.req;
  const headers: Record<string, string> = { accept: "application/json" };
  for (const name of ["cookie", "idempotency-key", "content-type"]) {
    const value = request.headers[name];
    const headerValue = Array.isArray(value) ? value[0] : value;
    if (headerValue) headers[name] = headerValue;
  }
  if (request.headers.cookie) headers.cookie = request.headers.cookie;
  const method = request.method ?? "GET";
  const body = method === "GET" || method === "HEAD" || method === "DELETE" ? undefined : JSON.stringify(await readBody(event));
  const response = await fetch(new URL(`/v1/admin/${path}${search}`, config.public.apiBaseUrl), { method, headers, body });
  setResponseStatus(event, response.status);
  const contentType = response.headers.get("content-type");
  if (contentType) setResponseHeader(event, "content-type", contentType);
  if (response.status === 204) return null;
  return await response.json();
});
