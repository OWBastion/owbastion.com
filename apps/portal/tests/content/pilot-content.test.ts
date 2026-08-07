import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const contentRoot = resolve(import.meta.dirname, "../../content");

describe("editorial pilot content boundary", () => {
  it("keeps the current typed samples free of Feishu download URLs", async () => {
    const files = [
      resolve(contentRoot, "blog/content-foundation.md"),
      resolve(contentRoot, "changelog/26.0808.1.md"),
    ];
    const documents = await Promise.all(files.map((file) => readFile(file, "utf8")));

    expect(documents).toHaveLength(2);
    expect(documents.join("\n")).not.toMatch(/https?:\/\/[^\s)]*feishu\.(cn|com)/i);
  });
});
