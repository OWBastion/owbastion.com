import { describe, expect, it } from "vitest";
import { isStudioGitProviderUrl, studioGitProxyRequestInit, studioGitProxyUrl, studioServerProxyAccessToken } from "../../utils/studio-git-proxy";

describe("Studio Git client proxy", () => {
  it("uses a non-credential sentinel for the Studio client session", () => {
    expect(studioServerProxyAccessToken).toBe("studio-server-proxy");
    expect(studioServerProxyAccessToken).not.toMatch(/github_pat_|gh[pousr]_/);
  });

  it("recognizes GitHub API origins used by the Studio client", () => {
    expect(isStudioGitProviderUrl(new URL("https://api.github.com/repos/OWBastion/owbastion.com/git/trees"))).toBe(true);
    expect(isStudioGitProviderUrl(new URL("https://github.com/api/v3/repos/OWBastion/owbastion.com/git/trees"))).toBe(true);
    expect(isStudioGitProviderUrl(new URL("https://github.com/OWBastion/owbastion.com"))).toBe(false);
  });

  it("rewrites only the origin while preserving the GitHub path and query", () => {
    const providerUrl = new URL("https://api.github.com/repos/OWBastion/owbastion.com/contents/apps/portal/content/blog/post.md?ref=main");
    expect(studioGitProxyUrl(providerUrl, "http://localhost:3000").toString()).toBe("http://localhost:3000/api/studio/git/repos/OWBastion/owbastion.com/contents/apps/portal/content/blog/post.md?ref=main");
  });

  it("marks streaming write bodies as half-duplex requests", () => {
    const request = new Request("https://api.github.com/repos/OWBastion/owbastion.com/git/blobs", {
      method: "POST",
      body: JSON.stringify({ content: "body", encoding: "utf-8" }),
    });
    const init = studioGitProxyRequestInit(request, new Headers(request.headers));

    expect(init.duplex).toBe("half");
    expect(init.body).toBe(request.body);
    expect(() => new Request("http://localhost:3000/api/studio/git/repos/OWBastion/owbastion.com/git/blobs", init)).not.toThrow();
  });

  it("does not add a streaming body to read requests", () => {
    const request = new Request("https://api.github.com/repos/OWBastion/owbastion.com/git/refs/heads/main");
    const init = studioGitProxyRequestInit(request, new Headers(request.headers));

    expect(init.body).toBeUndefined();
    expect(init.duplex).toBeUndefined();
  });
});
