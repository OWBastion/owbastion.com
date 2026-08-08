import { isStudioGitProviderUrl, studioGitProxyUrl } from "~/utils/studio-git-proxy";

export default defineNuxtPlugin(() => {
  const upstreamFetch = globalThis.fetch;

  globalThis.fetch = async (input, init) => {
    const request = input instanceof Request ? input : new Request(input, init);
    const url = new URL(request.url);
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
