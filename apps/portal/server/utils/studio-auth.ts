import type { H3Event } from "h3";
import { createError, getRequestHeader, getRequestProtocol, useSession } from "h3";
import { useRuntimeConfig } from "#imports";
import type { CurrentPlayer } from "~/composables/usePortalApi";

export {
  isStudioCapabilityPath,
  safeStudioRedirect,
  sanitizeStudioSessionResponse,
  studioAccessForPlayer,
  studioGitProxyTarget,
  studioRequestDecision,
  studioUserForAdmin,
} from "~/utils/studio-auth-policy";
export type { StudioAccess, StudioPlatformPlayer, StudioRequestDecision } from "~/utils/studio-auth-policy";

export async function getPlatformCurrentPlayer(event: H3Event): Promise<CurrentPlayer | null> {
  const cookie = getRequestHeader(event, "cookie");
  if (!cookie) return null;

  const config = useRuntimeConfig(event);
  let response: Response;
  try {
    response = await fetch(new URL("/v1/me", config.public.apiBaseUrl), {
      headers: {
        accept: "application/json",
        cookie,
        "user-agent": "OWBastion-Portal/1.0",
      },
    });
  } catch {
    throw createError({ statusCode: 502, statusMessage: "平台登录状态暂不可用。" });
  }

  if (response.status === 401 || response.status === 403) return null;
  if (!response.ok) throw createError({ statusCode: 502, statusMessage: "平台登录状态暂不可用。" });
  return await response.json() as CurrentPlayer;
}

export async function hasStudioUserSession(event: H3Event) {
  const session = await useSession(event, {
    name: "studio-session",
    password: useRuntimeConfig(event).studio?.auth?.sessionSecret,
    cookie: {
      secure: getRequestProtocol(event) === "https",
      path: "/",
    },
  });
  const user = session.data.user;
  if (!user || typeof user !== "object" || Array.isArray(user)) return false;
  const userRecord = user as Record<string, unknown>;
  return typeof userRecord.name === "string"
    && userRecord.name.trim().length > 0
    && typeof userRecord.email === "string"
    && userRecord.email.trim().length > 0;
}
