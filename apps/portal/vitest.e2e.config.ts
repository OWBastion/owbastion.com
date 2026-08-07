import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["tests/e2e/**/*.test.ts"],
    environment: "node",
    testTimeout: 120_000,
    hookTimeout: 240_000,
    // Nuxt build + browser suite: one worker avoids double-build and browser contention.
    fileParallelism: false,
    maxWorkers: 1,
    pool: "forks",
  },
});
