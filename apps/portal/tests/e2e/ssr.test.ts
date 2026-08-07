import { $fetch } from "@nuxt/test-utils/e2e";
import { describe, expect, it } from "vitest";
import { setupPortalE2E } from "./helpers/setup";

/**
 * SSR smoke stays on the shared e2e harness (same built server as browser tests).
 * Vitest runs e2e files sequentially (`fileParallelism: false`); setup is registered
 * per file and reuses the Nuxt build when options match.
 */
describe("Portal SSR", async () => {
  await setupPortalE2E();

  it("renders the home page from the built Nuxt server", async () => {
    const html = await $fetch("/");

    expect(html).toMatch(/<h1[^>]*id="hero-title"[^>]*>躲避堡垒 3<\/h1>/);
    expect(html).toContain("了解规则，完成挑战，查看公开记录。");
    expect(html).toContain('href="/achievements"');
  });
});
