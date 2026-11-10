import { readdir, readFile } from "node:fs/promises";
import { relative, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { blogFrontmatterSchema, changelogFrontmatterSchema } from "../../content/editorial-schemas";
import { findEditorialEntry, queryEditorialEntries, queryEditorialSummaries } from "../../utils/editorial-content";

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

describe("build-time editorial loader", () => {
  it("parses every Markdown file with valid frontmatter", async () => {
    const files = await listMarkdownFiles(contentRoot);
    const fileCount = (prefix: string) => files.filter((file) => relative(contentRoot, file).startsWith(prefix)).length;

    const blog = await queryEditorialEntries("blog");
    const changelog = await queryEditorialEntries("changelog");

    expect(blog).toHaveLength(fileCount("blog/"));
    expect(changelog).toHaveLength(fileCount("changelog/"));
    expect(blog.every((entry) => entry.title.length > 0 && entry.path.startsWith("/blog/"))).toBe(true);
    expect(changelog.every((entry) => entry.version && entry.releasedAt)).toBe(true);
    expect(new Set(changelog.map((entry) => entry.version)).size).toBe(changelog.length);
    expect(blog.every((entry) => !Number.isNaN(Date.parse(entry.publishedAt ?? "")))).toBe(true);
    expect(changelog.every((entry) => !Number.isNaN(Date.parse(entry.releasedAt ?? "")))).toBe(true);
  });

  it("orders entries newest first and exposes summaries without bodies", async () => {
    const blog = await queryEditorialSummaries("blog");
    const changelog = await queryEditorialSummaries("changelog");

    const blogDates = blog.map((entry) => Date.parse(entry.publishedAt ?? ""));
    expect([...blogDates].sort((a, b) => b - a)).toEqual(blogDates);
    const changelogDates = changelog.map((entry) => Date.parse(entry.releasedAt ?? ""));
    expect([...changelogDates].sort((a, b) => b - a)).toEqual(changelogDates);
    expect(blog.every((entry) => !("body" in entry))).toBe(true);
  });

  it("finds detail entries and returns null for unknown slugs", async () => {
    const entry = await findEditorialEntry("changelog", "26.0801.1");

    expect(entry?.path).toBe("/changelog/26.0801.1");
    expect(entry?.body.children.length).toBeGreaterThan(0);
    expect(await findEditorialEntry("blog", "no-such-post")).toBeNull();
    expect(await findEditorialEntry("changelog", "0.0000.0")).toBeNull();
  });

  it("renders math into KaTeX markup inside the parsed body", async () => {
    const entry = await findEditorialEntry("blog", "random-system-weighted-algorithm");
    const serialized = JSON.stringify(entry?.body);

    expect(entry).toBeTruthy();
    expect(serialized).toContain("katex");
    expect(serialized).toContain("W_{total}");
  });
});
