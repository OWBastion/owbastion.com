import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const contentRoot = resolve(import.meta.dirname, "../../content");

describe("editorial pilot content boundary", () => {
  it("keeps the migrated pilot entries free of Feishu download URLs", async () => {
    const files = [
      resolve(contentRoot, "blog/rotation-challenges-map-mastery.md"),
      resolve(contentRoot, "changelog/26.0801.1.md"),
    ];
    const documents = await Promise.all(files.map((file) => readFile(file, "utf8")));

    expect(documents).toHaveLength(2);
    const combined = documents.join("\n");
    expect(combined).not.toMatch(/https?:\/\/[^\s)]*feishu\.(cn|com)/i);
    expect(combined).toContain("轮换挑战与地图精通");
    expect(combined).toContain("26.0801.1");
    expect(combined).toContain("随机事件调整");
  });
});
