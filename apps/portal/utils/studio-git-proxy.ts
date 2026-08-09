export const studioServerProxyAccessToken = "studio-server-proxy";

export const isStudioGitProviderUrl = (url: URL) =>
  url.hostname === "api.github.com" || (url.hostname === "github.com" && url.pathname.startsWith("/api/v3/"));

export const studioGitProxyUrl = (url: URL, origin: string) =>
  new URL(`/api/studio/git${url.pathname}${url.search}`, origin);
