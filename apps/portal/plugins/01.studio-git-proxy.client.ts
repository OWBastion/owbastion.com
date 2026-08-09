import { isStudioGitProviderUrl, studioGitProxyRequestInit, studioGitProxyUrl } from "~/utils/studio-git-proxy";

export default defineNuxtPlugin(() => {
  const upstreamFetch = globalThis.fetch;

  globalThis.fetch = async (input, init) => {
    const request = input instanceof Request ? input : new Request(input, init);
    const url = new URL(request.url);
    if (!isStudioGitProviderUrl(url)) return upstreamFetch(request);

    const headers = new Headers(request.headers);
    headers.delete("authorization");
    return upstreamFetch(new Request(studioGitProxyUrl(url, window.location.origin), studioGitProxyRequestInit(request, headers)));
  };
});
