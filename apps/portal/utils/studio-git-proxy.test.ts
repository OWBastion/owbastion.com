import { describe, expect, it } from "vitest";
import { isStudioGitProviderUrl, studioGitProxyUrl, studioServerProxyAccessToken } from "./studio-git-proxy";

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
});
