export default defineEventHandler(async (event) => {
  const config = useRuntimeConfig();
  const submissionId = getRouterParam(event, "submissionId");
  const headers: Record<string, string> = {};
  const cookie = event.node.req.headers.cookie;
  if (cookie) headers.cookie = Array.isArray(cookie) ? cookie[0] : cookie;
  if (event.node.req.headers.cookie) headers.cookie = event.node.req.headers.cookie;
  const response = await fetch(new URL(`/v1/admin/submissions/${submissionId}/evidence`, config.public.apiBaseUrl), { headers });
  setResponseStatus(event, response.status);
  const contentType = response.headers.get("content-type");
  if (contentType) setResponseHeader(event, "content-type", contentType);
  return response.body;
});
