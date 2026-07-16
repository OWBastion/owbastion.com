import { mountSuspended, mockNuxtImport } from "@nuxt/test-utils/runtime";
import { flushPromises, type VueWrapper } from "@vue/test-utils";
import { describe, expect, it, vi } from "vitest";
import AchievementAdminPage from "./achievements.vue";

const title = { challengeId: "title-1", family: "achievement", type: "title_achievement", titleName: "守望先锋", category: "战绩", categoryOverride: null, condition: "完成挑战", evidenceRule: "完整截图", submissionMode: "manual", status: "active", gameVersion: "3.1.0", introducedVersion: "3.1.0", retiredVersion: null };
const secondTitle = { ...title, challengeId: "title-2", titleName: "游戏先锋", category: "探索" };
const catalogTitle = { challengeId: "title.INTERNAL", family: "title_catalog", type: "title_catalog", titleKey: "INTERNAL", titleName: "内部称号", category: "开发保留", condition: "开发/管理用途。", availability: "active", scope: "global", displayKind: "fixed", status: "active", gameVersion: "3.1.0", hasChallenge: false };
const map = { challengeId: "map-1", family: "map", type: "map_completion", name: "国王大道挑战", mapName: "国王大道", difficulty: "困难", status: "active", gameVersion: "3.0.0", introducedVersion: "3.0.0", retiredVersion: null };
const adminApi = vi.fn((path: string, options?: { method?: string; body?: Record<string, unknown> }) => {
  if (path === "/v1/achievements") return Promise.resolve({ items: [title, secondTitle, catalogTitle, map] });
  if (path === "/v1/achievements?status=sunsetting") return Promise.resolve({ items: [{ ...title, status: "sunsetting", retiredVersion: "26.0713.1" }] });
  if (["/v1/achievements/title-1", "/v1/achievements/title-2", "/v1/achievements/map-1"].includes(path) && options?.method === "PUT") return Promise.resolve();
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
        PortalSelect: { props: ["modelValue", "items"], emits: ["update:modelValue"], template: '<select :value="modelValue" @change="$emit(\'update:modelValue\', $event.target.value)"><option v-for="item in items" :key="item.value" :value="item.value">{{ item.label }}</option></select>' },
      },
    },
  });
  await flushPromises();
  return wrapper;
}

describe("achievement admin page", () => {
  it("groups generic achievements by series and maps by map without a side panel", async () => {
    const wrapper = await mountPage();
    expect(wrapper.text()).toContain("通用成就");
    expect(wrapper.text()).toContain("战绩");
    expect(wrapper.text()).toContain("探索");
    expect(wrapper.text()).toContain("内部称号");
    expect(wrapper.text()).toContain("未开放");
    expect(wrapper.text()).toContain("地图挑战");
    expect(wrapper.text()).toContain("国王大道");
    expect(wrapper.find(".portal-side-panel").exists()).toBe(false);
  });

  it("saves expanded title rules and clears the category override", async () => {
    const wrapper = await mountPage();
    await wrapper.findAll(".portal-button--secondary")[0].trigger("click");
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
    const planButton = wrapper.findAll(".portal-button--secondary").find((button) => button.text() === "计划下线")!;
    await planButton.trigger("click");
    const form = wrapper.find("form.plan-popover");
    await form.find('input[placeholder="例如 26.0713.1"]').setValue("26.0713.1");
    await form.trigger("submit");
    await flushPromises();
    expect(adminApi).toHaveBeenCalledWith("/v1/achievements/title-1", expect.objectContaining({ method: "PUT", body: expect.objectContaining({ status: "sunsetting", retiredVersion: "26.0713.1" }) }));
  });

  it("ends an active map challenge directly without a release version", async () => {
    const wrapper = await mountPage();
    const endButton = wrapper.findAll(".portal-button--danger").at(-1)!;
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
    await wrapper.find(".portal-button--danger").trigger("click");
    await flushPromises();
    const requestsBeforeCancel = adminApi.mock.calls.length;
    await wrapper.get(".end-dialog .portal-button--secondary").trigger("click");
    await flushPromises();
    expect(adminApi).toHaveBeenCalledTimes(requestsBeforeCancel);
    expect(document.body.querySelector('[role="dialog"]')).toBeNull();
  });

  it("updates catalog-only title availability without creating a challenge", async () => {
    const wrapper = await mountPage();
    const endButton = wrapper.findAll(".portal-button--danger").find((button) => button.text() === "下线称号")!;
    await endButton.trigger("click");
    await flushPromises();
    await (document.body.querySelector('[role="dialog"] form') as HTMLFormElement).dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
    await flushPromises();
    expect(adminApi).toHaveBeenCalledWith("/v1/titles/INTERNAL", expect.objectContaining({ method: "PUT", body: { contractVersion: "1", status: "retired" } }));
  });
});
