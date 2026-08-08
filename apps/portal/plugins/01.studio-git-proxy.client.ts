import { isStudioGitProviderUrl, studioGitProxyUrl, studioServerProxyAccessToken } from "~/utils/studio-git-proxy";

export default defineNuxtPlugin(() => {
  const upstreamFetch = globalThis.fetch;

  globalThis.fetch = async (input, init) => {
    const request = input instanceof Request ? input : new Request(input, init);
    const url = new URL(request.url);
    if (url.pathname === "/__nuxt_studio/auth/session" && request.method === "GET") {
      const response = await upstreamFetch(request);
      if (!response.ok) return response;
      const session = await response.json() as { user?: Record<string, unknown> };
      if (!session.user) return response;
      const headers = new Headers(response.headers);
      headers.delete("content-length");
      headers.delete("content-encoding");
      return new Response(JSON.stringify({
        ...session,
        user: { ...session.user, accessToken: studioServerProxyAccessToken },
      }), {
        status: response.status,
        statusText: response.statusText,
        headers,
      });
    }
    if (!isStudioGitProviderUrl(url)) return upstreamFetch(request);

    const headers = new Headers(request.headers);
    headers.delete("authorization");
    return upstreamFetch(new Request(studioGitProxyUrl(url, window.location.origin), {
      method: request.method,
      headers,
      body: request.method === "GET" || request.method === "HEAD" ? undefined : request.body,
      credentials: "same-origin",
    }));
  };
});
