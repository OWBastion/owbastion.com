import { createError, getRequestURL, sendRedirect } from "h3";
import { getPlatformCurrentPlayer, isStudioCapabilityPath, studioRequestDecision } from "~/server/utils/studio-auth";

export default defineEventHandler(async (event) => {
  const pathname = getRequestURL(event).pathname;
  if (!isStudioCapabilityPath(pathname)) return;
  const player = await getPlatformCurrentPlayer(event);
  const decision = studioRequestDecision(pathname, player);

  if (decision === "clear-session") {
    await clearStudioUserSession(event);
    return;
  }

  if (decision === "deny") throw createError({ statusCode: 404, statusMessage: "Not found" });
  if (pathname === "/_studio") return sendRedirect(event, "/api/studio/login?redirect=%2Fadmin%2Fcontent");
});
