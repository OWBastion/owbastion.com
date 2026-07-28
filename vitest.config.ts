import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    exclude: ["**/node_modules/**", "apps/portal/components/**/*.test.ts", "apps/portal/pages/**/*.test.ts", "apps/portal/tests/e2e/**/*.test.ts"],
    include: ["apps/**/*.test.ts", "packages/**/*.test.ts", "tools/**/*.test.ts"],
  },
});
