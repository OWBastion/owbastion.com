export type StudioPlatformPlayer = {
  player: {
    playerName: string;
    isAdmin: boolean;
  };
};

export type StudioAccess = "admin" | "anonymous" | "non-admin";
export type StudioRequestDecision = "ignore" | "allow" | "clear-session" | "deny";

const studioRepositoryPrefix = "repos/OWBastion/owbastion.com/";
const studioContentRoot = "apps/portal";

export const studioAccessForPlayer = (player: StudioPlatformPlayer | null): StudioAccess => {
  if (!player) return "anonymous";
  return player.player.isAdmin ? "admin" : "non-admin";
};

export const isStudioCapabilityPath = (pathname: string) => pathname === "/_studio" || pathname.startsWith("/__nuxt_studio/") || pathname === "/api/studio/git" || pathname.startsWith("/api/studio/git/");

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

export const sanitizeStudioSessionResponse = (body: unknown) => {
  const parsedBody = typeof body === "string" ? (() => {
    try {
      return JSON.parse(body) as unknown;
    } catch {
      return body;
    }
  })() : body;
  if (!parsedBody || typeof parsedBody !== "object" || Array.isArray(parsedBody)) return body;
  const session = parsedBody as { user?: unknown } & Record<string, unknown>;
  if (!session.user || typeof session.user !== "object" || Array.isArray(session.user)) return body;
  const user = { ...(session.user as Record<string, unknown>) };
  delete user.accessToken;
  const sanitized = { ...session, user };
  return typeof body === "string" ? JSON.stringify(sanitized) : sanitized;
};

export const studioGitProxyTarget = (path: string, method: string, search: URLSearchParams) => {
  const normalizedPath = path.replace(/^\/+/, "");
  if (!normalizedPath.startsWith(studioRepositoryPrefix)) return null;

  const operation = normalizedPath.slice(studioRepositoryPrefix.length);
  const normalizedMethod = method.toUpperCase();
  if (operation.startsWith("contents/")) {
    if (search.toString() !== "ref=main") return null;
    let contentPath: string;
    try {
      contentPath = decodeURIComponent(operation.slice("contents/".length));
    } catch {
      return null;
    }
    const segments = contentPath.split("/");
    if (!contentPath.startsWith(`${studioContentRoot}/`) || segments.includes("..") || segments.includes(".")) return null;
    if (normalizedMethod !== "GET") return null;
    return `/repos/OWBastion/owbastion.com/${operation}`;
  }

  if (operation === "git/refs/heads/main") {
    return normalizedMethod === "GET" || normalizedMethod === "PATCH" ? `/repos/OWBastion/owbastion.com/${operation}` : null;
  }
  if (/^git\/commits\/[0-9a-f]{7,64}$/i.test(operation)) {
    return normalizedMethod === "GET" ? `/repos/OWBastion/owbastion.com/${operation}` : null;
  }
  if (operation === "git/blobs" || operation === "git/trees" || operation === "git/commits") {
    return normalizedMethod === "POST" ? `/repos/OWBastion/owbastion.com/${operation}` : null;
  }
  return null;
};
