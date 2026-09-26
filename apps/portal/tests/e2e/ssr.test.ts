import { resolve } from "node:path";
import { createServer } from "node:http";
import { fileURLToPath } from "node:url";
import { $fetch, setup } from "@nuxt/test-utils/e2e";
import { afterAll, describe, expect, it } from "vitest";

const rootDir = fileURLToPath(new URL("../..", import.meta.url));
const outputDir = resolve(rootDir, ".output");
const testPort = process.env.NUXT_TEST_PORT ? Number(process.env.NUXT_TEST_PORT) : undefined;
const upstreamRequests: Array<{ path: string; cookie?: string }> = [];
let failingCatalog: string | null = null;

/**
 * Built-server SSR smoke only. Real browser regression is out of the code-level
 * suite; use agent computer-use when a live viewport/focus check is needed.
 */
describe("Portal SSR", async () => {
  const upstream = createServer((request, response) => {
    const path = new URL(request.url ?? "/", "http://portal-upstream.test").pathname;
    upstreamRequests.push({ path, cookie: request.headers.cookie });
    response.setHeader("content-type", "application/json");
    if (path === failingCatalog) {
      response.statusCode = 503;
      response.setHeader("x-request-id", "catalog-request-503");
      response.end(JSON.stringify({ contractVersion: "1", error: { code: "CATALOG_UNAVAILABLE", message: "目录暂不可用", requestId: "catalog-request-503" } }));
      return;
    }
    const items = path === "/v1/maps"
      ? [{ mapId: "map.samoa", mapName: "SSR 萨摩亚", gameVersion: "3.2.0", difficultyRating: "T3", mechanics: ["动态掩体"], coverUrl: null, backgroundUrl: null, defaultGameplayRevisionId: "revision:map.samoa:initial" }]
      : path === "/v1/challenges"
        ? [{ challengeId: "map.samoa.hell", family: "map", gameplayRevisionId: "revision:map.samoa:initial", type: "map_completion", kind: "difficulty_completion", name: "地狱难度通关", mapId: "map.samoa", mapName: "SSR 萨摩亚", titleKey: "SAMOA", difficulty: "地狱", gameVersion: "3.2.0", status: "active" }]
        : path === "/v1/public/achievements"
          ? [{ challengeId: "title.ssr", family: "achievement", type: "title_achievement", kind: "title_achievement", titleKey: "SSR", titleName: "SSR 成就称号", icon: "trophy", category: "SSR 测试", condition: "完成 SSR 验证", evidenceRule: "完整截图", gameVersion: "3.2.0", status: "active", submissionMode: "manual" }]
          : path === "/v1/events"
            ? [{ eventId: "event.ssr", name: "SSR 随机事件", category: "增益", rarity: "常见", description: "SSR 目录内容", durationSeconds: 60, cooldownSeconds: 0, weight: 1, gameVersion: "3.2.0", effectTags: [], effectAnnotations: [], releaseStatus: "implemented", archived: false, challenges: [] }]
            : null;
    if (path === "/v1/me") {
      response.statusCode = request.headers.cookie ? 200 : 401;
      response.end(JSON.stringify(request.headers.cookie
        ? { contractVersion: "1", player: { playerId: "private-player", playerName: "PLAYER_PRIVATE_SENTINEL", bindingStatus: "bound", isAdmin: false }, recentSubmissions: [] }
        : { error: { code: "UNAUTHENTICATED", message: "需要登录" } }));
      return;
    }
    response.end(JSON.stringify({ contractVersion: "1", items: items ?? [] }));
  });
  await new Promise<void>((resolveListen) => upstream.listen(0, "127.0.0.1", resolveListen));
  const address = upstream.address();
  if (!address || typeof address === "string") throw new Error("Portal test API did not start");
  process.env.NUXT_PUBLIC_API_BASE_URL = `http://127.0.0.1:${address.port}`;

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

  afterAll(async () => {
    await new Promise<void>((resolveClose, reject) => upstream.close((error) => error ? reject(error) : resolveClose()));
  });

  it("renders the home page from the built Nuxt server", async () => {
    const html = await $fetch("/");

    expect(html).toMatch(/<h1[^>]*id="hero-title"[^>]*>躲避堡垒 3<\/h1>/);
    expect(html).toContain("轮换挑战未开放");
    expect(html).toContain('href="/achievements"');
    expect(html).toContain('href="/changelog"');
  });

  it("preserves the upstream error message and request ID", async () => {
    failingCatalog = "/v1/events";
    try {
      const html = await $fetch("/events");
      expect(html).toContain("无法读取事件");
      expect(html).toContain("目录暂不可用");
      expect(html).toContain("Request-ID：catalog-request-503");
    } finally {
      failingCatalog = null;
    }
  });

  it("renders cached public catalogs in SSR HTML without forwarding player cookies", async () => {
    upstreamRequests.length = 0;
    const maps = await $fetch("/maps");
    const events = await $fetch("/events");
    const achievements = await $fetch("/achievements");
    const mapsAgain = await $fetch("/maps");
    const signedInAchievements = await $fetch("/achievements", { headers: { cookie: "portal_session=test" } });

    expect(maps).toContain("SSR 萨摩亚");
    expect(events).toContain("SSR 随机事件");
    expect(achievements).toContain("SSR 成就称号");
    expect(mapsAgain).toContain("SSR 萨摩亚");
    expect(signedInAchievements).toContain("SSR 成就称号");
    expect(signedInAchievements).not.toContain("PLAYER_PRIVATE_SENTINEL");
    expect(upstreamRequests.filter((request) => request.path === "/v1/maps")).toHaveLength(1);
    expect(upstreamRequests.filter((request) => request.path === "/v1/challenges")).toHaveLength(1);
    expect(upstreamRequests.filter((request) => request.path === "/v1/events")).toHaveLength(1);
    expect(upstreamRequests.filter((request) => request.path === "/v1/public/achievements")).toHaveLength(1);
    expect(upstreamRequests.every((request) => !request.cookie)).toBe(true);
    expect(upstreamRequests.some((request) => request.path === "/v1/me")).toBe(false);
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

  it("renders the weighted-random article formulas as KaTeX", async () => {
    const html = await $fetch("/blog/random-system-weighted-algorithm");

    expect(html).toContain("katex");
    expect(html).toContain("katex-display");
    expect(html).toContain("katex-mathml");
    expect(html).toMatch(/<span class="katex"><span class="katex-mathml">[\s\S]*?<annotation encoding="application\/x-tex">W_\{total\}<\/annotation>/u);
    expect(html).not.toContain("$P(i)");
    expect(html).not.toContain("$Q =");
  });
});
