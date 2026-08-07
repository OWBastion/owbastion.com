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
  });
});
