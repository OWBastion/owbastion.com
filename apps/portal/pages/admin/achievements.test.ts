import { mountSuspended, mockNuxtImport } from "@nuxt/test-utils/runtime";
import { flushPromises, type VueWrapper } from "@vue/test-utils";
import { describe, expect, it, vi } from "vitest";
import AchievementAdminPage from "./achievements.vue";

const title = { challengeId: "title-1", family: "achievement", type: "title_achievement", titleName: "守望先锋", category: "战绩", categoryOverride: null, condition: "完成挑战", evidenceRule: "完整截图", submissionMode: "manual", status: "active", gameVersion: "3.1.0", introducedVersion: "3.1.0", retiredVersion: null };
const map = { challengeId: "map-1", family: "map", type: "map_completion", name: "国王大道挑战", mapName: "国王大道", difficulty: "困难", status: "active", gameVersion: "3.0.0", introducedVersion: "3.0.0", retiredVersion: null };
const adminApi = vi.fn((path: string, options?: { method?: string; body?: Record<string, unknown> }) => {
  if (path === "/v1/achievements") return Promise.resolve({ items: [title, map] });
  if (path === "/v1/achievements?type=achievement") return Promise.resolve({ items: [title] });
  if (path === "/v1/achievements/title-1" && options?.method === "PUT") return Promise.resolve();
  if (path === "/v1/achievements/map-1" && options?.method === "PUT") return Promise.resolve();
  throw new Error(`Unexpected request: ${path}`);
});
mockNuxtImport("useAdminApi", () => () => adminApi);

async function mountPage(): Promise<VueWrapper> {
  adminApi.mockClear();
  const wrapper = await mountSuspended(AchievementAdminPage, { attachTo: document.body, global: { stubs: { NuxtLink: { template: "<a><slot /></a>" }, StatusBadge: { props: ["label"], template: "<span>{{ label }}</span>" } } } });
  await flushPromises();
  return wrapper;
}

describe("achievement admin page", () => {
  it("opens a title editor, saves it, and returns focus on close", async () => {
    const wrapper = await mountPage();
    const trigger = wrapper.get(".achievement-row");
    (trigger.element as HTMLButtonElement).focus();
    await trigger.trigger("click");
    await flushPromises();
    expect(wrapper.get('[role="dialog"]').attributes("aria-labelledby")).toBe("achievement-detail-title");
    expect(document.activeElement).toBe(wrapper.get(".sheet-close").element);
    await wrapper.get("form").trigger("submit");
    await flushPromises();
    expect(adminApi).toHaveBeenCalledWith("/v1/achievements/title-1", expect.objectContaining({ method: "PUT" }));
    await wrapper.get(".sheet-close").trigger("click");
    await flushPromises();
    expect(document.activeElement).toBe(trigger.element);
  });

  it("filters the catalog by challenge type", async () => {
    const wrapper = await mountPage();
    await wrapper.get('select[aria-label="筛选成就类型"]').setValue("achievement");
    await flushPromises();
    expect(wrapper.findAll(".achievement-row")).toHaveLength(1);
    expect(wrapper.text()).toContain("守望先锋");
  });

  it("retires a map challenge with its release version", async () => {
    const wrapper = await mountPage();
    await wrapper.findAll(".achievement-row")[1].trigger("click");
    await wrapper.get('input[placeholder="例如 3.2.0"]').setValue("3.2.0");
    await wrapper.get(".danger-button").trigger("click");
    await flushPromises();
    expect(adminApi).toHaveBeenCalledWith("/v1/achievements/map-1", expect.objectContaining({
      method: "PUT",
      body: expect.objectContaining({ family: "map", status: "retired", retiredVersion: "3.2.0" }),
    }));
  });
});
