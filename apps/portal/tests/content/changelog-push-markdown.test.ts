import { describe, expect, it } from "vitest";
import { composeChangelogPush } from "../../utils/changelog-push-markdown";

const base = { version: "26.1115.3", title: "赌徒调整", siteUrl: "https://owbastion.com" };
const link = "[查看完整更新日志](https://owbastion.com/changelog/26.1115.3)";

describe("composeChangelogPush", () => {
  it("puts the version in the heading and the changelog link at the end", () => {
    const text = composeChangelogPush({ ...base, markdown: "## 修复\n\n- 修复进点" });
    expect(text).toBe(`# 26.1115.3 赌徒调整\n\n## 修复\n\n- 修复进点\n\n${link}`);
  });

  it("keeps whole sections that fit and drops the rest with a pointer to the link", () => {
    const section = (name: string) => `## ${name}\n\n${"内容".repeat(100)}`;
    const text = composeChangelogPush({ ...base, markdown: [section("甲"), section("乙"), section("丙")].join("\n\n"), limit: 600 });
    expect(text).toContain("## 甲");
    expect(text).toContain("## 乙");
    expect(text).not.toContain("## 丙");
    expect(text).toMatch(/内容较长，仅列出开头。\[查看完整更新日志\]/);
    expect(text.length).toBeLessThanOrEqual(600);
  });

  it("cuts the first section at a line boundary when it alone is too long", () => {
    const markdown = `## 大改动\n${Array.from({ length: 50 }, (_, i) => `- 第 ${i} 条改动说明`).join("\n")}`;
    const text = composeChangelogPush({ ...base, markdown, limit: 300 });
    expect(text).toContain("## 大改动");
    expect(text).not.toContain("第 49 条");
    expect(text.length).toBeLessThanOrEqual(300);
    expect(text.endsWith(link)).toBe(true);
  });
});
