import type { H3Event } from "h3";
import { createError, getRequestHeader } from "h3";
import { useRuntimeConfig } from "#imports";
import type { CurrentPlayer } from "~/composables/usePortalApi";

type StudioPlatformPlayer = Pick<CurrentPlayer, "player">;

export type StudioAccess = "admin" | "anonymous" | "non-admin";
export type StudioRequestDecision = "ignore" | "allow" | "clear-session" | "deny";

export const studioAccessForPlayer = (player: StudioPlatformPlayer | null): StudioAccess => {
  if (!player) return "anonymous";
  return player.player.isAdmin ? "admin" : "non-admin";
};

export const isStudioCapabilityPath = (pathname: string) => pathname === "/_studio" || pathname.startsWith("/__nuxt_studio/");

export const isStudioSessionPath = (pathname: string) => pathname === "/__nuxt_studio/auth/session";

export const studioRequestDecision = (pathname: string, player: StudioPlatformPlayer | null): StudioRequestDecision => {
  if (!isStudioCapabilityPath(pathname)) return "ignore";
  const access = studioAccessForPlayer(player);
  if (isStudioSessionPath(pathname) && access !== "admin") return "clear-session";
  return access === "admin" ? "allow" : "deny";
};

export const safeStudioRedirect = (redirect: unknown) => {
  const fallback = "/admin/content";
  if (typeof redirect !== "string" || !redirect.startsWith("/") || redirect.startsWith("//") || redirect.includes("\\")) return fallback;
  try {
    const url = new URL(redirect, "http://portal.invalid");
    return url.origin === "http://portal.invalid" ? `${url.pathname}${url.search}${url.hash}` : fallback;
  } catch {
    return fallback;
  }
};

export const studioUserForAdmin = (player: StudioPlatformPlayer) => ({
  name: player.player.playerName,
  email: "content-editor@owbastion.local",
  providerId: "platform-admin",
});

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
