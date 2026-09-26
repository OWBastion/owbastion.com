import { installApiTestFetch } from "~/tests/utils/api-test-fetch";
import { mountSuspended, mockNuxtImport } from "@nuxt/test-utils/runtime";
import { flushPromises } from "@vue/test-utils";
import { describe, expect, it, vi } from "vitest";
import AdminDashboard from "./index.vue";

const adminApi = vi.fn((path: string) => {
  if (path === "/v1/submissions?status=ready_for_review,ocr_review_required&page=1&pageSize=5") return Promise.resolve({ total: 4, items: [
    { submissionId: "submission-1", mapName: "帕拉伊苏", difficulty: "困难", playerName: "他又", status: "ready_for_review", updatedAt: 0 },
    { submissionId: "submission-2", mapName: "釜山", difficulty: "专家", playerName: "阿澈", status: "ocr_review_required", updatedAt: 0 },
  ] });
  if (path === "/v1/binding-claims") return Promise.resolve({ items: [
    { claimId: "claim-pending", playerName: "例外玩家", playerId: "1234", status: "pending_review", createdAt: 3, operationType: "conflict" },
    { claimId: "claim-waiting", playerName: "正常玩家", playerId: "5678", status: "pending_confirmation", createdAt: 2, operationType: "initial_binding" },
  ] });
  if (path === "/v1/binding-invites") return Promise.resolve({ items: [
    { inviteId: "invite-retry", playerName: "迁移玩家", playerId: "4567", createdAt: 4, historicalMigration: { status: "retry_required" } },
    { inviteId: "invite-done", playerName: "已迁移", playerId: "8901", createdAt: 1, historicalMigration: { status: "completed" } },
  ] });
  if (path === "/v1/mastery-runs?unresolvedConflictsOnly=true&page=1&pageSize=5") return Promise.resolve({ total: 1, items: [
    { runId: "run-1", mapName: "花村", difficulty: "困难", playerName: "通关玩家", runCode: "1234-5678-9012", conflictCount: 1 },
  ] });
  if (path === "/v1/annotations/proposals?state=pending&page=1&pageSize=5") return Promise.resolve({ total: 1, items: [
    { proposalId: "proposal-1", submissionMapName: "测试地图", fieldKey: "difficulty", priority: { category: "correction" } },
  ] });
  if (path === "/v1/datasets?status=draft&page=1&pageSize=5") return Promise.resolve({ total: 1, items: [
    { datasetId: "dataset-1", version: 3, counts: { eligibleCount: 8 } },
  ] });
  throw new Error(`Unexpected request: ${path}`);
});
installApiTestFetch({ admin: adminApi });

describe("admin pending work landing page", () => {
  it("shows only actionable owner queues and links to their existing workflows", async () => {
    adminApi.mockClear();
    const wrapper = await mountSuspended(AdminDashboard, { global: { stubs: { NuxtLink: { props: ["to"], template: "<a :href=\"to\"><slot /></a>" } } } });
    await flushPromises();

    expect(wrapper.text()).toContain("9 项");
    expect(wrapper.text()).toContain("截图审核");
    expect(wrapper.text()).toContain("通关冲突");
    expect(wrapper.text()).toContain("等待定稿");
    expect(wrapper.text()).not.toContain("正常玩家");
    expect(wrapper.text()).not.toContain("已迁移");
    expect(wrapper.text()).not.toContain("活跃玩家");
    expect(wrapper.text()).not.toContain("地图目录");
    expect(wrapper.find(".metric-value").exists()).toBe(false);
    expect(wrapper.find(".management-links").exists()).toBe(false);
    expect(wrapper.find('a[href="/admin/reviews/submission-1"]').exists()).toBe(true);
    expect(wrapper.find('a[href="/admin/bindings"]').exists()).toBe(true);
    expect(wrapper.find('a[href="/admin/bindings?tab=invitations"]').exists()).toBe(true);
    expect(wrapper.find('a[href="/admin/mastery-runs?unresolvedConflictsOnly=true"]').exists()).toBe(true);
    expect(adminApi).toHaveBeenCalledTimes(6);
    expect(adminApi).not.toHaveBeenCalledWith(expect.stringContaining("/v1/player-reviews"));
    expect(adminApi).not.toHaveBeenCalledWith(expect.stringContaining("/v1/mastery-runs?page=1&pageSize=5"));
  });
});
