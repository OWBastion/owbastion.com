import { mountSuspended, mockNuxtImport } from "@nuxt/test-utils/runtime";
import { flushPromises } from "@vue/test-utils";
import { describe, expect, it, vi } from "vitest";
import AdminDashboard from "./index.vue";

const adminApi = vi.fn((path: string) => {
  if (path === "/v1/submissions?status=received,evidence_pending,evidence_stored,upload_pending,ocr_pending,ready_for_review,ocr_review_required&page=1&pageSize=5") return Promise.resolve({ total: 3, items: [
    { submissionId: "submission-1", mapName: "帕拉伊苏", difficulty: "困难", playerName: "他又", status: "ready_for_review", updatedAt: 0 },
    { submissionId: "submission-2", mapName: "釜山", difficulty: "专家", playerName: "阿澈", status: "ready_for_review", updatedAt: 0 },
  ] });
  throw new Error(`Unexpected request: ${path}`);
});
mockNuxtImport("useAdminApi", () => () => adminApi);

describe("admin dashboard", () => {
  it("shows the pending review queue without duplicating the management navigation", async () => {
    adminApi.mockClear();
    const wrapper = await mountSuspended(AdminDashboard, { global: { stubs: { NuxtLink: { props: ["to"], template: "<a :href=\"to\"><slot /></a>" } } } });
    await flushPromises();

    expect(wrapper.text()).toContain("3 条待核对");
    expect(wrapper.text()).not.toContain("活跃玩家");
    expect(wrapper.text()).not.toContain("地图目录");
    expect(wrapper.find(".metric-value").exists()).toBe(false);
    expect(wrapper.text()).toContain("帕拉伊苏");
    expect(wrapper.text()).toContain("等待核对");
    expect(wrapper.find('input[aria-label="搜索玩家"]').exists()).toBe(false);
    expect(wrapper.find(".management-links").exists()).toBe(false);
  });
});
