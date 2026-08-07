import { describe, expect, it } from "vitest";
import { blogFrontmatterSchema, changelogFrontmatterSchema } from "../../content/editorial-schemas";

describe("editorial content collections", () => {
  it("validates Blog metadata", () => {
    const result = blogFrontmatterSchema.safeParse({
      title: "Nuxt Content 基础",
      description: "开发日志摘要",
      publishedAt: new Date("2026-08-08"),
    });

    expect(result.success).toBe(true);
  });

  it("validates Changelog metadata", () => {
    const result = changelogFrontmatterSchema.safeParse({
      title: "Portal 内容基础",
      description: "已发布变更摘要",
      releasedAt: new Date("2026-08-08"),
      version: "26.0808.1",
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
