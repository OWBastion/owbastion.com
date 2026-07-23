import { flushPromises } from "@vue/test-utils";
import { mountSuspended, mockNuxtImport } from "@nuxt/test-utils/runtime";
import { describe, expect, it, vi } from "vitest";
import EventsAdminPage from "./events.vue";

const adminApi = vi.fn(async (path: string) => {
  if (path === "/v1/events?archived=false") {
    return {
      items: [{
        eventId: "event.test",
        name: "测试事件",
        category: "增益",
        rarity: "R",
        description: "测试事件说明",
        durationSeconds: 30,
        cooldownSeconds: 10,
        weight: 1,
        appearanceProbability: 0.1,
        categoryProbability: 0.2,
        groupTotalWeight: 10,
        groupSize: 2,
        failureProbability: 0.5,
        guaranteeProbability: 0.1,
        globalAppearanceProbability: 0.02,
        gameVersion: "2026.07.18",
        effectTags: ["测试"],
        releaseStatus: "implemented",
        challenges: [],
      }],
    };
  }
  throw new Error(`Unexpected request: ${path}`);
});

mockNuxtImport("useAdminApi", () => () => adminApi);

describe("admin events page", () => {
  it("renders sorting and grouping controls without an SSR error", async () => {
    const wrapper = await mountSuspended(EventsAdminPage, { attachTo: document.body });
    await flushPromises();

    expect(wrapper.get('[aria-label="排序方式"]')).toBeTruthy();
    expect(wrapper.get('[aria-label="分组方式"]')).toBeTruthy();
    expect(wrapper.text()).toContain("默认顺序");
    expect(wrapper.text()).toContain("不分组");
    expect(
      wrapper.findComponent({ name: "AdminDataTable" }).props("sorting"),
    ).toEqual([
      { id: "gameVersion", desc: true },
      { id: "name", desc: false },
    ]);
  });
});
