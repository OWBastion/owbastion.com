import { getPublicCatalog, type PublicCatalogName } from "../../utils/public-catalog";

const catalogNames = new Set<PublicCatalogName>(["maps", "mapChallenges", "achievements", "events"]);

export default defineEventHandler(async (event) => {
  const name = getRouterParam(event, "catalog");
  if (!name || !catalogNames.has(name as PublicCatalogName)) {
    throw createError({ statusCode: 404, statusMessage: "公开目录不存在。" });
  }
  return getPublicCatalog(name as PublicCatalogName);
});
