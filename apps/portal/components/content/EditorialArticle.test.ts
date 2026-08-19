import { mountSuspended } from "@nuxt/test-utils/runtime";
import { describe, expect, it } from "vitest";
import EditorialArticle from "./EditorialArticle.vue";

const stubs = {
  ContentRenderer: { template: "<div data-testid='content-renderer'>rendered content</div>" },
};

const changelogEntry = {
  path: "/changelog/26.0801.1",
  title: "随机事件调整",
  description: "26.0801.1 已发布，更新主题为随机事件调整。",
  releasedAt: "2026-08-01T00:00:00.000Z",
  version: "26.0801.1",
};

const blogEntry = {
  path: "/blog/rotation-challenges-map-mastery",
  title: "开发日志 #8：轮换挑战与地图精通",
  description: "为 Portal 建立内容基础。",
  publishedAt: "2026-08-08T00:00:00.000Z",
};

describe("EditorialArticle", () => {
  it("puts the changelog version capsule above a smaller title and hides the list description", async () => {
    const wrapper = await mountSuspended(EditorialArticle, {
      props: { entry: changelogEntry, kind: "changelog" },
      global: { stubs },
    });

    expect(wrapper.get(".changelog-version").text()).toContain("26.0801.1");
    expect(wrapper.get("h1").text()).toBe("随机事件调整");
    expect(wrapper.get("h1").classes()).toContain("type-headline");
    expect(wrapper.text().indexOf("26.0801.1")).toBeLessThan(wrapper.text().indexOf("随机事件调整"));
    expect(wrapper.find(".editorial-article-description").exists()).toBe(false);
    expect(wrapper.text()).not.toContain("已发布，更新主题为");
    expect(wrapper.get("[data-testid='content-renderer']").exists()).toBe(true);
  });

  it("keeps the blog title scale, kind, and description", async () => {
    const wrapper = await mountSuspended(EditorialArticle, {
      props: { entry: blogEntry, kind: "blog" },
      global: { stubs },
    });

    expect(wrapper.get("h1").text()).toBe("开发日志 #8：轮换挑战与地图精通");
    expect(wrapper.get("h1").classes()).toContain("page-title");
    expect(wrapper.text()).toContain("开发日志");
    expect(wrapper.get(".editorial-article-description").text()).toBe("为 Portal 建立内容基础。");
  });
});
