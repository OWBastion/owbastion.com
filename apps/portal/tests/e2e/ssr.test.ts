import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { $fetch, setup } from "@nuxt/test-utils/e2e";
import { describe, expect, it } from "vitest";

const rootDir = fileURLToPath(new URL("../..", import.meta.url));
const outputDir = resolve(rootDir, ".output");
const testPort = process.env.NUXT_TEST_PORT ? Number(process.env.NUXT_TEST_PORT) : undefined;

/**
 * Built-server SSR smoke only. Real browser regression is out of the code-level
 * suite; use agent computer-use when a live viewport/focus check is needed.
 */
describe("Portal SSR", async () => {
  await setup({
    rootDir,
    build: false,
    server: true,
    browser: false,
    nuxtConfig: { nitro: { output: { dir: outputDir } } },
    port: testPort,
    setupTimeout: 240_000,
    serverStartTimeout: 120_000,
  });

  it("renders the home page from the built Nuxt server", async () => {
    const html = await $fetch("/");

    expect(html).toMatch(/<h1[^>]*id="hero-title"[^>]*>躲避堡垒 3<\/h1>/);
    expect(html).toContain("限时目标按期开放，首个轮换挑战当前未开放。");
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

    const blogTitles = blogRows.map((row) => row.title);
    expect(blogTitles.length).toBeGreaterThan(0);
    expect(blogTitles).toEqual([...blogTitles].sort());
    expect(blogTitles.every((title) => typeof title === "string" && title.length > 0)).toBe(true);
    expect(blogRows.every((row) => typeof row.publishedAt === "string")).toBe(true);
    expect(changelogRows.length).toBeGreaterThan(0);
    const changelogVersions = changelogRows.map((row) => row.version);
    expect(changelogVersions).toEqual([...changelogVersions].sort().reverse());
    expect(new Set(changelogVersions).size).toBe(changelogVersions.length);
    expect(changelogRows.every((row) => typeof row.title === "string" && row.title.length > 0)).toBe(true);
    expect(changelogVersions.every((version) => typeof version === "string" && version.length > 0)).toBe(true);
    expect(changelogRows.every((row) => typeof row.releasedAt === "string")).toBe(true);
  });
});
