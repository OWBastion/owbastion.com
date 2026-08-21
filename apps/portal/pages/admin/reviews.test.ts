import { mountSuspended, mockNuxtImport } from "@nuxt/test-utils/runtime";
import { flushPromises } from "@vue/test-utils";
import { describe, expect, it, vi } from "vitest";
import ReviewsPage from "./reviews/index.vue";

const awaitingConfirmation = { submissionId: "submission-awaiting", mapName: "成就挑战", difficulty: "", playerName: "他又", status: "awaiting_player_confirmation", challenge: null, ocrStatus: "matched", ocrAttempt: 1, ocrErrorCode: null, ocr: null };
const adminApi = vi.fn((path: string) => {
  if (path === "/v1/submissions?page=1&pageSize=20&status=ready_for_review,ocr_review_required") return Promise.resolve({ items: [{ submissionId: "submission-1", mapName: "成就挑战", difficulty: "", playerName: "他又", status: "ready_for_review", challenge: { family: "achievement", titleName: "守望先锋", category: "战绩", condition: "完成挑战", evidenceRule: "完整截图" }, ocrStatus: "matched", ocrAttempt: 1, ocrErrorCode: null, ocr: { data: { map_name: "帕拉伊苏", achievement_titles: ["守望先锋"] }, fields: { map_name: { confidence: 0.98 }, achievement_titles: { confidence: 0.94 } } } }, { submissionId: "submission-2", mapName: "釜山", difficulty: "专家", playerName: "他又", status: "ocr_review_required", challenge: null, ocrStatus: "review_required", ocrAttempt: 1, ocrErrorCode: null }], total: 2 });
  if (path === "/v1/submissions?page=1&pageSize=20") return Promise.resolve({ items: [{ submissionId: "submission-1", mapName: "成就挑战", difficulty: "", playerName: "他又", status: "ready_for_review", challenge: { family: "achievement", titleName: "守望先锋", category: "战绩", condition: "完成挑战", evidenceRule: "完整截图" }, ocrStatus: "matched", ocrAttempt: 1, ocrErrorCode: null, ocr: { data: { map_name: "帕拉伊苏", achievement_titles: ["守望先锋"] }, fields: { map_name: { confidence: 0.98 }, achievement_titles: { confidence: 0.94 } } } }, { submissionId: "submission-2", mapName: "釜山", difficulty: "专家", playerName: "他又", status: "ocr_review_required", challenge: null, ocrStatus: "review_required", ocrAttempt: 1, ocrErrorCode: null }, { submissionId: "submission-3", mapName: "尼泊尔", difficulty: "地狱", playerName: "他又", status: "evidence_stored", challenge: null, ocrStatus: "not_started", ocrAttempt: null, ocrErrorCode: null }, { submissionId: "submission-4", mapName: "绿洲城", difficulty: "困难", playerName: "他又", status: "approved", challenge: null, ocrStatus: "matched", ocrAttempt: 1, ocrErrorCode: null }, awaitingConfirmation], total: 5 });
  if (path === "/v1/submissions?page=1&pageSize=20&status=awaiting_player_confirmation") return Promise.resolve({ items: [awaitingConfirmation], total: 1 });
  if (path === "/v1/submissions/submission-1") return Promise.resolve({ submissionId: "submission-1", mapName: "成就挑战", difficulty: "", playerName: "他又", status: "ready_for_review", challenge: { family: "achievement", titleName: "守望先锋", category: "战绩", condition: "完成挑战", evidenceRule: "完整截图" }, ocrStatus: "matched", ocrAttempt: 1, ocrErrorCode: null, ocr: { model_version: "v1", request_id: "ocr-request-1", data: { map_name: "帕拉伊苏", difficulty: "困难", viewer_player: "他又", challenge_completed: true }, fields: { map_name: { confidence: 0.98, status: "ok" }, difficulty: { confidence: 0.97, status: "ok" }, viewer_player: { confidence: 0.96, status: "ok" }, challenge_completed: { confidence: 0.99, status: "ok" } }, warnings: ["right_panel.version_missing"] } });
  throw new Error(`Unexpected request: ${path}`);
});
mockNuxtImport("useAdminApi", () => () => adminApi);

describe("admin reviews page", () => {
  it("links each submission to its standalone detail page", async () => {
    adminApi.mockClear();
    const wrapper = await mountSuspended(ReviewsPage, { global: { stubs: { USelect: { props: ["modelValue", "items"], emits: ["update:modelValue"], template: '<select aria-label="筛选提交状态" :value="modelValue" @change="$emit(\'update:modelValue\', $event.target.value)"><option v-for="item in items" :key="item.value" :value="item.value">{{ item.label }}</option></select>' } } } });
    await flushPromises();
    expect(adminApi).toHaveBeenCalledWith("/v1/submissions?page=1&pageSize=20&status=ready_for_review,ocr_review_required");
    expect(wrapper.findAll(".admin-table tbody tr")).toHaveLength(2);
    expect(wrapper.findAll(".admin-data-table__mobile-record")).toHaveLength(2);
    expect(wrapper.text()).toContain("等待核对");
    expect(wrapper.text()).toContain("帕拉伊苏");
    expect(wrapper.text()).toContain("成就挑战：守望先锋");
    expect(wrapper.text()).not.toContain("面板：");
    expect(wrapper.text()).toContain("地图 98%");
    expect(wrapper.text()).toContain("成就 94%");
    expect(wrapper.get('a[href="/admin/reviews/submission-1"]').text()).toContain("查看");
    expect(wrapper.find('[role="dialog"]').exists()).toBe(false);

    await wrapper.get('select[aria-label="筛选提交状态"]').setValue("awaiting_player_confirmation");
    await flushPromises();
    expect(adminApi).toHaveBeenLastCalledWith("/v1/submissions?page=1&pageSize=20&status=awaiting_player_confirmation");
  });
});
