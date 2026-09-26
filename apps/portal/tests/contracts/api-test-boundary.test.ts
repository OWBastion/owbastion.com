import { readdirSync, readFileSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const root = fileURLToPath(new URL("../..", import.meta.url));
const uiRoots = [join(root, "components"), join(root, "pages")];

const walk = (directory: string): string[] => readdirSync(directory).flatMap((name) => {
  const path = join(directory, name);
  return statSync(path).isDirectory() ? walk(path) : [path];
});

describe("Portal API test boundaries", () => {
  it("does not replace first-party API clients in component or page tests", () => {
    const violations = uiRoots.flatMap(walk)
      .filter((path) => path.endsWith(".test.ts"))
      .filter((path) => /mockNuxtImport\s*\(\s*(["'])use(?:Admin|Portal)Api\1/.test(readFileSync(path, "utf8")))
      .map((path) => path.slice(root.length + 1));

    expect(violations, "Mock HTTP responses at the fetch boundary so the real API client and proxy prefix stay under test.").toEqual([]);
  });
});
