import { readdir, readFile } from "node:fs/promises";
import { relative, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { blogFrontmatterSchema, changelogFrontmatterSchema } from "../../content/editorial-schemas";

describe("editorial content collections", () => {
  it("validates Blog metadata", () => {
    const result = blogFrontmatterSchema.safeParse({
      title: "开发日志 #8：轮换挑战与地图精通",
      description: "开发日志摘要",
      publishedAt: new Date("2026-08-08"),
    });

    expect(result.success).toBe(true);
  });

  it("validates Changelog metadata", () => {
    const result = changelogFrontmatterSchema.safeParse({
      title: "随机事件调整",
      description: "已发布变更摘要",
      releasedAt: new Date("2026-08-08"),
      version: "26.0801.1",
    });

    expect(result.success).toBe(true);
  });

  it("rejects missing required editorial metadata", () => {
    const blogResult = blogFrontmatterSchema.safeParse({
      title: "未完成的日志",
      description: "缺少发布日期",
    });
    const changelogResult = changelogFrontmatterSchema.safeParse({
      title: "未完成的变更",
      description: "缺少版本与发布日期",
    });

    expect(blogResult.success).toBe(false);
    expect(changelogResult.success).toBe(false);
  });
});

const contentRoot = resolve(import.meta.dirname, "../../content");

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
  it("enforces the shared Markdown invariants on every editorial file", async () => {
    const files = await listMarkdownFiles(contentRoot);
    const documents = await Promise.all(files.map((file) => readFile(file, "utf8")));
    const entries = files.map((file, index) => ({
      file: relative(contentRoot, file),
      document: documents[index]!,
    }));
    const blogDocuments = entries.filter(({ file }) => file.startsWith("blog/")).map(({ document }) => document);
    const changelogDocuments = entries.filter(({ file }) => file.startsWith("changelog/")).map(({ document }) => document);
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
  });
});
