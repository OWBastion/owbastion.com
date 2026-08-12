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
    expect(changelogRows).toHaveLength(23);
    expect(changelogRows.map((row) => row.version)).toEqual([
      "26.0801.1",
      "26.0729.1",
      "26.0710.1",
      "26.0704.1",
      "26.0628.1",
      "26.0513.1",
      "26.0501.1",
      "26.0417.1",
      "26.0406.10",
      "26.0401.1",
      "26.0325.1",
      "26.0321.1",
      "26.0317.1",
      "26.0227.1",
      "26.0212.1",
      "26.0201.1",
      "26.0131.1",
      "26.0123.3",
      "26.0123.1",
      "26.0117.1",
      "26.0107.2",
      "25.1225.1",
      "25.1223.1",
    ]);
    expect(changelogRows.every((row) => typeof row.releasedAt === "string")).toBe(true);
  });
});
