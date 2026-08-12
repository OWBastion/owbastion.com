import { readdir, readFile } from "node:fs/promises";
import { relative, resolve } from "node:path";
import { describe, expect, it } from "vitest";

const contentRoot = resolve(import.meta.dirname, "../../content");
const migratedBlogFiles = [
  "blog/random-system-weighted-algorithm.md",
  "blog/event-preview-and-ssr-expectations.md",
  "blog/legacy-events-rebalance.md",
  "blog/title-system-rebuild.md",
  "blog/technical-optimization.md",
  "blog/event-draw-optimization.md",
  "blog/achievement-challenges-and-anniversary.md",
  "blog/rotation-challenges-map-mastery.md",
];
const migratedChangelogVersions = [
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

const listMarkdownFiles = async (directory: string): Promise<string[]> => {
  const entries = await readdir(directory, { withFileTypes: true });
  const nestedFiles = await Promise.all(entries.map(async (entry) => {
    const file = resolve(directory, entry.name);
    if (entry.isDirectory()) return listMarkdownFiles(file);
    return entry.isFile() && entry.name.endsWith(".md") ? [file] : [];
  }));
  return nestedFiles.flat().sort();
};

describe("editorial content boundary", () => {
  it("keeps migrated entries formatted and checks every editorial file for unsafe content", async () => {
    const migratedFiles = [
      ...migratedBlogFiles,
      ...migratedChangelogVersions.map((version) => `changelog/${version}.md`),
    ].map((file) => resolve(contentRoot, file));
    const files = await listMarkdownFiles(contentRoot);
    const documents = await Promise.all(files.map((file) => readFile(file, "utf8")));
    const documentsByFile = new Map(files.map((file, index) => [file, documents[index]!]));

    for (const file of migratedFiles) {
      expect(files).toContain(file);
    }

    const entries = files.map((file, index) => ({
      file: relative(contentRoot, file),
      document: documents[index]!,
    }));
    const blogDocuments = entries.filter(({ file }) => file.startsWith("blog/")).map(({ document }) => document);
    const changelogDocuments = entries.filter(({ file }) => file.startsWith("changelog/")).map(({ document }) => document);
    const migratedDocuments = migratedFiles.map((file) => documentsByFile.get(file)!);
    const combined = documents.join("\n");
    const combinedChangelog = changelogDocuments.join("\n");

    expect(blogDocuments.length).toBeGreaterThan(0);
    expect(changelogDocuments.length).toBeGreaterThan(0);
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
    expect(migratedDocuments.join("\n")).toContain("轮换挑战与地图精通");
    expect(migratedDocuments.join("\n")).toContain("26.0801.1");
    expect(migratedDocuments.join("\n")).toContain("随机事件调整");
  });
});
