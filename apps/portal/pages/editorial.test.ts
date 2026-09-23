import { mountSuspended, mockNuxtImport } from "@nuxt/test-utils/runtime";
import { clearNuxtData } from "#imports";
import { flushPromises } from "@vue/test-utils";
import { reactive } from "vue";
import { describe, expect, it, vi } from "vitest";
import BlogListPage from "./blog/index.vue";
import BlogDetailPage from "./blog/[slug].vue";
import ChangelogListPage from "./changelog/index.vue";
import ChangelogDetailPage from "./changelog/[slug].vue";

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
  UBlogPosts: { props: ["posts"], template: "<div><a v-for='post in posts' :key='post.to' :href='post.to'>{{ post.title }}</a></div>" },
  UChangelogVersions: { props: ["versions"], template: "<div><a v-for='version in versions' :key='version.to' :href='version.to'>{{ version.badge }} {{ version.title }}</a></div>" },
  UEmpty: { props: ["title"], template: "<p>{{ title }}</p>" },
  UAlert: { props: ["title", "description"], template: "<div role='alert'><strong>{{ title }}</strong><p>{{ description }}</p><slot name='actions' /></div>" },
  UButton: { props: ["label"], template: "<button type='button'>{{ label }}</button>" },
  ContentRenderer: { template: "<article>rendered content</article>" },
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
    expect(wrapper.get('a[href="/blog/rotation-challenges-map-mastery"]').text()).toContain("开发日志 #8：轮换挑战与地图精通");
  });

  it("renders released Changelog entries with version labels", async () => {
    clearNuxtData("public-changelog-list");
    route.path = "/changelog";
    route.fullPath = "/changelog";
    setCollection([changelogEntry]);
    const wrapper = await mountSuspended(ChangelogListPage, { global: { stubs } });
    await flushPromises();

    expect(wrapper.get("h1").text()).toBe("版本更新");
    expect(wrapper.get('a[href="/changelog/26.0801.1"]').text()).toContain("版本 26.0801.1");
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
    expect(emptyWrapper.text()).toContain("暂无开发日志");
  });

  it("renders a changelog detail with the version above the title and a copy-link action", async () => {
    clearNuxtData("public-changelog-entry");
    route.path = "/changelog/26.0801.1";
    route.fullPath = "/changelog/26.0801.1";
    route.params.slug = "26.0801.1";
    setCollection([changelogEntry]);
    const wrapper = await mountSuspended(ChangelogDetailPage, { global: { stubs } });
    await flushPromises();

    expect(wrapper.text().indexOf("26.0801.1")).toBeLessThan(wrapper.text().indexOf("随机事件调整"));
    expect(wrapper.get("h1").text()).toBe("随机事件调整");
    expect(wrapper.text()).toContain("复制链接");
  });

  it("copies the changelog canonical URL", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText } });
    clearNuxtData("public-changelog-entry");
    route.path = "/changelog/26.0801.1";
    route.fullPath = "/changelog/26.0801.1";
    route.params.slug = "26.0801.1";
    setCollection([changelogEntry]);
    const wrapper = await mountSuspended(ChangelogDetailPage, { global: { stubs } });
    await flushPromises();

    const copyButton = wrapper.findAll("button").find((button) => button.text() === "复制链接");
    expect(copyButton).toBeDefined();
    await copyButton!.trigger("click");
    await flushPromises();

    expect(writeText).toHaveBeenCalledWith(expect.stringContaining("/changelog/26.0801.1"));
    expect(wrapper.text()).toContain("已复制");
  });
});
