import { DOMWrapper, enableAutoUnmount, flushPromises } from "@vue/test-utils";
import { mountSuspended, mockNuxtImport } from "@nuxt/test-utils/runtime";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
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
  eventGroup: "赌徒",
  effectTags: ["测试"],
  effectAnnotations: [],
  releaseStatus: "implemented",
  challenges: [],
};

const toastAdd = vi.fn();
mockNuxtImport("useToast", () => () => ({ add: toastAdd }));
let versionAvailability = "available";
const secondEvent = { ...testEvent, eventId: "event.second", name: "第二个事件", eventGroup: null };
const adminApi = vi.fn(async (path: string, options?: { method?: string; body?: Record<string, unknown> }) => {
  if (path === "/v1/events?archived=false") {
    return { items: [testEvent, secondEvent] };
  }
  if (path === "/v1/event-versions") return { items: [{ gameVersion: "2026.07.18", availability: versionAvailability, eventCount: 1 }] };
  if (path === "/v1/event-versions/2026.07.18/availability" && options?.method === "PUT") { versionAvailability = String(options.body?.availability); return { gameVersion: "2026.07.18", availability: versionAvailability, eventCount: 1 }; }
  if (path === "/v1/events/event.second" && options?.method === "PUT") return { ...secondEvent, ...(options.body ?? {}) };
  if (path === "/v1/events/event.test" && options?.method === "PUT") return { ...testEvent, ...(options.body ?? {}), rarity: "R" };
  throw new Error(`Unexpected request: ${path}`);
});

mockNuxtImport("useAdminApi", () => () => adminApi);

const dialogStub = { AdminResponsiveDialog: { props: ["open"], template: '<div v-if="open"><slot name="body" /><slot name="footer" /></div>' } };

const openEditor = async (wrapper: Awaited<ReturnType<typeof mountSuspended>>, name = "测试事件") => {
  // The virtualized desktop grid renders no rows in jsdom; open the record from the mobile list.
  const record = wrapper.findAll(".admin-data-table__mobile-primary-link").find((button) => button.text().includes(name));
  expect(record).toBeTruthy();
  await record!.trigger("click");
  await flushPromises();
};
const createdOption = async (label: string) => {
  await flushPromises();
  return new DOMWrapper(document.body).findAll('[role="option"]').find((option) => option.text().includes(label));
};

enableAutoUnmount(afterEach);

describe("admin events page", () => {
  beforeEach(() => { toastAdd.mockClear(); versionAvailability = "available"; adminApi.mockClear(); document.body.innerHTML = ""; });

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

    await openEditor(wrapper);
    const form = wrapper.get('form[aria-label="事件编辑"]');
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
    expect(body).toMatchObject({ name: "测试事件", category: "增益", eventGroup: "赌徒", weight: 1, effectTags: ["测试"], gameVersion: "2026.07.18" });
    expect(form.find('input[placeholder="选择或输入事件组"]').element).toHaveProperty("value", "赌徒");
  });

  it("commits created category and effect tag values into the save body", async () => {
    const wrapper = await mountSuspended(EventsAdminPage, { attachTo: document.body, global: { stubs: dialogStub } });
    await flushPromises();

    await openEditor(wrapper);
    const form = wrapper.get('form[aria-label="事件编辑"]');

    const categoryInput = form.find('input[placeholder="选择或输入类别"]');
    await categoryInput.setValue("新类别");
    const categoryOption = await createdOption("新类别");
    expect(categoryOption).toBeTruthy();
    await categoryOption!.trigger("click");
    await flushPromises();
    expect(categoryInput.element).toHaveProperty("value", "新类别");

    const tagsInput = form.find('input[aria-label="效果标签"]');
    await tagsInput.setValue("新标签");
    const tagOption = await createdOption("新标签");
    expect(tagOption).toBeTruthy();
    await tagOption!.trigger("click");
    await flushPromises();

    await form.trigger("submit");
    await flushPromises();

    const saved = adminApi.mock.calls.find(([path, options]) => path === "/v1/events/event.test" && options?.method === "PUT");
    expect(saved).toBeTruthy();
    expect(saved![1]!.body!).toMatchObject({ category: "新类别", effectTags: ["测试", "新标签"] });
  });

  it("offers an undo after saving that restores the previous values", async () => {
    const wrapper = await mountSuspended(EventsAdminPage, { attachTo: document.body, global: { stubs: dialogStub } });
    await flushPromises();
    await openEditor(wrapper);
    const form = wrapper.get('form[aria-label="事件编辑"]');
    await form.find('input[placeholder="选择或输入类别"]').setValue("新类别");
    (await createdOption("新类别"))!.trigger("click");
    await flushPromises();
    await form.trigger("submit");
    await flushPromises();

    const toast = toastAdd.mock.calls.map(([item]) => item).find((item) => item.title === "已保存「测试事件」");
    expect(toast).toBeTruthy();
    adminApi.mockClear();
    await toast.actions[0].onClick();
    await flushPromises();
    const restored = adminApi.mock.calls.find(([path, options]) => path === "/v1/events/event.test" && options?.method === "PUT");
    expect(restored![1]!.body).toMatchObject({ category: "增益", eventGroup: "赌徒", weight: 1 });
  });

  it("suspends a version from the toolbar switch without a confirmation dialog and offers an undo", async () => {
    const wrapper = await mountSuspended(EventsAdminPage, { attachTo: document.body });
    await flushPromises();
    await wrapper.get('button[aria-label="更多"]').trigger("click");
    await flushPromises();
    await new DOMWrapper(document.body).get('button[aria-label="挂起版本 2026.07.18"]').trigger("click");
    await flushPromises();

    expect(adminApi).toHaveBeenCalledWith("/v1/event-versions/2026.07.18/availability", expect.objectContaining({ method: "PUT", body: { contractVersion: "1", availability: "suspended" } }));
    expect(wrapper.get('button[aria-label="更多，1 个版本已挂起"]').text()).toContain("1 已挂起");
    const toast = toastAdd.mock.calls.map(([item]) => item).find((item) => item.title === "2026.07.18 已挂起");
    await toast.actions[0].onClick();
    await flushPromises();
    expect(versionAvailability).toBe("available");
  });

  it("filters the catalog by event group chip", async () => {
    const wrapper = await mountSuspended(EventsAdminPage, { attachTo: document.body });
    await flushPromises();

    const chips = () => wrapper.findAll('[aria-label="事件组"] button');
    expect(chips().map((chip) => chip.text())).toEqual(["赌徒1", "未分组1"]);
    await chips()[0]!.trigger("click");
    expect(wrapper.findAll(".admin-data-table__mobile-record").map((record) => record.text())).toEqual([expect.stringContaining("测试事件")]);
  });

  it("asks before dropping unsaved changes when another event is selected beside the table", async () => {
    vi.stubGlobal("matchMedia", (query: string) => ({ matches: query.includes("min-width: 64rem"), media: query, addEventListener: () => {}, removeEventListener: () => {}, addListener: () => {}, removeListener: () => {}, dispatchEvent: () => false, onchange: null }));
    const wrapper = await mountSuspended(EventsAdminPage, { attachTo: document.body });
    await flushPromises();
    await openEditor(wrapper);
    expect(wrapper.find('aside[aria-label="事件编辑"] form').exists()).toBe(true);
    await wrapper.get('aside input[required]').setValue("改过的名称");
    await openEditor(wrapper, "第二个事件");
    expect(wrapper.text()).toContain("有未保存的修改");
    expect(wrapper.get("aside h2").text()).toBe("测试事件");

    await wrapper.findAll("button").find((button) => button.text() === "放弃并切换")!.trigger("click");
    await flushPromises();
    expect(wrapper.get("aside h2").text()).toBe("第二个事件");
    vi.unstubAllGlobals();
  });
});
