import { mountSuspended } from "@nuxt/test-utils/runtime";
import { describe, expect, it } from "vitest";
import EditorialEntryList from "./EditorialEntryList.vue";

const entry = (path: string, title: string, date: string, extra: Record<string, unknown> = {}) => ({ path, title, date, ...extra });

describe("EditorialEntryList", () => {
  it("features the newest development log and groups the rest by year, newest first", async () => {
    const wrapper = await mountSuspended(EditorialEntryList, {
      props: {
        kind: "blog",
        entries: [
          entry("/blog/c", "最新一篇", "2026-10-07T00:00:00.000Z", { description: "最新的摘要", tags: ["随机事件"] }),
          entry("/blog/b", "今年较早", "2026-02-15T00:00:00.000Z", { description: "较早的摘要" }),
          entry("/blog/a", "去年的一篇", "2025-12-01T00:00:00.000Z", { description: "去年的摘要" }),
        ],
      },
    });

    const feature = wrapper.get(".entry-feature");
    expect(feature.attributes("href")).toBe("/blog/c");
    expect(feature.text()).toContain("最新的摘要");
    expect(feature.text()).toContain("随机事件");
    expect(wrapper.findAll(".entry-year-heading").map((heading) => heading.text())).toEqual(["2026", "2025"]);
    expect(wrapper.findAll(".entry-row").map((row) => row.get(".entry-row__title").text())).toEqual(["今年较早", "去年的一篇"]);
    expect(wrapper.get(".entry-row__date").text()).toBe("2月15日");
  });

  it("lists release notes by version with the newest marked and no summary line", async () => {
    const wrapper = await mountSuspended(EditorialEntryList, {
      props: {
        kind: "changelog",
        entries: [
          entry("/changelog/26.1009.1", "镜中回响", "2026-10-09T00:00:00.000Z", { version: "26.1009.1", description: "26.1009.1 已发布，更新主题为镜中回响。" }),
          entry("/changelog/26.0925.1", "事件调整", "2026-09-25T00:00:00.000Z", { version: "26.0925.1" }),
        ],
      },
    });

    expect(wrapper.find(".entry-feature").exists()).toBe(false);
    const rows = wrapper.findAll(".entry-row");
    expect(rows).toHaveLength(2);
    expect(rows[0]!.text()).toContain("26.1009.1");
    expect(rows[0]!.text()).toContain("最新");
    expect(rows[1]!.text()).not.toContain("最新");
    expect(wrapper.text()).not.toContain("已发布，更新主题为");
  });
});
