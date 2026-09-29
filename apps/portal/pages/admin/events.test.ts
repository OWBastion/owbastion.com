import { DOMWrapper, flushPromises } from "@vue/test-utils";
import { mountSuspended, mockNuxtImport } from "@nuxt/test-utils/runtime";
import { describe, expect, it, vi } from "vitest";
import EventsAdminPage from "./events.vue";

const testEvent = {
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
};

const adminApi = vi.fn(async (path: string, options?: { method?: string; body?: Record<string, unknown> }) => {
  if (path === "/v1/events?archived=false") {
    return { items: [testEvent] };
  }
  if (path === "/v1/event-versions") return { items: [{ gameVersion: "2026.07.18", availability: "available", eventCount: 1 }] };
  if (path === "/v1/events/event.test" && options?.method === "PUT") return { ...testEvent, ...(options.body ?? {}), rarity: "R" };
  throw new Error(`Unexpected request: ${path}`);
});

mockNuxtImport("useAdminApi", () => () => adminApi);

const dialogStub = { AdminResponsiveDialog: { props: ["open"], template: '<div v-if="open"><slot name="body" /><slot name="footer" /></div>' } };

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

  it("loads existing values into structured editor fields and saves without a rarity field", async () => {
    const wrapper = await mountSuspended(EventsAdminPage, { attachTo: document.body, global: { stubs: dialogStub } });
    await flushPromises();

    // The virtualized desktop grid renders no rows in jsdom; open the record's
    // actions through the mobile overflow menu instead.
    await wrapper.get('button[aria-label="打开更多操作"]').trigger("click");
    await flushPromises();
    const editButton = new DOMWrapper(document.body).findAll("button").find((button) => button.text() === "编辑");
    expect(editButton).toBeTruthy();
    await editButton!.trigger("click");
    await flushPromises();

    const form = wrapper.get("#event-editor");
    expect(form.text()).toContain("稀有度：R");
    expect(form.findAll('input[role="combobox"]').length).toBeGreaterThan(0);
    expect(form.find('input[role="combobox"]').element).toHaveProperty("value", "增益");
    expect(form.findAll("input").map((input) => (input.element as HTMLInputElement).value)).not.toContain("R");

    await form.trigger("submit");
    await flushPromises();

    const saved = adminApi.mock.calls.find(([path, options]) => path === "/v1/events/event.test" && options?.method === "PUT");
    expect(saved).toBeTruthy();
    const body = saved![1]!.body!;
    expect(body).not.toHaveProperty("rarity");
    expect(body).toMatchObject({ name: "测试事件", category: "增益", weight: 1, effectTags: ["测试"], gameVersion: "2026.07.18" });
  });
});
