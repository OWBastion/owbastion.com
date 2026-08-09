import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const contentRoot = resolve(import.meta.dirname, "../../content");

describe("editorial content boundary", () => {
  it("keeps migrated entries formatted and free of Feishu download URLs", async () => {
    const changelogVersions = [
      "25.1223.1",
      "25.1225.1",
      "26.0107.2",
      "26.0117.1",
      "26.0123.1",
      "26.0123.3",
      "26.0131.1",
      "26.0201.1",
      "26.0212.1",
      "26.0227.1",
      "26.0317.1",
      "26.0321.1",
      "26.0325.1",
      "26.0401.1",
      "26.0406.10",
      "26.0417.1",
      "26.0501.1",
      "26.0513.1",
      "26.0628.1",
      "26.0704.1",
      "26.0710.1",
      "26.0729.1",
      "26.0801.1",
    ];
    const files = [
      resolve(contentRoot, "blog/random-system-weighted-algorithm.md"),
      resolve(contentRoot, "blog/event-preview-and-ssr-expectations.md"),
      resolve(contentRoot, "blog/legacy-events-rebalance.md"),
      resolve(contentRoot, "blog/title-system-rebuild.md"),
      resolve(contentRoot, "blog/technical-optimization.md"),
      resolve(contentRoot, "blog/event-draw-optimization.md"),
      resolve(contentRoot, "blog/achievement-challenges-and-anniversary.md"),
      resolve(contentRoot, "blog/rotation-challenges-map-mastery.md"),
      ...changelogVersions.map((version) => resolve(contentRoot, `changelog/${version}.md`)),
    ];
    const documents = await Promise.all(files.map((file) => readFile(file, "utf8")));

    expect(changelogVersions).toHaveLength(23);
    expect(documents).toHaveLength(31);
    const combined = documents.join("\n");
    const changelogDocuments = documents.slice(8);
    const combinedChangelog = changelogDocuments.join("\n");
    expect(combined).not.toMatch(/https?:\/\/[^\s)]*feishu\.(cn|com)/i);
    expect(documents.every((document) => document.startsWith("---\ntitle:"))).toBe(true);
    expect(documents.some((document) => /^# /m.test(document))).toBe(false);
    expect(changelogDocuments.every((document) => /^---[\s\S]*?---\n\n/u.test(document))).toBe(true);
    expect(combinedChangelog).not.toMatch(/^# /m);
    expect(combinedChangelog).not.toMatch(/^#{5,}/m);
    expect(combinedChangelog).not.toMatch(/^#{1,6}\s*$/m);
    expect(changelogDocuments.every((document) => !/\n---\s*$/u.test(document.trimEnd()))).toBe(true);
    for (const document of changelogDocuments) {
      const body = document.replace(/^---[\s\S]*?---\n\n/u, "");
      const levels = [...body.matchAll(/^(#{1,6})\s+/gmu)].map((match) => match[1].length);
      expect(levels.every((level, index) => index === 0 || level <= levels[index - 1] + 1)).toBe(true);
    }
    expect(combined).not.toMatch(/\\[.(){}[\]*_+\-|~%&<>]/);
    expect(combined).toContain("轮换挑战与地图精通");
    expect(combined).toContain("26.0801.1");
    expect(combined).toContain("随机事件调整");
  });
});
