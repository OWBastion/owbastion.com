import { DOMWrapper, enableAutoUnmount, flushPromises } from "@vue/test-utils";
import { mountSuspended, mockNuxtImport } from "@nuxt/test-utils/runtime";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import EventsAdminPage from "./events.vue";

const event = (eventId: string, name: string, overrides: Record<string, unknown> = {}) => ({
  eventId, name, category: "增益", rarity: "R", description: `${name}说明`, durationSeconds: 30, cooldownSeconds: 10, weight: 1,
  gameVersion: "5.0", eventGroup: null, effectTags: ["测试"], effectAnnotations: [], releaseStatus: "implemented", archived: false, challenges: [], ...overrides,
});
let store: Array<ReturnType<typeof event>> = [];
let versionAvailability = "available";
const resetStore = () => { store = [event("a", "梭哈", { eventGroup: "赌徒", weight: 1 }), event("b", "先知", { eventGroup: "作弊", weight: 1 }), event("c", "草稿事件", { releaseStatus: "development" })]; versionAvailability = "available"; };

const toastAdd = vi.fn();
mockNuxtImport("useToast", () => () => ({ add: toastAdd }));

type Options = { method?: string; body?: Record<string, unknown> };
const adminApi = vi.fn(async (path: string, options?: Options) => {
  if (path === "/v1/events?archived=false") return { items: store };
  if (path === "/v1/event-versions") return { items: [{ gameVersion: "5.0", availability: versionAvailability, eventCount: store.length }] };
  if (path === "/v1/event-versions/5.0/availability" && options?.method === "PUT") { versionAvailability = String(options.body?.availability); return { gameVersion: "5.0", availability: versionAvailability, eventCount: store.length }; }
  if (path === "/v1/events/batch" && options?.method === "POST") {
    const updates = options.body!.updates as Array<Record<string, unknown> & { eventId: string }>;
    store = store.map((item) => { const update = updates.find((candidate) => candidate.eventId === item.eventId); return update ? { ...item, ...update, eventGroup: update.eventGroup === "" ? null : (update.eventGroup ?? item.eventGroup) } as typeof item : item; });
    return { contractVersion: "1", items: updates.map((update) => store.find((item) => item.eventId === update.eventId)) };
  }
  if (path === "/v1/events" && options?.method === "POST") { const created = event("n", String(options.body?.name)); store = [created, ...store]; return created; }
  if (path === "/v1/events/a" && options?.method === "DELETE") { store = store.filter((item) => item.eventId !== "a"); return {}; }
  throw new Error(`Unexpected request: ${path}`);
});
mockNuxtImport("useAdminApi", () => () => adminApi);

const stubs = { USlideover: { props: ["open", "title"], template: '<div v-if="open" role="dialog"><h2>{{ title }}</h2><slot name="body" /><slot name="footer" /></div>' } };
const mountPage = async () => { const wrapper = await mountSuspended(EventsAdminPage, { attachTo: document.body, global: { stubs } }); await flushPromises(); return wrapper; };
type Wrapper = Awaited<ReturnType<typeof mountPage>>;
const rowOf = (wrapper: Wrapper, name: string) => wrapper.findAll("tbody tr").find((row) => row.text().includes(name))!;
const setWeight = async (wrapper: Wrapper, name: string, value: string) => { const input = rowOf(wrapper, name).get('input[aria-label="权重"]'); (input.element as HTMLInputElement).value = value; await input.trigger("change"); await flushPromises(); };
const toastFor = (title: string) => toastAdd.mock.calls.map(([item]) => item).find((item) => item.title === title);

enableAutoUnmount(afterEach);

describe("admin events workbench", () => {
  beforeEach(() => { resetStore(); toastAdd.mockClear(); adminApi.mockClear(); document.body.innerHTML = ""; });

  it("lists the implemented events with the candidate pool, and switches status", async () => {
    const wrapper = await mountPage();
    expect(wrapper.findAll("tbody tr").map((row) => row.get("button").text())).toEqual(["梭哈", "先知"]);
    expect(wrapper.get('[aria-label="候选池"]').text()).toContain("2");
    await wrapper.findAll('[aria-label="状态"] button').find((button) => button.text().startsWith("开发中"))!.trigger("click");
    expect(wrapper.findAll("tbody tr").map((row) => row.get("button").text())).toEqual(["草稿事件"]);
  });

  it("stages an inline weight change with its probability effect and saves everything in one batch", async () => {
    const wrapper = await mountPage();
    const before = rowOf(wrapper, "先知").get(".event-table__probability b").text();
    await setWeight(wrapper, "梭哈", "2.5");

    expect(wrapper.get('[role="status"]').text()).toContain("1 项未保存的修改");
    expect(adminApi.mock.calls.some(([path]) => path === "/v1/events/batch")).toBe(false);
    expect(rowOf(wrapper, "梭哈").get('input[aria-label="权重"]').classes()).toContain("is-changed");
    expect(rowOf(wrapper, "先知").get(".event-table__probability b").text()).not.toBe(before);
    expect(rowOf(wrapper, "先知").find(".event-table__delta").exists()).toBe(true);

    await wrapper.findAll("button").find((button) => button.text() === "保存全部")!.trigger("click");
    await flushPromises();
    const call = adminApi.mock.calls.find(([path]) => path === "/v1/events/batch")!;
    expect(call[1]!.body).toEqual({ contractVersion: "1", updates: [{ eventId: "a", weight: 2.5 }] });
    expect(wrapper.find('[role="status"]').exists()).toBe(false);
    expect(toastFor("已保存 1 项修改")).toBeTruthy();
  });

  it("undoes a saved batch with the previous values", async () => {
    const wrapper = await mountPage();
    await setWeight(wrapper, "梭哈", "2.5");
    await wrapper.findAll("button").find((button) => button.text() === "保存全部")!.trigger("click");
    await flushPromises();
    adminApi.mockClear();
    await toastFor("已保存 1 项修改").actions[0].onClick();
    await flushPromises();

    const call = adminApi.mock.calls.find(([path]) => path === "/v1/events/batch")!;
    expect(call[1]!.body).toEqual({ contractVersion: "1", updates: [{ eventId: "a", weight: 1 }] });
    expect((rowOf(wrapper, "梭哈").get('input[aria-label="权重"]').element as HTMLInputElement).value).toBe("1");
  });

  it("discards the draft without saving", async () => {
    const wrapper = await mountPage();
    await setWeight(wrapper, "梭哈", "2.5");
    await wrapper.findAll("button").find((button) => button.text() === "放弃")!.trigger("click");

    expect(wrapper.find('[role="status"]').exists()).toBe(false);
    expect((rowOf(wrapper, "梭哈").get('input[aria-label="权重"]').element as HTMLInputElement).value).toBe("1");
    expect(adminApi.mock.calls.some(([path]) => path === "/v1/events/batch")).toBe(false);
  });

  it("stages bulk changes for the selected events into the same draft", async () => {
    const wrapper = await mountPage();
    for (const name of ["梭哈", "先知"]) await rowOf(wrapper, name).get('input[type="checkbox"]').setValue(true);
    expect(wrapper.text()).toContain("已选 2 项");

    const group = wrapper.get('select[aria-label="设事件组"]');
    (group.element as HTMLSelectElement).value = "__clear";
    await group.trigger("change");
    expect(wrapper.get('[role="status"]').text()).toContain("2 项未保存的修改");
    expect((rowOf(wrapper, "梭哈").get('select[aria-label="事件组"]').element as HTMLSelectElement).value).toBe("");

    await wrapper.findAll(".selection-bar__op").find((button) => button.text() === "×")!.trigger("click");
    await wrapper.get('input[aria-label="权重数值"]').setValue("0.5");
    await wrapper.findAll("button").find((button) => button.text() === "应用")!.trigger("click");
    expect((rowOf(wrapper, "梭哈").get('input[aria-label="权重"]').element as HTMLInputElement).value).toBe("0.5");
  });

  it("suspends a version from the pool strip with an undo", async () => {
    const wrapper = await mountPage();
    await wrapper.get('button[aria-label="挂起版本 5.0"]').trigger("click");
    await flushPromises();

    expect(adminApi).toHaveBeenCalledWith("/v1/event-versions/5.0/availability", expect.objectContaining({ method: "PUT", body: { contractVersion: "1", availability: "suspended" } }));
    expect(wrapper.get('[aria-label="候选池"]').text()).toContain("0");
    await toastFor("5.0 已挂起").actions[0].onClick();
    await flushPromises();
    expect(versionAvailability).toBe("available");
  });

  it("opens the sheet from the event name and stages edits into the draft", async () => {
    const wrapper = await mountPage();
    await rowOf(wrapper, "梭哈").get(".event-table__open").trigger("click");
    await flushPromises();

    const sheet = wrapper.get('[role="dialog"]');
    expect(sheet.text()).toContain("平均每");
    const name = sheet.find("input[required]");
    (name.element as HTMLInputElement).value = "梭哈二";
    await name.trigger("change");
    expect(wrapper.get('[role="status"]').text()).toContain("1 项未保存的修改");
    expect(sheet.text()).toContain("改动已进入页面顶部的草稿");
  });

  it("creates an event from the sheet and archives with a second confirming click", async () => {
    const wrapper = await mountPage();
    await wrapper.findAll("button").find((button) => button.text() === "新建事件")!.trigger("click");
    await flushPromises();
    const sheet = wrapper.get('[role="dialog"]');
    const name = sheet.find("input[required]");
    (name.element as HTMLInputElement).value = "全新事件";
    await name.trigger("change");
    await sheet.findAll("button").find((button) => button.text() === "创建事件")!.trigger("click");
    await flushPromises();
    expect(adminApi.mock.calls.find(([path, options]) => path === "/v1/events" && options?.method === "POST")![1]!.body).toMatchObject({ name: "全新事件", contractVersion: "1" });

    await rowOf(wrapper, "梭哈").get(".event-table__open").trigger("click");
    await flushPromises();
    const archive = () => wrapper.get('[role="dialog"]').findAll("button").find((button) => /归档/.test(button.text()))!;
    await archive().trigger("click");
    expect(adminApi.mock.calls.some(([, options]) => options?.method === "DELETE")).toBe(false);
    await archive().trigger("click");
    await flushPromises();
    expect(adminApi.mock.calls.some(([path, options]) => path === "/v1/events/a" && options?.method === "DELETE")).toBe(true);
    expect(wrapper.findAll("tbody tr").map((row) => row.text()).join()).not.toContain("梭哈");
  });
});
