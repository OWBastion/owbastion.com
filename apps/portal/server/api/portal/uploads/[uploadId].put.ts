import { proxyResponseBody, proxyUnavailable, requestIdForEvent, setRequestId, upstreamRequestId } from "../../../utils/request-tracing";

export default defineEventHandler(async (event) => {
  const config = useRuntimeConfig();
  const requestId = requestIdForEvent(event);
  setRequestId(event, requestId);
  const uploadId = getRouterParam(event, "uploadId");
  if (!uploadId) throw createError({ statusCode: 400, statusMessage: "Upload ID is required" });

  const headers: Record<string, string> = { "user-agent": "OWBastion-Portal/1.0" };
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
  return proxyResponseBody(event, response, responseId);
});
