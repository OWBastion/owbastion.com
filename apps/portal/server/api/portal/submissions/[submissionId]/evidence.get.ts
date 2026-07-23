import { proxyUnavailable, requestIdForEvent, setRequestId, upstreamRequestId } from "../../../../utils/request-tracing";

export default defineEventHandler(async (event) => {
  const config = useRuntimeConfig();
  const requestId = requestIdForEvent(event);
  setRequestId(event, requestId);
  const submissionId = getRouterParam(event, "submissionId");
  const headers: Record<string, string> = {};
  const cookie = event.node.req.headers.cookie;
  if (cookie) headers.cookie = Array.isArray(cookie) ? cookie[0] : cookie;
  headers["x-request-id"] = requestId;

  let response: Response;
  try { response = await fetch(new URL(`/v1/me/submissions/${submissionId}/evidence`, config.public.apiBaseUrl), { headers }); }
  catch (error) { return proxyUnavailable(event, requestId, "portal:submission-evidence", error); }
  setRequestId(event, upstreamRequestId(response, requestId));
  setResponseStatus(event, response.status);
  for (const name of ["content-type", "cache-control"]) {
    const value = response.headers.get(name);
    if (value) setResponseHeader(event, name, value);
  }
  return response.body;
});
