import { proxyUnavailable, requestIdForEvent, setRequestId, upstreamRequestId } from "../../../utils/request-tracing";

export default defineEventHandler(async (event) => {
  const config = useRuntimeConfig();
  const requestId = requestIdForEvent(event);
  setRequestId(event, requestId);
  const uploadId = getRouterParam(event, "uploadId");
  if (!uploadId) throw createError({ statusCode: 400, statusMessage: "Upload ID is required" });

  const headers: Record<string, string> = {};
  const cookie = event.node.req.headers.cookie;
  const contentType = event.node.req.headers["content-type"];
  if (cookie) headers.cookie = Array.isArray(cookie) ? cookie[0] : cookie;
  if (contentType) headers["content-type"] = Array.isArray(contentType) ? contentType[0] : contentType;
  headers["x-request-id"] = requestId;

  const rawBody = await readRawBody(event, false);
  let response: Response;
  try {
    response = await fetch(new URL(`/v1/uploads/${encodeURIComponent(uploadId)}`, config.public.apiBaseUrl), {
      method: "PUT",
      headers,
      body: rawBody ? new Uint8Array(rawBody).buffer : null,
    });
  } catch (error) { return proxyUnavailable(event, requestId, "portal:upload", error); }
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
