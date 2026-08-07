import { createError, getQuery, sendRedirect, setResponseHeader } from "h3";
import { getPlatformCurrentPlayer, safeStudioRedirect, studioAccessForPlayer, studioUserForAdmin } from "~/server/utils/studio-auth";

export default defineEventHandler(async (event) => {
  setResponseHeader(event, "cache-control", "private, no-store");
  const player = await getPlatformCurrentPlayer(event);
  const access = studioAccessForPlayer(player);
  if (access === "anonymous") throw createError({ statusCode: 401, statusMessage: "请先登录平台账号。" });
  if (access !== "admin" || !player) throw createError({ statusCode: 403, statusMessage: "当前账号没有内容编辑权限。" });

  try {
    await setStudioUserSession(event, studioUserForAdmin(player));
  } catch {
    throw createError({ statusCode: 503, statusMessage: "内容编辑器暂未完成服务端配置。" });
  }

  return sendRedirect(event, safeStudioRedirect(getQuery(event).redirect));
});
