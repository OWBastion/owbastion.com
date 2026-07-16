import { mountSuspended, mockNuxtImport } from "@nuxt/test-utils/runtime";
import { flushPromises, type VueWrapper } from "@vue/test-utils";
import { describe, expect, it, vi } from "vitest";
import AchievementAdminPage from "./achievements.vue";

const title = { challengeId: "title-1", family: "achievement", type: "title_achievement", titleName: "守望先锋", category: "战绩", categoryOverride: null, condition: "完成挑战", evidenceRule: "完整截图", submissionMode: "manual", status: "active", gameVersion: "3.1.0", introducedVersion: "3.1.0", retiredVersion: null };
const secondTitle = { ...title, challengeId: "title-2", titleName: "游戏先锋" };
const catalogTitle = { challengeId: "title.INTERNAL", family: "title_catalog", type: "title_catalog", titleKey: "INTERNAL", titleName: "内部称号", category: "开发保留", condition: "开发/管理用途。", availability: "active", scope: "global", displayKind: "fixed", status: "active", gameVersion: "3.1.0", hasChallenge: false };
const map = { challengeId: "map-1", family: "map", type: "map_completion", name: "国王大道挑战", mapName: "国王大道", difficulty: "困难", status: "active", gameVersion: "3.0.0", introducedVersion: "3.0.0", retiredVersion: null };
const secondMap = { ...map, challengeId: "map-2", name: "国王大道专家挑战" };
const adminApi = vi.fn((path: string, options?: { method?: string; body?: Record<string, unknown> }) => {
  if (path === "/v1/achievements") return Promise.resolve({ items: [title, secondTitle, catalogTitle, map, secondMap] });
  if (path === "/v1/achievements?status=sunsetting") return Promise.resolve({ items: [{ ...title, status: "sunsetting", retiredVersion: "26.0713.1" }] });
  if (["/v1/achievements/title-1", "/v1/achievements/title-2", "/v1/achievements/map-1", "/v1/achievements/map-2"].includes(path) && options?.method === "PUT") return Promise.resolve();
  if (path === "/v1/titles/INTERNAL" && options?.method === "PUT") return Promise.resolve();
  throw new Error(`Unexpected request: ${path}`);
});
mockNuxtImport("useAdminApi", () => () => adminApi);

async function mountPage(): Promise<VueWrapper> {
  adminApi.mockClear();
  const wrapper = await mountSuspended(AchievementAdminPage, {
    attachTo: document.body,
    global: {
      stubs: {
        NuxtLink: { template: "<a><slot /></a>" },
        StatusBadge: { props: ["label"], template: "<span>{{ label }}</span>" },
        UModal: { props: ["open"], emits: ["update:open"], template: '<div v-if="open" role="dialog"><slot name="body" /></div>' },
        UPopover: { props: ["open"], emits: ["update:open"], template: '<div><slot /><slot name="content" /></div>' },
        UCard: { template: "<div><slot /></div>" },
        UTabs: {
          props: ["modelValue", "items"],
          emits: ["update:modelValue"],
          template: '<div><button v-for="item in items" :key="item.value" type="button" :aria-label="item.label" @click="$emit(\'update:modelValue\', item.value)">{{ item.label }}</button><slot :name="modelValue" /></div>',
        },
        USelect: { props: ["modelValue", "items"], emits: ["update:modelValue"], template: '<select :value="modelValue" @change="$emit(\'update:modelValue\', $event.target.value)"><option v-for="item in items" :key="item.value" :value="item.value">{{ item.label }}</option></select>' },
      },
    },
  });
  await flushPromises();
  return wrapper;
}

describe("achievement admin page", () => {
  it("renders grouped achievements in one active tab at a time", async () => {
    const wrapper = await mountPage();
    expect(wrapper.text()).toContain("通用成就");
    expect(wrapper.find(".admin-table [aria-label='筛选成就状态']").exists()).toBe(true);
    expect(wrapper.find(".admin-workspace__toolbar").exists()).toBe(false);
    expect(wrapper.text()).toContain("战绩");
    expect(wrapper.text()).toContain("内部称号");
    expect(wrapper.text()).toContain("未开放");
    expect(wrapper.text()).not.toContain("国王大道");
    expect(wrapper.find(".portal-side-panel").exists()).toBe(false);
    expect(wrapper.findAll('button[aria-label="编辑规则"]')).toHaveLength(2);
    expect(wrapper.findAll('button[aria-label="计划下线"]')).toHaveLength(2);
    expect(wrapper.findAll('button[aria-label="结束挑战"]')).toHaveLength(2);
    expect(wrapper.findAll("button").some((button) => button.text() === "管理")).toBe(false);

    expect(wrapper.findAll('td[rowspan="2"]')).toHaveLength(1);
    expect(wrapper.find('td[rowspan="2"]').text()).toBe("战绩");
    expect(wrapper.findAll("td.hidden")).toHaveLength(1);
    expect(wrapper.findAll('td[rowspan="1"]:not(.hidden)')).toHaveLength(1);

    await wrapper.get('button[aria-label="地图挑战"]').trigger("click");
    await flushPromises();
    expect(wrapper.text()).toContain("国王大道");
    expect(wrapper.text()).not.toContain("内部称号");
    expect(wrapper.findAll('button[aria-label="编辑规则"]')).toHaveLength(0);
    expect(wrapper.findAll('button[aria-label="计划下线"]')).toHaveLength(2);
    expect(wrapper.findAll('td[rowspan="2"]')).toHaveLength(1);
    expect(wrapper.find('td[rowspan="2"]').text()).toBe("国王大道");
    expect(wrapper.findAll("td.hidden")).toHaveLength(1);
  });

  it("saves expanded title rules and clears the category override", async () => {
    const wrapper = await mountPage();
    await wrapper.get('button[aria-label="编辑规则"]').trigger("click");
    await flushPromises();
    const textareas = wrapper.findAll("textarea");
    await textareas[0].setValue("完成更新后的挑战");
    const category = wrapper.find('input[placeholder="战绩"]');
    await category.setValue("");
    await wrapper.get("form.editor").trigger("submit");
    await flushPromises();
    expect(adminApi).toHaveBeenCalledWith("/v1/achievements/title-1", expect.objectContaining({ method: "PUT", body: expect.objectContaining({ condition: "完成更新后的挑战", categoryOverride: null }) }));
  });

  it("plans a sunset in a temporary Nuxt UI popover", async () => {
    const wrapper = await mountPage();
    const planButton = wrapper.get('button[aria-label="计划下线"]');
    await planButton.trigger("click");
    const form = wrapper.find("form.plan-popover");
    await form.find('input[placeholder="例如 26.0713.1"]').setValue("26.0713.1");
    await form.trigger("submit");
    await flushPromises();
    expect(adminApi).toHaveBeenCalledWith("/v1/achievements/title-1", expect.objectContaining({ method: "PUT", body: expect.objectContaining({ status: "sunsetting", retiredVersion: "26.0713.1" }) }));
  });

  it("ends an active map challenge directly without a release version", async () => {
    const wrapper = await mountPage();
    await wrapper.get('button[aria-label="地图挑战"]').trigger("click");
    await flushPromises();
    const endButton = wrapper.get('button[aria-label="结束挑战"]');
    await endButton.trigger("click");
    await flushPromises();
    const dialog = document.body.querySelector('[role="dialog"]') as HTMLElement;
    expect(dialog).not.toBeNull();
    await (dialog.querySelector("form") as HTMLFormElement).dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
    await flushPromises();
    expect(adminApi).toHaveBeenCalledWith("/v1/achievements/map-1", expect.objectContaining({ method: "PUT", body: expect.objectContaining({ family: "map", status: "retired" }) }));
    expect(adminApi.mock.calls.find(([path]) => path === "/v1/achievements/map-1")?.[1]?.body).not.toHaveProperty("retiredVersion");
  });

  it("does not write when the end confirmation is cancelled", async () => {
    const wrapper = await mountPage();
    await wrapper.get('button[aria-label="结束挑战"]').trigger("click");
    await flushPromises();
    const requestsBeforeCancel = adminApi.mock.calls.length;
    await wrapper.find(".end-dialog button").trigger("click");
    await flushPromises();
    expect(adminApi).toHaveBeenCalledTimes(requestsBeforeCancel);
    expect(document.body.querySelector('[role="dialog"]')).toBeNull();
  });

  it("updates catalog-only title availability without creating a challenge", async () => {
    const wrapper = await mountPage();
    const endButton = wrapper.get('button[aria-label="下线称号"]');
    await endButton.trigger("click");
    await flushPromises();
    await (document.body.querySelector('[role="dialog"] form') as HTMLFormElement).dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
    await flushPromises();
    expect(adminApi).toHaveBeenCalledWith("/v1/titles/INTERNAL", expect.objectContaining({ method: "PUT", body: { contractVersion: "1", status: "retired" } }));
  });
});
