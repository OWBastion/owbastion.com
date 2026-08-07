import { fileURLToPath } from "node:url";
import { $fetch, setup } from "@nuxt/test-utils/e2e";
import { describe, expect, it } from "vitest";

const rootDir = fileURLToPath(new URL("../..", import.meta.url));

/**
 * Built-server SSR smoke only. Real browser regression is out of the code-level
 * suite; use agent computer-use when a live viewport/focus check is needed.
 */
describe("Portal SSR", async () => {
  await setup({
    rootDir,
    build: true,
    server: true,
    browser: false,
    setupTimeout: 240_000,
    serverStartTimeout: 120_000,
  });

  it("renders the home page from the built Nuxt server", async () => {
    const html = await $fetch("/");

    expect(html).toMatch(/<h1[^>]*id="hero-title"[^>]*>躲避堡垒 3<\/h1>/);
    expect(html).toContain("了解规则，完成挑战，查看公开记录。");
    expect(html).toContain('href="/achievements"');
    expect(html).toContain('href="/changelog"');
  });

  it("queries both built editorial collections", async () => {
    const [blogRows, changelogRows] = await Promise.all([
      $fetch("/__nuxt_content/blog/query", {
        method: "POST",
        body: { sql: "SELECT \"title\", \"publishedAt\" FROM _content_blog ORDER BY \"title\" ASC" },
      }),
      $fetch("/__nuxt_content/changelog/query", {
        method: "POST",
        body: { sql: "SELECT \"title\", \"version\", \"releasedAt\" FROM _content_changelog ORDER BY \"version\" DESC" },
      }),
    ]);

    expect(blogRows).toEqual([
      expect.objectContaining({ title: "Nuxt Content 基础", publishedAt: expect.any(String) }),
    ]);
    expect(changelogRows).toEqual([
      expect.objectContaining({ title: "Portal 内容基础", version: "26.0808.1", releasedAt: expect.any(String) }),
    ]);
  });
});
