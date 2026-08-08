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
const studioEditorialMutationRoots = ["apps/portal/content/", "apps/portal/public/content/"] as const;
const studioGitShaPattern = /^[0-9a-f]{40}$/i;

const isRecord = (value: unknown): value is Record<string, unknown> => Boolean(value) && typeof value === "object" && !Array.isArray(value);

const hasOnlyKeys = (value: Record<string, unknown>, keys: readonly string[]) => Object.keys(value).every((key) => keys.includes(key));

const isNonEmptyString = (value: unknown) => typeof value === "string" && value.trim().length > 0;

export const isStudioGitSha = (value: unknown): value is string => typeof value === "string" && studioGitShaPattern.test(value);

const isSafePortalPath = (path: unknown): path is string => {
  if (typeof path !== "string" || !path.startsWith(`${studioContentRoot}/`) || path.includes("\\")) return false;
  return path.split("/").every((segment) => segment.length > 0 && segment !== "." && segment !== "..");
};

export const isStudioEditorialMutationPath = (path: unknown): path is string => {
  if (!isSafePortalPath(path)) return false;
  return studioEditorialMutationRoots.some((root) => path.startsWith(root));
};

export const isStudioGitBlobPayload = (payload: unknown) => {
  if (!isRecord(payload) || !hasOnlyKeys(payload, ["content", "encoding"])) return false;
  return typeof payload.content === "string" && (payload.encoding === "utf-8" || payload.encoding === "base64");
};

export const isStudioGitTreePayload = (payload: unknown, expectedBaseTreeSha: string) => {
  if (!isRecord(payload) || !hasOnlyKeys(payload, ["base_tree", "tree"]) || payload.base_tree !== expectedBaseTreeSha || !isStudioGitSha(expectedBaseTreeSha) || !Array.isArray(payload.tree) || payload.tree.length === 0) return false;
  return payload.tree.every((entry) => {
    if (!isRecord(entry) || !hasOnlyKeys(entry, ["path", "mode", "type", "sha"])) return false;
    return isStudioEditorialMutationPath(entry.path) && entry.mode === "100644" && entry.type === "blob" && (entry.sha === null || isStudioGitSha(entry.sha));
  });
};

export const isStudioGitCommitPayload = (payload: unknown, expectedTreeSha: string, expectedParentSha: string) => {
  if (!isRecord(payload) || !hasOnlyKeys(payload, ["message", "tree", "parents", "author"]) || !isStudioGitSha(expectedTreeSha) || !isStudioGitSha(expectedParentSha)) return false;
  if (!isNonEmptyString(payload.message) || payload.tree !== expectedTreeSha || !Array.isArray(payload.parents) || payload.parents.length !== 1 || payload.parents[0] !== expectedParentSha) return false;
  if (!isRecord(payload.author) || !hasOnlyKeys(payload.author, ["name", "email", "date"])) return false;
  return isNonEmptyString(payload.author.name) && isNonEmptyString(payload.author.email) && isNonEmptyString(payload.author.date) && !Number.isNaN(Date.parse(payload.author.date as string));
};

export const isStudioGitRefUpdatePayload = (payload: unknown, expectedCommitSha: string) => {
  if (!isRecord(payload) || !hasOnlyKeys(payload, ["sha", "force"]) || !isStudioGitSha(expectedCommitSha) || payload.sha !== expectedCommitSha) return false;
  return payload.force === undefined || payload.force === false;
};

export const isStudioGitRefResponse = (payload: unknown): payload is { object: { type: "commit"; sha: string } } => {
  if (!isRecord(payload) || !isRecord(payload.object)) return false;
  return payload.object.type === "commit" && isStudioGitSha(payload.object.sha);
};

export const isStudioGitTreeResponse = (payload: unknown): payload is { sha: string } => isRecord(payload) && isStudioGitSha(payload.sha);

export const isStudioGitCommitResponse = (payload: unknown, expectedCommitSha: string, expectedTreeSha: string, expectedParentSha: string) => {
  if (!isRecord(payload) || !isStudioGitSha(expectedCommitSha) || !isStudioGitSha(expectedTreeSha) || !isStudioGitSha(expectedParentSha)) return false;
  if (payload.sha !== expectedCommitSha || !isRecord(payload.tree) || payload.tree.sha !== expectedTreeSha || !Array.isArray(payload.parents) || payload.parents.length !== 1) return false;
  const parent = payload.parents[0];
  return isRecord(parent) && parent.sha === expectedParentSha;
};

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
    if (!isSafePortalPath(contentPath)) return null;
    if (normalizedMethod !== "GET") return null;
    return `/repos/OWBastion/owbastion.com/${operation}`;
  }

  if (search.toString() !== "") return null;
  if (operation === "git/refs/heads/main") {
    return normalizedMethod === "GET" || normalizedMethod === "PATCH" ? `/repos/OWBastion/owbastion.com/${operation}` : null;
  }
  if (/^git\/commits\/[0-9a-f]{40}$/i.test(operation)) {
    return normalizedMethod === "GET" ? `/repos/OWBastion/owbastion.com/${operation}` : null;
  }
  if (operation === "git/blobs" || operation === "git/trees" || operation === "git/commits") {
    return normalizedMethod === "POST" ? `/repos/OWBastion/owbastion.com/${operation}` : null;
  }
  return null;
};
