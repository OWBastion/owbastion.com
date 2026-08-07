import { mountSuspended, mockNuxtImport } from "@nuxt/test-utils/runtime";
import { clearNuxtData } from "#imports";
import { flushPromises } from "@vue/test-utils";
import { reactive } from "vue";
import { describe, expect, it, vi } from "vitest";
import BlogListPage from "./blog/index.vue";
import BlogDetailPage from "./blog/[slug].vue";
import ChangelogListPage from "./changelog/index.vue";

const queryCollection = vi.hoisted(() => vi.fn());
const route = reactive({ path: "/blog/rotation-challenges-map-mastery", fullPath: "/blog/rotation-challenges-map-mastery", params: { slug: "rotation-challenges-map-mastery" } });
mockNuxtImport("queryCollection", () => queryCollection);
mockNuxtImport("useRoute", () => () => route);

const blogEntry = {
  path: "/blog/rotation-challenges-map-mastery",
  title: "开发日志 #8：轮换挑战与地图精通",
  description: "为 Portal 建立内容基础。",
  publishedAt: "2026-08-08T00:00:00.000Z",
  tags: ["content"],
  body: { type: "root", children: [] },
};
const changelogEntry = {
  path: "/changelog/26.0801.1",
  title: "随机事件调整",
  description: "26.0801.1 已发布，更新主题为随机事件调整。",
  releasedAt: "2026-08-01T00:00:00.000Z",
  version: "26.0801.1",
  tags: ["随机事件"],
  body: { type: "root", children: [] },
};

function setCollection(rows: unknown[], failure?: Error) {
  queryCollection.mockImplementation((name: string) => ({
    order: () => ({ all: async () => {
      if (failure) throw failure;
      return name === "blog" ? rows : rows;
    } }),
    path: () => ({ first: async () => {
      if (failure) throw failure;
      return rows[0] ?? null;
    } }),
  }));
}

const stubs = {
  UBlogPosts: { props: ["posts"], template: "<div data-testid='blog-posts'><a v-for='post in posts' :key='post.to' :href='post.to'>{{ post.title }}</a></div>" },
  UChangelogVersions: { props: ["versions"], template: "<div data-testid='changelog-versions'><a v-for='version in versions' :key='version.to' :href='version.to'>{{ version.badge }} {{ version.title }}</a></div>" },
  UEmpty: { props: ["title"], template: "<div data-testid='empty'>{{ title }}</div>" },
  UAlert: { props: ["title", "description"], template: "<div role='alert'><strong>{{ title }}</strong><p>{{ description }}</p><slot name='actions' /></div>" },
  UButton: { props: ["label"], template: "<button type='button'>{{ label }}</button>" },
  ContentRenderer: { template: "<div data-testid='content-renderer'>rendered content</div>" },
};

describe("public editorial surfaces", () => {
  it("renders anonymous Blog entries with stable links", async () => {
    clearNuxtData("public-blog-list");
    route.path = "/blog";
    route.fullPath = "/blog";
    setCollection([blogEntry]);
    const wrapper = await mountSuspended(BlogListPage, { global: { stubs } });
    await flushPromises();

    expect(wrapper.get("h1").text()).toBe("开发日志");
    expect(wrapper.get("[data-testid='blog-posts']").text()).toContain("开发日志 #8：轮换挑战与地图精通");
    expect(wrapper.get("[data-testid='blog-posts'] a").attributes("href")).toBe("/blog/rotation-challenges-map-mastery");
  });

  it("renders released Changelog entries with version labels", async () => {
    clearNuxtData("public-changelog-list");
    route.path = "/changelog";
    route.fullPath = "/changelog";
    setCollection([changelogEntry]);
    const wrapper = await mountSuspended(ChangelogListPage, { global: { stubs } });
    await flushPromises();

    expect(wrapper.get("h1").text()).toBe("版本记录");
    expect(wrapper.get("[data-testid='changelog-versions']").text()).toContain("版本 26.0801.1");
    expect(wrapper.get("[data-testid='changelog-versions'] a").attributes("href")).toBe("/changelog/26.0801.1");
  });

  it("renders Markdown content through ContentRenderer on detail pages", async () => {
    clearNuxtData("public-blog-entry");
    route.path = "/blog/rotation-challenges-map-mastery";
    route.fullPath = "/blog/rotation-challenges-map-mastery";
    route.params.slug = "rotation-challenges-map-mastery";
    setCollection([blogEntry]);
    const wrapper = await mountSuspended(BlogDetailPage, { global: { stubs } });
    await flushPromises();

    expect(wrapper.get("h1").text()).toBe("开发日志 #8：轮换挑战与地图精通");
    expect(wrapper.text()).toContain("开发日志");
    expect(wrapper.get("[data-testid='content-renderer']").exists()).toBe(true);
  });

  it("keeps read failures and empty results explicit", async () => {
    clearNuxtData("public-blog-list");
    route.path = "/blog";
    route.fullPath = "/blog";
    setCollection([], new Error("content unavailable"));
    const errorWrapper = await mountSuspended(BlogListPage, { global: { stubs } });
    await flushPromises();
    expect(errorWrapper.get("[role='alert']").text()).toContain("无法读取开发日志");

    clearNuxtData("public-blog-list");
    setCollection([]);
    const emptyWrapper = await mountSuspended(BlogListPage, { global: { stubs } });
    await flushPromises();
    expect(emptyWrapper.get("[data-testid='empty']").text()).toBe("暂无开发日志");
  });
});
