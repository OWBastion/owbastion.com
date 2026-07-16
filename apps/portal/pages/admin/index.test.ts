import { mountSuspended, mockNuxtImport } from "@nuxt/test-utils/runtime";
import { flushPromises } from "@vue/test-utils";
import { describe, expect, it, vi } from "vitest";
import AdminDashboard from "./index.vue";

const adminApi = vi.fn((path: string) => {
  if (path === "/v1/qq/groups") return Promise.resolve({ items: [{ groupOpenId: "group-1", enabled: true }, { groupOpenId: "group-2", enabled: false }] });
  if (path === "/v1/submissions?status=ready_for_review") return Promise.resolve({ items: [
    { submissionId: "submission-1", mapName: "帕拉伊苏", difficulty: "困难", playerName: "他又", status: "ready_for_review", updatedAt: 0 },
    { submissionId: "submission-2", mapName: "釜山", difficulty: "专家", playerName: "阿澈", status: "ready_for_review", updatedAt: 0 },
  ] });
  throw new Error(`Unexpected request: ${path}`);
});
mockNuxtImport("useAdminApi", () => () => adminApi);

describe("admin dashboard", () => {
  it("shows dashboard metrics, review queue, and functional links", async () => {
    adminApi.mockClear();
    const wrapper = await mountSuspended(AdminDashboard, { global: { stubs: { NuxtLink: { props: ["to"], template: "<a :href=\"to\"><slot /></a>" } } } });
    await flushPromises();

    expect(wrapper.text()).toContain("待核对");
    expect(wrapper.text()).toContain("已开放群组");
    expect(wrapper.text()).toContain("已关闭群组");
    expect(wrapper.text()).toContain("群组总数");
    expect(wrapper.text()).toContain("帕拉伊苏");
    expect(wrapper.text()).toContain("等待核对");
    expect(wrapper.find('input[aria-label="搜索玩家"]').exists()).toBe(false);
    expect(wrapper.find('a[href="/admin/reviews"]').exists()).toBe(true);
    expect(wrapper.find('a[href="/admin/players"]').exists()).toBe(true);
    expect(wrapper.find('a[href="/admin/channels"]').exists()).toBe(true);
    expect(wrapper.find('a[href="/admin/achievements"]').exists()).toBe(true);
    expect(wrapper.find('a[href="/admin/titles"]').exists()).toBe(true);
  });
});
