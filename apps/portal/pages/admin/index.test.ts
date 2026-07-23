import { mountSuspended, mockNuxtImport } from "@nuxt/test-utils/runtime";
import { flushPromises } from "@vue/test-utils";
import { describe, expect, it, vi } from "vitest";
import AdminDashboard from "./index.vue";

const adminApi = vi.fn((path: string) => {
  if (path === "/v1/submissions?status=received,evidence_pending,evidence_stored,upload_pending,ocr_pending,ready_for_review,ocr_review_required&page=1&pageSize=5") return Promise.resolve({ total: 3, items: [
    { submissionId: "submission-1", mapName: "帕拉伊苏", difficulty: "困难", playerName: "他又", status: "ready_for_review", updatedAt: 0 },
    { submissionId: "submission-2", mapName: "釜山", difficulty: "专家", playerName: "阿澈", status: "ready_for_review", updatedAt: 0 },
  ] });
  if (path === "/v1/submissions?status=upload_pending,ocr_pending&page=1&pageSize=1") return Promise.resolve({ total: 2, items: [] });
  if (path === "/v1/player-accounts?status=active&page=1&pageSize=1") return Promise.resolve({ total: 42 });
  if (path === "/v1/maps") return Promise.resolve({ items: [{ mapId: "map-1" }, { mapId: "map-2" }, { mapId: "map-3" }] });
  throw new Error(`Unexpected request: ${path}`);
});
mockNuxtImport("useAdminApi", () => () => adminApi);

describe("admin dashboard", () => {
  it("shows dashboard metrics, review queue, and functional links", async () => {
    adminApi.mockClear();
    const wrapper = await mountSuspended(AdminDashboard, { global: { stubs: { NuxtLink: { props: ["to"], template: "<a :href=\"to\"><slot /></a>" } } } });
    await flushPromises();

    expect(wrapper.text()).toContain("待审核");
    expect(wrapper.text()).toContain("OCR 队列");
    expect(wrapper.text()).toContain("活跃玩家");
    expect(wrapper.text()).toContain("地图目录");
    expect(wrapper.text()).toContain("3");
    expect(wrapper.text()).toContain("2");
    expect(wrapper.text()).toContain("42");
    expect(wrapper.findAll(".metric-value")[3]?.text()).toBe("3");
    expect(wrapper.text()).toContain("帕拉伊苏");
    expect(wrapper.text()).toContain("等待核对");
    expect(wrapper.find('input[aria-label="搜索玩家"]').exists()).toBe(false);
    expect(wrapper.find('a[href="/admin/reviews"]').exists()).toBe(true);
    expect(wrapper.findAll('a[href="/admin/reviews"]').length).toBeGreaterThanOrEqual(2);
    expect(wrapper.find('a[href="/admin/players"]').exists()).toBe(true);
    expect(wrapper.find('a[href="/admin/channels"]').exists()).toBe(true);
    expect(wrapper.find('a[href="/admin/achievements"]').exists()).toBe(true);
    expect(wrapper.find('a[href="/admin/maps"]').exists()).toBe(true);
    expect(wrapper.find('a[href="/admin/titles"]').exists()).toBe(true);
  });
});
