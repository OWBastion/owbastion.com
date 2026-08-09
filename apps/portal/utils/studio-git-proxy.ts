export const studioServerProxyAccessToken = "studio-server-proxy";

export const isStudioGitProviderUrl = (url: URL) =>
  url.hostname === "api.github.com" || (url.hostname === "github.com" && url.pathname.startsWith("/api/v3/"));

export const studioGitProxyUrl = (url: URL, origin: string) =>
  new URL(`/api/studio/git${url.pathname}${url.search}`, origin);

type StudioGitProxyRequestInit = RequestInit & { duplex?: "half" };

export const studioGitProxyRequestInit = (request: Request, headers: Headers): StudioGitProxyRequestInit => ({
  method: request.method,
  headers,
  body: request.method === "GET" || request.method === "HEAD" ? undefined : request.body,
  credentials: "same-origin",
  ...(request.method === "GET" || request.method === "HEAD" ? {} : { duplex: "half" }),
});
