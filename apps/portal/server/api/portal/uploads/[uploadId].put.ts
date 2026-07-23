export default defineEventHandler(async (event) => {
  const config = useRuntimeConfig();
  const uploadId = getRouterParam(event, "uploadId");
  if (!uploadId) throw createError({ statusCode: 400, statusMessage: "Upload ID is required" });

  const headers: Record<string, string> = {};
  const cookie = event.node.req.headers.cookie;
  const contentType = event.node.req.headers["content-type"];
  if (cookie) headers.cookie = Array.isArray(cookie) ? cookie[0] : cookie;
  if (contentType) headers["content-type"] = Array.isArray(contentType) ? contentType[0] : contentType;

  const response = await fetch(new URL(`/v1/uploads/${encodeURIComponent(uploadId)}`, config.public.apiBaseUrl), {
    method: "PUT",
    headers,
    body: await readRawBody(event),
  });
  setResponseStatus(event, response.status);
  const responseContentType = response.headers.get("content-type");
  if (responseContentType) setResponseHeader(event, "content-type", responseContentType);
  if (response.status === 204) return null;
  return await response.json();
});
