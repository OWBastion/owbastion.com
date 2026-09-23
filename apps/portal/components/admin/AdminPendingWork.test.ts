import { mountSuspended } from "@nuxt/test-utils/runtime";
import { describe, expect, it } from "vitest";
import AdminPendingWork from "./AdminPendingWork.vue";

describe("AdminPendingWork", () => {
  it("links actionable items to their owning queues and reports unavailable queues", async () => {
    const wrapper = await mountSuspended(AdminPendingWork, {
      props: {
        groups: [
          { id: "reviews", label: "截图审核", href: "/admin/reviews", count: 1, items: [{ id: "s1", title: "测试地图", detail: "等待核对", href: "/admin/reviews/s1" }], error: null },
          { id: "bindings", label: "绑定例外", href: "/admin/bindings", count: null, items: [], error: "无法读取绑定例外。" },
        ],
      },
      global: { stubs: { NuxtLink: { props: ["to"], template: "<a :href=\"to\"><slot /></a>" } } },
    });

    expect(wrapper.find('a[href="/admin/reviews/s1"]').exists()).toBe(true);
    expect(wrapper.find('a[href="/admin/reviews"]').text()).toBe("打开队列");
    expect(wrapper.text()).toContain("无法读取绑定例外。");
  });

  it("shows a concise empty state when every queue is clear", async () => {
    const wrapper = await mountSuspended(AdminPendingWork, {
      props: { groups: [{ id: "reviews", label: "截图审核", href: "/admin/reviews", count: 0, items: [], error: null }] },
    });

    expect(wrapper.text()).toContain("暂无待处理事项");
    expect(wrapper.find("a").exists()).toBe(false);
  });
});
