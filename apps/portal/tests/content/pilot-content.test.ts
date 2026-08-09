import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const contentRoot = resolve(import.meta.dirname, "../../content");

describe("editorial content boundary", () => {
  it("keeps migrated entries formatted and free of Feishu download URLs", async () => {
    const files = [
      resolve(contentRoot, "blog/random-system-weighted-algorithm.md"),
      resolve(contentRoot, "blog/event-preview-and-ssr-expectations.md"),
      resolve(contentRoot, "blog/legacy-events-rebalance.md"),
      resolve(contentRoot, "blog/title-system-rebuild.md"),
      resolve(contentRoot, "blog/technical-optimization.md"),
      resolve(contentRoot, "blog/event-draw-optimization.md"),
      resolve(contentRoot, "blog/achievement-challenges-and-anniversary.md"),
      resolve(contentRoot, "blog/rotation-challenges-map-mastery.md"),
      resolve(contentRoot, "changelog/26.0801.1.md"),
    ];
    const documents = await Promise.all(files.map((file) => readFile(file, "utf8")));

    expect(documents).toHaveLength(9);
    const combined = documents.join("\n");
    expect(combined).not.toMatch(/https?:\/\/[^\s)]*feishu\.(cn|com)/i);
    expect(documents.every((document) => document.startsWith("---\ntitle:"))).toBe(true);
    expect(documents.some((document) => /^# /m.test(document))).toBe(false);
    expect(combined).not.toMatch(/\\[.(){}[\]*_+\-|~%&<>]/);
    expect(combined).toContain("轮换挑战与地图精通");
    expect(combined).toContain("26.0801.1");
    expect(combined).toContain("随机事件调整");
  });
});
