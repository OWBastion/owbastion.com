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

    expect(blogRows.map((row) => row.title)).toEqual([
      "开发日志 #1：随机系统底层重构——从“随机”到“算法加权”",
      "开发日志 #2：4.0 事件预览与 SSR 获取期望",
      "开发日志 #3：老事件的“新生”——权重系统下的再平衡 🎮",
      "开发日志 #4：称号系统重构计划",
      "开发日志 #5：技术层的优化与改进",
      "开发日志 #6：事件抽取算法的优化与改进",
      "开发日志 #7：成就挑战系统的优化改进与周年庆",
      "开发日志 #8：轮换挑战与地图精通",
    ]);
    expect(blogRows.every((row) => typeof row.publishedAt === "string")).toBe(true);
    expect(changelogRows).toEqual([
      expect.objectContaining({ title: "随机事件调整", version: "26.0801.1", releasedAt: expect.any(String) }),
    ]);
  });
});
