import { installApiTestFetch } from "~/tests/utils/api-test-fetch";
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
        gameVersion: "2026.07.18",
        effectTags: ["测试"],
        effectAnnotations: [],
        releaseStatus: "implemented",
        challenges: [],
      }],
    };
  }
  if (path === "/v1/event-versions") return { items: [{ gameVersion: "2026.07.18", availability: "available", eventCount: 1 }] };
  throw new Error(`Unexpected request: ${path}`);
});

installApiTestFetch({ admin: adminApi });

describe("admin events page", () => {
  it("renders the event list with sorting and grouping controls", async () => {
    const wrapper = await mountSuspended(EventsAdminPage, { attachTo: document.body });
    await flushPromises();

    const sortingSelect = wrapper.get('[aria-label="排序方式"]');
    expect(sortingSelect).toBeTruthy();
    expect(wrapper.get('[aria-label="分组方式"]')).toBeTruthy();
    expect(wrapper.text()).toContain("默认顺序");
    expect(wrapper.text()).toContain("不分组");
    expect(wrapper.text()).toContain("测试事件");
  });
});
