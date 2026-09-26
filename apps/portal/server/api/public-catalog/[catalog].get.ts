import { getPublicCatalog, type PublicCatalogName } from "../../utils/public-catalog";

const catalogNames = new Set<PublicCatalogName>(["maps", "mapChallenges", "achievements", "events"]);

export default defineEventHandler(async (event) => {
  const name = getRouterParam(event, "catalog");
  if (!name || !catalogNames.has(name as PublicCatalogName)) {
    throw createError({ statusCode: 404, statusMessage: "公开目录不存在。" });
  }
  try {
    return await getPublicCatalog(name as PublicCatalogName);
  } catch (cause) {
    const upstreamError = cause as { statusCode?: number; statusMessage?: string; data?: unknown };
    if (!upstreamError.statusCode) throw cause;

    const body = upstreamError.data ?? { error: { code: `UPSTREAM_${upstreamError.statusCode}`, message: upstreamError.statusMessage ?? "无法读取公开目录，请稍后重试。" } };
    const requestId = (body as { error?: { requestId?: string } }).error?.requestId;
    if (requestId) setResponseHeader(event, "x-request-id", requestId);
    setResponseStatus(event, upstreamError.statusCode);
    return body;
  }
});
