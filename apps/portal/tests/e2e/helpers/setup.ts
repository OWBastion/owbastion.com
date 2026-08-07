import { fileURLToPath } from "node:url";
import { setup } from "@nuxt/test-utils/e2e";

const rootDir = fileURLToPath(new URL("../../..", import.meta.url));

/**
 * Shared Nuxt e2e setup for Portal browser + SSR suite.
 * One built server + Chromium browser for the process.
 */
export async function setupPortalE2E() {
  await setup({
    rootDir,
    build: true,
    server: true,
    browser: true,
    // Enables apps/portal/server/middleware/e2e-fixtures.ts for SSR + client API.
    env: {
      NUXT_PORTAL_E2E_FIXTURES: "1",
    },
    browserOptions: {
      type: "chromium",
      launch: {
        // Headless is the default; keep CI-friendly flags.
        args: ["--disable-dev-shm-usage"],
      },
    },
    setupTimeout: 240_000,
    serverStartTimeout: 120_000,
  });
}
