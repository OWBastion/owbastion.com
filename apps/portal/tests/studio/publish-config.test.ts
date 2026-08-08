import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const repositoryRoot = resolve(import.meta.dirname, "../../../..");
const nuxtConfig = readFileSync(resolve(repositoryRoot, "apps/portal/nuxt.config.ts"), "utf8");
const compose = readFileSync(resolve(repositoryRoot, "compose.yaml"), "utf8");

describe("Studio publishing boundary", () => {
  it("keeps the Studio repository workspace inside the Portal app", () => {
    expect(nuxtConfig).toContain('rootDir: "apps/portal"');
    expect(nuxtConfig).not.toContain("NUXT_PUBLIC_STUDIO");
  });

  it("requires the Git credential only through the server Compose environment", () => {
    expect(compose).toContain("STUDIO_GITHUB_TOKEN: ${STUDIO_GITHUB_TOKEN:?set STUDIO_GITHUB_TOKEN}");
    expect(compose).not.toContain("NUXT_PUBLIC_STUDIO_GITHUB_TOKEN");
  });
});
