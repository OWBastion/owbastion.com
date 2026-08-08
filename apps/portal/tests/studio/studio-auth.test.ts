import { describe, expect, it } from "vitest";
import {
  isStudioCapabilityPath,
  isStudioEditorialMutationPath,
  isStudioGitBlobPayload,
  isStudioGitCommitPayload,
  isStudioGitRefUpdatePayload,
  isStudioGitTreePayload,
  safeStudioRedirect,
  sanitizeStudioSessionResponse,
  studioAccessForPlayer,
  studioGitProxyTarget,
  studioRequestDecision,
  studioUserForAdmin,
} from "../../utils/studio-auth-policy";

const anonymous = null;
const player = { player: { playerName: "Player", isAdmin: false } };
const admin = { player: { playerName: "Maintainer", isAdmin: true } };
const mainSha = "a".repeat(40);
const mainTreeSha = "b".repeat(40);
const treeSha = "c".repeat(40);
const commitSha = "d".repeat(40);

describe("Studio platform authorization bridge", () => {
  it.each([
    ["anonymous", anonymous, "anonymous"],
    ["non-admin", player, "non-admin"],
    ["admin", admin, "admin"],
  ])("classifies %s platform access", (_label, currentPlayer, expected) => {
    expect(studioAccessForPlayer(currentPlayer)).toBe(expected);
  });

  it("allows an admin across the editor and server write paths", () => {
    expect(studioRequestDecision("/_studio", admin)).toBe("allow");
    expect(studioRequestDecision("/__nuxt_studio/auth/session", admin)).toBe("allow");
    expect(studioRequestDecision("/__nuxt_studio/meta", admin)).toBe("allow");
    expect(studioRequestDecision("/__nuxt_studio/medias/blog/cover.png", admin)).toBe("allow");
  });

  it("denies editor and write access to anonymous and non-admin sessions", () => {
    for (const currentPlayer of [anonymous, player]) {
      expect(studioRequestDecision("/_studio", currentPlayer)).toBe("deny");
      expect(studioRequestDecision("/__nuxt_studio/meta", currentPlayer)).toBe("deny");
      expect(studioRequestDecision("/__nuxt_studio/medias/blog/cover.png", currentPlayer)).toBe("deny");
    }
  });

  it("clears the Studio session when the platform session is missing or no longer admin", () => {
    expect(studioRequestDecision("/__nuxt_studio/auth/session", anonymous)).toBe("clear-session");
    expect(studioRequestDecision("/__nuxt_studio/auth/session", player)).toBe("clear-session");
  });

  it("does not turn unrelated Portal requests into Studio requests", () => {
    expect(isStudioCapabilityPath("/admin/content")).toBe(false);
    expect(studioRequestDecision("/admin/content", admin)).toBe("ignore");
  });

  it("protects the server Git proxy with the admin Studio boundary", () => {
    expect(isStudioCapabilityPath("/api/studio/git/repos/OWBastion/owbastion.com/git/trees")).toBe(true);
    expect(studioRequestDecision("/api/studio/git/repos/OWBastion/owbastion.com/git/trees", admin)).toBe("allow");
    expect(studioRequestDecision("/api/studio/git/repos/OWBastion/owbastion.com/git/trees", player)).toBe("deny");
    expect(studioGitProxyTarget("repos/OWBastion/owbastion.com/contents/apps/portal/content/blog/post.md", "GET", new URLSearchParams("ref=main"))).toBe("/repos/OWBastion/owbastion.com/contents/apps/portal/content/blog/post.md");
    expect(studioGitProxyTarget("repos/OWBastion/owbastion.com/contents/apps/api/src/private.ts", "GET", new URLSearchParams("ref=main"))).toBeNull();
    expect(studioGitProxyTarget("repos/OWBastion/owbastion.com/git/trees", "POST", new URLSearchParams())).toBe("/repos/OWBastion/owbastion.com/git/trees");
  });

  it("rejects alternate branches, query parameters, writes, and arbitrary Git objects", () => {
    expect(studioGitProxyTarget("repos/OWBastion/owbastion.com/contents/apps/portal/content/blog/post.md", "PUT", new URLSearchParams("ref=main"))).toBeNull();
    expect(studioGitProxyTarget("repos/OWBastion/owbastion.com/contents/apps/portal/content/blog/post.md", "GET", new URLSearchParams("ref=feature"))).toBeNull();
    expect(studioGitProxyTarget("repos/OWBastion/owbastion.com/contents/apps/portal/content/blog/post.md", "GET", new URLSearchParams("ref=main&foo=bar"))).toBeNull();
    expect(studioGitProxyTarget("repos/OWBastion/owbastion.com/git/refs/heads/release", "PATCH", new URLSearchParams())).toBeNull();
    expect(studioGitProxyTarget("repos/OWBastion/owbastion.com/git/refs/heads/main", "PATCH", new URLSearchParams("force=true"))).toBeNull();
    expect(studioGitProxyTarget("repos/OWBastion/owbastion.com/git/trees", "GET", new URLSearchParams())).toBeNull();
    expect(studioGitProxyTarget(`repos/OWBastion/owbastion.com/git/commits/${"e".repeat(39)}`, "GET", new URLSearchParams())).toBeNull();
    expect(studioGitProxyTarget("repos/OWBastion/other-repo/git/trees", "POST", new URLSearchParams())).toBeNull();
  });

  it("limits tree mutations to editorial content and the supported media root", () => {
    expect(isStudioEditorialMutationPath("apps/portal/content/blog/post.md")).toBe(true);
    expect(isStudioEditorialMutationPath("apps/portal/public/content/blog/cover.png")).toBe(true);

    for (const path of [
      "apps/portal/server/runtime-secret.ts",
      "apps/portal/pages/admin/content.vue",
      "apps/portal/nuxt.config.ts",
      "pages/admin/content.vue",
      "apps/portal/content/../server/runtime-secret.ts",
      "apps/portal/public/robots.txt",
    ]) {
      expect(isStudioEditorialMutationPath(path)).toBe(false);
      expect(isStudioGitTreePayload({ base_tree: mainTreeSha, tree: [{ path, mode: "100644", type: "blob", sha: treeSha }] }, mainTreeSha)).toBe(false);
    }

    expect(isStudioGitTreePayload({
      base_tree: mainTreeSha,
      tree: [
        { path: "apps/portal/content/blog/post.md", mode: "100644", type: "blob", sha: treeSha },
        { path: "apps/portal/public/content/blog/cover.png", mode: "100644", type: "blob", sha: null },
      ],
    }, mainTreeSha)).toBe(true);
  });

  it("rejects composable Git payloads that are not the current publish transaction", () => {
    expect(isStudioGitBlobPayload({ content: "body", encoding: "utf-8" })).toBe(true);
    expect(isStudioGitBlobPayload({ content: "body", encoding: "utf-8", path: "apps/portal/server/private.ts" })).toBe(false);
    expect(isStudioGitBlobPayload({ content: "body", encoding: "hex" })).toBe(false);

    const commit = {
      message: "Update editorial content",
      tree: treeSha,
      parents: [mainSha],
      author: { name: "Maintainer", email: "content-editor@owbastion.local", date: "2026-08-08T00:00:00.000Z" },
    };
    expect(isStudioGitCommitPayload(commit, treeSha, mainSha)).toBe(true);
    expect(isStudioGitCommitPayload({ ...commit, tree: "e".repeat(40) }, treeSha, mainSha)).toBe(false);
    expect(isStudioGitCommitPayload({ ...commit, parents: ["e".repeat(40)] }, treeSha, mainSha)).toBe(false);
    expect(isStudioGitCommitPayload({ ...commit, parents: [mainSha, "e".repeat(40)] }, treeSha, mainSha)).toBe(false);
    expect(isStudioGitCommitPayload({ ...commit, author: { ...commit.author, date: "not-a-date" } }, treeSha, mainSha)).toBe(false);

    expect(isStudioGitRefUpdatePayload({ sha: commitSha }, commitSha)).toBe(true);
    expect(isStudioGitRefUpdatePayload({ sha: commitSha, force: false }, commitSha)).toBe(true);
    expect(isStudioGitRefUpdatePayload({ sha: commitSha, force: true }, commitSha)).toBe(false);
    expect(isStudioGitRefUpdatePayload({ sha: mainSha }, commitSha)).toBe(false);
    expect(isStudioGitRefUpdatePayload({ sha: commitSha, unrelated: true }, commitSha)).toBe(false);
  });

  it("keeps the bridge identity free of platform-private identifiers", () => {
    expect(studioUserForAdmin(admin)).toEqual({ name: "Maintainer", email: "content-editor@owbastion.local", providerId: "platform-admin" });
    expect(studioUserForAdmin(admin)).not.toHaveProperty("playerId");
  });

  it("removes Git credentials from the Studio session response", () => {
    const response = { user: { name: "Maintainer", accessToken: "server-only" }, id: "session-id" };
    expect(sanitizeStudioSessionResponse(response)).toEqual({ user: { name: "Maintainer", accessToken: "studio-server-proxy" }, id: "session-id" });
    expect(response.user).toHaveProperty("accessToken");
    expect(sanitizeStudioSessionResponse(JSON.stringify(response))).toBe(JSON.stringify({ user: { name: "Maintainer", accessToken: "studio-server-proxy" }, id: "session-id" }));
  });

  it("accepts only same-origin relative redirects", () => {
    expect(safeStudioRedirect("/admin/content?from=nav")).toBe("/admin/content?from=nav");
    expect(safeStudioRedirect("https://example.com/steal")).toBe("/admin/content");
    expect(safeStudioRedirect("//example.com/steal")).toBe("/admin/content");
    expect(safeStudioRedirect(undefined)).toBe("/admin/content");
  });
});
