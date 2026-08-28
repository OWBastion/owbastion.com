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
    expect(html).toContain("轮换挑战未开放");
    expect(html).toContain('href="/achievements"');
    expect(html).toContain('href="/changelog"');
  });

  it("queries both built editorial collections", async () => {
    const [blogRows, changelogRows] = await Promise.all([
      $fetch("/__nuxt_content/blog/query", {
        method: "POST",
        body: { sql: "SELECT \"title\", \"path\", \"publishedAt\" FROM _content_blog ORDER BY \"publishedAt\" DESC" },
      }),
      $fetch("/__nuxt_content/changelog/query", {
        method: "POST",
        body: { sql: "SELECT \"title\", \"description\", \"path\", \"version\", \"releasedAt\" FROM _content_changelog ORDER BY \"releasedAt\" DESC" },
      }),
    ]);

    const blogTitles = blogRows.map((row) => row.title);
    expect(blogTitles.length).toBeGreaterThan(0);
    expect(blogTitles.every((title) => typeof title === "string" && title.length > 0)).toBe(true);
    expect(blogRows.every((row) => typeof row.path === "string" && row.path.startsWith("/blog/"))).toBe(true);
    expect(blogRows.every((row) => typeof row.publishedAt === "string")).toBe(true);
    expect(changelogRows.length).toBeGreaterThan(0);
    const changelogVersions = changelogRows.map((row) => row.version);
    expect(new Set(changelogVersions).size).toBe(changelogVersions.length);
    expect(changelogRows.every((row) => typeof row.title === "string" && row.title.length > 0)).toBe(true);
    expect(changelogRows.every((row) => typeof row.path === "string" && row.path.startsWith("/changelog/"))).toBe(true);
    expect(changelogVersions.every((version) => typeof version === "string" && version.length > 0)).toBe(true);
    expect(changelogRows.every((row) => typeof row.releasedAt === "string")).toBe(true);

    const latestBlog = blogRows[0];
    const latestChangelog = changelogRows[0];
    if (!latestBlog || !latestChangelog) throw new Error("built editorial collections are unexpectedly empty");

    const [blogIndex, changelogIndex, blogDetail, changelogDetail] = await Promise.all([
      $fetch("/blog"),
      $fetch("/changelog"),
      $fetch(latestBlog.path),
      $fetch(latestChangelog.path),
    ]);

    expect(blogIndex).toContain(`href="${latestBlog.path}"`);
    expect(blogIndex).toContain(latestBlog.title);
    expect(blogDetail).toContain(latestBlog.title);
    expect(changelogIndex).toContain(`href="${latestChangelog.path}"`);
    expect(changelogIndex).toContain(`版本 ${latestChangelog.version}`);
    expect(changelogDetail).toContain(latestChangelog.title);
    expect(changelogDetail).toContain('property="og:title"');
    expect(changelogDetail).toContain('property="og:description"');
    expect(changelogDetail).toContain('property="og:url"');
    expect(changelogDetail).toContain('name="twitter:card"');
    expect(changelogDetail).toContain('name="twitter:title"');
    expect(changelogDetail).toContain('name="twitter:description"');
    expect(changelogDetail).toContain(latestChangelog.description);
  });
});
